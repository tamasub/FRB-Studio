using System;
using System.Drawing;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace FRBStudio.NativeShell
{
    // Native window UI state only, independent of project Data JSON and ViewDef.
    // Studio and Launch-settings keep separate bounds so neither changes the other.
    internal static class NativeShellWindowBounds
    {
        private static string StorePath(bool launcher) => Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "FRBStudio", launcher ? "launcher_window_bounds.json" : "studio_window_bounds.json");

        internal static bool TryLoad(out Rectangle bounds, bool launcher=true)
        {
            bounds = Rectangle.Empty;
            try
            {
                if (!File.Exists(StorePath(launcher))) return false;
                var saved = new JavaScriptSerializer().Deserialize<Dictionary<string, int>>(File.ReadAllText(StorePath(launcher)));
                if (saved == null || !saved.ContainsKey("x") || !saved.ContainsKey("y")
                    || !saved.ContainsKey("width") || !saved.ContainsKey("height")) return false;
                var width = saved["width"];
                var height = saved["height"];
                if (width < 520 || height < 360 || width > 10000 || height > 10000) return false;
                var requested = new Rectangle(saved["x"], saved["y"], width, height);
                // A disconnected monitor must not make the editor impossible to reach.
                var screen = Screen.AllScreens.FirstOrDefault(candidate =>
                    Rectangle.Intersect(candidate.WorkingArea, requested).Width >= 120
                    && Rectangle.Intersect(candidate.WorkingArea, requested).Height >= 80);
                if (screen == null) return false;
                var area = screen.WorkingArea;
                // Clamp to visible desktop after DPI or monitor changes.
                var safeWidth = Math.Min(requested.Width, area.Width);
                var safeHeight = Math.Min(requested.Height, area.Height);
                bounds = new Rectangle(
                    Math.Max(area.Left, Math.Min(requested.X, area.Right - safeWidth)),
                    Math.Max(area.Top, Math.Min(requested.Y, area.Bottom - safeHeight)),
                    safeWidth, safeHeight);
                return true;
            }
            catch (Exception) { return false; }
        }

        internal static void TrySave(Rectangle bounds, bool launcher=true)
        {
            if (bounds.Width < 520 || bounds.Height < 360) return;
            try
            {
                var path = StorePath(launcher);
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                var json = new JavaScriptSerializer().Serialize(new Dictionary<string, int> {
                    ["x"] = bounds.X, ["y"] = bounds.Y,
                    ["width"] = bounds.Width, ["height"] = bounds.Height
                });
                File.WriteAllText(path, json);
            }
            catch (Exception) { /* UI settings are best-effort; never block close */ }
        }
    }
}
