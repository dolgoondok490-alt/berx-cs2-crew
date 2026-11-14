using System;
using System.Linq;
using System.Threading.Tasks;
using BerxLauncher.Core;
using Xunit;

namespace BerxLauncher.Tests
{
    public class OrchestratorTests
    {
        static (FakeWorld w, Orchestrator o, LogHub log) Make(Action<FakeWorld, LauncherSettings> setup = null)
        {
            var w = new FakeWorld();
            var s = w.Settings();
            setup?.Invoke(w, s);
            var log = new LogHub(null);
            return (w, TestUtil.Orch(w, s, log), log);
        }

        static string AllLogs(LogHub l) => string.Join("\n", l.Snapshot().Select(x => x.Text));

        [Fact]
        public async Task Start_runs_full_sequence_in_order()
        {
            var (w, o, log) = Make();
            var r = await o.StartAsync();
            Assert.True(r.Ok, r.Error);
            int wgI = w.Calls.IndexOf("wg-activate:BERX-ARENA"), srvI = w.Calls.IndexOf("start-server"), agI = w.Calls.IndexOf("start-agent");
            int rconI = w.Calls.IndexOf("rcon-connect");
            Assert.True(wgI >= 0 && wgI < srvI && srvI < rconI && rconI < agI, string.Join(",", w.Calls));
            Assert.True(w.ServerRunning && w.AgentRunning && w.WgActive);
            Assert.True(o.ExpectServer && o.ExpectAgent);
        }

        [Fact]
        public async Task Start_never_duplicates_running_processes()
        {
            var (w, o, log) = Make();
            w.WgActive = true; w.AddServer(); w.AddAgent();
            var r = await o.StartAsync();
            Assert.True(r.Ok, r.Error);
            Assert.DoesNotContain("start-server", w.Calls);
            Assert.DoesNotContain("start-agent", w.Calls);
            Assert.DoesNotContain(w.Calls, c => c.StartsWith("wg-activate"));
            Assert.Equal(1, w.Procs.Values.Count(p => p.Name == "cs2.exe"));
            Assert.Contains("аль хэдийн", AllLogs(log));
        }

        [Fact]
        public async Task Users_own_CS2_game_is_never_treated_as_server_or_stopped()
        {
            var (w, o, log) = Make();
            int game = w.AddGame();
            Assert.Empty(o.FindServers());
            var r = await o.StartAsync();
            Assert.True(r.Ok, r.Error);
            Assert.Contains("start-server", w.Calls);         // тоглоом ажиллаж байсан ч серверийг асаана
            var stop = await o.StopAsync();
            Assert.True(stop.Ok, stop.Error);
            Assert.True(w.Procs.ContainsKey(game), "тоглоомын процесс хаагдсан байна!");
            Assert.DoesNotContain("kill:" + game, w.Calls);
        }

        [Fact]
        public async Task Stop_is_graceful_and_ordered_agent_then_server_then_tunnel()
        {
            var (w, o, log) = Make();
            w.WgActive = true; w.AddServer(); w.AddAgent();
            var r = await o.StopAsync();
            Assert.True(r.Ok, r.Error);
            int a = w.Calls.IndexOf("stopfile"), q = w.Calls.IndexOf("rcon-quit"), t = w.Calls.IndexOf("wg-deactivate:BERX-ARENA");
            Assert.True(a >= 0 && a < q && q < t, string.Join(",", w.Calls));
            Assert.DoesNotContain(w.Calls, c => c.StartsWith("kill:"));     // хүчээр хаагаагүй
            Assert.False(w.ServerRunning || w.AgentRunning || w.WgActive);
        }

        [Fact]
        public async Task Stop_kills_start_agent_bat_loop_so_agent_does_not_respawn()
        {
            var (w, o, log) = Make();
            int cmd = w.AddProc("cmd.exe", @"C:\Windows\System32\cmd.exe", "cmd /c \"C:\\agent\\windows\\start-agent.bat\"");
            w.AddAgent(parent: cmd);
            var r = await o.StopAsync();
            Assert.True(r.Ok, r.Error);
            Assert.Contains("kill:" + cmd, w.Calls);
            Assert.False(w.AgentRunning);
        }

        [Fact]
        public async Task Stop_falls_back_to_killing_old_agent_without_stop_support()
        {
            var (w, o, log) = Make();
            w.AgentHonorsStop = false;
            int ag = w.AddAgent();
            var r = await o.StopAsync();
            Assert.True(r.Ok, r.Error);
            Assert.Contains("kill:" + ag, w.Calls);
            Assert.Contains("хуучин berx-agent.js", AllLogs(log));
        }

        [Fact]
        public async Task Stop_force_kills_only_the_dedicated_server_after_timeout()
        {
            var (w, o, log) = Make();
            w.ServerIgnoresQuit = true;
            int srv = w.AddServer(), game = w.AddGame();
            var r = await o.StopAsync();
            Assert.True(r.Ok, r.Error);
            Assert.Contains("rcon-quit", w.Calls);
            Assert.Contains("kill:" + srv, w.Calls);
            Assert.DoesNotContain("kill:" + game, w.Calls);
            Assert.True(w.Procs.ContainsKey(game));
        }

        [Fact]
        public async Task ManageWireGuard_off_never_touches_tunnel()
        {
            var (w, o, log) = Make((w0, s) => s.ManageWireGuard = false);
            Assert.True((await o.StartAsync()).Ok);
            Assert.True((await o.StopAsync()).Ok);
            Assert.DoesNotContain(w.Calls, c => c.StartsWith("wg-"));
        }

        [Fact]
        public async Task Restart_stops_then_starts()
        {
            var (w, o, log) = Make();
            w.WgActive = true; int oldSrv = w.AddServer(); w.AddAgent();
            var r = await o.RestartAsync();
            Assert.True(r.Ok, r.Error);
            Assert.True(w.Calls.IndexOf("rcon-quit") < w.Calls.IndexOf("start-server"));
            Assert.False(w.Procs.ContainsKey(oldSrv));
            Assert.True(w.ServerRunning && w.AgentRunning);
        }

        [Fact]
        public async Task Second_operation_while_busy_is_rejected()
        {
            var w = new FakeWorld();
            var gate = new TaskCompletionSource<bool>();
            var o = new Orchestrator(w.Settings(), w, w, w, w.RconFactory, new LogHub(null), _ => gate.Task) { PollInterval = TimeSpan.FromSeconds(1) };
            var first = o.StartAsync();                 // WireGuard хүлээлт дээр түр зогсоно
            var second = await o.StopAsync();
            Assert.False(second.Ok);
            Assert.Contains("Өөр үйлдэл", second.Error);
            gate.SetResult(true);
            await first;
        }

        // ---------------- алдааны нөхцөлүүд
        [Fact]
        public async Task Missing_server_exe_fails_clearly_and_starts_nothing()
        {
            var (w, o, log) = Make((w0, s) => s.ServerExe = @"D:\nope\cs2.exe");
            var r = await o.StartAsync();
            Assert.False(r.Ok); Assert.Equal(Step.Config, r.FailedStep);
            Assert.Contains(@"D:\nope\cs2.exe", r.Error);
            Assert.Empty(w.Calls);
        }

        [Fact]
        public async Task Missing_env_or_short_secret_or_node_fail_in_preflight()
        {
            var (w, o, _) = Make(); w.Files.Remove(System.IO.Path.Combine(FakeWorld.AgentDir, ".env"));
            var r = await o.StartAsync(); Assert.Equal(Step.Config, r.FailedStep); Assert.Contains(".env", r.Error);

            var (w2, o2, _) = Make(); w2.Files[System.IO.Path.Combine(FakeWorld.AgentDir, ".env")] = "SERVER_AGENT_SECRET=short\nRCON_PASSWORD=x";
            r = await o2.StartAsync(); Assert.Equal(Step.Config, r.FailedStep); Assert.Contains("SERVER_AGENT_SECRET", r.Error);

            var (w3, o3, _) = Make(); w3.NodePath = null;
            r = await o3.StartAsync(); Assert.Equal(Step.Config, r.FailedStep); Assert.Contains("Node.js", r.Error);
            Assert.Empty(w3.Calls);
        }

        [Fact]
        public async Task WireGuard_failure_stops_before_server()
        {
            var (w, o, _) = Make(); w.WgActivateFails = true;
            var r = await o.StartAsync();
            Assert.Equal(Step.WireGuard, r.FailedStep);
            Assert.Contains("цуцалсан", r.Error);
            Assert.DoesNotContain("start-server", w.Calls);

            var (w2, o2, _) = Make(); w2.WgNeverComesUp = true;
            r = await o2.StartAsync();
            Assert.Equal(Step.WireGuard, r.FailedStep);
            Assert.DoesNotContain("start-server", w2.Calls);
        }

        [Fact]
        public async Task VPS_unreachable_blocks_start_unless_disabled()
        {
            var (w, o, _) = Make(); w.PingMs = null;
            var r = await o.StartAsync();
            Assert.Equal(Step.Network, r.FailedStep);
            Assert.Contains("10.66.66.1", r.Error);
            Assert.DoesNotContain("start-server", w.Calls);

            var (w2, o2, log2) = Make((x, s) => s.RequireVpsPing = false); w2.PingMs = null;
            r = await o2.StartAsync();
            Assert.True(r.Ok, r.Error);
            Assert.Contains("10.66.66.1", AllLogs(log2));
        }

        [Fact]
        public async Task Busy_udp_port_is_reported()
        {
            var (w, o, _) = Make(); w.UdpBusy = true; w.WgActive = true;
            var r = await o.StartAsync();
            Assert.Equal(Step.Server, r.FailedStep);
            Assert.Contains("27015", r.Error);
        }

        [Fact]
        public async Task Server_that_exits_immediately_is_reported()
        {
            var (w, o, _) = Make(); w.ServerExitsImmediately = true; w.WgActive = true;
            var r = await o.StartAsync();
            Assert.Equal(Step.Server, r.FailedStep);
            Assert.Contains("асаад унтарлаа", r.Error);
            Assert.DoesNotContain("start-agent", w.Calls);
        }

        [Fact]
        public async Task Wrong_rcon_password_fails_fast_without_retry_spam()
        {
            var (w, o, _) = Make(); w.WgActive = true;
            w.Files[System.IO.Path.Combine(FakeWorld.AgentDir, ".env")] = $"SERVER_AGENT_SECRET={FakeWorld.Secret}\nRCON_PASSWORD=wrong-one\n";
            var r = await o.StartAsync();
            Assert.Equal(Step.Rcon, r.FailedStep);
            Assert.Contains("RCON нууц үг буруу", r.Error);
            Assert.Equal(1, w.RconConnects);
            Assert.DoesNotContain("start-agent", w.Calls);
        }

        [Fact]
        public async Task Rcon_never_ready_times_out_with_hint()
        {
            var (w, o, _) = Make(); w.WgActive = true; w.RconNeverReady = true;
            var r = await o.StartAsync();
            Assert.Equal(Step.Rcon, r.FailedStep);
            Assert.Contains("-usercon", r.Error);
            Assert.DoesNotContain("start-agent", w.Calls);
        }

        [Fact]
        public async Task Agent_crash_is_reported_with_redacted_log_tail()
        {
            var (w, o, log) = Make(); w.WgActive = true; w.AgentCrashes = true;
            var r = await o.StartAsync();
            Assert.Equal(Step.Agent, r.FailedStep);
            Assert.Contains("асаад унтарлаа", r.Error);
            Assert.DoesNotContain(FakeWorld.Secret, r.Error);
            Assert.DoesNotContain(FakeWorld.Secret, AllLogs(log));
            Assert.DoesNotContain(FakeWorld.RconPass, AllLogs(log));
        }
    }

    public class MonitorTests
    {
        [Fact]
        public void Online_only_when_every_part_is_really_up()
        {
            var w = new FakeWorld(); var log = new LogHub(null);
            var o = TestUtil.Orch(w, w.Settings(), log);
            var m = new StatusMonitor(o, w, w, w, w.RconFactory, log);

            var s = m.Poll();
            Assert.False(s.Online);
            Assert.Equal(CompState.Stopped, s.Server);
            Assert.Null(s.Map); Assert.Null(s.Players); Assert.Null(s.LatencyMs);   // хуурамч утга алга

            w.WgActive = true; w.AddServer(); w.AddAgent();
            s = m.Poll();
            Assert.True(s.Online);
            Assert.Equal("de_mirage", s.Map);
            Assert.Equal(2, s.Players); Assert.Equal(1, s.Bots); Assert.Equal(12, s.MaxPlayers);
            Assert.Equal(25, s.LatencyMs);
            Assert.True(s.RamBytes > 0);
        }

        [Fact]
        public void Unexpected_server_exit_is_an_error()
        {
            var w = new FakeWorld(); var log = new LogHub(null);
            var o = TestUtil.Orch(w, w.Settings(), log);
            var m = new StatusMonitor(o, w, w, w, w.RconFactory, log);
            int pid = w.AddServer(); o.ExpectServer = true;
            Assert.Equal(CompState.Running, m.Poll().Server);
            w.Procs.Remove(pid);
            var s = m.Poll();
            Assert.Equal(CompState.Error, s.Server);
            Assert.Contains(log.Snapshot(), l => l.Level == LogLevel.Error && l.Text.Contains("санаандгүй"));
        }

        [Fact]
        public void Bad_rcon_password_is_not_retried()
        {
            var w = new FakeWorld(); var log = new LogHub(null);
            w.Files[System.IO.Path.Combine(FakeWorld.AgentDir, ".env")] = $"SERVER_AGENT_SECRET={FakeWorld.Secret}\nRCON_PASSWORD=bad\n";
            var o = TestUtil.Orch(w, w.Settings(), log);
            var m = new StatusMonitor(o, w, w, w, w.RconFactory, log);
            w.AddServer();
            for (int i = 0; i < 4; i++) Assert.Equal(CompState.Error, m.Poll().Rcon);
            Assert.Equal(1, w.RconConnects);
        }

        [Fact]
        public void Agent_log_error_marks_agent_as_error()
        {
            var w = new FakeWorld(); var log = new LogHub(null);
            var o = TestUtil.Orch(w, w.Settings(), log);
            var m = new StatusMonitor(o, w, w, w, w.RconFactory, log) { AgentHealthSource = () => new AgentHealth { Error = true, Message = "Сайт agent-ийг танихгүй байна" } };
            w.AddAgent();
            var s = m.Poll();
            Assert.Equal(CompState.Error, s.Agent);
            Assert.Contains("танихгүй", s.AgentDetail);
        }
    }
}
