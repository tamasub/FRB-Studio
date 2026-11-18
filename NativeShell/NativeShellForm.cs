using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading.Tasks;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FRBStudio.NativeShell
{
    internal sealed class NativeShellForm : Form
    {
        private readonly WebView2 _webView = new WebView2();
        private readonly Label _status = new Label();
        // Frame-owned content: launcher theme gets an outer charcoal rim and
        // an inner light line without replacing the standard WinForms title bar.
        private readonly Panel _clientSurface = new Panel();
        private NativeShellConfig _config;
        private WorkspacePolicy _workspace;
        private NativeCommandDispatcher _dispatcher;
        private string _appRoot;
        private string _allowedOrigin;
        private readonly string _initialUri;
        private readonly string _initialPage;
        private readonly string _initialJsonPath;
        private readonly string _launchViewDefPath;
        private readonly string _initialMarkdownPath;
        private readonly string _initialWorkspaceRoot;
        private readonly CoreWebView2Environment _sharedEnvironment;
        private readonly bool _deferInitialNavigation;
        private CoreWebView2Environment _environment;
        private Task _initializationTask;
        private bool _presentationReceived;
        private bool _launcherPresentation;
        private bool _nativeTitleBarDark;
        private bool _nativeTitleBarLaunchPalette;
        private bool _nativeTitleBarLaunchLightPalette;
        // The main WinForms host must never flash its default (1500x950) bounds.
        // Keep it transparent until the ViewDef applies its final presentation.
        private readonly bool _useStartupSplash;
        private Form _startupSplash;
        private Timer _startupDeadline;
        private bool _startupRevealed;
        private readonly bool _startupSplashLight;
        // Launch-owned session only. A random pipe capability prevents borrowing
        // a standalone Studio process or accepting unauthenticated switch paths.
        private readonly bool _launchPreview;
        private readonly string _launchPreviewPipe;
        private readonly int? _launchPreviewOwnerPid;
        // Explicit dock pop-out turns this Launch-owned preview into a normal
        // desktop Studio. Its process must then survive Launch's exit.
        private volatile bool _launchReleasedFromOwner;
        private bool _launchOwnerExitHandling;
        // Independent of the docked Form HWND: Qt can destroy that HWND on
        // console-close before the owner process signals its exit.
        private System.Threading.SynchronizationContext _launchOwnerUiContext;
        private const string LaunchCloseCommand = "@FRB_LAUNCH_CLOSE@";
        private const string LaunchReleaseCommand = "@FRB_LAUNCH_RELEASE@";
        private const string LaunchDockedCommand = "@FRB_LAUNCH_DOCKED@";
        private Timer _launchDockTimeout;
        private bool _launchDockRevealed;
        private TaskCompletionSource<bool> _launchSwitchGuardResponse;
        private string _launchSwitchGuardId;

        [DllImport("dwmapi.dll", PreserveSig = true)]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        private void SetNativeTitleBarDark(bool dark, bool launchPalette, bool launchLightPalette = false)
        {
            if (!IsHandleCreated) return;
            var enabled = dark ? 1 : 0;
            try
            {
                // Win10 20H1 / Win11; fallback for older Win10.
                if (DwmSetWindowAttribute(Handle, 20, ref enabled, sizeof(int)) != 0)
                    DwmSetWindowAttribute(Handle, 19, ref enabled, sizeof(int));
                if (dark)
                {
                    // Windows 11: match the FRB Launch palette where supported.
                    // DWM caption color is a single COLORREF, not a gradient.
                    // FRB Launch's gray-green gradient is approximately (85,97,90)
                    // in the middle of its title bar; use that as the solid-color match.
                    // Keep the original dark caption for other Studio dark themes.
                    var caption = ColorTranslator.ToWin32(launchPalette
                        ? Color.FromArgb(85, 97, 90)
                        : Color.FromArgb(32, 43, 41));
                    var titleText = ColorTranslator.ToWin32(Color.FromArgb(229, 235, 243));
                    DwmSetWindowAttribute(Handle, 35, ref caption, sizeof(int));
                    DwmSetWindowAttribute(Handle, 36, ref titleText, sizeof(int));
                    // Windows 11 non-client border: dark-gray ring around the full window.
                    var border = ColorTranslator.ToWin32(launchPalette
                        ? Color.FromArgb(52, 60, 56)
                        : Color.FromArgb(32, 43, 41));
                    DwmSetWindowAttribute(Handle, 34, ref border, sizeof(int));
                }
                else if (launchLightPalette)
                {
                    var caption = ColorTranslator.ToWin32(Color.FromArgb(235, 242, 238));
                    var titleText = ColorTranslator.ToWin32(Color.FromArgb(29, 51, 44));
                    var border = ColorTranslator.ToWin32(Color.FromArgb(173, 191, 181));
                    DwmSetWindowAttribute(Handle, 35, ref caption, sizeof(int));
                    DwmSetWindowAttribute(Handle, 36, ref titleText, sizeof(int));
                    DwmSetWindowAttribute(Handle, 34, ref border, sizeof(int));
                }
            }
            catch (DllNotFoundException) { /* Windows without DWM */ }
            catch (EntryPointNotFoundException) { /* older Windows */ }
        }

        private void ApplyNativePresentation(string preset, string theme, string shell)
        {
            var launcher = string.Equals(preset, "launcher", StringComparison.OrdinalIgnoreCase)
                && string.Equals(shell, "minimal", StringComparison.OrdinalIgnoreCase);
            var dark = string.Equals(theme, "dark", StringComparison.OrdinalIgnoreCase)
                || string.Equals(theme, "launch-dark", StringComparison.OrdinalIgnoreCase);
            var launchLight = launcher && string.Equals(theme, "launch-light", StringComparison.OrdinalIgnoreCase);
            // Startup hint / saved preference colors the splash before WebView2.
            // Ignore intermediate standard ViewDef renders while the launcher
            // document is loading; they must not briefly repaint the splash light.
            if (launcher)
                (_startupSplash as StartupSplashForm)?.SetAppearance(!dark);
            // Before launcher ViewDef loads, an ordinary startup ViewDef must not
            // lock the window's size, caption, or palette.
            if (!launcher && !dark) return;
            // Only a launcher presentation may be recolored after initial sizing.
            if (_presentationReceived && (!_launcherPresentation || !launcher)) return;
            var firstPresentation = !_presentationReceived;
            _presentationReceived = true;
            _launcherPresentation = launcher;
            _nativeTitleBarDark = dark;
            _nativeTitleBarLaunchPalette = launcher && dark;
            _nativeTitleBarLaunchLightPalette = launchLight;
            SetNativeTitleBarDark(dark, _nativeTitleBarLaunchPalette, launchLight);
            if (launcher)
            {
                Padding = new Padding(5);
                _clientSurface.Padding = new Padding(1);
                if (launchLight)
                {
                    BackColor = Color.FromArgb(185, 202, 193);
                    _clientSurface.BackColor = Color.FromArgb(246, 250, 247);
                }
                else
                {
                    BackColor = Color.FromArgb(51, 62, 56);
                    _clientSurface.BackColor = Color.FromArgb(180, 191, 180);
                }
            }
            _status.BackColor = dark ? Color.FromArgb(23, 35, 33) : Color.FromArgb(245, 249, 246);
            _status.ForeColor = dark ? Color.FromArgb(172, 188, 185) : Color.FromArgb(76, 96, 88);
            if (!launcher || !firstPresentation) return;
            Text = "FRB Launch — 設定";
            if (_launchPreview) return; // Outer Launch splitter owns all embedded geometry.
            _status.Height = 20;
            // Preserve the existing compact bounds contract. A palette click
            // must never resize the native window or overwrite saved bounds.
            if (!_launchPreview && NativeShellWindowBounds.TryLoad(out var bounds, launcher:true))
            {
                StartPosition = FormStartPosition.Manual;
                Bounds = bounds;
            }
            else
            {
                Size = new Size(990, 690);
                CenterToScreen();
            }
        }

        // Borderless splash is styled explicitly: WinForms default Font/Frame
        // otherwise looks unrelated to the WebView2 Studio + Qt launcher.
        private sealed class StartupSplashForm : Form
        {
            private const int Radius = 12;
            private bool _light;
            private readonly Font _headlineFont = new Font("Segoe UI", 10.5f, FontStyle.Regular);
            private readonly Font _subtitleFont = new Font("Segoe UI", 9f, FontStyle.Regular);

            internal StartupSplashForm(bool light)
            {
                _light = light;
                Text = "FRB Studio  起動中...";
                FormBorderStyle = FormBorderStyle.None;
                StartPosition = FormStartPosition.CenterScreen;
                ClientSize = new Size(340, 112);
                MaximizeBox = false;
                MinimizeBox = false;
                ControlBox = false;
                ShowInTaskbar = true;
                BackColor = light ? Color.FromArgb(246, 250, 247) : Color.FromArgb(32, 43, 41);
                DoubleBuffered = true;
            }

            internal void SetAppearance(bool light)
            {
                if (_light == light) return;
                _light = light;
                BackColor = light ? Color.FromArgb(246, 250, 247) : Color.FromArgb(32, 43, 41);
                Invalidate();
            }

            // Add the standard Windows window shadow while keeping the rounded
            // borderless shape (no custom activation or focus management).
            protected override CreateParams CreateParams
            {
                get
                {
                    var parameters = base.CreateParams;
                    parameters.ClassStyle |= 0x00020000; // CS_DROPSHADOW
                    return parameters;
                }
            }

            private static GraphicsPath RoundedRectangle(Rectangle rect, int radius)
            {
                var path = new GraphicsPath();
                var diameter = radius * 2;
                path.AddArc(rect.Left, rect.Top, diameter, diameter, 180, 90);
                path.AddArc(rect.Right - diameter, rect.Top, diameter, diameter, 270, 90);
                path.AddArc(rect.Right - diameter, rect.Bottom - diameter, diameter, diameter, 0, 90);
                path.AddArc(rect.Left, rect.Bottom - diameter, diameter, diameter, 90, 90);
                path.CloseFigure();
                return path;
            }

            protected override void OnResize(EventArgs e)
            {
                base.OnResize(e);
                if (ClientSize.Width < Radius * 2 || ClientSize.Height < Radius * 2) return;
                using (var path = RoundedRectangle(new Rectangle(0, 0, ClientSize.Width, ClientSize.Height), Radius))
                {
                    var previous = Region;
                    Region = new Region(path);
                    previous?.Dispose();
                }
            }

            protected override void OnPaint(PaintEventArgs e)
            {
                base.OnPaint(e);
                var g = e.Graphics;
                g.SmoothingMode = SmoothingMode.AntiAlias;
                var outer = new Rectangle(0, 0, ClientSize.Width - 1, ClientSize.Height - 1);
                using (var path = RoundedRectangle(outer, Radius))
                using (var header = new LinearGradientBrush(outer,
                    _light ? Color.FromArgb(222, 237, 227) : Color.FromArgb(104, 116, 107),
                    _light ? Color.FromArgb(183, 205, 190) : Color.FromArgb(55, 71, 62), 90f))
                using (var border = new Pen(_light ? Color.FromArgb(167, 191, 177) : Color.FromArgb(193, 203, 192)))
                {
                    g.FillPath(header, path);
                    g.DrawPath(border, path);
                }
                var inner = Rectangle.Inflate(outer, -5, -5);
                using (var path = RoundedRectangle(inner, Radius - 4))
                using (var fill = new SolidBrush(_light ? Color.FromArgb(246, 250, 247) : Color.FromArgb(32, 43, 41)))
                using (var outline = new Pen(_light ? Color.FromArgb(187, 206, 193) : Color.FromArgb(101, 122, 112)))
                {
                    g.FillPath(fill, path);
                    g.DrawPath(outline, path);
                }
                // Align BOTH lines centrally, using Studio's Segoe UI stack;
                // Windows supplies its normal Japanese glyph fallback.
                var headline = new Rectangle(16, 28, ClientSize.Width - 32, 28);
                var subtitle = new Rectangle(16, 59, ClientSize.Width - 32, 25);
                const TextFormatFlags centered = TextFormatFlags.HorizontalCenter
                    | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPrefix | TextFormatFlags.SingleLine;
                TextRenderer.DrawText(g, "FRB Studio  起動中...", _headlineFont, headline,
                    _light ? Color.FromArgb(36, 74, 59) : Color.FromArgb(235, 241, 238), centered);
                TextRenderer.DrawText(g, "画面を準備しています", _subtitleFont, subtitle,
                    _light ? Color.FromArgb(89, 119, 104) : Color.FromArgb(170, 188, 180), centered);
            }

            protected override void Dispose(bool disposing)
            {
                if (disposing) { _headlineFont.Dispose(); _subtitleFont.Dispose(); }
                base.Dispose(disposing);
            }
        }

        private void ShowStartupSplash()
        {
            if (!_useStartupSplash || _startupRevealed || _startupSplash != null) return;
            _startupSplash = new StartupSplashForm(_startupSplashLight);
            _startupSplash.Show();
            _startupSplash.Activate();

            // If the web app does not send its ready event (e.g. a script error),
            // show the host rather than leaving the user with a permanent splash.
            _startupDeadline = new Timer { Interval = 20000 };
            _startupDeadline.Tick += (_, __) => RevealMainWindow();
            _startupDeadline.Start();
        }

        private void RevealMainWindow()
        {
            if (!_useStartupSplash || _startupRevealed || IsDisposed) return;
            _startupRevealed = true;
            _startupDeadline?.Stop();
            _startupDeadline?.Dispose();
            _startupDeadline = null;

            // Presentation dimensions have already been applied by
            // ApplyNativePresentation; lay out the WebView before making it visible.
            PerformLayout();
            _webView.PerformLayout();
            Opacity = 1;
            ShowInTaskbar = true;
            // Changing ShowInTaskbar may recreate the HWND and clear DWM attrs.
            SetNativeTitleBarDark(_nativeTitleBarDark, _nativeTitleBarLaunchPalette, _nativeTitleBarLaunchLightPalette);
            _startupSplash?.Close();
            _startupSplash?.Dispose();
            _startupSplash = null;
            Activate();
            // Mouse activation from the Qt launcher can leave the WebView2
            // unfocused even though its outer WinForms window is foreground.
            // Always pass keyboard focus to the content after splash removal.
            if (_webView.CanFocus) _webView.Focus();
        }

        private void RevealAfterLayout()
        {
            if (!_useStartupSplash || _startupRevealed || !IsHandleCreated) return;
            // Defer one UI message turn so WinForms can finish Bounds/Layout updates.
            BeginInvoke(new Action(RevealMainWindow));
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            _startupDeadline?.Stop();
            _startupDeadline?.Dispose();
            _startupDeadline = null;
            _startupSplash?.Close();
            _startupSplash?.Dispose();
            _startupSplash = null;
            _launchDockTimeout?.Stop();
            _launchDockTimeout?.Dispose();
            _launchDockTimeout = null;
            if (_useStartupSplash)
                NativeShellWindowBounds.TrySave(WindowState == FormWindowState.Normal ? Bounds : RestoreBounds, launcher:_launcherPresentation);
            base.OnFormClosing(e);
        }


        public NativeShellForm(
            string initialUri = null,
            string initialPage = null,
            string initialJsonPath = null,
            string initialWorkspaceRoot = null,
            CoreWebView2Environment sharedEnvironment = null,
            bool deferInitialNavigation = false,
            string initialMarkdownPath = null,
            string startupTheme = null,
            string launchViewDefPath = null,
            bool launchPreview = false,
            string launchPreviewPipe = null,
            int? launchPreviewOwnerPid = null)
        {
            _launchPreview = launchPreview;
            _launchPreviewPipe = launchPreviewPipe;
            _launchPreviewOwnerPid = launchPreviewOwnerPid;
            _startupSplashLight = string.Equals(startupTheme, "light", StringComparison.OrdinalIgnoreCase);
            _initialUri = initialUri;
            _initialPage = initialPage;
            _initialJsonPath = initialJsonPath;
            _launchViewDefPath = launchViewDefPath;
            _initialMarkdownPath = initialMarkdownPath;
            _initialWorkspaceRoot = initialWorkspaceRoot;
            _sharedEnvironment = sharedEnvironment;
            _deferInitialNavigation = deferInitialNavigation;
            // Child/popup windows continue to use the normal visible startup path.
            _useStartupSplash = sharedEnvironment == null && !deferInitialNavigation && !_launchPreview;
            if (_useStartupSplash || _launchPreview)
            {
                // Launch-owned Studio stays entirely transparent until Qt's
                // third-column host confirms SetParent via the private pipe.
                // Ordinary standalone Studio still uses its existing splash.
                Opacity = 0;
                ShowInTaskbar = false;
            }
            Text = "FRB Studio / Native Shell";
            Width = 1500;
            Height = 950;
            StartPosition = FormStartPosition.CenterScreen;
            // Standard Studio restores its own last normal-size bounds. Launcher
            // presentation may override these with the independent Launch bounds.
            if (_useStartupSplash && NativeShellWindowBounds.TryLoad(out var studioBounds, launcher:false))
            {
                StartPosition = FormStartPosition.Manual;
                Bounds = studioBounds;
            }
		    var iconPath = Path.Combine(AppContext.BaseDirectory, "FRB_Studio.ico");
		    if (File.Exists(iconPath))
		    {
		        this.Icon = new Icon(iconPath);
		    }

            _status.Dock = DockStyle.Bottom;
            _status.Height = 24;
            _status.TextAlign = ContentAlignment.MiddleLeft;
            _status.Padding = new Padding(8, 0, 0, 0);
            _status.Text = "Native Shell 初期化中...";

            _webView.Dock = DockStyle.Fill;
            _clientSurface.Dock = DockStyle.Fill;
            _clientSurface.Padding = new Padding(0);
            _clientSurface.Controls.Add(_webView);
            _clientSurface.Controls.Add(_status);
            Controls.Add(_clientSurface);

            ResizeEnd += (_, __) => {
                if (_useStartupSplash && WindowState == FormWindowState.Normal)
                    NativeShellWindowBounds.TrySave(Bounds, launcher:_launcherPresentation);
            };
            Shown += async (_, __) => {
                ShowStartupSplash();
                if (_launchPreviewPipe != null) StartLaunchPreviewPipe();
                if (_launchPreview)
                {
                    // Failure fallback: a lost host must not strand a hidden
                    // document indefinitely. Normal docking stops this timer.
                    _launchDockTimeout = new Timer { Interval = 45000 };
                    _launchDockTimeout.Tick += (_, __) =>
                    {
                        _launchDockTimeout.Stop();
                        if (!_launchDockRevealed && !_launchReleasedFromOwner)
                            RevealUndockedLaunchPreview();
                    };
                    _launchDockTimeout.Start();
                }
                if (_launchPreviewOwnerPid.HasValue)
                {
                    _launchOwnerUiContext = System.Threading.SynchronizationContext.Current
                        ?? new WindowsFormsSynchronizationContext();
                    StartLaunchOwnerWatch();
                }
                await EnsureInitializedAsync();
            };
        }

        // One private pipe per Launch-owned NativeShell. Pipe operations never run
        // on the UI thread; every WebView/dispatcher mutation is marshalled back.
        private void StartLaunchPreviewPipe()
        {
            _ = Task.Run(async () => {
                while (!IsDisposed && !Disposing)
                {
                    try
                    {
                        using (var pipe = new NamedPipeServerStream(_launchPreviewPipe,
                            PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous))
                        {
                            await Task.Factory.FromAsync(pipe.BeginWaitForConnection,
                                pipe.EndWaitForConnection, null);
                            using (var reader = new StreamReader(pipe, new UTF8Encoding(false), false, 4096, true))
                            using (var writer = new StreamWriter(pipe, new UTF8Encoding(false), 4096, true) { AutoFlush = true })
                            {
                                var requestedPath = await reader.ReadLineAsync();
                                var result = await RouteLaunchPreviewSwitchAsync(requestedPath);
                                await writer.WriteLineAsync(result);
                                // ACK before closing; Launch is still reading this pipe.
                                if (requestedPath == LaunchCloseCommand && result == "OK" && !IsDisposed)
                                    BeginInvoke(new Action(Close));
                            }
                        }
                    }
                    catch (IOException) { /* A client disconnected; accept the next request. */ }
                    catch (ObjectDisposedException) { break; }
                    catch (Exception) { if (IsDisposed || Disposing) break; }
                }
            });
        }

        private string RevealLaunchPreviewAfterDock()
        {
            if (!_launchPreview || !_launchPreviewOwnerPid.HasValue)
                return "ERROR: Not a Launch-owned preview";
            if (_launchReleasedFromOwner)
                return "ERROR: Session already released";
            if (_launchDockRevealed) return "OK";
            if (!IsHandleCreated ||
                (GetWindowLong(Handle, -16) & WindowStyleChild) == 0 ||
                GetParent(Handle) == IntPtr.Zero)
                return "ERROR: Studio is not docked in the Launch host";
            // No ShowInTaskbar switch here: that could recreate the HWND after
            // Qt has attached it.  No Activate()/focus change either.
            Opacity = 1;
            _launchDockRevealed = true;
            _launchDockTimeout?.Stop();
            return "OK";
        }

        private void RevealUndockedLaunchPreview()
        {
            if (!_launchPreview || _launchDockRevealed || IsDisposed || Disposing)
                return;
            // Only a failed handoff reaches this path. Show the Studio on the
            // desktop rather than silently hiding a potentially editable page.
            var docked = IsHandleCreated &&
                (GetWindowLong(Handle, -16) & WindowStyleChild) != 0;
            Opacity = 1;
            // Avoid changing ShowInTaskbar after Qt's SetParent: WinForms may
            // recreate that HWND and tear it out of the third-column host.
            if (!docked) ShowInTaskbar = true;
            _launchDockRevealed = true;
            _status.Text = docked
                ? "Studioは第3列に収容されました（収容通知の確認は未完了）。"
                : "Launchへの収容を確認できませんでした。単独ウィンドウで表示しています。";
        }

        private Task<string> RouteLaunchPreviewSwitchAsync(string path)
        {
            var outcome = new TaskCompletionSource<string>(TaskCreationOptions.RunContinuationsAsynchronously);
            try
            {
                if (IsDisposed || Disposing || !IsHandleCreated) return Task.FromResult("ERROR: Studio is unavailable");
                BeginInvoke(new Action(async () => {
                    try { outcome.TrySetResult(path == LaunchCloseCommand
                        ? await ConfirmLaunchPreviewLeaveAsync()
                        : (path == LaunchReleaseCommand
                            ? ReleaseLaunchPreviewOwnership()
                            : (path == LaunchDockedCommand
                                ? RevealLaunchPreviewAfterDock()
                                : await SwitchLaunchPreviewDocumentAsync(path)))); }
                    catch (Exception ex) { outcome.TrySetResult("ERROR: " + ex.Message.Replace('\n', ' ')); }
                }));
            }
            catch (InvalidOperationException) { outcome.TrySetResult("ERROR: Studio window has closed"); }
            return outcome.Task;
        }

        private string ReleaseLaunchPreviewOwnership()
        {
            // The private token identifies the owning Launch session; no file
            // switch, save confirmation or editor close occurs on release.
            if (!_launchPreview || !_launchPreviewOwnerPid.HasValue)
                return "ERROR: Not a Launch-owned preview";
            if (_launchSwitchGuardResponse != null)
                return "ERROR: A Studio navigation is in progress";
            _launchReleasedFromOwner = true;
            _launchDockTimeout?.Stop();
            // Pop-out is never permitted to inherit a transparent main form.
            Opacity = 1;
            TraceLaunchOwner("RELEASED_TO_DESKTOP");
            return "OK";
        }

        // User-visible validation for file switch, explicit Quit and abnormal
        // parent loss. Never silently discard edited JSON/Markdown content.
        private async Task<string> ConfirmLaunchPreviewLeaveAsync()
        {
            if (!_launchPreview) return "ERROR: Not a Launch preview session";
            if (_launchSwitchGuardResponse != null) return "ERROR: Studio navigation is already in progress";
            await EnsureInitializedAsync();
            if (_webView.CoreWebView2 == null)
                return "OK"; // Initialization failed: no live editor to save.
            var id = Guid.NewGuid().ToString("N");
            var guard = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            _launchSwitchGuardId = id;
            _launchSwitchGuardResponse = guard;
            var script = @"(async function(){
                let approved = false;
                try {
                    if (window.FrbJsonObjectUnsavedGuard?.confirmNavigationAway)
                        approved = !!(await window.FrbJsonObjectUnsavedGuard.confirmNavigationAway('navigation'));
                    else if (typeof confirmMarkdownNavigationAway === 'function')
                        approved = !!(await confirmMarkdownNavigationAway());
                    else approved = true;
                } catch (_) { approved = false; }
                if (approved) window.__frbLaunchPreviewSwitchApproved = true;
                window.chrome.webview.postMessage({frb_launch_switch_guard: '" + id + @"', approved: approved});
            })();";
            try
            {
                await _webView.CoreWebView2.ExecuteScriptAsync(script);
                var completed = await Task.WhenAny(guard.Task, Task.Delay(90000));
                if (completed != guard.Task) return "ERROR: Unsaved confirmation timed out";
                return await guard.Task ? "OK" : "CANCEL";
            }
            finally
            {
                _launchSwitchGuardId = null;
                _launchSwitchGuardResponse = null;
            }
        }

        // Diagnostics exist only for Launch-owned Studio processes. A residual
        // NativeShell can be distinguished from a standalone Studio by this log.
        private void TraceLaunchOwner(string stage)
        {
            if (!_launchPreviewOwnerPid.HasValue) return;
            try
            {
                var folder = Path.Combine(Environment.GetFolderPath(
                    Environment.SpecialFolder.LocalApplicationData), "FRBStudio");
                Directory.CreateDirectory(folder);
                File.AppendAllText(Path.Combine(folder, "launch_owner_watch.log"),
                    DateTime.Now.ToString("o") + " StudioPID=" + Process.GetCurrentProcess().Id +
                    " LaunchPID=" + _launchPreviewOwnerPid.Value + " " + stage + Environment.NewLine);
            }
            catch { /* Logging must not affect launch or unsaved data. */ }
        }

        // A console-window × can kill python without running Launcher.quit().
        // Wait on the REAL process handle rather than polling a PID. Post back
        // through an independent WinForms UI context: the embedded Form HWND
        // may already have been destroyed with the Qt parent HWND.
        private void StartLaunchOwnerWatch()
        {
            TraceLaunchOwner("OWNER_WATCH_STARTED");
            _ = Task.Run(() => {
                bool ownerExited = false;
                try
                {
                    using (var owner = Process.GetProcessById(_launchPreviewOwnerPid.Value))
                    {
                        if (owner.Id == Process.GetCurrentProcess().Id) return;
                        owner.WaitForExit();
                        ownerExited = true;
                    }
                }
                catch (ArgumentException) { ownerExited = true; } // Already gone
                catch (InvalidOperationException) { ownerExited = true; }
                catch (System.ComponentModel.Win32Exception) { /* Unknown ownership. */ }
                if (!ownerExited) { TraceLaunchOwner("OWNER_WAIT_FAILED"); return; }
                TraceLaunchOwner("OWNER_EXIT_DETECTED");
                if (_launchReleasedFromOwner) return;  // Explicit pop-out.
                var ui = _launchOwnerUiContext;
                if (ui == null) { TraceLaunchOwner("UI_CONTEXT_UNAVAILABLE"); return; }
                try
                {
                    ui.Post(_ => {
                        if (IsDisposed || Disposing)
                        {
                            TraceLaunchOwner("FORM_ALREADY_DISPOSED");
                            return;
                        }
                        if (!_launchReleasedFromOwner)
                            _ = OnLaunchOwnerExitedAsync();
                    }, null);
                }
                catch (Exception ex)
                {
                    TraceLaunchOwner("OWNER_UI_POST_FAILED " + ex.GetType().Name);
                }
            });
        }

        private const int WindowStyleChild = 0x40000000;
        private const int WindowStyleCaption = 0x00C00000;
        private const int WindowStyleThickFrame = 0x00040000;
        private const int WindowStyleSysMenu = 0x00080000;
        private const int WindowStyleMinimize = 0x00020000;
        private const int WindowStyleMaximize = 0x00010000;
        private const int WindowStylePopup = unchecked((int)0x80000000);
        private const int SwpFrameChanged = 0x0020;
        private const int SwpShowWindow = 0x0040;
        private const int SwpNoZOrder = 0x0004;

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr GetParent(IntPtr window);
        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetParent(IntPtr child, IntPtr newParent);
        [DllImport("user32.dll", EntryPoint = "GetWindowLongW", SetLastError = true)]
        private static extern int GetWindowLong(IntPtr window, int index);
        [DllImport("user32.dll", EntryPoint = "SetWindowLongW", SetLastError = true)]
        private static extern int SetWindowLong(IntPtr window, int index, int value);
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowPos(IntPtr window, IntPtr insertAfter,
            int x, int y, int width, int height, uint flags);

        private void ExposeOrphanedLaunchStudio()
        {
            // Launch changed the native HWND to WS_CHILD during docking. Undo
            // that before prompting: the Qt host may already be destroyed.
            // The docked HWND may have been destroyed by Qt already. If this
            // Form is still live, try to recreate it as an independent desktop
            // window before checking dirty state. Never force-terminate it.
            if (!IsHandleCreated && !IsDisposed && !Disposing)
            {
                try { ShowInTaskbar = true; Show(); }
                catch (InvalidOperationException) { /* Guard below handles it. */ }
            }
            if (!IsHandleCreated) return;
            _launchDockTimeout?.Stop();
            Opacity = 1;
            var window = Handle;
            var style = GetWindowLong(window, -16);
            if ((style & WindowStyleChild) != 0)
            {
                SetParent(window, IntPtr.Zero);
                var restored = (style & ~WindowStyleChild) | WindowStylePopup |
                    WindowStyleCaption | WindowStyleThickFrame | WindowStyleSysMenu |
                    WindowStyleMinimize | WindowStyleMaximize;
                SetWindowLong(window, -16, restored);
                SetWindowPos(window, IntPtr.Zero, 90, 90, 1100, 750,
                    SwpNoZOrder | SwpFrameChanged | SwpShowWindow);
            }
            ShowInTaskbar = true;
            Show();
            WindowState = FormWindowState.Normal;
            Activate();
        }

        // Abnormal parent exit is different from a voluntary JSON switch:
        // never start a 90-second, possibly invisible confirmation dialog.
        // Only a definitively CLEAN page may close automatically. Dirty or
        // unknown pages remain accessible for manual save/recovery.
        private async Task<bool?> ProbeLaunchPreviewDirtyAsync()
        {
            try
            {
                if (!IsHandleCreated || _webView.CoreWebView2 == null) return null;
                const string script = @"(function(){
                    try {
                        if (window.FrbJsonObjectUnsavedGuard &&
                            typeof window.FrbJsonObjectUnsavedGuard.hasUnsavedChanges === 'function')
                            return !!window.FrbJsonObjectUnsavedGuard.hasUnsavedChanges();
                        if (typeof hasUnsavedMarkdownNavigationState === 'function')
                            return !!hasUnsavedMarkdownNavigationState();
                        return null;
                    } catch (_) { return null; }
                })();";
                var probe = _webView.CoreWebView2.ExecuteScriptAsync(script);
                if (await Task.WhenAny(probe, Task.Delay(2500)) != probe) return null;
                var value = await probe;
                if (string.Equals(value, "false", StringComparison.Ordinal)) return false;
                if (string.Equals(value, "true", StringComparison.Ordinal)) return true;
            }
            catch (Exception ex) { TraceLaunchOwner("DIRTY_PROBE_ERROR " + ex.GetType().Name); }
            return null;
        }

        private async Task OnLaunchOwnerExitedAsync()
        {
            if (_launchReleasedFromOwner || _launchOwnerExitHandling || IsDisposed || Disposing) return;
            _launchOwnerExitHandling = true;
            try
            {
                TraceLaunchOwner("OWNER_EXIT_HANDLER_ENTERED handle=" + IsHandleCreated);
                ExposeOrphanedLaunchStudio();
                var dirty = await ProbeLaunchPreviewDirtyAsync();
                if (dirty == false && !IsDisposed && !Disposing)
                {
                    TraceLaunchOwner("CLEAN_AUTO_CLOSE");
                    Close();
                }
                else
                {
                    // A destroyed HWND or an unresponsive WebView is UNKNOWN,
                    // not clean. Preserve data instead of killing the process.
                    TraceLaunchOwner(dirty == true ? "DIRTY_PRESERVED" : "UNKNOWN_PRESERVED");
                    if (!IsDisposed && !Disposing)
                        _status.Text = dirty == true
                            ? "Launch終了。未保存の変更があるためStudioを保持しました。"
                            : "Launch終了。編集状態を確認できないためStudioを保持しました。";
                }
            }
            catch (Exception ex)
            {
                TraceLaunchOwner("OWNER_EXIT_HANDLER_ERROR " + ex.GetType().Name);
                if (!IsDisposed && !Disposing)
                    _status.Text = "Launch終了後、Studioを保持: " + ex.Message;
            }
        }

        // A menu-settings handoff carries the same vetted flags as a normal
        // --open-json startup.  Legacy path-only requests remain compatible.
        private sealed class LaunchPreviewSwitchRequest
        {
            public string path { get; set; }
            public string[] args { get; set; }
        }

        private static NativeLaunchOptions ParseLaunchPreviewSwitchRequest(string request)
        {
            if (string.IsNullOrWhiteSpace(request))
                throw new ArgumentException("Absolute JSON/Markdown path required.");
            var path = request;
            var args = new string[0];
            if (request.TrimStart().StartsWith("{", StringComparison.Ordinal))
            {
                var payload = new JavaScriptSerializer().Deserialize<LaunchPreviewSwitchRequest>(request);
                if (payload == null) throw new ArgumentException("Invalid Launch switch request.");
                path = payload.path;
                args = payload.args ?? new string[0];
            }
            if (string.IsNullOrWhiteSpace(path) || !Path.IsPathRooted(path))
                throw new ArgumentException("Absolute JSON/Markdown path required.");
            var full = Path.GetFullPath(path);
            var ext = Path.GetExtension(full);
            if ((!ext.Equals(".json", StringComparison.OrdinalIgnoreCase) &&
                 !ext.Equals(".md", StringComparison.OrdinalIgnoreCase)) || !File.Exists(full))
                throw new FileNotFoundException("Launch JSON/Markdown document not found", full);
            // Only the Launch-maintenance flags can be passed over the pipe.
            // Disallow startup preview, arbitrary theme, shortcut, or other flags.
            var accepted = new[] { "--launch-home=", "--launch-view-def=", "--launch-page-id=",
                "--launch-item-id=", "--launch-new-category=" };
            if (args.Length > 5) throw new ArgumentException("Too many Launch edit arguments.");
            foreach (var argument in args)
            {
                if (string.IsNullOrWhiteSpace(argument) ||
                    !System.Linq.Enumerable.Any(accepted, flag => argument.StartsWith(flag, StringComparison.OrdinalIgnoreCase)))
                    throw new ArgumentException("Unsupported Launch edit argument.");
            }
            var startup = new List<string> { ext.Equals(".json", StringComparison.OrdinalIgnoreCase)
                ? "--open-json=" + full : "--open-md=" + full };
            startup.AddRange(args);
            // Reuse canonical UserData/ViewDef validation from regular startup.
            return NativeLaunchOptions.Parse(startup.ToArray());
        }

        private async Task<string> SwitchLaunchPreviewDocumentAsync(string request)
        {
            if (!_launchPreview || string.IsNullOrWhiteSpace(_launchPreviewPipe)) return "ERROR: Not a Launch preview session";
            // Reject invalid maintenance context before touching the editor.
            var options = ParseLaunchPreviewSwitchRequest(request);
            var full = options.InitialJsonPath ?? options.InitialMarkdownPath;
            await EnsureInitializedAsync();
            if (_dispatcher == null || _webView.CoreWebView2 == null) return "ERROR: Studio is not ready";

            // The switch and explicit Launch Quit share the same unsaved guard.
            // A Cancel must preserve the document, view definition, and save grant.
            var leave = await ConfirmLaunchPreviewLeaveAsync();
            if (leave != "OK") return leave;
            var id = Guid.NewGuid().ToString("N");
            _dispatcher.SwitchLaunchPreviewDocument(full, options.LaunchViewDefPath);
            // A reused shell may transition between the regular Studio and
            // Launch-maintenance presets. Let the *new* page set the frame
            // presentation; never retain a stale Launch-settings caption.
            if (options.LaunchViewDefPath != null)
            {
                _presentationReceived = false;
            }
            else if (_launcherPresentation)
            {
                _presentationReceived = false;
                _launcherPresentation = false;
                Text = "FRB Studio / Native Shell";
                Padding = new Padding(0);
                _clientSurface.Padding = new Padding(0);
                _status.Height = 24;
            }
            var page = options.InitialPage;
            // Different URL each time: a same-file reselect also reloads.
            _webView.CoreWebView2.Navigate(_allowedOrigin + "/" + page + "&launchSwitch=" + id);
            return "OK";
        }

        // WebView2 JS handles Ctrl+Q when the page has focus.  WinForms must
        // also route it when mouse launching left focus on the native chrome.
        // Both routes invoke the same JS unsaved-guard before Form.Close().
        protected override bool ProcessCmdKey(ref Message msg, Keys keyData)
        {
            if (keyData == (Keys.Control | Keys.Q)
                && _webView.CoreWebView2 != null
                && _webView.Source != null
                && string.Equals(_webView.Source.AbsolutePath, "/index.html", StringComparison.OrdinalIgnoreCase))
            {
                _ = RequestCloseFromNativeShortcutAsync();
                return true;
            }
            return base.ProcessCmdKey(ref msg, keyData);
        }

        private async Task RequestCloseFromNativeShortcutAsync()
        {
            try
            {
                await _webView.CoreWebView2.ExecuteScriptAsync(
                    "window.__frbStudioRequestClose?.();");
            }
            catch (Exception ex)
            {
                _status.Text = "Studio 終了ショートカット: " + ex.Message;
            }
        }

        private Task EnsureInitializedAsync()
        {
            if (_initializationTask == null)
                _initializationTask = InitializeAsync();
            return _initializationTask;
        }

        private async Task<CoreWebView2> EnsureCoreWebViewReadyAsync()
        {
            await EnsureInitializedAsync();
            if (_webView.CoreWebView2 == null)
                throw new InvalidOperationException("Child WebView2 initialization failed.");
            return _webView.CoreWebView2;
        }

        private async Task InitializeAsync()
        {
            try
            {
                _appRoot = ResolveStudioAppRoot();
                var configPath = ResolveConfigPath();
                _config = NativeShellConfig.Load(configPath);
                _workspace = new WorkspacePolicy(
                    !string.IsNullOrWhiteSpace(_initialWorkspaceRoot) && Directory.Exists(_initialWorkspaceRoot)
                        ? _initialWorkspaceRoot
                        : _appRoot);
                _dispatcher = new NativeCommandDispatcher(_config, _workspace, _initialJsonPath, _initialMarkdownPath, _launchViewDefPath, launchPreview:_launchPreview);

                var webRoot = Path.Combine(_appRoot, "wwwroot");
                if (!File.Exists(Path.Combine(webRoot, _config.StartPage)))
                    throw new FileNotFoundException("Native Shell start page が見つかりません。", Path.Combine(webRoot, _config.StartPage));

                _allowedOrigin = "https://" + _config.VirtualHostName;
                var userDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "FRBStudio",
                    // A docked preview may be alive while the user starts a
                    // second standalone Studio. Sharing a single WebView2
                    // profile across differing host lifecycles can provoke
                    // HRESULT 0x8007139F (incorrect state) at initialization.
                    // Keep standalone's historical profile unchanged.
                    _launchPreview ? "WebView2_LaunchPreview" : "WebView2");
                Directory.CreateDirectory(userDataFolder);

                var runtimeVersion = CoreWebView2Environment.GetAvailableBrowserVersionString();
                _environment = _sharedEnvironment ?? await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await _webView.EnsureCoreWebView2Async(_environment);

                _webView.CoreWebView2.Settings.AreDevToolsEnabled = _config.DevToolsEnabled;
                _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    _config.VirtualHostName,
                    webRoot,
                    CoreWebView2HostResourceAccessKind.DenyCors);

                _webView.CoreWebView2.WebMessageReceived += OnWebMessageReceived;
                _webView.CoreWebView2.NavigationStarting += OnNavigationStarting;
                _webView.CoreWebView2.NewWindowRequested += OnNewWindowRequested;
                _webView.CoreWebView2.NavigationCompleted += (_, e) => {
                    if (!_useStartupSplash || _startupRevealed) return;
                    // index.html reports readiness AFTER auto-loading its Data/ViewDef.
                    // Other HTML tools have no such message, so show after navigation.
                    var page = _webView.Source?.AbsolutePath ?? "";
                    if (!e.IsSuccess || !page.EndsWith("/index.html", StringComparison.OrdinalIgnoreCase))
                        RevealAfterLayout();
                };

                _status.Text = "Native Shell / WebView2 Runtime " + runtimeVersion + " / App Root: " + _workspace.RootPath;
                if (!_deferInitialNavigation)
                {
                    var requestedPageUri = !string.IsNullOrWhiteSpace(_initialPage)
                        ? _allowedOrigin + "/" + _initialPage.TrimStart('/')
                        : null;
                    var startUri = !string.IsNullOrWhiteSpace(_initialUri) && IsAllowedNavigation(_initialUri)
                        ? _initialUri
                        : (!string.IsNullOrWhiteSpace(requestedPageUri) && IsAllowedNavigation(requestedPageUri)
                            ? requestedPageUri
                            : _allowedOrigin + "/" + _config.StartPage.TrimStart('/'));
                    _webView.Source = new Uri(startUri);
                }
            }
            catch (Exception ex)
            {
                // An initialization failure must be visible even if the
                // Launch-owned host could not be docked yet.
                if (_launchPreview) RevealUndockedLaunchPreview();
                RevealMainWindow();
                _status.Text = "起動失敗: " + ex.Message;
                MessageBox.Show(
                    "FRB Studio Native Shell の起動に失敗しました。\n\n" +
                    ex.Message +
                    "\n\n追加インストールは自動実行しません。配布条件に合う環境か確認してください。",
                    "FRB Studio Native Shell",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
            }
        }

        private async void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                if (!IsAllowedSource(e.Source)) return;
                // UI-only profile message from the trusted Studio origin; never forward
                // to the file/command dispatcher or synthesize a bridge response.
                // studio_work_0269: UI-only messages are tiny. Do not deserialize large
                // file.writeText/CAS payloads with JavaScriptSerializer's 2 MiB default
                // MaxJsonLength here: that exception previously swallowed the reply,
                // leaving the browser waiting until NATIVE_TIMEOUT. The dispatcher
                // handles full-size commands with MaxJsonLength = int.MaxValue.
                var rawMessage = e.WebMessageAsJson;
                var message = rawMessage.Length <= 32768
                    ? new JavaScriptSerializer().DeserializeObject(rawMessage) as Dictionary<string, object>
                    : null;
                if (message != null && message.TryGetValue("frb_launch_switch_guard", out var guardId)
                    && guardId is string candidate && candidate == _launchSwitchGuardId
                    && message.TryGetValue("approved", out var accepted) && accepted is bool approved)
                {
                    _launchSwitchGuardResponse?.TrySetResult(approved);
                    return;
                }
                // Ctrl+Q from the trusted Studio main page closes this WinForms form
                // through the same Close() / OnFormClosing path as the title-bar X.
                // The page checks the unsaved guard before sending this request.
                if (message != null && message.TryGetValue("studio_close_request", out var closeValue)
                    && closeValue is bool closeRequested && closeRequested
                    && Uri.TryCreate(e.Source, UriKind.Absolute, out var closeSource)
                    && string.Equals(closeSource.AbsolutePath, "/index.html", StringComparison.OrdinalIgnoreCase))
                {
                    if (!IsDisposed && IsHandleCreated)
                        BeginInvoke(new Action(Close));
                    return;
                }
                if (message != null && message.TryGetValue("studio_startup_ready", out var readyValue)
                    && readyValue is bool ready && ready)
                {
                    RevealAfterLayout();
                    return;
                }
                // Persist only intentional launcher-palette changes. Untrusted/unrelated
                // commands never enter the file/command dispatcher.
                if (message != null && message.TryGetValue("studio_theme_preference", out var preferenceValue)
                    && preferenceValue is Dictionary<string, object> preference
                    && Uri.TryCreate(e.Source, UriKind.Absolute, out var preferenceSource)
                    && string.Equals(preferenceSource.AbsolutePath, "/index.html", StringComparison.OrdinalIgnoreCase))
                {
                    if (preference.TryGetValue("theme", out var value) && value is string theme)
                        NativeStudioThemePreference.TrySave(theme);
                    return;
                }
                if (message != null && message.TryGetValue("studio_presentation", out var profileValue)
                    && profileValue is Dictionary<string, object> profile)
                {
                    string get(string key) => profile.TryGetValue(key, out var value) ? value as string : null;
                    ApplyNativePresentation(get("preset"), get("theme"), get("shell"));
                    return;
                }
                var responseJson = await _dispatcher.DispatchAsync(rawMessage, e.AdditionalObjects);
                _webView.CoreWebView2.PostWebMessageAsJson(responseJson);
                _status.Text = "Native Bridge: message processed / App Root: " + _workspace.RootPath;
            }
            catch (Exception ex)
            {
                _status.Text = "Native Bridge error: " + ex.Message;
            }
        }

        private void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            if (IsAllowedNavigation(e.Uri)) return;
            e.Cancel = true;
            if (_config.OpenExternalLinksInDefaultBrowser && Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri))
                OpenExternal(uri.AbsoluteUri);
        }

        private async void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            var deferral = e.GetDeferral();
            NativeShellForm child = null;
            try
            {
                if (IsAllowedNavigation(e.Uri))
                {
                    // Bind the JavaScript window.open() WindowProxy to the actual child WebView2.
                    // WebView2 requires the popup target to share the opener environment/profile and
                    // to remain un-navigated until assigned to NewWindow.
                    child = new NativeShellForm(
                        initialUri: null,
                        initialWorkspaceRoot: _workspace?.RootPath ?? _appRoot,
                        sharedEnvironment: _environment,
                        deferInitialNavigation: true);
                    child.Show(this);
                    e.NewWindow = await child.EnsureCoreWebViewReadyAsync();
                    return;
                }

                e.Handled = true;
                if (_config.OpenExternalLinksInDefaultBrowser && Uri.TryCreate(e.Uri, UriKind.Absolute, out var uri))
                    OpenExternal(uri.AbsoluteUri);
            }
            catch (Exception ex)
            {
                e.Handled = true;
                if (child != null && !child.IsDisposed)
                    child.Close();
                _status.Text = "Native Shell new-window error: " + ex.Message;
            }
            finally
            {
                deferral.Complete();
            }
        }

        private bool IsAllowedSource(string source)
        {
            if (!Uri.TryCreate(source, UriKind.Absolute, out var uri)) return false;
            return string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase)
                && string.Equals(uri.Host, _config.VirtualHostName, StringComparison.OrdinalIgnoreCase);
        }

        private bool IsAllowedNavigation(string uriText)
        {
            if (string.Equals(uriText, "about:blank", StringComparison.OrdinalIgnoreCase)) return true;
            if (!Uri.TryCreate(uriText, UriKind.Absolute, out var uri)) return false;
            return string.Equals(uri.Scheme, "https", StringComparison.OrdinalIgnoreCase)
                && string.Equals(uri.Host, _config.VirtualHostName, StringComparison.OrdinalIgnoreCase);
        }

        private static void OpenExternal(string uri)
        {
            try
            {
                Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
            }
            catch { }
        }

        private string ResolveConfigPath()
        {
            var nextToExe = Path.Combine(AppContext.BaseDirectory, "native_shell.config.json");
            if (File.Exists(nextToExe)) return nextToExe;

            var sourceConfig = Path.Combine(_appRoot, "NativeShell", "native_shell.config.json");
            if (File.Exists(sourceConfig)) return sourceConfig;

            throw new FileNotFoundException("native_shell.config.json が見つかりません。");
        }

        private static string ResolveStudioAppRoot()
        {
            var starts = new[] { AppContext.BaseDirectory, Environment.CurrentDirectory };
            foreach (var start in starts)
            {
                var dir = new DirectoryInfo(Path.GetFullPath(start));
                while (dir != null)
                {
                    if (File.Exists(Path.Combine(dir.FullName, "wwwroot", "index.html"))
                        && Directory.Exists(Path.Combine(dir.FullName, "data", "json"))
                        && Directory.Exists(Path.Combine(dir.FullName, "defs")))
                        return dir.FullName;
                    dir = dir.Parent;
                }
            }

            throw new DirectoryNotFoundException("FRBStudio_App root を特定できません。");
        }
    }
}
