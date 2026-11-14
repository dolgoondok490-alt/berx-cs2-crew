using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using BerxLauncher.Core;
using BerxLauncher.Platform;

namespace BerxLauncher.UI
{
    sealed class SettingsForm : Form
    {
        readonly LauncherSettings src;
        readonly Orchestrator orch;
        public LauncherSettings Result { get; private set; }

        readonly TextBox tServer = Box(), tArgs = Box(), tAgent = Box(), tNode = Box(), tTunnel = Box(), tWgExe = Box(), tWgConf = Box(),
                         tVps = Box(), tPublic = Box(), tWeb = Box();
        readonly NumericUpDown nRcon = Num(10, 900), nStop = Num(5, 300);
        readonly CheckBox cManageWg = Chk("WireGuard tunnel-ийг launcher асааж/унтраана"),
                          cPing = Chk("VPS ping амжилтгүй бол START-ыг зогсооно"),
                          cBoot = Chk("Windows асахад launcher-ийг автоматаар нээх"),
                          cMin = Chk("Нээгдэхдээ tray-д нуугдах (minimized)"),
                          cMinTray = Chk("Minimize хийхэд system tray руу нуух"),
                          cCloseTray = Chk("Цонх хаахад (X) tray-д үлдэх"),
                          cKeep = Chk("Launcher-ээс гарахад серверийг ажиллуулсан хэвээр үлдээх"),
                          cAuto = Chk("Launcher нээгдэхэд серверийг автоматаар START хийх");
        readonly Label envInfo = new Label { AutoSize = false, ForeColor = Theme.Muted, Font = Theme.Ui(8.5f) };

        public SettingsForm(LauncherSettings s, Orchestrator orch)
        {
            src = s; this.orch = orch;
            Text = "Тохиргоо — BERX ARENA Launcher";
            Icon = Theme.AppIcon(32);
            BackColor = Theme.Bg; ForeColor = Theme.Text; Font = Theme.Ui(9f);
            FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false; MinimizeBox = false;
            StartPosition = FormStartPosition.CenterParent;
            ClientSize = new Size(Dpi.P(760), Dpi.P(720));
            ShowInTaskbar = false;

            var scroll = new Panel { AutoScroll = true, Dock = DockStyle.Fill, BackColor = Theme.Bg, Padding = new Padding(Dpi.P(24), Dpi.P(12), Dpi.P(24), Dpi.P(12)) };
            var grid = new TableLayoutPanel { ColumnCount = 3, AutoSize = true, Dock = DockStyle.Top, BackColor = Theme.Bg, GrowStyle = TableLayoutPanelGrowStyle.AddRows };
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, Dpi.P(190)));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            grid.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, Dpi.P(44)));

            Section(grid, "CS2 сервер");
            Row(grid, "CS2 server (cs2.exe)", tServer, Browse(tServer, true, "cs2.exe|cs2.exe|EXE|*.exe"));
            Row(grid, "Launch arguments", tArgs, null);
            Section(grid, "BERX Agent");
            Row(grid, "Agent хавтас", tAgent, Browse(tAgent, false, null));
            Row(grid, "Node.js (хоосон = автомат)", tNode, Browse(tNode, true, "node.exe|node.exe"));
            envInfo.Height = Dpi.P(36); envInfo.Dock = DockStyle.Fill; envInfo.Margin = new Padding(0, 0, 0, Dpi.P(6));
            grid.Controls.Add(new Label(), 0, grid.RowCount); grid.Controls.Add(envInfo, 1, grid.RowCount); grid.SetColumnSpan(envInfo, 2); grid.RowCount++;
            Section(grid, "WireGuard");
            Full(grid, cManageWg);
            Row(grid, "Tunnel нэр", tTunnel, null);
            Row(grid, "wireguard.exe", tWgExe, Browse(tWgExe, true, "wireguard.exe|wireguard.exe"));
            Row(grid, "Tunnel config (заавал биш)", tWgConf, Browse(tWgConf, true, "WireGuard config|*.conf;*.conf.dpapi"));
            Row(grid, "VPS WireGuard IP", tVps, null);
            Full(grid, cPing);
            Section(grid, "Холбогдох");
            Row(grid, "Public connect хаяг", tPublic, null);
            Row(grid, "BERX вэбсайт", tWeb, null);
            Section(grid, "Хугацаа (секунд)");
            Row(grid, "RCON бэлэн болох хүлээлт", nRcon, null);
            Row(grid, "Graceful stop хүлээлт", nStop, null);
            Section(grid, "Launcher");
            foreach (var c in new[] { cBoot, cMin, cMinTray, cCloseTray, cKeep, cAuto }) Full(grid, c);

            scroll.Controls.Add(grid);

            var footer = new Panel { Dock = DockStyle.Bottom, Height = Dpi.P(66), BackColor = Theme.Panel };
            var bShortcut = new FlatButton { Text = "Desktop shortcut үүсгэх", Glyph = "", Style = FlatButton.Kind.Ghost, TextFont = Theme.Semi(9f), BackColor = Theme.Panel };
            var bSave = new FlatButton { Text = "Хадгалах", Style = FlatButton.Kind.Primary, TextFont = Theme.Semi(9.5f), BackColor = Theme.Panel };
            var bCancel = new FlatButton { Text = "Болих", TextFont = Theme.Semi(9.5f), BackColor = Theme.Panel };
            footer.Controls.AddRange(new Control[] { bShortcut, bSave, bCancel });
            footer.Resize += (o, e) =>
            {
                int h = Dpi.P(40), y = (footer.Height - h) / 2, r = footer.Width - Dpi.P(24);
                bSave.Bounds = new Rectangle(r - Dpi.P(130), y, Dpi.P(130), h);
                bCancel.Bounds = new Rectangle(r - Dpi.P(130) - Dpi.P(10) - Dpi.P(100), y, Dpi.P(100), h);
                bShortcut.Bounds = new Rectangle(Dpi.P(24), y, Dpi.P(230), h);
            };
            bSave.Click += (o, e) => Save();
            bCancel.Click += (o, e) => { DialogResult = DialogResult.Cancel; Close(); };
            bShortcut.Click += (o, e) =>
            {
                try { var p = DesktopShortcut.CreateDesktop(Application.ExecutablePath); MessageBox.Show(this, "Үүслээ:\n" + p, "BERX ARENA", MessageBoxButtons.OK, MessageBoxIcon.Information); }
                catch (Exception ex) { MessageBox.Show(this, "Shortcut үүссэнгүй: " + ex.Message, "BERX ARENA", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
            };

            Controls.Add(scroll);
            Controls.Add(footer);
            CancelButton = null;
            LoadFrom(s);
            tAgent.TextChanged += (o, e) => UpdateEnvInfo();
            UpdateEnvInfo();
        }

        protected override void OnHandleCreated(EventArgs e) { base.OnHandleCreated(e); DarkTitle.Apply(Handle); }
        protected override void OnShown(EventArgs e) { base.OnShown(e); tServer.SelectionLength = 0; ActiveControl = null; }

        void LoadFrom(LauncherSettings s)
        {
            tServer.Text = s.ServerExe; tArgs.Text = s.ServerArgs; tAgent.Text = s.AgentDir; tNode.Text = s.NodePath;
            tTunnel.Text = s.TunnelName; tWgExe.Text = s.WireGuardExe; tWgConf.Text = s.TunnelConfigPath; tVps.Text = s.VpsIp;
            tPublic.Text = s.PublicAddress; tWeb.Text = s.WebsiteUrl;
            nRcon.Value = Math.Max(nRcon.Minimum, Math.Min(nRcon.Maximum, s.RconTimeoutSec));
            nStop.Value = Math.Max(nStop.Minimum, Math.Min(nStop.Maximum, s.StopTimeoutSec));
            cManageWg.Checked = s.ManageWireGuard; cPing.Checked = s.RequireVpsPing; cBoot.Checked = s.StartWithWindows; cMin.Checked = s.StartMinimized;
            cMinTray.Checked = s.MinimizeToTray; cCloseTray.Checked = s.CloseToTray; cKeep.Checked = s.KeepServerRunningOnExit; cAuto.Checked = s.AutoStartServer;
            tWgConf.Tag = "placeholder";
        }

        void UpdateEnvInfo()
        {
            var path = Path.Combine(tAgent.Text.Trim().Trim('"'), ".env");
            if (!File.Exists(path)) { envInfo.Text = "⚠ agent\\.env олдсонгүй (.env.example-г .env болгож бөглөнө)."; envInfo.ForeColor = Theme.Yellow; return; }
            EnvFile env;
            try { env = EnvFile.Parse(File.ReadAllText(path)); } catch (Exception e) { envInfo.Text = "agent\\.env уншигдсангүй: " + e.Message; return; }
            envInfo.ForeColor = Theme.Muted;
            envInfo.Text = $"agent\\.env (зөвхөн уншина): RCON {env.Get("RCON_HOST", "127.0.0.1")}:{env.Get("RCON_PORT", "27015")} · RCON_PASSWORD {(env.Get("RCON_PASSWORD").Length > 0 ? "✓" : "✗ хоосон")} · SERVER_AGENT_SECRET {(env.Get("SERVER_AGENT_SECRET").Length >= 24 ? "✓" : "✗")} · PUBLIC_ADDRESS {env.Get("PUBLIC_ADDRESS", "—")}";
        }

        void Save()
        {
            var s = src.Clone();
            s.ServerExe = tServer.Text; s.ServerArgs = tArgs.Text; s.AgentDir = tAgent.Text; s.NodePath = tNode.Text;
            s.TunnelName = tTunnel.Text; s.WireGuardExe = tWgExe.Text; s.TunnelConfigPath = tWgConf.Text; s.VpsIp = tVps.Text;
            s.PublicAddress = tPublic.Text; s.WebsiteUrl = tWeb.Text;
            s.RconTimeoutSec = (int)nRcon.Value; s.StopTimeoutSec = (int)nStop.Value;
            s.ManageWireGuard = cManageWg.Checked; s.RequireVpsPing = cPing.Checked; s.StartWithWindows = cBoot.Checked; s.StartMinimized = cMin.Checked;
            s.MinimizeToTray = cMinTray.Checked; s.CloseToTray = cCloseTray.Checked; s.KeepServerRunningOnExit = cKeep.Checked; s.AutoStartServer = cAuto.Checked;
            s.Normalize();
            if (s.ManageWireGuard && s.TunnelName.IndexOfAny(new[] { '"', '\\', '/', ' ' }) >= 0)
            { MessageBox.Show(this, "Tunnel нэрэнд хоосон зай, \\ / \" байж болохгүй.", "BERX ARENA", MessageBoxButtons.OK, MessageBoxIcon.Warning); return; }
            var warn = "";
            if (!File.Exists(s.ServerExe)) warn += "• cs2.exe олдсонгүй\n";
            if (!File.Exists(s.AgentScriptPath())) warn += "• Agent хавтсанд berx-agent.js алга\n";
            if (warn.Length > 0 && MessageBox.Show(this, warn + "\nИнгээд хадгалах уу?", "BERX ARENA", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            Result = s;
            DialogResult = DialogResult.OK;
            Close();
        }

        // ---------- helpers
        static TextBox Box() => new TextBox { BackColor = Theme.Panel2, ForeColor = Theme.Text, BorderStyle = BorderStyle.FixedSingle, Dock = DockStyle.Fill, Font = Theme.Ui(9.5f), Margin = new Padding(0, Dpi.P(4), Dpi.P(6), Dpi.P(4)) };
        static NumericUpDown Num(int min, int max) => new NumericUpDown { Minimum = min, Maximum = max, BackColor = Theme.Panel2, ForeColor = Theme.Text, BorderStyle = BorderStyle.FixedSingle, Width = Dpi.P(110), Font = Theme.Ui(9.5f), Margin = new Padding(0, Dpi.P(4), 0, Dpi.P(4)) };
        static CheckBox Chk(string t) => new CheckBox { Text = t, AutoSize = true, ForeColor = Theme.Text, FlatStyle = FlatStyle.Flat, Font = Theme.Ui(9.5f), Margin = new Padding(0, Dpi.P(5), 0, Dpi.P(5)), BackColor = Theme.Bg };

        static void Section(TableLayoutPanel g, string title)
        {
            var l = new Label { Text = title.ToUpperInvariant(), ForeColor = Theme.Accent, Font = Theme.Semi(8.5f), AutoSize = true, Margin = new Padding(0, Dpi.P(16), 0, Dpi.P(4)) };
            g.Controls.Add(l, 0, g.RowCount); g.SetColumnSpan(l, 3); g.RowCount++;
        }

        static void Row(TableLayoutPanel g, string label, Control input, Control extra)
        {
            var l = new Label { Text = label, ForeColor = Theme.Muted, AutoSize = false, Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleLeft, Font = Theme.Ui(9f), Margin = new Padding(0) };
            g.Controls.Add(l, 0, g.RowCount);
            g.Controls.Add(input, 1, g.RowCount);
            if (extra != null) g.Controls.Add(extra, 2, g.RowCount); else g.SetColumnSpan(input, 2);
            g.RowCount++;
        }

        static void Full(TableLayoutPanel g, Control c)
        {
            g.Controls.Add(new Label { Margin = new Padding(0), Width = 1 }, 0, g.RowCount);
            g.Controls.Add(c, 1, g.RowCount); g.SetColumnSpan(c, 2); g.RowCount++;
        }

        Control Browse(TextBox target, bool file, string filter)
        {
            var b = new FlatButton { Text = "…", Width = Dpi.P(38), Height = Dpi.P(28), TextFont = Theme.Semi(10f), Margin = new Padding(0, Dpi.P(3), 0, Dpi.P(3)), Radius = 7 };
            b.Click += (o, e) =>
            {
                if (file)
                {
                    using (var d = new OpenFileDialog { Filter = filter ?? "*.*|*.*", CheckFileExists = true })
                    {
                        try { var dir = Path.GetDirectoryName(target.Text); if (Directory.Exists(dir)) d.InitialDirectory = dir; } catch { /* ignore */ }
                        if (d.ShowDialog(this) == DialogResult.OK) target.Text = d.FileName;
                    }
                }
                else
                {
                    using (var d = new FolderBrowserDialog { SelectedPath = target.Text, ShowNewFolderButton = false })
                        if (d.ShowDialog(this) == DialogResult.OK) target.Text = d.SelectedPath;
                }
            };
            return b;
        }
    }
}
