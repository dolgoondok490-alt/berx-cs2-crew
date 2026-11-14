using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

namespace BerxLauncher.UI
{
    static class Theme
    {
        public static readonly Color Bg = Hex(0x101012);
        public static readonly Color Panel = Hex(0x17171A);
        public static readonly Color Panel2 = Hex(0x1E1E22);
        public static readonly Color Panel3 = Hex(0x26262B);
        public static readonly Color Line = Hex(0x2B2B31);
        public static readonly Color Text = Hex(0xF3F3F5);
        public static readonly Color Muted = Hex(0x9A9AA4);
        public static readonly Color Dim = Hex(0x62626C);
        public static readonly Color Accent = Hex(0xFF6900);
        public static readonly Color AccentHi = Hex(0xFF8326);
        public static readonly Color Green = Hex(0x22D36B);
        public static readonly Color Gray = Hex(0x6E6E78);
        public static readonly Color Red = Hex(0xFF4D4F);
        public static readonly Color Yellow = Hex(0xF5B81C);
        public static readonly Color Blue = Hex(0x5AA2FF);

        static Color Hex(int v) => Color.FromArgb(255, (v >> 16) & 255, (v >> 8) & 255, v & 255);

        static readonly Dictionary<string, Font> cache = new Dictionary<string, Font>();

        static Font Get(string family, float size, FontStyle style, string fallback = "Segoe UI")
        {
            var key = family + "|" + size + "|" + style;
            if (cache.TryGetValue(key, out var f)) return f;
            try { f = new Font(family, size, style); if (!string.Equals(f.Name, family, StringComparison.OrdinalIgnoreCase)) { f.Dispose(); f = null; } }
            catch { f = null; }
            f ??= new Font(fallback, size, style);
            cache[key] = f;
            return f;
        }

        public static Font Ui(float size, FontStyle st = FontStyle.Regular) => Get("Segoe UI", size, st);
        public static Font Semi(float size) => Get("Segoe UI Semibold", size, FontStyle.Regular);
        public static Font Display(float size, FontStyle st = FontStyle.Bold | FontStyle.Italic) => Get("Bahnschrift", size, st);
        public static Font DisplayCond(float size) => Get("Bahnschrift SemiBold Condensed", size, FontStyle.Regular, "Segoe UI Semibold");
        public static Font Mono(float size) => Get("Cascadia Mono", size, FontStyle.Regular, "Consolas");
        public static Font Icons(float size) => Get("Segoe Fluent Icons", size, FontStyle.Regular, "Segoe MDL2 Assets");

        public static GraphicsPath Round(RectangleF r, float rad)
        {
            var p = new GraphicsPath();
            float d = Math.Max(0.1f, Math.Min(rad * 2, Math.Min(r.Width, r.Height)));
            p.AddArc(r.X, r.Y, d, d, 180, 90);
            p.AddArc(r.Right - d, r.Y, d, d, 270, 90);
            p.AddArc(r.Right - d, r.Bottom - d, d, d, 0, 90);
            p.AddArc(r.X, r.Bottom - d, d, d, 90, 90);
            p.CloseFigure();
            return p;
        }

        public static Color Lerp(Color a, Color b, float t)
        {
            t = Math.Max(0, Math.Min(1, t));
            return Color.FromArgb((int)(a.A + (b.A - a.A) * t), (int)(a.R + (b.R - a.R) * t), (int)(a.G + (b.G - a.G) * t), (int)(a.B + (b.B - a.B) * t));
        }

        public static Color A(Color c, int alpha) => Color.FromArgb(Math.Max(0, Math.Min(255, alpha)), c);

        public static void Hq(Graphics g)
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.TextRenderingHint = System.Drawing.Text.TextRenderingHint.ClearTypeGridFit;
        }

        static Icon appIcon;
        public static Icon AppIcon(int size = 32)
        {
            try
            {
                using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("berx.ico"))
                    if (s != null) return new Icon(s, new Size(size, size));
            }
            catch { /* ignore */ }
            return appIcon ??= SystemIcons.Application;
        }

        public static Bitmap AppBitmap(int size)
        {
            using (var ic = AppIcon(size >= 48 ? 256 : 48)) return new Bitmap(ic.ToBitmap(), size, size);
        }

        public static void Draw(Graphics g, string s, Font f, Color c, Rectangle r, TextFormatFlags flags)
            => TextRenderer.DrawText(g, s ?? "", f, r, c, flags | TextFormatFlags.NoPadding | TextFormatFlags.NoPrefix);
    }

    /// <summary>Нэг timer бүх анимацийг удирдана (hover, pulse, busy stripes).</summary>
    static class Animator
    {
        static readonly List<IAnimated> items = new List<IAnimated>();
        static readonly Timer timer = new Timer { Interval = 16 };
        static DateTime last = DateTime.UtcNow;
        public static float Time { get; private set; }

        static Animator()
        {
            timer.Tick += (s, e) =>
            {
                var now = DateTime.UtcNow;
                float dt = (float)Math.Min(0.1, (now - last).TotalSeconds);
                last = now; Time += dt;
                foreach (var it in items.ToArray()) it.Tick(dt);
            };
            timer.Start();
        }

        public static void Add(IAnimated a) { if (!items.Contains(a)) items.Add(a); }
        public static void Remove(IAnimated a) => items.Remove(a);
    }

    interface IAnimated { void Tick(float dt); }

    /// <summary>Windows 10/11 dark title bar (DWM). Хуучин Windows дээр чимээгүй алгасна.</summary>
    static class DarkTitle
    {
        [System.Runtime.InteropServices.DllImport("dwmapi.dll")]
        static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

        public static void Apply(IntPtr hwnd)
        {
            try
            {
                int on = 1;
                if (DwmSetWindowAttribute(hwnd, 20, ref on, 4) != 0) DwmSetWindowAttribute(hwnd, 19, ref on, 4);
                int caption = 0x00121010; // COLORREF (BGR) = #101012
                DwmSetWindowAttribute(hwnd, 35, ref caption, 4);
            }
            catch { /* ignore */ }
        }
    }
}
