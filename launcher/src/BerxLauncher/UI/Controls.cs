using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Linq;
using System.Windows.Forms;
using BerxLauncher.Core;

namespace BerxLauncher.UI
{
    static class Dpi
    {
        public static float S = 1f;
        public static int P(float v) => (int)Math.Round(v * S);
    }

    /// <summary>Давхар буфертэй, өөрөө зурдаг суурь control.</summary>
    class Smooth : Control
    {
        public Smooth()
        {
            SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer |
                     ControlStyles.ResizeRedraw | ControlStyles.SupportsTransparentBackColor, true);
            BackColor = Theme.Bg;
            ForeColor = Theme.Text;
        }
        protected Color Under => Parent is Card c ? c.Fill : (Parent?.BackColor ?? Theme.Bg);
    }

    class Card : Smooth
    {
        public Color Fill = Theme.Panel;
        public string Title;
        public string TitleRight;
        public float Radius = 14;
        public Card() { }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; Theme.Hq(g);
            g.Clear(Parent?.BackColor ?? Theme.Bg);
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            using (var p = Theme.Round(r, Dpi.P(Radius)))
            {
                using (var b = new LinearGradientBrush(new Rectangle(0, 0, Width, Math.Max(1, Height)), Theme.Lerp(Fill, Color.White, 0.025f), Fill, 90f)) g.FillPath(b, p);
                using (var pen = new Pen(Theme.Line)) g.DrawPath(pen, p);
            }
            if (!string.IsNullOrEmpty(Title))
            {
                Theme.Draw(g, Title.ToUpperInvariant(), Theme.Semi(8.5f), Theme.Muted, new Rectangle(Dpi.P(18), Dpi.P(14), Width - Dpi.P(36), Dpi.P(18)), TextFormatFlags.Left);
                if (!string.IsNullOrEmpty(TitleRight))
                    Theme.Draw(g, TitleRight, Theme.Ui(8.5f), Theme.Dim, new Rectangle(Dpi.P(18), Dpi.P(14), Width - Dpi.P(36), Dpi.P(18)), TextFormatFlags.Right);
            }
        }
    }

    class FlatButton : Smooth, IAnimated
    {
        public enum Kind { Normal, Primary, Danger, Ghost, Success }
        public Kind Style = Kind.Normal;
        public string Glyph;           // Segoe Fluent/MDL2 icon
        public string Sub;
        public Font TextFont;
        public float Radius = 10;
        bool hover, down, busy;
        float hoverT, busyPhase;

        public bool Busy { get => busy; set { if (busy == value) return; busy = value; Cursor = value ? Cursors.WaitCursor : Cursors.Hand; Invalidate(); } }

        public FlatButton()
        {
            Cursor = Cursors.Hand;
            TabStop = true;
            Animator.Add(this);
        }

        protected override void Dispose(bool disposing) { Animator.Remove(this); base.Dispose(disposing); }

        public void Tick(float dt)
        {
            float target = hover && Enabled && !busy ? 1 : 0;
            if (Math.Abs(hoverT - target) > 0.001f) { hoverT += Math.Sign(target - hoverT) * Math.Min(Math.Abs(target - hoverT), dt * 7); Invalidate(); }
            if (busy) { busyPhase += dt * 60; Invalidate(); }
        }

        protected override void OnTextChanged(EventArgs e) { Invalidate(); base.OnTextChanged(e); }
        protected override void OnMouseEnter(EventArgs e) { hover = true; base.OnMouseEnter(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = false; down = false; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseDown(MouseEventArgs e) { if (e.Button == MouseButtons.Left) { down = true; Invalidate(); } base.OnMouseDown(e); }
        protected override void OnMouseUp(MouseEventArgs e) { down = false; Invalidate(); base.OnMouseUp(e); }
        protected override void OnEnabledChanged(EventArgs e) { Cursor = Enabled ? Cursors.Hand : Cursors.Default; Invalidate(); base.OnEnabledChanged(e); }
        protected override void OnClick(EventArgs e) { if (Enabled && !busy) base.OnClick(e); }
        protected override void OnKeyDown(KeyEventArgs e) { if (e.KeyCode == Keys.Enter || e.KeyCode == Keys.Space) OnClick(EventArgs.Empty); base.OnKeyDown(e); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; Theme.Hq(g);
            g.Clear(Under);
            Color fill, border, fore;
            switch (Style)
            {
                case Kind.Primary: fill = Theme.Lerp(Theme.Accent, Theme.AccentHi, hoverT); border = fill; fore = Color.White; break;
                case Kind.Danger: fill = Theme.Lerp(Theme.A(Theme.Red, 26), Theme.A(Theme.Red, 60), hoverT); border = Theme.A(Theme.Red, 150); fore = Theme.Lerp(Hex(0xFF8A8C), Color.White, hoverT); break;
                case Kind.Ghost: fill = Theme.Lerp(Theme.A(Theme.Panel3, 0), Theme.Panel3, hoverT); border = Theme.Lerp(Theme.Line, Theme.Dim, hoverT); fore = Theme.Text; break;
                case Kind.Success: fill = Theme.A(Theme.Green, 26); border = Theme.A(Theme.Green, 150); fore = Theme.Green; break;
                default: fill = Theme.Lerp(Theme.Panel2, Theme.Panel3, hoverT); border = Theme.Lerp(Theme.Line, Theme.A(Theme.Accent, 140), hoverT); fore = Theme.Text; break;
            }
            if (!Enabled && !busy && Style != Kind.Success) { fill = Style == Kind.Primary ? Theme.Lerp(Theme.Accent, Theme.Panel2, 0.72f) : Theme.Lerp(fill, Under, 0.5f); border = Theme.Line; fore = Theme.Dim; }
            if (down) fill = Theme.Lerp(fill, Color.Black, 0.15f);

            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            using (var path = Theme.Round(r, Dpi.P(Radius)))
            {
                using (var b = new SolidBrush(fill)) g.FillPath(b, path);
                if (Style == Kind.Primary && Enabled && !busy)
                {
                    using (var glow = new LinearGradientBrush(new Rectangle(0, 0, Width, Math.Max(1, Height)), Theme.A(Color.White, 40), Theme.A(Color.White, 0), 90f))
                    using (var top = Theme.Round(new RectangleF(1, 1, Width - 3, Height / 2f), Dpi.P(Radius))) g.FillPath(glow, top);
                }
                if (busy)
                {
                    var clip = g.Clip; g.SetClip(path);
                    float step = Dpi.P(22);
                    using (var sb = new SolidBrush(Theme.A(Color.White, 34)))
                        for (float x = -Height * 2 + busyPhase % (step * 2); x < Width + Height; x += step * 2)
                            g.FillPolygon(sb, new[] { new PointF(x, Height), new PointF(x + step, Height), new PointF(x + step + Height, 0), new PointF(x + Height, 0) });
                    g.Clip = clip;
                }
                using (var pen = new Pen(border)) g.DrawPath(pen, path);
            }

            var font = TextFont ?? Theme.Semi(10f);
            var textSize = TextRenderer.MeasureText(Text ?? "", font, Size.Empty, TextFormatFlags.NoPadding);
            int glyphW = 0;
            Font gf = null;
            if (!string.IsNullOrEmpty(Glyph)) { gf = Theme.Icons(font.Size * 0.95f); glyphW = TextRenderer.MeasureText(Glyph, gf, Size.Empty, TextFormatFlags.NoPadding).Width + Dpi.P(8); }
            int subH = string.IsNullOrEmpty(Sub) ? 0 : Dpi.P(18);
            int total = glyphW + textSize.Width;
            int x0 = (Width - total) / 2, cy = (Height - subH) / 2;
            if (gf != null) Theme.Draw(g, Glyph, gf, fore, new Rectangle(x0, cy - textSize.Height / 2, glyphW, textSize.Height), TextFormatFlags.VerticalCenter | TextFormatFlags.Left);
            Theme.Draw(g, Text, font, fore, new Rectangle(x0 + glyphW, cy - textSize.Height / 2, textSize.Width + 2, textSize.Height), TextFormatFlags.VerticalCenter | TextFormatFlags.Left);
            if (subH > 0)
                Theme.Draw(g, Sub, Theme.Ui(8.5f), Style == Kind.Primary && Enabled ? Theme.A(Color.White, 215) : Style == Kind.Success ? Theme.A(Theme.Green, 200) : Theme.Muted,
                    new Rectangle(Dpi.P(10), cy + textSize.Height / 2 + Dpi.P(2), Width - Dpi.P(20), subH), TextFormatFlags.HorizontalCenter | TextFormatFlags.EndEllipsis);
        }

        static Color Hex(int v) => Color.FromArgb(255, (v >> 16) & 255, (v >> 8) & 255, v & 255);
    }

    static class StateStyle
    {
        public static Color Color(CompState s) => s switch
        {
            CompState.Running => Theme.Green,
            CompState.Error => Theme.Red,
            CompState.Starting => Theme.Accent,
            _ => Theme.Gray
        };
    }

    class StatusCard : Smooth, IAnimated
    {
        public string Title, Glyph;
        public string StateText = "—", Detail = "";
        public CompState State = CompState.Unknown;
        float pulse;

        public StatusCard() { Animator.Add(this); }
        protected override void Dispose(bool disposing) { Animator.Remove(this); base.Dispose(disposing); }
        public void Tick(float dt) { if (State == CompState.Running || State == CompState.Starting || State == CompState.Error) { pulse += dt; Invalidate(new Rectangle(0, 0, Dpi.P(60), Height)); } }

        public void Set(CompState s, string text, string detail)
        {
            if (s == State && text == StateText && detail == Detail) return;
            State = s; StateText = text; Detail = detail ?? ""; Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; Theme.Hq(g);
            g.Clear(Under);
            var c = StateStyle.Color(State);
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            using (var p = Theme.Round(r, Dpi.P(12)))
            {
                using (var b = new SolidBrush(Theme.Panel2)) g.FillPath(b, p);
                if (State == CompState.Running || State == CompState.Error)
                    using (var gl = new LinearGradientBrush(new Rectangle(0, 0, Math.Max(1, Width), Math.Max(1, Height)), Theme.A(c, 26), Theme.A(c, 0), 0f)) g.FillPath(gl, p);
                using (var pen = new Pen(State == CompState.Running ? Theme.A(c, 90) : State == CompState.Error ? Theme.A(c, 120) : Theme.Line)) g.DrawPath(pen, p);
            }
            int pad = Dpi.P(14);
            // icon
            if (!string.IsNullOrEmpty(Glyph))
                Theme.Draw(g, Glyph, Theme.Icons(11f), Theme.Muted, new Rectangle(pad, pad - Dpi.P(1), Dpi.P(20), Dpi.P(20)), TextFormatFlags.Left);
            Theme.Draw(g, Title, Theme.Semi(8.5f), Theme.Muted, new Rectangle(pad + Dpi.P(22), pad, Width - pad * 2 - Dpi.P(22), Dpi.P(18)), TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
            // dot + state
            float dotY = pad + Dpi.P(33), dotX = pad + Dpi.P(5);
            float pr = State == CompState.Unknown || State == CompState.Stopped ? 0 : (float)(0.5 + 0.5 * Math.Sin(pulse * (State == CompState.Starting ? 7 : 3)));
            using (var halo = new SolidBrush(Theme.A(c, (int)(55 * pr)))) g.FillEllipse(halo, dotX - Dpi.P(9), dotY - Dpi.P(9), Dpi.P(18), Dpi.P(18));
            using (var dot = new SolidBrush(c)) g.FillEllipse(dot, dotX - Dpi.P(5), dotY - Dpi.P(5), Dpi.P(10), Dpi.P(10));
            var stFont = Theme.Display(13.5f, FontStyle.Bold);
            int avail = Width - pad * 2 - Dpi.P(18);
            if (TextRenderer.MeasureText(StateText ?? "", stFont, Size.Empty, TextFormatFlags.NoPadding).Width > avail) stFont = Theme.Display(11f, FontStyle.Bold);
            Theme.Draw(g, StateText, stFont, State == CompState.Unknown || State == CompState.Stopped ? Theme.Muted : (State == CompState.Running ? Theme.Text : c),
                new Rectangle(pad + Dpi.P(18), (int)dotY - Dpi.P(13), Width - pad * 2 - Dpi.P(18), Dpi.P(26)), TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis);
            Theme.Draw(g, Detail, Theme.Ui(8.5f), Theme.Dim, new Rectangle(pad, Height - pad - Dpi.P(16), Width - pad * 2, Dpi.P(17)), TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
            if (!string.IsNullOrEmpty(Detail) && Detail.Length > 28) toolTipText = Detail; else toolTipText = null;
        }

        string toolTipText;
        static readonly ToolTip tip = new ToolTip { InitialDelay = 300 };
        protected override void OnMouseHover(EventArgs e) { if (toolTipText != null) tip.Show(toolTipText, this, Dpi.P(12), Height, 6000); base.OnMouseHover(e); }
        protected override void OnMouseLeave(EventArgs e) { tip.Hide(this); base.OnMouseLeave(e); }
    }

    class MetricTile : Smooth
    {
        public string Label, Value = "—", Sub;
        public Color ValueColor = Theme.Text;

        public void Set(string value, string sub = null, Color? color = null)
        {
            var vc = color ?? Theme.Text;
            if (value == Value && sub == Sub && vc == ValueColor) return;
            Value = value; Sub = sub; ValueColor = vc; Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; Theme.Hq(g);
            g.Clear(Under);
            int pad = Dpi.P(4);
            Theme.Draw(g, Label?.ToUpperInvariant(), Theme.Semi(7.5f), Theme.Dim, new Rectangle(pad, 0, Width - pad, Dpi.P(16)), TextFormatFlags.Left);
            var isDash = Value == "—";
            var vf = Theme.Display(isDash ? 15f : 16f);
            if (!isDash && TextRenderer.MeasureText(Value ?? "", vf, Size.Empty, TextFormatFlags.NoPadding).Width > Width - pad) vf = Theme.Display(12.5f);
            Theme.Draw(g, Value, vf, isDash ? Theme.Dim : ValueColor, new Rectangle(pad - Dpi.P(1), Dpi.P(16), Width - pad, Dpi.P(30)), TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
            if (!string.IsNullOrEmpty(Sub))
                Theme.Draw(g, Sub, Theme.Ui(8f), Theme.Muted, new Rectangle(pad, Dpi.P(46), Width - pad, Dpi.P(16)), TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
        }
    }

    class StatusPill : Smooth, IAnimated
    {
        public enum Mode { Offline, Online, Busy }
        Mode mode = Mode.Offline;
        string text = "SERVER OFFLINE";
        float t;

        public StatusPill() { Animator.Add(this); }
        protected override void Dispose(bool disposing) { Animator.Remove(this); base.Dispose(disposing); }
        public void Tick(float dt) { if (mode != Mode.Offline) { t += dt; Invalidate(); } }
        public void Set(Mode m, string label) { if (m == mode && label == text) return; mode = m; text = label; Invalidate(); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; Theme.Hq(g);
            g.Clear(Under);
            var c = mode == Mode.Online ? Theme.Green : mode == Mode.Busy ? Theme.Accent : Theme.Gray;
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            using (var p = Theme.Round(r, Height / 2f))
            {
                using (var b = new SolidBrush(Theme.A(c, mode == Mode.Offline ? 22 : 30))) g.FillPath(b, p);
                using (var pen = new Pen(Theme.A(c, mode == Mode.Offline ? 90 : 150), Dpi.P(1.2f))) g.DrawPath(pen, p);
            }
            float pr = mode == Mode.Offline ? 0 : (float)(0.5 + 0.5 * Math.Sin(t * (mode == Mode.Busy ? 7 : 2.6)));
            float cx = Dpi.P(22), cy = Height / 2f;
            using (var halo = new SolidBrush(Theme.A(c, (int)(70 * pr)))) g.FillEllipse(halo, cx - Dpi.P(10), cy - Dpi.P(10), Dpi.P(20), Dpi.P(20));
            using (var dot = new SolidBrush(c)) g.FillEllipse(dot, cx - Dpi.P(5.5f), cy - Dpi.P(5.5f), Dpi.P(11), Dpi.P(11));
            Theme.Draw(g, text, Theme.Display(12.5f), mode == Mode.Offline ? Theme.Muted : c,
                new Rectangle(Dpi.P(38), 0, Width - Dpi.P(50), Height), TextFormatFlags.Left | TextFormatFlags.VerticalCenter);
        }
    }

    class ErrorBanner : Smooth
    {
        string message;
        public event EventHandler Dismissed;
        public string Message => message;

        public void Show(string msg, int width)
        {
            message = msg;
            var sz = TextRenderer.MeasureText(msg, Theme.Ui(9.5f), new Size(width - Dpi.P(90), 0), TextFormatFlags.WordBreak);
            Height = Math.Max(Dpi.P(52), sz.Height + Dpi.P(26));
            Visible = true; Invalidate();
        }

        Rectangle CloseRect => new Rectangle(Width - Dpi.P(40), Dpi.P(10), Dpi.P(28), Dpi.P(28));

        protected override void OnMouseMove(MouseEventArgs e) { Cursor = CloseRect.Contains(e.Location) ? Cursors.Hand : Cursors.Default; base.OnMouseMove(e); }
        protected override void OnMouseClick(MouseEventArgs e) { if (CloseRect.Contains(e.Location)) { Visible = false; Dismissed?.Invoke(this, EventArgs.Empty); } base.OnMouseClick(e); }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; Theme.Hq(g);
            g.Clear(Under);
            var r = new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f);
            using (var p = Theme.Round(r, Dpi.P(12)))
            {
                using (var b = new SolidBrush(Color.FromArgb(255, 44, 20, 22))) g.FillPath(b, p);
                using (var pen = new Pen(Theme.A(Theme.Red, 150))) g.DrawPath(pen, p);
            }
            using (var bar = new SolidBrush(Theme.Red)) g.FillRectangle(bar, Dpi.P(1), Dpi.P(10), Dpi.P(3), Height - Dpi.P(20));
            Theme.Draw(g, "", Theme.Icons(13f), Theme.Red, new Rectangle(Dpi.P(16), Dpi.P(13), Dpi.P(26), Dpi.P(26)), TextFormatFlags.Left);
            Theme.Draw(g, message, Theme.Ui(9.5f), Theme.Text, new Rectangle(Dpi.P(48), Dpi.P(13), Width - Dpi.P(96), Height - Dpi.P(20)), TextFormatFlags.WordBreak | TextFormatFlags.Left);
            Theme.Draw(g, "", Theme.Icons(10f), Theme.Muted, CloseRect, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
        }
    }

    class SegTabs : Smooth
    {
        public string[] Items = new string[0];
        public int Selected;
        public event EventHandler SelectedChanged;
        int hover = -1;

        Rectangle ItemRect(int i)
        {
            int w = Width / Math.Max(1, Items.Length);
            return new Rectangle(i * w, 0, w, Height);
        }

        protected override void OnMouseMove(MouseEventArgs e) { int h = -1; for (int i = 0; i < Items.Length; i++) if (ItemRect(i).Contains(e.Location)) h = i; if (h != hover) { hover = h; Cursor = h >= 0 ? Cursors.Hand : Cursors.Default; Invalidate(); } base.OnMouseMove(e); }
        protected override void OnMouseLeave(EventArgs e) { hover = -1; Invalidate(); base.OnMouseLeave(e); }
        protected override void OnMouseClick(MouseEventArgs e)
        {
            for (int i = 0; i < Items.Length; i++)
                if (ItemRect(i).Contains(e.Location) && i != Selected) { Selected = i; Invalidate(); SelectedChanged?.Invoke(this, EventArgs.Empty); }
            base.OnMouseClick(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; Theme.Hq(g);
            g.Clear(Under);
            using (var p = Theme.Round(new RectangleF(0.5f, 0.5f, Width - 1.5f, Height - 1.5f), Height / 2f))
            using (var b = new SolidBrush(Theme.Panel2)) g.FillPath(b, p);
            for (int i = 0; i < Items.Length; i++)
            {
                var r = ItemRect(i); r.Inflate(-Dpi.P(3), -Dpi.P(3));
                if (i == Selected)
                    using (var p = Theme.Round(r, r.Height / 2f)) using (var b = new SolidBrush(Theme.Accent)) g.FillPath(b, p);
                else if (i == hover)
                    using (var p = Theme.Round(r, r.Height / 2f)) using (var b = new SolidBrush(Theme.Panel3)) g.FillPath(b, p);
                Theme.Draw(g, Items[i], Theme.Semi(8.5f), i == Selected ? Color.White : Theme.Muted, r, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
            }
        }
    }

    /// <summary>Өнгөт live log (custom зурдаг — DrawToBitmap/скриншотод ч харагдана).</summary>
    class LogView : Smooth
    {
        sealed class Row { public LogLine Line; public string Text; public bool First; }
        readonly List<LogLine> lines = new List<LogLine>();
        readonly List<Row> rows = new List<Row>();
        int top;                 // эхний харагдах мөр
        bool follow = true;
        int cols = 80;
        public string Filter = "all";
        bool dragThumb; int dragStartY, dragStartTop;
        const int MaxLines = 1500;

        public LogView() { Font = Theme.Mono(8.75f); }

        int LineH => TextRenderer.MeasureText("Ag", Font, Size.Empty, TextFormatFlags.NoPadding).Height + Dpi.P(3);
        int CharW => Math.Max(1, TextRenderer.MeasureText("0000000000", Font, Size.Empty, TextFormatFlags.NoPadding).Width / 10);
        int VisibleRows => Math.Max(1, (Height - Dpi.P(16)) / LineH);
        const int Prefix = 16; // "HH:mm:ss AGENT  "

        public void Add(LogLine l)
        {
            lines.Add(l);
            if (lines.Count > MaxLines) { lines.RemoveRange(0, lines.Count - MaxLines); Rebuild(); }
            else if (Pass(l)) Wrap(l);
            if (follow) top = Math.Max(0, rows.Count - VisibleRows);
            Invalidate();
        }

        public void Clear() { lines.Clear(); rows.Clear(); top = 0; follow = true; Invalidate(); }

        public string AllText() => string.Join(Environment.NewLine, lines.Where(Pass).Select(l => $"{l.Time:HH:mm:ss} [{l.Source}] {l.Text}"));

        bool Pass(LogLine l) => Filter == "all" || l.Source == Filter;

        public void SetFilter(string f) { Filter = f; Rebuild(); top = Math.Max(0, rows.Count - VisibleRows); follow = true; Invalidate(); }

        void Rebuild() { rows.Clear(); foreach (var l in lines) if (Pass(l)) Wrap(l); }

        void Wrap(LogLine l)
        {
            int width = Math.Max(20, cols - Prefix);
            var text = (l.Text ?? "").Replace("\r", "");
            bool first = true;
            foreach (var para in text.Split('\n'))
            {
                var s = para;
                do
                {
                    int take = Math.Min(width, s.Length);
                    if (take < s.Length) { int sp = s.LastIndexOf(' ', take); if (sp > width / 2) take = sp + 1; }
                    rows.Add(new Row { Line = l, Text = s.Substring(0, take), First = first });
                    first = false;
                    s = s.Substring(take);
                } while (s.Length > 0);
            }
        }

        protected override void OnResize(EventArgs e)
        {
            int c = Math.Max(30, (Width - Dpi.P(30)) / CharW);
            if (c != cols) { cols = c; Rebuild(); if (follow) top = Math.Max(0, rows.Count - VisibleRows); }
            base.OnResize(e);
        }

        protected override void OnMouseWheel(MouseEventArgs e)
        {
            ScrollBy(-Math.Sign(e.Delta) * 3);
            base.OnMouseWheel(e);
        }

        void ScrollBy(int d)
        {
            int max = Math.Max(0, rows.Count - VisibleRows);
            top = Math.Max(0, Math.Min(max, top + d));
            follow = top >= max;
            Invalidate();
        }

        Rectangle Thumb()
        {
            int max = Math.Max(0, rows.Count - VisibleRows);
            if (max == 0) return Rectangle.Empty;
            int track = Height - Dpi.P(16);
            int h = Math.Max(Dpi.P(24), track * VisibleRows / Math.Max(1, rows.Count));
            int y = Dpi.P(8) + (int)((track - h) * (top / (float)max));
            return new Rectangle(Width - Dpi.P(9), y, Dpi.P(5), h);
        }

        protected override void OnMouseDown(MouseEventArgs e)
        {
            var t = Thumb(); t.Inflate(Dpi.P(4), 0);
            if (!t.IsEmpty && t.Contains(e.Location)) { dragThumb = true; dragStartY = e.Y; dragStartTop = top; }
            Focus();
            base.OnMouseDown(e);
        }
        protected override void OnMouseUp(MouseEventArgs e) { dragThumb = false; base.OnMouseUp(e); }
        protected override void OnMouseMove(MouseEventArgs e)
        {
            if (dragThumb)
            {
                int max = Math.Max(0, rows.Count - VisibleRows);
                int track = Height - Dpi.P(16) - Thumb().Height;
                if (track > 0) { top = dragStartTop; ScrollBy((int)((e.Y - dragStartY) / (float)track * max)); }
            }
            base.OnMouseMove(e);
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.Clear(Under);
            int lh = LineH, cw = CharW, x0 = Dpi.P(10), y = Dpi.P(8);
            if (rows.Count == 0)
            {
                Theme.Draw(g, "Log хоосон байна", Theme.Ui(9f), Theme.Dim, new Rectangle(0, 0, Width, Height), TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter);
                return;
            }
            for (int i = top; i < Math.Min(rows.Count, top + VisibleRows + 1); i++, y += lh)
            {
                var r = rows[i];
                if (r.First)
                {
                    Theme.Draw(g, r.Line.Time.ToString("HH:mm:ss"), Font, Theme.Dim, new Rectangle(x0, y, cw * 9, lh), TextFormatFlags.Left);
                    bool agent = r.Line.Source == "agent";
                    Theme.Draw(g, agent ? "AGENT" : "BERX", Font, agent ? Theme.Blue : Theme.Accent, new Rectangle(x0 + cw * 9, y, cw * 7, lh), TextFormatFlags.Left);
                }
                var c = r.Line.Level switch { LogLevel.Error => Theme.Red, LogLevel.Warn => Theme.Yellow, LogLevel.Ok => Theme.Green, _ => Theme.Text };
                Theme.Draw(g, r.Text, Font, c, new Rectangle(x0 + cw * Prefix, y, Width - x0 - cw * Prefix - Dpi.P(14), lh), TextFormatFlags.Left | TextFormatFlags.EndEllipsis);
            }
            var t = Thumb();
            if (!t.IsEmpty)
            {
                Theme.Hq(g);
                using (var p = Theme.Round(t, t.Width / 2f)) using (var b = new SolidBrush(Theme.Panel3)) g.FillPath(b, p);
            }
        }
    }

    /// <summary>Шошго — утга хос мөрүүд (зам, хаяг).</summary>
    class InfoList : Smooth
    {
        public List<KeyValuePair<string, string>> Items = new List<KeyValuePair<string, string>>();
        static readonly ToolTip tip = new ToolTip();

        public void Set(List<KeyValuePair<string, string>> items)
        {
            Items = items; Invalidate();
            tip.SetToolTip(this, string.Join(Environment.NewLine, items.Select(i => i.Key + ": " + i.Value)));
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics;
            g.Clear(Under);
            int y = 0, rowH = Dpi.P(38);
            foreach (var kv in Items)
            {
                if (y + rowH > Height + Dpi.P(4)) break;
                Theme.Draw(g, kv.Key.ToUpperInvariant(), Theme.Semi(7.5f), Theme.Dim, new Rectangle(0, y, Width, Dpi.P(15)), TextFormatFlags.Left);
                Theme.Draw(g, kv.Value, Theme.Ui(9f), Theme.Text, new Rectangle(0, y + Dpi.P(15), Width, Dpi.P(19)), TextFormatFlags.Left | TextFormatFlags.PathEllipsis);
                y += rowH;
            }
        }
    }

    sealed class DarkMenuColors : ProfessionalColorTable
    {
        public override Color ToolStripDropDownBackground => Theme.Panel2;
        public override Color MenuItemSelected => Theme.Panel3;
        public override Color MenuItemSelectedGradientBegin => Theme.Panel3;
        public override Color MenuItemSelectedGradientEnd => Theme.Panel3;
        public override Color MenuItemBorder => Theme.A(Theme.Accent, 120);
        public override Color MenuBorder => Theme.Line;
        public override Color ImageMarginGradientBegin => Theme.Panel2;
        public override Color ImageMarginGradientMiddle => Theme.Panel2;
        public override Color ImageMarginGradientEnd => Theme.Panel2;
        public override Color SeparatorDark => Theme.Line;
        public override Color SeparatorLight => Theme.Panel2;
    }
}
