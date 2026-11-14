using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using BerxLauncher.Core;
using BerxLauncher.Platform;
using Xunit;
using Xunit.Abstractions;

namespace BerxLauncher.Tests
{
    /// <summary>
    /// Жинхэнэ Windows процессуудаар (тусгаарласан temp хавтаст):
    ///   • "CS2 сервер" = node.exe-г cs2.exe болгож хуулсан + хуурамч RCON (fake-cs2.js)
    ///   • "Хэрэглэгчийн CS2 тоглоом" = өөр замтай cs2.exe — хэзээ ч хөндөгдөх ёсгүй
    ///   • Жинхэнэ berx-agent.js + хуурамч BERX сайт (fake-site.js)
    /// Production сервер, WireGuard-д огт хүрэхгүй.
    /// </summary>
    public class WindowsEndToEndTests : IDisposable
    {
        readonly ITestOutputHelper output;
        readonly string root = Path.Combine(Path.GetTempPath(), "berx-e2e-" + Guid.NewGuid().ToString("N").Substring(0, 8));
        Process game, site;

        public WindowsEndToEndTests(ITestOutputHelper output) { this.output = output; }

        static int FreePort() { var l = new TcpListener(IPAddress.Loopback, 0); l.Start(); int p = ((IPEndPoint)l.LocalEndpoint).Port; l.Stop(); return p; }

        static string RepoAgentScript()
        {
            var d = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
            while (d != null && !File.Exists(Path.Combine(d.FullName, "agent", "berx-agent.js"))) d = d.Parent;
            return d == null ? null : Path.Combine(d.FullName, "agent", "berx-agent.js");
        }

        [Fact]
        public async Task Real_processes_start_monitor_stop_restart_and_game_is_untouched()
        {
            var host = new WindowsProcessHost();
            var node = host.ResolveNode(null);
            Assert.True(node != null, "Node.js PATH-д алга (CI дээр setup-node хэрэгтэй)");
            var agentSrc = RepoAgentScript();
            Assert.True(agentSrc != null, "agent/berx-agent.js олдсонгүй");
            var fixtures = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "fixtures");

            var srvDir = Path.Combine(root, "cs2-server", "game", "bin", "win64");
            var gameDir = Path.Combine(root, "Steam", "steamapps", "common", "Counter-Strike Global Offensive", "game", "bin", "win64");
            var agentDir = Path.Combine(root, "berx-cs2-crew-main", "agent");
            foreach (var d in new[] { srvDir, gameDir, agentDir }) Directory.CreateDirectory(d);
            var srvExe = Path.Combine(srvDir, "cs2.exe");
            File.Copy(node, srvExe);
            File.Copy(node, Path.Combine(gameDir, "cs2.exe"));
            File.Copy(agentSrc, Path.Combine(agentDir, "berx-agent.js"));

            int rconPort = FreePort(), sitePort = FreePort(), evPort = FreePort();
            const string pass = "e2e-rcon-pass-777";
            const string secret = "e2e-agent-secret-abcdefghijklmnop";
            var marker = Path.Combine(root, "cs2-marker.txt");
            var heartbeats = Path.Combine(root, "heartbeats.txt");
            File.WriteAllText(Path.Combine(agentDir, ".env"),
                $"BERX_URL=http://127.0.0.1:{sitePort}\nSERVER_AGENT_SECRET={secret}\nRCON_HOST=127.0.0.1\nRCON_PORT={rconPort}\nRCON_PASSWORD={pass}\nPUBLIC_ADDRESS=203.0.113.9:27015\nEVENTS_PORT={evPort}\nPOLL_MS=2000\n");

            site = Process.Start(new ProcessStartInfo(node, $"\"{Path.Combine(fixtures, "fake-site.js")}\" {sitePort} \"{heartbeats}\"") { UseShellExecute = false, CreateNoWindow = true });
            game = Process.Start(new ProcessStartInfo(Path.Combine(gameDir, "cs2.exe"), "-e \"setInterval(function(){},1000)\"") { UseShellExecute = false, CreateNoWindow = true });

            var settings = new LauncherSettings
            {
                ServerExe = srvExe,
                ServerArgs = $"\"{Path.Combine(fixtures, "fake-cs2.js")}\" {rconPort} {pass} \"{marker}\"",
                AgentDir = agentDir,
                NodePath = node,
                ManageWireGuard = false,
                RconTimeoutSec = 40,
                StopTimeoutSec = 15
            }.Normalize();
            var log = new LogHub(Path.Combine(root, "launcher.log"));
            log.Line += l => output.WriteLine($"[{l.Source}] {l.Level}: {l.Text}");
            var noWg = new FakeWorld();                     // WireGuard удирдлага унтраалттай: жинхэнэ tunnel-д хүрэхгүй
            var net = new WindowsNetProbe();
            var orch = new Orchestrator(settings, host, noWg, net, () => new RconClient(), log) { AgentLogFile = Path.Combine(root, "logs", "agent.log"), PollInterval = TimeSpan.FromSeconds(1) };
            var tail = new AgentLogTail(orch.AgentLogFile, log);
            var mon = new StatusMonitor(orch, host, noWg, net, () => new RconClient(), log) { AgentHealthSource = () => tail.Health };

            // ---------- START
            var r = await orch.StartAsync();
            Assert.True(r.Ok, "START: " + r.Error);
            var servers = orch.FindServers();
            Assert.Single(servers);
            Assert.Equal(Orchestrator.NormPath(srvExe), Orchestrator.NormPath(servers[0].Path));
            Assert.Single(orch.FindAgents());
            Assert.Contains(host.List("cs2.exe"), p => p.Pid == game.Id);       // тоглоом cs2.exe боловч
            Assert.DoesNotContain(servers, p => p.Pid == game.Id);              // сервер гэж тооцогдохгүй

            // ---------- давхар START → давхар процесс үүсэхгүй
            r = await orch.StartAsync();
            Assert.True(r.Ok, "START#2: " + r.Error);
            Assert.Single(orch.FindServers());
            Assert.Single(orch.FindAgents());

            // ---------- Live status (бодит RCON + процесс)
            StatusSnapshot s = null;
            for (int i = 0; i < 20; i++)
            {
                tail.Pump(); s = mon.Poll();
                if (s.Online && s.Map != null && s.CpuPercent.HasValue) break;
                Thread.Sleep(1000);
            }
            Assert.True(s.Online, $"ONLINE биш: server={s.Server} rcon={s.Rcon}({s.RconDetail}) agent={s.Agent}({s.AgentDetail})");
            Assert.Equal("de_mirage", s.Map);
            Assert.Equal(2, s.Players);
            Assert.Equal(1, s.Bots);
            Assert.True(s.Uptime.HasValue && s.Uptime.Value.TotalSeconds >= 0);
            Assert.True(s.RamBytes > 0);
            Assert.True(SpinUntil(() => File.Exists(heartbeats) && File.ReadAllText(heartbeats).Contains("\"online\":true"), 15000), "Agent сайт руу online heartbeat илгээсэнгүй");

            // ---------- STOP (graceful)
            r = await orch.StopAsync();
            Assert.True(r.Ok, "STOP: " + r.Error);
            Assert.Empty(orch.FindServers());
            Assert.Empty(orch.FindAgents());
            Assert.Contains("quit", File.ReadAllText(marker));                  // RCON quit-ээр унтарсан
            var lastHb = File.ReadAllLines(heartbeats).Last(l => l.Trim().Length > 0);
            Assert.Contains("\"online\":false", lastHb);                         // agent сайтад Offline мэдэгдсэн
            Assert.False(game.HasExited, "Хэрэглэгчийн CS2 тоглоом хаагдсан байна!");
            var logs = string.Join("\n", log.Snapshot().Select(l => l.Text));
            Assert.DoesNotContain("хүчээр", logs);
            Assert.DoesNotContain("хуучин berx-agent", logs);
            tail.Pump();
            Assert.Equal(CompState.Stopped, mon.Poll().Server);

            // ---------- RESTART
            r = await orch.StartAsync();
            Assert.True(r.Ok, "START#3: " + r.Error);
            int pid1 = orch.FindServers()[0].Pid;
            r = await orch.RestartAsync();
            Assert.True(r.Ok, "RESTART: " + r.Error);
            Assert.Single(orch.FindServers());
            Assert.NotEqual(pid1, orch.FindServers()[0].Pid);
            Assert.Single(orch.FindAgents());
            r = await orch.StopAsync();
            Assert.True(r.Ok, "STOP#2: " + r.Error);
            Assert.False(game.HasExited);

            // ---------- нууц мэдээлэл log-д алга
            var launcherLog = File.ReadAllText(Path.Combine(root, "launcher.log"));
            Assert.DoesNotContain(pass, launcherLog);
            Assert.DoesNotContain(secret, launcherLog);
            Assert.DoesNotContain(pass, logs);
            Assert.DoesNotContain(secret, logs);
        }

        static bool SpinUntil(Func<bool> f, int ms)
        {
            var end = DateTime.UtcNow.AddMilliseconds(ms);
            while (DateTime.UtcNow < end) { try { if (f()) return true; } catch { /* retry */ } Thread.Sleep(300); }
            return false;
        }

        public void Dispose()
        {
            foreach (var p in new[] { game, site }) { try { if (p != null && !p.HasExited) p.Kill(); } catch { /* ignore */ } }
            // энэ тестийн temp хавтаснаас асаасан үлдэгдэл процесс
            try
            {
                var host = new WindowsProcessHost();
                foreach (var p in host.List("cs2.exe").Concat(host.List("node.exe")))
                    if ((p.Path ?? "").StartsWith(root, StringComparison.OrdinalIgnoreCase) || (p.CommandLine ?? "").IndexOf(root, StringComparison.OrdinalIgnoreCase) >= 0)
                        host.Kill(p.Pid);
            }
            catch { /* ignore */ }
            try { Thread.Sleep(500); Directory.Delete(root, true); } catch { /* ignore */ }
        }
    }
}
