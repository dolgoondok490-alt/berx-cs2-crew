using System;
using System.IO;
using System.Web.Script.Serialization;

namespace BerxLauncher.Core
{
    /// <summary>Launcher-ийн тохиргоо. %LOCALAPPDATA%\BERX ARENA Launcher\settings.json-д хадгална.
    /// Нууц мэдээлэл (RCON нууц үг, SERVER_AGENT_SECRET) энд ХАДГАЛАГДАХГҮЙ — agent\.env-ээс уншина.</summary>
    public sealed class LauncherSettings
    {
        public string ServerExe { get; set; } = @"C:\cs2-server\steamcmd\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe";
        public string ServerArgs { get; set; } = "-dedicated -console -usercon -port 27015 +game_type 0 +game_mode 1 +map de_mirage";
        public string AgentDir { get; set; } = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads", "berx-cs2-crew-main", "agent");
        public string NodePath { get; set; } = "";

        public bool ManageWireGuard { get; set; } = true;
        public string TunnelName { get; set; } = "BERX-ARENA";
        public string WireGuardExe { get; set; } = @"C:\Program Files\WireGuard\wireguard.exe";
        public string TunnelConfigPath { get; set; } = "";
        public string VpsIp { get; set; } = "10.66.66.1";
        public bool RequireVpsPing { get; set; } = true;

        public string PublicAddress { get; set; } = "202.179.6.146:27015";
        public string WebsiteUrl { get; set; } = "https://berx-cs2-crew.vercel.app/#server";

        public int RconTimeoutSec { get; set; } = 120;
        public int StopTimeoutSec { get; set; } = 30;

        public bool StartWithWindows { get; set; }
        public bool StartMinimized { get; set; }
        public bool MinimizeToTray { get; set; } = true;
        public bool CloseToTray { get; set; } = true;
        public bool KeepServerRunningOnExit { get; set; } = true;
        public bool AutoStartServer { get; set; }

        // ---- тооцоолсон замууд (method тул JSON-д орохгүй) ----
        public string EnvPath() => Path.Combine(AgentDir ?? "", ".env");
        public string AgentScriptPath() => Path.Combine(AgentDir ?? "", "berx-agent.js");
        public string StopFilePath() => Path.Combine(AgentDir ?? "", ".berx-stop");
        public string ResolveTunnelConfig()
        {
            if (!string.IsNullOrWhiteSpace(TunnelConfigPath)) return TunnelConfigPath;
            var wgDir = Path.GetDirectoryName(string.IsNullOrWhiteSpace(WireGuardExe) ? @"C:\Program Files\WireGuard\wireguard.exe" : WireGuardExe);
            return Path.Combine(wgDir ?? @"C:\Program Files\WireGuard", "Data", "Configurations", TunnelName + ".conf.dpapi");
        }

        public static string AppDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BERX ARENA Launcher");
        public static string DefaultPath => Path.Combine(AppDir, "settings.json");

        public static LauncherSettings Load(string path, out string warning)
        {
            warning = null;
            try
            {
                if (File.Exists(path))
                {
                    var s = new JavaScriptSerializer().Deserialize<LauncherSettings>(File.ReadAllText(path));
                    if (s != null) return s.Normalize();
                }
            }
            catch (Exception e) { warning = "Тохиргооны файл уншигдсангүй, анхны утгыг ашиглалаа: " + e.Message; }
            return new LauncherSettings();
        }

        public void Save(string path)
        {
            Normalize();
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var tmp = path + ".tmp";
            File.WriteAllText(tmp, new JavaScriptSerializer().Serialize(this));
            if (File.Exists(path)) File.Delete(path);
            File.Move(tmp, path);
        }

        public LauncherSettings Clone()
        {
            var js = new JavaScriptSerializer();
            return js.Deserialize<LauncherSettings>(js.Serialize(this)).Normalize();
        }

        public LauncherSettings Normalize()
        {
            ServerExe = (ServerExe ?? "").Trim().Trim('"');
            ServerArgs = (ServerArgs ?? "").Trim();
            AgentDir = (AgentDir ?? "").Trim().Trim('"').TrimEnd('\\', '/');
            NodePath = (NodePath ?? "").Trim().Trim('"');
            TunnelName = string.IsNullOrWhiteSpace(TunnelName) ? "BERX-ARENA" : TunnelName.Trim();
            WireGuardExe = (WireGuardExe ?? "").Trim().Trim('"');
            TunnelConfigPath = (TunnelConfigPath ?? "").Trim().Trim('"');
            VpsIp = (VpsIp ?? "").Trim();
            PublicAddress = (PublicAddress ?? "").Trim();
            WebsiteUrl = string.IsNullOrWhiteSpace(WebsiteUrl) ? "https://berx-cs2-crew.vercel.app/#server" : WebsiteUrl.Trim();
            RconTimeoutSec = Math.Max(10, Math.Min(900, RconTimeoutSec));
            StopTimeoutSec = Math.Max(5, Math.Min(300, StopTimeoutSec));
            return this;
        }
    }
}
