using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using BerxLauncher.Core;

namespace BerxLauncher.Tests
{
    /// <summary>Тусгаарласан симуляц: жинхэнэ процесс, WireGuard, сүлжээ хөндөхгүй.</summary>
    sealed class FakeWorld : IProcessHost, IWireGuard, INetProbe
    {
        public const string ServerExe = @"C:\cs2-server\steamcmd\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe";
        public const string GameExe = @"C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe";
        public const string AgentDir = @"C:\Users\user\Downloads\berx-cs2-crew-main\agent";
        public const string Secret = "s3cr3t-agent-key-0123456789abcdef";
        public const string RconPass = "rconPW-xyz";

        public readonly Dictionary<int, ProcInfo> Procs = new Dictionary<int, ProcInfo>();
        public readonly Dictionary<string, string> Files = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        public readonly HashSet<string> Dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        public readonly List<string> Calls = new List<string>();
        int nextPid = 1000;

        // behaviour switches
        public bool ServerExitsImmediately, ServerIgnoresQuit, AgentHonorsStop = true, AgentCrashes;
        public bool WgActive, WgActivateFails, WgNeverComesUp;
        public long? PingMs = 25;
        public bool UdpBusy;
        public string NodePath = @"C:\Program Files\nodejs\node.exe";
        public int RconConnects;
        public bool RconNeverReady;

        public FakeWorld()
        {
            Files[ServerExe] = "exe";
            Dirs.Add(AgentDir);
            Files[Path.Combine(AgentDir, "berx-agent.js")] = "js";
            Files[Path.Combine(AgentDir, ".env")] = $"BERX_URL=https://berx-cs2-crew.vercel.app\nSERVER_AGENT_SECRET={Secret}\nRCON_HOST=192.168.1.18\nRCON_PORT=27015\nRCON_PASSWORD={RconPass}\nPUBLIC_ADDRESS=202.179.6.146:27015\n";
        }

        public LauncherSettings Settings() => new LauncherSettings { ServerExe = ServerExe, AgentDir = AgentDir, RconTimeoutSec = 20, StopTimeoutSec = 5 };

        public int AddProc(string name, string path, string cmd = null, int parent = 0)
        {
            int pid = nextPid++;
            Procs[pid] = new ProcInfo { Pid = pid, Name = name, Path = path, CommandLine = cmd ?? $"\"{path}\"", ParentPid = parent, StartTime = DateTime.Now.AddMinutes(-3) };
            return pid;
        }
        public int AddServer() => AddProc("cs2.exe", ServerExe, $"\"{ServerExe}\" -dedicated -usercon");
        public int AddGame() => AddProc("cs2.exe", GameExe, $"\"{GameExe}\" -steam");
        public int AddAgent(int parent = 0) => AddProc("node.exe", NodePath, "node  berx-agent.js", parent);
        public bool ServerRunning => Procs.Values.Any(p => p.Name == "cs2.exe" && p.Path == ServerExe);
        public bool AgentRunning => Procs.Values.Any(p => p.Name == "node.exe" && (p.CommandLine ?? "").Contains("berx-agent.js"));

        // ---- IProcessHost
        public IList<ProcInfo> List(string exeName) => Procs.Values.Where(p => string.Equals(p.Name, exeName, StringComparison.OrdinalIgnoreCase)).ToList();
        public ProcInfo Get(int pid) => Procs.TryGetValue(pid, out var p) ? p : null;
        public int StartServer(string exe, string args)
        {
            Calls.Add("start-server");
            if (ServerExitsImmediately) return 4242;
            return AddProc("cs2.exe", exe, $"\"{exe}\" {args}");
        }
        public int StartAgent(string node, string dir, string log)
        {
            Calls.Add("start-agent");
            if (AgentCrashes)
            {
                if (log != null) Files[log] = $"12:00:00 BERX Agent v1.0.0\n✖ SERVER_AGENT_SECRET (24+ тэмдэгт) ... secret was {Secret}\n";
                return 777;
            }
            return AddAgent();
        }
        public void Kill(int pid) { Calls.Add("kill:" + pid); Procs.Remove(pid); }
        public ProcSample? Sample(int pid) => Procs.ContainsKey(pid) ? new ProcSample { Cpu = TimeSpan.FromSeconds(5), Ram = 1500L << 20 } : (ProcSample?)null;
        public bool FileExists(string path) => path != null && Files.ContainsKey(path);
        public bool DirExists(string path) => path != null && Dirs.Contains(path);
        public string ReadText(string path) => path != null && Files.TryGetValue(path, out var t) ? t : null;
        public void WriteFile(string path, string text)
        {
            Files[path] = text;
            if (path.EndsWith(".berx-stop"))
            {
                Calls.Add("stopfile");
                if (AgentHonorsStop) foreach (var a in Procs.Values.Where(p => p.Name == "node.exe").ToList()) Procs.Remove(a.Pid);
            }
        }
        public void DeleteFile(string path) => Files.Remove(path);
        public string ResolveNode(string configured) => NodePath;

        // ---- IWireGuard
        public bool IsActive(string tunnel) => WgActive;
        public OpOutcome Activate(LauncherSettings s)
        {
            Calls.Add("wg-activate:" + s.TunnelName);
            if (WgActivateFails) return OpOutcome.Fail("Windows Administrator зөвшөөрлийг цуцалсан.");
            if (!WgNeverComesUp) WgActive = true;
            return OpOutcome.Success();
        }
        public OpOutcome Deactivate(LauncherSettings s) { Calls.Add("wg-deactivate:" + s.TunnelName); WgActive = false; return OpOutcome.Success(); }
        public string Describe(string tunnel) => tunnel + " · 10.66.66.2";

        // ---- INetProbe
        public long? Ping(string host, int timeoutMs) => WgActive ? PingMs : null;
        public bool IsUdpPortInUse(int port) => UdpBusy;

        public Func<IRconClient> RconFactory => () => new FakeRcon(this);
    }

    sealed class FakeRcon : IRconClient
    {
        readonly FakeWorld w;
        public FakeRcon(FakeWorld w) { this.w = w; }
        public bool Connected { get; private set; }
        public void Connect(string host, int port, string password, int timeoutMs)
        {
            w.RconConnects++;
            w.Calls.Add("rcon-connect");
            if (!w.ServerRunning || w.RconNeverReady) throw new IOException("connection refused");
            if (password != FakeWorld.RconPass) throw new RconAuthException();
            Connected = true;
        }
        public string Exec(string command, int timeoutMs = 5000)
        {
            if (!Connected || !w.ServerRunning) throw new IOException("closed");
            if (command == "quit")
            {
                w.Calls.Add("rcon-quit");
                if (!w.ServerIgnoresQuit) foreach (var p in w.Procs.Values.Where(p => p.Path == FakeWorld.ServerExe).ToList()) w.Procs.Remove(p.Pid);
                Connected = false;
                return "";
            }
            if (command == "status_json") return "{\"server\":{\"map\":\"de_mirage\",\"max_players\":12,\"clients\":[{\"name\":\"DOK\"},{\"name\":\"Kaze\"},{\"name\":\"BOT Albert\",\"bot\":true}]}}";
            return "";
        }
        public void Dispose() { Connected = false; }
    }

    static class TestUtil
    {
        public static Orchestrator Orch(FakeWorld w, LauncherSettings s, LogHub log)
            => new Orchestrator(s, w, w, w, w.RconFactory, log, _ => Task.CompletedTask) { AgentLogFile = @"C:\logs\agent.log", PollInterval = TimeSpan.FromSeconds(1) };
    }
}
