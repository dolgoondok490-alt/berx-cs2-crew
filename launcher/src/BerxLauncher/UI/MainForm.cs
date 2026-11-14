using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using BerxLauncher.Core;
using BerxLauncher.Platform;

namespace BerxLauncher.UI
{
    sealed class MainForm : Form
    {
        readonly string settingsPath;
        readonly CliOptions cli;
        readonly LogHub log;
        readonly Orchestrator orch;
        readonly StatusMonitor monitor;
        AgentLogTail tail;
        LauncherSettings settings;

        // controls
        readonly StatusPill pill = new StatusPill();
        readonly ErrorBanner banner = new ErrorBanner { Visible = false };
        readonly Card serverCard = new Card { Title = "Сервер удирдлага" };
        readonly FlatButton btnStart = new FlatButton { Text = "START SERVER", Style = FlatButton.Kind.Primary, Glyph = "", Radius = 14 };
        readonly FlatButton btnStop = new FlatButton { Text = "STOP", Style = FlatButton.Kind.Danger, Glyph = "" };
        readonly FlatButton btnRestart = new FlatButton { Text = "RESTART", Glyph = "" };
        readonly FlatButton btnWeb = new FlatButton { Text = "BERX вэбсайт нээх", Glyph = "", Style = FlatButton.Kind.Ghost };
        readonly FlatButton btnCopy = new FlatButton { Text = "Connect хаяг хуулах", Glyph = "", Style = FlatButton.Kind.Ghost };
        readonly FlatButton btnSettings = new FlatButton { Text = "Тохиргоо", Glyph = "", Style = FlatButton.Kind.Ghost };
        readonly Card infoCard = new Card { Title = "Систем" };
        readonly InfoList info = new InfoList();
        readonly StatusCard cWg = new StatusCard { Title = "WIREGUARD", Glyph = "" };
        readonly StatusCard cServer = new StatusCard { Title = "CS2 DEDICATED SERVER", Glyph = "" };
        readonly StatusCard cAgent = new StatusCard { Title = "BERX AGENT", Glyph = "" };
        readonly StatusCard cRcon = new StatusCard { Title = "RCON", Glyph = "" };
        readonly Card metricsCard = new Card { Title = "Live" };
        readonly MetricTile mMap = new MetricTile { Label = "Map" };
        readonly MetricTile mPlayers = new MetricTile { Label = "Тоглогч" };
        readonly MetricTile mUptime = new MetricTile { Label = "Uptime" };
        readonly MetricTile mCpu = new MetricTile { Label = "CPU (сервер)" };
        readonly MetricTile mRam = new MetricTile { Label = "RAM (сервер)" };
        readonly MetricTile mPing = new MetricTile { Label = "VPS latency" };
        readonly Card logCard = new Card { Title = "Live logs" };
        readonly LogView logView = new LogView();
        readonly SegTabs logTabs = new SegTabs { Items = new[] { "Бүгд", "Launcher", "Agent" } };
        readonly FlatButton btnLogCopy = new FlatButton { Text = "Хуулах", Glyph = "", Style = FlatButton.Kind.Ghost, TextFont = null };
        readonly FlatButton btnLogFolder = new FlatButton { Text = "Хавтас", Glyph = "", Style = FlatButton.Kind.Ghost };

        NotifyIcon tray;
        ToolStripMenuItem trayStart, trayStop, trayRestart;
        readonly ConcurrentQueue<LogLine> pendingLogs = new ConcurrentQueue<LogLine>();
        readonly System.Windows.Forms.Timer uiTimer = new System.Windows.Forms.Timer { Interval = 120 };
        volatile bool closing;
        bool exiting, trayHintShown, stoppedForExit;
        static Bitmap logoBmp;
        StatusSnapshot last;
        string progressText;
        public int ExitCode { get; private set; }

        public MainForm(LauncherSettings settings, string settingsPath, CliOptions cli, string loadWarning)
        {
            this.settings = settings; this.settingsPath = settingsPath; this.cli = cli;
            Directory.CreateDirectory(LauncherSettings.AppDir);
            var logsDir = Path.Combine(LauncherSettings.AppDir, "logs");
            log = new LogHub(Path.Combine(logsDir, "launcher.log"));
            log.Line += l => pendingLogs.Enqueue(l);

            var host = new WindowsProcessHost();
            var wg = new WindowsWireGuard();
            var net = new WindowsNetProbe();
            orch = new Orchestrator(settings, host, wg, net, () => new RconClient(), log) { AgentLogFile = Path.Combine(logsDir, "agent.log") };
            orch.Progress += m => { progressText = m; };
            monitor = new StatusMonitor(orch, host, wg, net, () => new RconClient(), log);
            tail = new AgentLogTail(orch.AgentLogFile, log);
            monitor.AgentHealthSource = () => tail.Health;

            using (var g = CreateGraphics()) Dpi.S = g.DpiX / 96f;

            Text = "BERX ARENA Launcher";
            Icon = Theme.AppIcon(32);
            BackColor = Theme.Bg;
            ForeColor = Theme.Text;
            Font = Theme.Ui(9f);
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(Dpi.P(1180), Dpi.P(780));
            MinimumSize = new Size(Dpi.P(1020), Dpi.P(720));
            DoubleBuffered = true;
            SetStyle(ControlStyles.ResizeRedraw, true);
            KeyPreview = true;

            btnStart.TextFont = Theme.Display(19f);
            btnStart.Sub = "WireGuard → CS2 → RCON → Agent";
            foreach (var b in new[] { btnStop, btnRestart }) b.TextFont = Theme.Display(11.5f, FontStyle.Bold);
            foreach (var b in new[] { btnWeb, btnCopy, btnSettings, btnLogCopy, btnLogFolder }) b.TextFont ??= Theme.Semi(9f);
            btnLogCopy.TextFont = Theme.Semi(8.5f); btnLogFolder.TextFont = Theme.Semi(8.5f);

            serverCard.Controls.AddRange(new Control[] { btnStart, btnStop, btnRestart, btnCopy, btnWeb, btnSettings });
            infoCard.Controls.Add(info);
            metricsCard.Controls.AddRange(new Control[] { mMap, mPlayers, mUptime, mCpu, mRam, mPing });
            logCard.Controls.AddRange(new Control[] { logView, logTabs, btnLogCopy, btnLogFolder });
            Controls.AddRange(new Control[] { pill, banner, serverCard, infoCard, cWg, cServer, cAgent, cRcon, metricsCard, logCard });
            logView.BackColor = Theme.Panel;

            btnStart.Click += (s, e) => RunOp("start");
            btnStop.Click += (s, e) => RunOp("stop");
            btnRestart.Click += (s, e) => RunOp("restart");
            btnWeb.Click += (s, e) => OpenUrl(settings.WebsiteUrl);
            btnCopy.Click += (s, e) => CopyConnect();
            btnSettings.Click += (s, e) => OpenSettings();
            btnLogCopy.Click += (s, e) => { var t = logView.AllText(); if (t.Length > 0) { Clipboard.SetText(t); log.Info("Log санах ойд хуулагдлаа"); } };
            btnLogFolder.Click += (s, e) => { try { Process.Start("explorer.exe", "\"" + logsDir + "\""); } catch { /* ignore */ } };
            logTabs.SelectedChanged += (s, e) => logView.SetFilter(logTabs.Selected == 0 ? "all" : logTabs.Selected == 1 ? "launcher" : "agent");
            banner.Dismissed += (s, e) => LayoutUi();

            BuildTray();
            uiTimer.Tick += (s, e) => DrainLogs();
            uiTimer.Start();

            log.Info($"BERX ARENA Launcher v{Application.ProductVersion} эхэллээ");
            if (loadWarning != null) log.Warn(loadWarning);
            if (WindowsWireGuard.IsElevated()) log.Info("Administrator эрхтэй ажиллаж байна");
            UpdateInfo();
            UpdateButtons(null);
            LayoutUi();
        }

        protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); DarkTitle.Apply(Handle); }

        // ------------------------------------------------------------ layout
        protected override void OnResize(EventArgs e)
        {
            base.OnResize(e);
            if (WindowState == FormWindowState.Minimized && settings.MinimizeToTray && !cli.IsAutomation) { Hide(); ShowTrayHint(); }
            LayoutUi();
        }

        void LayoutUi()
        {
            if (ClientSize.Width < 100) return;
            int W = ClientSize.Width, H = ClientSize.Height, m = Dpi.P(24), gap = Dpi.P(14);
            int headerH = Dpi.P(92);
            pill.Bounds = new Rectangle(W - m - Dpi.P(230), Dpi.P(28), Dpi.P(230), Dpi.P(40));
            int y0 = headerH;
            if (banner.Visible) { banner.Bounds = new Rectangle(m, y0, W - 2 * m, banner.Height); y0 += banner.Height + gap; }

            int leftW = Dpi.P(350);
            int sx = Dpi.P(18), inner = leftW - 2 * sx;
            int y = Dpi.P(42);
            btnStart.Bounds = new Rectangle(sx, y, inner, Dpi.P(96)); y += Dpi.P(96) + Dpi.P(10);
            int half = (inner - Dpi.P(10)) / 2;
            btnStop.Bounds = new Rectangle(sx, y, half, Dpi.P(44));
            btnRestart.Bounds = new Rectangle(sx + half + Dpi.P(10), y, inner - half - Dpi.P(10), Dpi.P(44)); y += Dpi.P(44) + Dpi.P(18);
            btnCopy.Bounds = new Rectangle(sx, y + Dpi.P(22), inner, Dpi.P(40)); y += Dpi.P(22) + Dpi.P(40) + Dpi.P(8);
            btnWeb.Bounds = new Rectangle(sx, y, inner, Dpi.P(40)); y += Dpi.P(40) + Dpi.P(8);
            btnSettings.Bounds = new Rectangle(sx, y, inner, Dpi.P(40)); y += Dpi.P(40) + Dpi.P(18);
            serverCard.Bounds = new Rectangle(m, y0, leftW, y);
            infoCard.Bounds = new Rectangle(m, y0 + y + gap, leftW, Math.Max(Dpi.P(120), H - m - (y0 + y + gap)));
            info.Bounds = new Rectangle(sx, Dpi.P(40), inner, infoCard.Height - Dpi.P(52));
            info.BackColor = infoCard.Fill;

            int rx = m + leftW + gap, rw = W - rx - m;
            int cw = (rw - 3 * Dpi.P(12)) / 4, ch = Dpi.P(100);
            var cards = new[] { cWg, cServer, cAgent, cRcon };
            for (int i = 0; i < 4; i++) cards[i].Bounds = new Rectangle(rx + i * (cw + Dpi.P(12)), y0, i == 3 ? rw - 3 * (cw + Dpi.P(12)) : cw, ch);
            int my = y0 + ch + gap, mh = Dpi.P(108);
            metricsCard.Bounds = new Rectangle(rx, my, rw, mh);
            var tiles = new[] { mMap, mPlayers, mUptime, mCpu, mRam, mPing };
            int tx = Dpi.P(18), tw = (rw - 2 * tx) / tiles.Length;
            for (int i = 0; i < tiles.Length; i++) tiles[i].Bounds = new Rectangle(tx + i * tw, Dpi.P(38), tw - Dpi.P(8), Dpi.P(64));
            int ly = my + mh + gap;
            logCard.Bounds = new Rectangle(rx, ly, rw, Math.Max(Dpi.P(160), H - m - ly));
            logTabs.Bounds = new Rectangle(rw - Dpi.P(18) - Dpi.P(220) - Dpi.P(200), Dpi.P(9), Dpi.P(220), Dpi.P(28));
            btnLogCopy.Bounds = new Rectangle(rw - Dpi.P(18) - Dpi.P(192), Dpi.P(9), Dpi.P(92), Dpi.P(28));
            btnLogFolder.Bounds = new Rectangle(rw - Dpi.P(18) - Dpi.P(92), Dpi.P(9), Dpi.P(92), Dpi.P(28));
            logView.Bounds = new Rectangle(Dpi.P(8), Dpi.P(44), rw - Dpi.P(16), logCard.Height - Dpi.P(52));
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            var g = e.Graphics; Theme.Hq(g);
            g.Clear(Theme.Bg);
            // header glow
            using (var gp = new GraphicsPath())
            {
                var er = new Rectangle(-Dpi.P(160), -Dpi.P(150), Dpi.P(760), Dpi.P(300));
                gp.AddEllipse(er);
                using (var pb = new PathGradientBrush(gp) { CenterColor = Theme.A(Theme.Accent, 34), SurroundColors = new[] { Theme.A(Theme.Accent, 0) } })
                    g.FillEllipse(pb, er);
            }
            int m = Dpi.P(24);
            logoBmp ??= Theme.AppBitmap(Dpi.P(46));
            g.DrawImage(logoBmp, m, Dpi.P(24), Dpi.P(46), Dpi.P(46));
            int tx = m + Dpi.P(60);
            Theme.Draw(g, "B E R X   C S 2   C R E W   ·   S E R V E R   L A U N C H E R", Theme.Semi(7f), Theme.Dim, new Rectangle(tx, Dpi.P(20), Dpi.P(520), Dpi.P(14)), TextFormatFlags.Left);
            var big = Theme.Display(26f);
            var w1 = TextRenderer.MeasureText("BERX", big, Size.Empty, TextFormatFlags.NoPadding).Width;
            Theme.Draw(g, "BERX", big, Theme.Text, new Rectangle(tx - Dpi.P(2), Dpi.P(34), w1 + Dpi.P(6), Dpi.P(44)), TextFormatFlags.Left);
            Theme.Draw(g, "ARENA", big, Theme.Accent, new Rectangle(tx + w1 - Dpi.P(6), Dpi.P(34), Dpi.P(200), Dpi.P(44)), TextFormatFlags.Left);
            // connect label inside server card is drawn by card paint hook below
        }

        // server card: connect address label above copy button
        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
            serverCard.Paint += (s, pe) =>
            {
                var r = btnCopy.Bounds;
                Theme.Draw(pe.Graphics, "CONNECT", Theme.Semi(7.5f), Theme.Dim, new Rectangle(r.X, r.Y - Dpi.P(22), Dpi.P(70), Dpi.P(18)), TextFormatFlags.Left | TextFormatFlags.VerticalCenter);
                Theme.Draw(pe.Graphics, string.IsNullOrEmpty(settings.PublicAddress) ? "(тохируулаагүй)" : settings.PublicAddress, Theme.Mono(9.5f), Theme.Text,
                    new Rectangle(r.X + Dpi.P(70), r.Y - Dpi.P(22), r.Width - Dpi.P(70), Dpi.P(18)), TextFormatFlags.Right | TextFormatFlags.VerticalCenter);
            };
            foreach (var l in log.Snapshot()) logView.Add(l);
            while (pendingLogs.TryDequeue(out _)) { }
            new Thread(PollLoop) { IsBackground = true, Name = "status-poll" }.Start();
        }

        protected override void OnShown(EventArgs e)
        {
            base.OnShown(e);
            if (cli.IsAutomation) { _ = Automation(); return; }
            if (cli.Minimized || settings.StartMinimized) { Hide(); }
            if (settings.AutoStartServer) Task.Delay(1500).ContinueWith(_ => BeginInvoke((Action)(() => { if (last == null || !last.Online) RunOp("start"); })));
        }

        // ------------------------------------------------------------ polling
        void PollLoop()
        {
            int tick = 0;
            while (!closing)
            {
                try
                {
                    tail.Pump();
                    bool busy = orch.Busy;
                    if (tick % (busy ? 2 : 4) == 0)
                    {
                        var snap = monitor.Poll();
                        if (!closing && IsHandleCreated) BeginInvoke((Action)(() => ApplySnapshot(snap)));
                    }
                }
                catch (Exception ex) { log.Warn("Төлөв шалгахад алдаа: " + ex.Message); }
                tick++;
                Thread.Sleep(500);
            }
        }

        void DrainLogs()
        {
            int n = 0;
            while (n < 200 && pendingLogs.TryDequeue(out var l)) { logView.Add(l); n++; }
            if (orch.Busy && progressText != null && btnStart.Busy) btnStart.Sub = progressText;
        }

        static string MapName(string m)
        {
            var n = System.Text.RegularExpressions.Regex.Replace(m, "^(de|cs|ar|aim|workshop)_", "");
            if (n == "dust2") return "Dust II";
            return n.Length > 0 ? char.ToUpperInvariant(n[0]) + n.Substring(1) : m;
        }

        static string Fmt(TimeSpan t) => t.TotalHours >= 1 ? $"{(int)t.TotalHours}:{t.Minutes:00}:{t.Seconds:00}" : $"{t.Minutes:00}:{t.Seconds:00}";

        void ApplySnapshot(StatusSnapshot s)
        {
            last = s;
            string St(CompState c, string run, string stop) => c switch { CompState.Running => run, CompState.Error => "Error", CompState.Starting => "Starting…", _ => stop };
            cWg.Set(s.WireGuard, St(s.WireGuard, "Active", "Inactive"), s.WireGuardDetail);
            cServer.Set(s.Server, St(s.Server, "Running", "Stopped"), "Dedicated · " + s.ServerDetail);
            cAgent.Set(s.Agent, St(s.Agent, "Running", "Stopped"), s.AgentDetail);
            cRcon.Set(s.Rcon, St(s.Rcon, "Connected", "Disconnected"), s.RconDetail);

            bool srv = s.Server == CompState.Running;
            mMap.Set(srv && !string.IsNullOrEmpty(s.Map) ? MapName(s.Map) : "—", srv && !string.IsNullOrEmpty(s.Map) ? s.Map : null);
            if (srv && s.Players.HasValue)
                mPlayers.Set(s.MaxPlayers.HasValue ? $"{s.Players} / {s.MaxPlayers}" : s.Players.ToString(), s.Bots > 0 ? $"+{s.Bots} bot" : null);
            else mPlayers.Set("—");
            mUptime.Set(srv && s.Uptime.HasValue ? Fmt(s.Uptime.Value) : "—");
            mCpu.Set(srv && s.CpuPercent.HasValue ? $"{s.CpuPercent:0.0}%" : "—", srv ? $"{Environment.ProcessorCount} core" : null,
                s.CpuPercent > 85 ? Theme.Red : s.CpuPercent > 60 ? Theme.Yellow : (Color?)null);
            mRam.Set(srv && s.RamBytes.HasValue ? (s.RamBytes.Value >= 1L << 30 ? $"{s.RamBytes.Value / (double)(1L << 30):0.00} GB" : $"{s.RamBytes.Value / (1 << 20)} MB") : "—");
            mPing.Set(s.LatencyMs.HasValue ? $"{s.LatencyMs} ms" : "—", s.LatencyMs.HasValue ? settings.VpsIp : null,
                s.LatencyMs > 120 ? Theme.Red : s.LatencyMs > 60 ? Theme.Yellow : (s.LatencyMs.HasValue ? Theme.Green : (Color?)null));

            if (s.Busy) pill.Set(StatusPill.Mode.Busy, s.Op == "stop" ? "STOPPING…" : s.Op == "restart" ? "RESTARTING…" : "STARTING…");
            else pill.Set(s.Online ? StatusPill.Mode.Online : StatusPill.Mode.Offline, s.Online ? "SERVER ONLINE" : "SERVER OFFLINE");
            if (tray != null) tray.Text = s.Online ? "BERX ARENA · ONLINE" : s.Busy ? "BERX ARENA · ..." : "BERX ARENA · OFFLINE";
            UpdateButtons(s);
        }

        void UpdateButtons(StatusSnapshot s)
        {
            bool busy = orch.Busy || btnStart.Busy;
            bool online = s?.Online == true;
            bool anything = s != null && (s.Server == CompState.Running || s.AgentPid != null || (settings.ManageWireGuard && s.WireGuard != CompState.Stopped && s.WireGuard != CompState.Unknown));
            btnStart.Enabled = !busy && !online;
            if (!busy)
            {
                btnStart.Text = online ? "SERVER ONLINE" : "START SERVER";
                btnStart.Sub = online ? "Бүх хэсэг ажиллаж байна" : (s != null && s.Server == CompState.Running ? "Дутуу хэсгийг асаана" : "WireGuard → CS2 → RCON → Agent");
                btnStart.Glyph = online ? "" : "";
            }
            btnStop.Enabled = !busy && anything;
            btnRestart.Enabled = !busy && s != null && s.Server == CompState.Running;
            btnSettings.Enabled = !busy;
            if (trayStart != null) { trayStart.Enabled = btnStart.Enabled; trayStop.Enabled = btnStop.Enabled; trayRestart.Enabled = btnRestart.Enabled; }
        }

        // ------------------------------------------------------------ operations
        async void RunOp(string kind)
        {
            if (orch.Busy) return;
            banner.Visible = false; LayoutUi();
            btnStart.Busy = true;
            btnStart.Style = FlatButton.Kind.Primary;
            btnStart.Text = kind == "stop" ? "ЗОГСООЖ БАЙНА…" : kind == "restart" ? "ДАХИН АСААЖ…" : "ЭХЛҮҮЛЖ БАЙНА…";
            btnStart.Sub = "…";
            btnStart.Enabled = true;
            UpdateButtons(last);
            pill.Set(StatusPill.Mode.Busy, kind == "stop" ? "STOPPING…" : kind == "restart" ? "RESTARTING…" : "STARTING…");
            log.Info(kind == "stop" ? "■ STOP SERVER" : kind == "restart" ? "↻ RESTART SERVER" : "▶ START SERVER");
            OpResult r;
            try
            {
                r = await Task.Run(() => kind == "stop" ? orch.StopAsync() : kind == "restart" ? orch.RestartAsync() : orch.StartAsync());
            }
            finally { btnStart.Busy = false; }
            UpdateButtons(last);
            ForcePoll();
            if (!r.Ok) ShowError(r.Error);
            else if (!Visible && tray != null) tray.ShowBalloonTip(3000, "BERX ARENA", kind == "stop" ? "Сервер зогслоо" : "Сервер асаалттай ✓", ToolTipIcon.Info);
        }

        public Task<OpResult> RunOpForAutomation(string kind)
            => Task.Run(() => kind == "stop" ? orch.StopAsync() : kind == "restart" ? orch.RestartAsync() : orch.StartAsync());

        void ForcePoll()
        {
            Task.Run(() => { try { var s = monitor.Poll(); if (!closing) BeginInvoke((Action)(() => ApplySnapshot(s))); } catch { /* ignore */ } });
        }

        void ShowError(string msg)
        {
            banner.Show(msg, ClientSize.Width - Dpi.P(48));
            LayoutUi();
            if (!Visible && tray != null) tray.ShowBalloonTip(6000, "BERX ARENA — алдаа", msg.Length > 200 ? msg.Substring(0, 200) + "…" : msg, ToolTipIcon.Error);
        }

        void CopyConnect()
        {
            if (string.IsNullOrWhiteSpace(settings.PublicAddress)) { ShowError("Connect хаяг тохируулаагүй байна (Тохиргоо → Public address)."); return; }
            try { Clipboard.SetText("connect " + settings.PublicAddress); log.Ok($"Хуулагдлаа: connect {settings.PublicAddress}"); }
            catch (Exception e) { log.Warn("Clipboard: " + e.Message); }
        }

        void OpenUrl(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
            catch (Exception e) { ShowError("Вэбсайт нээгдсэнгүй: " + e.Message); }
        }

        void OpenSettings()
        {
            if (orch.Busy) return;
            using (var f = new SettingsForm(settings, orch))
            {
                if (f.ShowDialog(this) != DialogResult.OK) return;
                var ns = f.Result;
                try
                {
                    ns.Save(settingsPath);
                    if (ns.StartWithWindows != settings.StartWithWindows || ns.StartWithWindows != Autostart.IsEnabled())
                        Autostart.Apply(ns.StartWithWindows, Application.ExecutablePath);
                }
                catch (Exception e) { ShowError("Тохиргоо хадгалагдсангүй: " + e.Message); return; }
                bool agentDirChanged = !string.Equals(ns.AgentDir, settings.AgentDir, StringComparison.OrdinalIgnoreCase);
                settings = ns; orch.Settings = ns;
                if (agentDirChanged) tail.Reset();
                log.Ok("Тохиргоо хадгалагдлаа");
                UpdateInfo(); serverCard.Invalidate(); ForcePoll();
            }
        }

        void UpdateInfo()
        {
            var env = orch.LoadEnv();
            string rcon = env.Exists ? $"{env.Get("RCON_HOST", "127.0.0.1")}:{env.Get("RCON_PORT", "27015")}  ·  нууц үг {(env.Get("RCON_PASSWORD").Length > 0 ? "✓" : "✗")}" : "agent\\.env олдсонгүй";
            info.Set(new List<KeyValuePair<string, string>>
            {
                new KeyValuePair<string, string>("WireGuard tunnel", settings.ManageWireGuard ? $"{settings.TunnelName} → VPS {settings.VpsIp}" : $"{settings.TunnelName} (удирдахгүй)"),
                new KeyValuePair<string, string>("RCON (agent\\.env)", rcon),
                new KeyValuePair<string, string>("Agent", settings.AgentDir),
                new KeyValuePair<string, string>("CS2 server", settings.ServerExe),
                new KeyValuePair<string, string>("Launcher", $"v{Application.ProductVersion}  ·  {(WindowsWireGuard.IsElevated() ? "Admin" : "энгийн эрх")}"),
            });
        }

        // ------------------------------------------------------------ tray
        void BuildTray()
        {
            var menu = new ContextMenuStrip { Renderer = new ToolStripProfessionalRenderer(new DarkMenuColors()), ShowImageMargin = false, Font = Theme.Ui(9.5f), ForeColor = Theme.Text, BackColor = Theme.Panel2 };
            var open = new ToolStripMenuItem("BERX ARENA Launcher нээх") { Font = Theme.Semi(9.5f) };
            open.Click += (s, e) => ShowWindow();
            trayStart = new ToolStripMenuItem("▶  Start server"); trayStart.Click += (s, e) => RunOp("start");
            trayStop = new ToolStripMenuItem("■  Stop server"); trayStop.Click += (s, e) => RunOp("stop");
            trayRestart = new ToolStripMenuItem("↻  Restart server"); trayRestart.Click += (s, e) => RunOp("restart");
            var web = new ToolStripMenuItem("BERX вэбсайт"); web.Click += (s, e) => OpenUrl(settings.WebsiteUrl);
            var copy = new ToolStripMenuItem("Connect хаяг хуулах"); copy.Click += (s, e) => CopyConnect();
            var quit = new ToolStripMenuItem("Гарах"); quit.Click += (s, e) => ExitApp();
            menu.Items.AddRange(new ToolStripItem[] { open, new ToolStripSeparator(), trayStart, trayStop, trayRestart, new ToolStripSeparator(), web, copy, new ToolStripSeparator(), quit });
            foreach (ToolStripItem it in menu.Items) it.ForeColor = Theme.Text;
            tray = new NotifyIcon { Icon = Theme.AppIcon(16), Text = "BERX ARENA · OFFLINE", Visible = !cli.IsAutomation, ContextMenuStrip = menu };
            tray.DoubleClick += (s, e) => ShowWindow();
        }

        public void ShowWindow()
        {
            if (InvokeRequired) { BeginInvoke((Action)ShowWindow); return; }
            Show();
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            Activate(); BringToFront();
        }

        void ShowTrayHint()
        {
            if (trayHintShown || tray == null) return;
            trayHintShown = true;
            tray.ShowBalloonTip(2500, "BERX ARENA Launcher", "System tray дээр ажилласаар байна. Хулганы баруун товчоор Start/Stop.", ToolTipIcon.Info);
        }

        void ExitApp()
        {
            exiting = true;
            Close();
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            if (!exiting && e.CloseReason == CloseReason.UserClosing && settings.CloseToTray && !cli.IsAutomation)
            {
                e.Cancel = true; Hide(); ShowTrayHint(); return;
            }
            bool running = last != null && (last.Server == CompState.Running || last.AgentPid != null);
            if (!cli.IsAutomation && running && !stoppedForExit && !settings.KeepServerRunningOnExit && e.CloseReason == CloseReason.UserClosing)
            {
                if (orch.Busy) { e.Cancel = true; return; }
                var ans = MessageBox.Show(this, "Launcher хаахаас өмнө серверийг зогсоох уу?\n\nYes — зогсоогоод хаана\nNo — сервер ажилласаар үлдэнэ", "BERX ARENA", MessageBoxButtons.YesNoCancel, MessageBoxIcon.Question);
                if (ans == DialogResult.Cancel) { e.Cancel = true; exiting = false; return; }
                if (ans == DialogResult.Yes)
                {
                    e.Cancel = true;
                    Task.Run(() => orch.StopAsync()).ContinueWith(_ => BeginInvoke((Action)(() => { stoppedForExit = true; exiting = true; Close(); })));
                    return;
                }
            }
            else if (running && !cli.IsAutomation) log.Info("Launcher хаагдлаа — сервер ажилласаар байна");
            closing = true;
            monitor.Dispose();
            if (tray != null) { tray.Visible = false; tray.Dispose(); }
            base.OnFormClosing(e);
        }

        // ------------------------------------------------------------ automation (CI тест, скриншот)
        async Task Automation()
        {
            try
            {
                bool online = false;
                if (cli.Start)
                {
                    var r = await RunOpForAutomation("start");
                    if (!r.Ok) log.Error("AUTOMATION START FAILED: " + r.Error);
                }
                var until = DateTime.UtcNow.AddSeconds(cli.WaitSec);
                while (DateTime.UtcNow < until)
                {
                    await Task.Delay(1000);
                    if (last != null && last.Online && last.Map != null && last.CpuPercent.HasValue) { online = true; break; }
                }
                await Task.Delay(1500);
                if (cli.Screenshot != null) Shot(this, cli.Screenshot);
                if (cli.ScreenshotSettings != null)
                {
                    using (var f = new SettingsForm(settings, orch)) { f.StartPosition = FormStartPosition.Manual; f.Location = new Point(0, 0); f.Show(this); await Task.Delay(800); Shot(f, cli.ScreenshotSettings); f.Close(); }
                }
                if (cli.StopAfter)
                {
                    var r = await RunOpForAutomation("stop");
                    if (!r.Ok) { log.Error("AUTOMATION STOP FAILED: " + r.Error); online = false; }
                    ForcePoll();
                    await Task.Delay(3500);
                    if (cli.Screenshot != null) Shot(this, Path.Combine(Path.GetDirectoryName(Path.GetFullPath(cli.Screenshot)), Path.GetFileNameWithoutExtension(cli.Screenshot) + "-stopped.png"));
                }
                File.WriteAllText(Path.Combine(LauncherSettings.AppDir, "automation-result.txt"), online ? "ONLINE" : "NOT-ONLINE");
                ExitCode = !cli.Start || online ? 0 : 2;
            }
            catch (Exception e) { log.Error("AUTOMATION: " + e); ExitCode = 3; }
            exiting = true;
            Close();
        }

        static void Shot(Control c, string path)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path)));
            using (var bmp = new Bitmap(c.Width, c.Height))
            {
                c.DrawToBitmap(bmp, new Rectangle(0, 0, c.Width, c.Height));
                bmp.Save(path, ImageFormat.Png);
            }
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing) { uiTimer.Dispose(); }
            base.Dispose(disposing);
        }
    }
}
