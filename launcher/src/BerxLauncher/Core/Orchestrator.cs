using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace BerxLauncher.Core
{
    public enum Step { Config, WireGuard, Network, Server, Rcon, Agent, Stop }

    public sealed class StepException : Exception
    {
        public Step Step { get; }
        public StepException(Step step, string message) : base(message) { Step = step; }
    }

    public sealed class OpResult
    {
        public bool Ok;
        public Step? FailedStep;
        public string Error;
    }

    /// <summary>
    /// START: WireGuard → VPS ping → CS2 server → RCON бэлэн → BERX Agent.
    /// STOP:  Agent (аюулгүй) → CS2 (RCON quit) → зөвхөн BERX-ARENA tunnel.
    /// Хэрэглэгчийн CS2 тоглоом (өөр замтай cs2.exe)-ыг ХЭЗЭЭ Ч хөндөхгүй.
    /// </summary>
    public sealed class Orchestrator
    {
        readonly IProcessHost proc;
        readonly IWireGuard wg;
        readonly INetProbe net;
        readonly Func<IRconClient> rconFactory;
        readonly LogHub log;
        readonly Func<TimeSpan, Task> delay;
        readonly SemaphoreSlim gate = new SemaphoreSlim(1, 1);

        public LauncherSettings Settings { get; set; }
        public string AgentLogFile { get; set; }
        public TimeSpan PollInterval { get; set; } = TimeSpan.FromSeconds(2);

        volatile bool busy;
        volatile string currentOp;
        public bool Busy => busy;
        public string CurrentOp => currentOp;

        /// <summary>Launcher өөрөө асаасан/асаалттай байх ёстой гэж үзэж буй эсэх (санаандгүй унтралтыг илрүүлэхэд).</summary>
        public volatile bool ExpectServer;
        public volatile bool ExpectAgent;

        public event Action<string> Progress;

        public Orchestrator(LauncherSettings settings, IProcessHost proc, IWireGuard wg, INetProbe net,
            Func<IRconClient> rconFactory, LogHub log, Func<TimeSpan, Task> delay = null)
        {
            Settings = settings; this.proc = proc; this.wg = wg; this.net = net;
            this.rconFactory = rconFactory; this.log = log; this.delay = delay ?? (t => Task.Delay(t));
        }

        public Task<OpResult> StartAsync() => Run("start", DoStart);
        public Task<OpResult> StopAsync() => Run("stop", DoStop);
        public Task<OpResult> RestartAsync() => Run("restart", async () => { await DoStop(); log.Info("Дахин асааж байна…"); await DoStart(); });

        async Task<OpResult> Run(string name, Func<Task> body)
        {
            if (!await gate.WaitAsync(0)) return new OpResult { Ok = false, Error = "Өөр үйлдэл явагдаж байна. Түр хүлээнэ үү." };
            busy = true; currentOp = name;
            try { await body(); return new OpResult { Ok = true }; }
            catch (StepException e) { log.Error(e.Message); return new OpResult { Ok = false, FailedStep = e.Step, Error = e.Message }; }
            catch (Exception e) { log.Error("Гэнэтийн алдаа: " + e.Message); return new OpResult { Ok = false, Error = "Гэнэтийн алдаа: " + e.Message }; }
            finally { busy = false; currentOp = null; gate.Release(); }
        }

        void Report(string msg) { try { Progress?.Invoke(msg); } catch { /* UI */ } }

        // ------------------------------------------------------------------ find
        public static string NormPath(string p)
        {
            if (string.IsNullOrWhiteSpace(p)) return "";
            try { return System.IO.Path.GetFullPath(p.Trim().Trim('"')).TrimEnd('\\', '/').ToLowerInvariant(); }
            catch { return p.Trim().ToLowerInvariant(); }
        }

        string ServerExeName => System.IO.Path.GetFileName(Settings.ServerExe ?? "cs2.exe");

        /// <summary>Зөвхөн тохиргоонд заасан замаас ажиллаж буй dedicated server.</summary>
        public IList<ProcInfo> FindServers()
        {
            var want = NormPath(Settings.ServerExe);
            if (want.Length == 0) return new List<ProcInfo>();
            return proc.List(ServerExeName).Where(p => p.Path != null && NormPath(p.Path) == want).ToList();
        }

        public IList<ProcInfo> FindAgents()
            => proc.List("node.exe").Where(p => p.CommandLine != null && p.CommandLine.IndexOf("berx-agent.js", StringComparison.OrdinalIgnoreCase) >= 0).ToList();

        bool IsAgent(ProcInfo p) => p != null && p.CommandLine != null && p.CommandLine.IndexOf("berx-agent.js", StringComparison.OrdinalIgnoreCase) >= 0;

        public EnvFile LoadEnv()
        {
            var env = EnvFile.Parse(proc.ReadText(Settings.EnvPath()));
            log.Redactor.SetSecrets(env.SecretValues());
            return env;
        }

        public RconCreds LoadRcon()
        {
            var env = LoadEnv();
            if (!env.Exists) throw new StepException(Step.Config, $"agent\\.env файл олдсонгүй: {Settings.EnvPath()}");
            var pass = env.Get("RCON_PASSWORD");
            if (pass.Length == 0) throw new StepException(Step.Config, "agent\\.env дотор RCON_PASSWORD хоосон байна.");
            if (!int.TryParse(env.Get("RCON_PORT", "27015"), out var port)) port = 27015;
            return new RconCreds { Host = env.Get("RCON_HOST", "127.0.0.1"), Port = port, Password = pass };
        }

        // ------------------------------------------------------------------ START
        sealed class Plan { public RconCreds Rcon; public string Node; }

        Plan Preflight()
        {
            var s = Settings;
            if (string.IsNullOrWhiteSpace(s.ServerExe) || !proc.FileExists(s.ServerExe))
                throw new StepException(Step.Config, $"CS2 сервер олдсонгүй: {s.ServerExe}\nТохиргоо → «CS2 server (cs2.exe)» замыг шалгана уу.");
            if (string.IsNullOrWhiteSpace(s.AgentDir) || !proc.DirExists(s.AgentDir))
                throw new StepException(Step.Config, $"Agent хавтас олдсонгүй: {s.AgentDir}\nТохиргоо → «Agent хавтас»-ыг шалгана уу.");
            if (!proc.FileExists(s.AgentScriptPath()))
                throw new StepException(Step.Config, $"berx-agent.js олдсонгүй: {s.AgentScriptPath()}");
            var env = LoadEnv();
            if (!env.Exists)
                throw new StepException(Step.Config, $"agent\\.env файл олдсонгүй: {s.EnvPath()}\n.env.example-г .env болгож хуулаад бөглөнө үү.");
            if (env.Get("SERVER_AGENT_SECRET").Length < 24)
                throw new StepException(Step.Config, "agent\\.env дотор SERVER_AGENT_SECRET (24+ тэмдэгт) тохируулаагүй байна.");
            var creds = LoadRcon();
            var node = proc.ResolveNode(s.NodePath);
            if (node == null)
                throw new StepException(Step.Config, "Node.js олдсонгүй. https://nodejs.org-оос LTS хувилбар суулгах эсвэл Тохиргоо → «Node.js» замыг зааж өгнө үү.");
            return new Plan { Rcon = creds, Node = node };
        }

        async Task DoStart()
        {
            Report("Тохиргоо шалгаж байна…");
            var plan = Preflight();
            log.Info("Тохиргоо OK — server, agent, .env, Node.js олдлоо");
            if (Settings.ManageWireGuard) await EnsureWireGuard();
            else log.Info("WireGuard удирдлага унтраалттай (Тохиргоо) — tunnel-ийг хөндсөнгүй");
            await EnsureServer(plan.Rcon);
            await EnsureAgent(plan.Node);
            Report("Бэлэн");
            log.Ok("BERX ARENA асаалттай ✓");
        }

        async Task EnsureWireGuard()
        {
            var t = Settings.TunnelName;
            Report("WireGuard шалгаж байна…");
            if (wg.IsActive(t)) log.Info($"WireGuard {t} идэвхтэй байна");
            else
            {
                log.Info($"WireGuard {t} tunnel-ийг асааж байна (Windows Administrator зөвшөөрөл асууна)…");
                var r = wg.Activate(Settings);
                if (!r.Ok) throw new StepException(Step.WireGuard, "WireGuard tunnel асаасангүй: " + r.Error);
                bool up = false;
                for (int i = 0; i < 15 && !(up = wg.IsActive(t)); i++) await delay(TimeSpan.FromSeconds(1));
                if (!up) throw new StepException(Step.WireGuard, $"WireGuard {t} tunnel идэвхжсэнгүй. WireGuard програм дээрх tunnel-ийн нэр, тохиргоог шалгана уу.");
                log.Ok($"WireGuard {t} асаалаа");
            }
            Report("VPS холболт шалгаж байна…");
            long? ms = null;
            for (int i = 0; i < 8 && ms == null; i++)
            {
                ms = net.Ping(Settings.VpsIp, 1500);
                if (ms == null) await delay(TimeSpan.FromSeconds(1));
            }
            if (ms == null)
            {
                var m = $"VPS {Settings.VpsIp} хариу өгөхгүй байна — WireGuard handshake болоогүй байж магадгүй. VPS асаалттай эсэх, tunnel-ийн Endpoint болон түлхүүрийг шалгана уу.";
                if (Settings.RequireVpsPing) throw new StepException(Step.Network, m);
                log.Warn(m + " (Тохиргоонд ping шаардахгүй гэсэн тул үргэлжлүүллээ)");
            }
            else log.Ok($"VPS {Settings.VpsIp} холбогдлоо · {ms} ms");
        }

        static int ParsePort(string args)
        {
            var m = Regex.Match(args ?? "", @"-port\s+(\d+)");
            return m.Success && int.TryParse(m.Groups[1].Value, out var p) ? p : 27015;
        }

        async Task EnsureServer(RconCreds rc)
        {
            Report("CS2 сервер асааж байна…");
            var running = FindServers();
            if (running.Count > 0)
            {
                log.Info($"CS2 сервер аль хэдийн ажиллаж байна (PID {running[0].Pid}) — давхар асаахгүй");
                ExpectServer = true;
            }
            else
            {
                int port = ParsePort(Settings.ServerArgs);
                if (net.IsUdpPortInUse(port))
                    throw new StepException(Step.Server, $"UDP {port} порт өөр програмд эзлэгдсэн байна. Өөр CS2 сервер ажиллаж байгаа эсэхийг шалгана уу.");
                var unknown = proc.List(ServerExeName).Where(p => p.Path == null).Select(p => p.Pid).ToList();
                if (unknown.Count > 0) log.Warn($"Замыг нь уншиж чадаагүй {ServerExeName} (PID {string.Join(", ", unknown)}) байна — түүнийг хөндөхгүй.");
                int pid;
                try { pid = proc.StartServer(Settings.ServerExe, Settings.ServerArgs); }
                catch (Exception e) { throw new StepException(Step.Server, "CS2 сервер асаахад алдаа гарлаа: " + e.Message); }
                ExpectServer = true;
                log.Ok($"CS2 сервер асаалаа (PID {pid})");
            }

            Report("RCON бэлэн болохыг хүлээж байна…");
            log.Info($"RCON {rc.Host}:{rc.Port} бэлэн болохыг хүлээж байна (map ачаалж байна)…");
            int attempts = Math.Max(1, (int)Math.Ceiling(Settings.RconTimeoutSec / Math.Max(0.05, PollInterval.TotalSeconds)));
            string lastErr = null;
            for (int i = 0; i < attempts; i++)
            {
                if (FindServers().Count == 0)
                {
                    ExpectServer = false;
                    throw new StepException(Step.Server, "CS2 сервер асаад унтарлаа. Серверийн консол цонхны алдааг шалгана уу (порт эзлэгдсэн, map нэр, Metamod/gameinfo.gi, CS2 update).");
                }
                using (var c = rconFactory())
                {
                    try
                    {
                        c.Connect(rc.Host, rc.Port, rc.Password, 3000);
                        c.Exec("status", 3000);
                        log.Ok($"RCON холбогдлоо ({rc.Host}:{rc.Port})");
                        return;
                    }
                    catch (RconAuthException)
                    {
                        throw new StepException(Step.Rcon, "RCON нууц үг буруу: agent\\.env-ийн RCON_PASSWORD нь server.cfg доторх rcon_password-той таарахгүй байна.");
                    }
                    catch (Exception e) { lastErr = e.Message; }
                }
                await delay(PollInterval);
            }
            throw new StepException(Step.Rcon, $"RCON {rc.Host}:{rc.Port} {Settings.RconTimeoutSec} секундын дотор хариу өгсөнгүй ({lastErr}).\nСервер -usercon параметртэй асч байгаа эсэх, agent\\.env-ийн RCON_HOST/RCON_PORT-ийг шалгана уу.");
        }

        string AgentFailHint()
        {
            string tail = null;
            try
            {
                var txt = AgentLogFile != null ? proc.ReadText(AgentLogFile) : null;
                if (txt != null)
                {
                    var lines = txt.Split('\n').Select(l => l.Trim()).Where(l => l.Length > 0 && !l.Contains("[debug]")).ToList();
                    tail = string.Join(" | ", lines.Skip(Math.Max(0, lines.Count - 3)));
                }
            }
            catch { /* ignore */ }
            return string.IsNullOrEmpty(tail) ? "Agent log-ийг шалгана уу." : "Сүүлийн log: " + log.Redactor.Apply(tail);
        }

        async Task EnsureAgent(string node)
        {
            Report("BERX Agent асааж байна…");
            var running = FindAgents();
            if (running.Count > 0)
            {
                log.Info($"BERX Agent аль хэдийн ажиллаж байна (PID {running[0].Pid}) — давхар асаахгүй");
                ExpectAgent = true;
                return;
            }
            proc.DeleteFile(Settings.StopFilePath());
            try { proc.StartAgent(node, Settings.AgentDir, AgentLogFile); }
            catch (Exception e) { throw new StepException(Step.Agent, "BERX Agent асаахад алдаа гарлаа: " + e.Message); }
            ExpectAgent = true;

            ProcInfo found = null;
            for (int i = 0; i < 16 && found == null; i++) { await delay(TimeSpan.FromMilliseconds(500)); found = FindAgents().FirstOrDefault(); }
            if (found != null)
            {
                await delay(TimeSpan.FromSeconds(2)); // эхний секундэд унтарвал (тохиргооны алдаа) барина
                if (!IsAgent(proc.Get(found.Pid))) found = null;
            }
            if (found == null)
            {
                ExpectAgent = false;
                throw new StepException(Step.Agent, "BERX Agent асаад унтарлаа. " + AgentFailHint());
            }
            log.Ok($"BERX Agent асаалаа (PID {found.Pid})");
        }

        // ------------------------------------------------------------------ STOP
        async Task DoStop()
        {
            var errors = new List<string>();
            ExpectAgent = false; ExpectServer = false;
            Report("BERX Agent зогсоож байна…");
            try { await StopAgent(); } catch (Exception e) { errors.Add("Agent: " + e.Message); }
            Report("CS2 сервер зогсоож байна…");
            try { await StopServer(); } catch (Exception e) { errors.Add("CS2 сервер: " + e.Message); }
            if (Settings.ManageWireGuard)
            {
                Report("WireGuard унтрааж байна…");
                try { await StopWireGuard(); } catch (Exception e) { errors.Add("WireGuard: " + e.Message); }
            }
            if (errors.Count > 0) throw new StepException(Step.Stop, "Зогсоох үед алдаа гарлаа:\n" + string.Join("\n", errors));
            Report("Зогссон");
            log.Ok("BERX ARENA зогслоо");
        }

        async Task StopAgent()
        {
            var agents = FindAgents();
            if (agents.Count == 0) { log.Info("BERX Agent ажиллаагүй байна"); return; }
            foreach (var a in agents)
            {
                var parent = proc.Get(a.ParentPid);
                if (parent != null && string.Equals(parent.Name, "cmd.exe", StringComparison.OrdinalIgnoreCase)
                    && (parent.CommandLine ?? "").IndexOf("start-agent.bat", StringComparison.OrdinalIgnoreCase) >= 0)
                {
                    proc.Kill(parent.Pid);
                    log.Info("start-agent.bat-ийн давталтыг хаалаа (agent дахин асахгүйн тулд)");
                }
            }
            var stopFile = Settings.StopFilePath();
            proc.WriteFile(stopFile, "stop");
            log.Info("BERX Agent-ийг аюулгүй зогсоож байна (сайтад Offline мэдэгдэнэ)…");
            for (int i = 0; i < 24 && agents.Any(a => IsAgent(proc.Get(a.Pid))); i++) await delay(TimeSpan.FromMilliseconds(500));
            var left = agents.Where(a => IsAgent(proc.Get(a.Pid))).ToList();
            foreach (var a in left)
            {
                proc.Kill(a.Pid);
                log.Warn($"Agent (PID {a.Pid}) зогсоох дохиог хүлээж аваагүй (хуучин berx-agent.js байж магадгүй) — процессыг хаалаа. Сайт ~25 секундын дараа Offline болно.");
            }
            proc.DeleteFile(stopFile);
            if (FindAgents().Count > 0) throw new Exception("Agent зогссонгүй");
            if (left.Count == 0) log.Ok("BERX Agent зогслоо");
        }

        async Task StopServer()
        {
            var servers = FindServers();
            if (servers.Count == 0) { log.Info("CS2 сервер ажиллаагүй байна"); return; }
            bool sent = false;
            try
            {
                var rc = LoadRcon();
                using (var c = rconFactory())
                {
                    c.Connect(rc.Host, rc.Port, rc.Password, 3000);
                    try { c.Exec("quit", 1500); } catch { /* сервер холболтоо хаана */ }
                    sent = true;
                    log.Info("RCON-оор quit илгээлээ — CS2 сервер аюулгүй унтарч байна…");
                }
            }
            catch (Exception e) { log.Warn("RCON quit илгээж чадсангүй: " + e.Message); }

            if (sent)
            {
                int waits = Math.Max(1, Settings.StopTimeoutSec * 2);
                for (int i = 0; i < waits && servers.Any(s => proc.Get(s.Pid) != null); i++) await delay(TimeSpan.FromMilliseconds(500));
            }
            var want = NormPath(Settings.ServerExe);
            foreach (var s in servers)
            {
                var cur = proc.Get(s.Pid);
                if (cur == null) continue;
                if (cur.Path == null || NormPath(cur.Path) != want) { log.Warn($"PID {s.Pid} BERX сервер биш болсон — хөндсөнгүй"); continue; }
                proc.Kill(s.Pid);
                log.Warn(sent
                    ? $"CS2 сервер (PID {s.Pid}) {Settings.StopTimeoutSec} секундэд унтраагүй тул хүчээр хаалаа"
                    : $"CS2 сервер (PID {s.Pid})-ийг RCON-гүйгээр хаалаа");
            }
            for (int i = 0; i < 10 && FindServers().Count > 0; i++) await delay(TimeSpan.FromMilliseconds(500));
            if (FindServers().Count > 0) throw new Exception("CS2 сервер зогссонгүй");
            log.Ok("CS2 сервер зогслоо");
        }

        async Task StopWireGuard()
        {
            var t = Settings.TunnelName;
            if (!wg.IsActive(t)) { log.Info($"WireGuard {t} аль хэдийн унтарсан байна"); return; }
            log.Info($"WireGuard {t} tunnel-ийг унтрааж байна (бусад VPN-ийг хөндөхгүй)…");
            var r = wg.Deactivate(Settings);
            if (!r.Ok) throw new Exception(r.Error);
            for (int i = 0; i < 10 && wg.IsActive(t); i++) await delay(TimeSpan.FromSeconds(1));
            if (wg.IsActive(t)) throw new Exception($"{t} tunnel унтарсангүй");
            log.Ok($"WireGuard {t} унтарлаа");
        }
    }
}
