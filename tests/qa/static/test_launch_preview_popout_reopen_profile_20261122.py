"""Static regression: popped-out Studio must not lock a new Launch preview.

Native WebView2 concurrency requires a Windows acceptance pass after NativeShell
is rebuilt; these tests verify the source contract without executing WinForms.
"""
from pathlib import Path

STUDIO_ROOT = Path(__file__).resolve().parents[3]
LAUNCH_ROOT = Path(__file__).resolve().parents[4] / 'launch'


def test_launch_preview_profile_is_unique_to_validated_pipe_capability():
    form = (STUDIO_ROOT / 'NativeShell' / 'NativeShellForm.cs').read_text(encoding='utf-8-sig')
    options = (STUDIO_ROOT / 'NativeShell' / 'NativeLaunchOptions.cs').read_text(encoding='utf-8-sig')
    assert 'ResolveWebView2ProfileName(_launchPreview, _launchPreviewPipe)' in form
    assert 'if (!launchPreview) return "WebView2";' in form
    assert 'launchPreviewPipe.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)' in form
    assert 'Guid.TryParseExact(launchPreviewPipe.Substring(prefix.Length), "N", out var token)' in form
    assert '"WebView2_LaunchPreview_" + token.ToString("N")' in form
    assert '"WebView2_LaunchPreview_" + Guid.NewGuid().ToString("N")' in form
    assert 'options.LaunchPreviewPipe = "frb_studio_launch_" + parsedToken.ToString("N")' in options
    assert '_environment = _sharedEnvironment ?? await CoreWebView2Environment.CreateAsync(null, userDataFolder);' in form


def test_each_launch_preview_uses_fresh_pipe_after_safe_popout():
    panel = (LAUNCH_ROOT / 'src' / 'studio_preview_panel.py').read_text(encoding='utf-8')
    assert 'self._launch_pipe_token = uuid.uuid4().hex' in panel
    assert "'--launch-preview-pipe=' + self._launch_pipe_token" in panel
    assert 'attached.detach(foreground=True, show_window=True, keep_docked_size=True)' in panel
    detached = panel.split('    def _finish_studio_popout(self, reply):', 1)[1].split('    def request_studio_autoswitch(', 1)[0]
    assert 'self._process = None' in detached
    assert 'self._launch_pipe_token = None' in detached
    assert '.kill(' not in detached


def test_standalone_and_popup_profiles_remain_unchanged():
    form = (STUDIO_ROOT / 'NativeShell' / 'NativeShellForm.cs').read_text(encoding='utf-8-sig')
    assert 'if (!launchPreview) return "WebView2";' in form
    assert 'sharedEnvironment: _environment' in form
    assert 'e.NewWindow = await child.EnsureCoreWebViewReadyAsync();' in form
