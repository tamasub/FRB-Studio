using System;
using System.IO;

namespace FRBStudio.NativeShell
{
    internal sealed class NativeLaunchOptions
    {
        public string InitialPage { get; private set; }
        public string InitialJsonPath { get; private set; }
        public string InitialMarkdownPath { get; private set; }
        public string LaunchItemId { get; private set; }
        public string LaunchNewCategoryPage { get; private set; }
        public string LaunchPageId { get; private set; }
        public string StudioTheme { get; private set; }
        public string LaunchViewDefPath { get; private set; }
        public string LaunchHomePath { get; private set; }
        public bool LaunchPreview { get; private set; }
        public string LaunchPreviewPipe { get; private set; }
        public int? LaunchPreviewOwnerPid { get; private set; }

        public static NativeLaunchOptions Parse(string[] args)
        {
            // Saved preference has lower priority than an explicit command-line override.
            var options = new NativeLaunchOptions { StudioTheme = NativeStudioThemePreference.TryLoad() };
            if (args == null) return options;
            var explicitThemeArgument = false;

            foreach (var raw in args)
            {
                var arg = raw ?? string.Empty;
                if (string.Equals(arg, "--launch-preview", StringComparison.OrdinalIgnoreCase))
                {
                    options.LaunchPreview = true;
                    continue;
                }
                if (arg.StartsWith("--launch-preview-pipe=", StringComparison.OrdinalIgnoreCase))
                {
                    var token = arg.Substring("--launch-preview-pipe=".Length);
                    if (!Guid.TryParseExact(token, "N", out var parsedToken))
                        throw new ArgumentException("--launch-preview-pipe requires a 32-character GUID.");
                    options.LaunchPreviewPipe = "frb_studio_launch_" + parsedToken.ToString("N");
                    continue;
                }
                if (arg.StartsWith("--launch-preview-owner-pid=", StringComparison.OrdinalIgnoreCase))
                {
                    var value = arg.Substring("--launch-preview-owner-pid=".Length);
                    if (!int.TryParse(value, out var pid) || pid <= 0)
                        throw new ArgumentException("--launch-preview-owner-pid requires a positive process ID.");
                    options.LaunchPreviewOwnerPid = pid;
                    continue;
                }
                if (arg.StartsWith("--studio-theme=", StringComparison.OrdinalIgnoreCase))
                {
                    var theme = arg.Substring("--studio-theme=".Length).Trim();
                    if (!string.Equals(theme, "light", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(theme, "dark", StringComparison.OrdinalIgnoreCase))
                        throw new ArgumentException("--studio-theme requires light or dark.");
                    options.StudioTheme = theme.ToLowerInvariant();
                    explicitThemeArgument = true;
                    continue;
                }
                if (arg.StartsWith("--launch-item-id=", StringComparison.OrdinalIgnoreCase))
                {
                    options.LaunchItemId = arg.Substring("--launch-item-id=".Length).Trim();
                    if (string.IsNullOrWhiteSpace(options.LaunchItemId))
                        throw new ArgumentException("--launch-item-id requires an item ID.");
                    continue;
                }
                if (arg.StartsWith("--launch-page-id=", StringComparison.OrdinalIgnoreCase))
                {
                    options.LaunchPageId = arg.Substring("--launch-page-id=".Length).Trim();
                    if (string.IsNullOrWhiteSpace(options.LaunchPageId))
                        throw new ArgumentException("--launch-page-id requires a page ID.");
                    continue;
                }
                if (arg.StartsWith("--launch-new-category=", StringComparison.OrdinalIgnoreCase))
                {
                    options.LaunchNewCategoryPage = arg.Substring("--launch-new-category=".Length).Trim();
                    if (string.IsNullOrWhiteSpace(options.LaunchNewCategoryPage))
                        throw new ArgumentException("--launch-new-category requires a page ID.");
                    continue;
                }
                if (arg.StartsWith("--launch-home=", StringComparison.OrdinalIgnoreCase))
                {
                    var path = arg.Substring("--launch-home=".Length).Trim();
                    if (!Path.IsPathRooted(path))
                        throw new ArgumentException("--launch-home requires an absolute directory path.");
                    options.LaunchHomePath = Path.GetFullPath(path);
                    continue;
                }
                if (arg.StartsWith("--launch-view-def=", StringComparison.OrdinalIgnoreCase))
                {
                    var path = arg.Substring("--launch-view-def=".Length).Trim();
                    if (!Path.IsPathRooted(path) || !path.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                        throw new ArgumentException("--launch-view-def requires an absolute .json file path.");
                    options.LaunchViewDefPath = Path.GetFullPath(path);
                    continue;
                }
                if (arg.StartsWith("--open-json=", StringComparison.OrdinalIgnoreCase))
                {
                    var path = arg.Substring("--open-json=".Length).Trim();
                    if (!Path.IsPathRooted(path) || !path.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
                        throw new ArgumentException("--open-json requires an absolute .json file path.");
                    options.InitialJsonPath = Path.GetFullPath(path);
                    continue;
                }
                if (arg.StartsWith("--open-md=", StringComparison.OrdinalIgnoreCase))
                {
                    var path = arg.Substring("--open-md=".Length).Trim();
                    if (!Path.IsPathRooted(path) || !path.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
                        throw new ArgumentException("--open-md requires an absolute .md file path.");
                    options.InitialMarkdownPath = Path.GetFullPath(path);
                    continue;
                }
                if (arg.StartsWith("--launch=", StringComparison.OrdinalIgnoreCase))
                {
                    var value = arg.Substring("--launch=".Length).Trim();
                    if (string.Equals(value, "markdown", StringComparison.OrdinalIgnoreCase))
                    {
                        options.InitialPage = "mdViewer.html";
                    }
                    continue;
                }

                if (arg.StartsWith("--launch-shortcut=", StringComparison.OrdinalIgnoreCase))
                {
                    try
                    {
                        var encodedId = arg.Substring("--launch-shortcut=".Length).Trim();
                        var shortcutId = Uri.UnescapeDataString(encodedId);
                        if (NativeLaunchShortcutCatalog.TryBuildInitialPage(shortcutId, out var initialPage))
                        {
                            options.InitialPage = initialPage;
                        }
                    }
                    catch
                    {
                        // A stale/invalid convenience task must never block normal NativeShell startup.
                    }
                }
            }
            if (options.LaunchPreviewOwnerPid.HasValue && (!options.LaunchPreview || options.LaunchPreviewPipe == null))
                throw new ArgumentException("--launch-preview-owner-pid requires a Launch preview pipe.");
            if (options.LaunchPreviewPipe != null && !options.LaunchPreview)
                throw new ArgumentException("--launch-preview-pipe requires --launch-preview.");
            int launchTargets = (options.LaunchItemId != null ? 1 : 0)
                + (options.LaunchNewCategoryPage != null ? 1 : 0)
                + (options.LaunchPageId != null ? 1 : 0);
            // Launch owns the ViewDef, while the document can now live in
            // %LOCALAPPDATA%/FRBLaunch/UserData. Require the explicit Launch
            // installation root; do not infer the owner from the AppData path.
            // Legacy Launch/config sessions continue to work during migration.
            if (options.LaunchViewDefPath != null)
            {
                if (options.InitialJsonPath == null ||
                    !string.Equals(Path.GetFileName(options.InitialJsonPath), "frb_launch_data.json", StringComparison.OrdinalIgnoreCase))
                    throw new ArgumentException("--launch-view-def requires frb_launch_data.json.");
                string launchRoot;
                if (!string.IsNullOrEmpty(options.LaunchHomePath))
                {
                    launchRoot = options.LaunchHomePath;
                    var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                    var canonicalUser = Path.GetFullPath(Path.Combine(localAppData, "FRBLaunch", "UserData", "frb_launch_data.json"));
                    var legacy = Path.GetFullPath(Path.Combine(launchRoot, "config", "frb_launch_data.json"));
                    if (!string.Equals(options.InitialJsonPath, canonicalUser, StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(options.InitialJsonPath, legacy, StringComparison.OrdinalIgnoreCase))
                        throw new ArgumentException("--open-json must be the canonical Launch UserData JSON.");
                }
                else
                {
                    if (!string.Equals(Path.GetFileName(Path.GetDirectoryName(options.InitialJsonPath)), "config", StringComparison.OrdinalIgnoreCase))
                        throw new ArgumentException("AppData Launch editing requires --launch-home.");
                    launchRoot = Path.GetDirectoryName(Path.GetDirectoryName(options.InitialJsonPath));
                }
                var canonical = Path.GetFullPath(Path.Combine(launchRoot, "defs", "launch", "frb_launch_maintenance_view_def_v0_1.json"));
                if (!string.Equals(options.LaunchViewDefPath, canonical, StringComparison.OrdinalIgnoreCase))
                    throw new ArgumentException("--launch-view-def must point to the Launch-owned canonical ViewDef.");
            }
            else if (options.LaunchHomePath != null)
                throw new ArgumentException("--launch-home requires --launch-view-def.");
            if (launchTargets > 1)
                throw new ArgumentException("Launch edit targets cannot be combined.");
            if (launchTargets > 0 && options.InitialJsonPath == null)
                throw new ArgumentException("Launch edit requires --open-json.");
            if (!string.IsNullOrWhiteSpace(options.InitialMarkdownPath) && !string.IsNullOrWhiteSpace(options.InitialJsonPath))
                throw new ArgumentException("--open-json and --open-md cannot be combined.");
            if (!string.IsNullOrWhiteSpace(options.InitialMarkdownPath))
                options.InitialPage = "mdViewer.html?startupMd=1";
            if (!string.IsNullOrWhiteSpace(options.InitialJsonPath))
            {
                var page = "index.html?startupJson=1";
                if (options.LaunchViewDefPath != null)
                    page += "&launchViewDef=1";
                if (options.LaunchItemId != null)
                    page += "&focusField=item_id&focusValue=" + Uri.EscapeDataString(options.LaunchItemId) + "&openDetail=true&launchItemProperties=1";
                if (options.LaunchNewCategoryPage != null)
                    page += "&launchNewCategory=1&newCategoryPage=" + Uri.EscapeDataString(options.LaunchNewCategoryPage);
                if (options.LaunchPageId != null)
                    page += "&launchPageId=" + Uri.EscapeDataString(options.LaunchPageId);
                options.InitialPage = page;
            }
            // The startup hint comes from the user preference (or an explicit CLI override).
            // It only affects launcher presentation, never writes to Data or ViewDef.
            // WebView and splash consume the same resolved value.
            if (options.StudioTheme != null)
            {
                // Preserve a normal no-argument launch (home.html). Only an
                // explicit CLI theme retains the old "open index" behavior.
                if (string.IsNullOrWhiteSpace(options.InitialPage) && explicitThemeArgument)
                    options.InitialPage = "index.html";
                if (options.InitialPage != null &&
                    options.InitialPage.StartsWith("index.html", StringComparison.OrdinalIgnoreCase))
                    options.InitialPage += (options.InitialPage.Contains("?") ? "&" : "?")
                        + "studioTheme=" + options.StudioTheme;
            }
            return options;
        }
    }
}
