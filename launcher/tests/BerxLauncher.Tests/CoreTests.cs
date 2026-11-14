using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using BerxLauncher.Core;
using Xunit;

namespace BerxLauncher.Tests
{
    public class RedactorAndEnvTests
    {
        [Fact]
        public void Env_is_parsed_like_the_agent()
        {
            var env = EnvFile.Parse("# comment\nRCON_HOST=192.168.1.18\r\nRCON_PASSWORD=\"p@ss word\"\nEMPTY=\nlower=x\nRCON_HOST=dup\n");
            Assert.True(env.Exists);
            Assert.Equal("192.168.1.18", env.Get("RCON_HOST"));
            Assert.Equal("p@ss word", env.Get("RCON_PASSWORD"));
            Assert.Equal("def", env.Get("EMPTY", "def"));
            Assert.False(env.Values.ContainsKey("lower"));
            Assert.False(EnvFile.Parse(null).Exists);
        }

        [Fact]
        public void Secrets_never_reach_logs()
        {
            var r = new Redactor();
            r.SetSecrets(EnvFile.Parse("SERVER_AGENT_SECRET=abcdefghijklmnopqrstuvwxyz123\nRCON_PASSWORD=hunter22\nRCON_HOST=1.2.3.4").SecretValues());
            var outp = r.Apply("secret abcdefghijklmnopqrstuvwxyz123 and hunter22 at 1.2.3.4");
            Assert.DoesNotContain("abcdefghijklmnopqrstuvwxyz123", outp);
            Assert.DoesNotContain("hunter22", outp);
            Assert.Contains("1.2.3.4", outp);
            Assert.DoesNotContain("yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk=", r.Apply("PrivateKey = yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk="));
            Assert.DoesNotContain("qwerty", r.Apply("rcon_password \"qwerty\""));
            Assert.DoesNotContain("zzz123", r.Apply("connect 1.2.3.4:27015; password zzz123"));
            // энгийн мессеж эвдрэхгүй
            Assert.Equal("agent\\.env-ийн RCON_PASSWORD нь server.cfg доторх rcon_password-той таарахгүй байна.",
                r.Apply("agent\\.env-ийн RCON_PASSWORD нь server.cfg доторх rcon_password-той таарахгүй байна."));
        }

        [Fact]
        public void Settings_roundtrip_keeps_defaults_for_missing_fields_and_no_secrets()
        {
            var dir = Path.Combine(Path.GetTempPath(), "berx-set-" + Guid.NewGuid().ToString("N"));
            var path = Path.Combine(dir, "settings.json");
            Directory.CreateDirectory(dir);
            File.WriteAllText(path, "{\"TunnelName\":\"MY-TUN\",\"ManageWireGuard\":false}");
            var s = LauncherSettings.Load(path, out var warn);
            Assert.Null(warn);
            Assert.Equal("MY-TUN", s.TunnelName);
            Assert.False(s.ManageWireGuard);
            Assert.Equal("10.66.66.1", s.VpsIp);                                   // анхны утга
            Assert.Contains("+map de_mirage", s.ServerArgs);
            s.Save(path);
            var json = File.ReadAllText(path);
            Assert.DoesNotContain("EnvPath", json);
            Assert.DoesNotContain("PASSWORD", json.ToUpperInvariant());
            File.WriteAllText(path, "{broken");
            LauncherSettings.Load(path, out warn);
            Assert.NotNull(warn);
            Assert.EndsWith(@"WireGuard\Data\Configurations\MY-TUN.conf.dpapi", s.ResolveTunnelConfig());
            Directory.Delete(dir, true);
        }

        [Fact]
        public void Status_parsers_read_real_values_only()
        {
            var j = ServerStatusParser.ParseJson("garbage {\"server\":{\"map\":\"de_nuke\",\"clients\":[{\"name\":\"A\",\"steamid64\":\"7656\"},{\"name\":\"BOT x\",\"is_bot\":1},{\"name\":\"SourceTV\"}]}} trailing");
            Assert.Equal("de_nuke", j.Map); Assert.Equal(1, j.Humans); Assert.Equal(1, j.Bots);
            Assert.Null(ServerStatusParser.ParseJson("Unknown command 'status_json'"));
            var t = ServerStatusParser.ParseStatusText("hostname: BERX\nloaded spawngroup(  1)  : SV:  [1: de_ancient | main lump | mapload]\n" +
                "  2    00:12   30    0     active 786432 1.2.3.4:27005 'Kaze'\n 65280  BOT  0  0  active 0 'Albert'\n");
            Assert.Equal("de_ancient", t.Map); Assert.Equal("BERX", t.Hostname); Assert.Equal(1, t.Humans); Assert.Equal(1, t.Bots);
        }

        [Fact]
        public void Agent_log_tail_handles_partial_utf8_lines_and_health()
        {
            var path = Path.Combine(Path.GetTempPath(), "berx-tail-" + Guid.NewGuid().ToString("N") + ".log");
            var log = new LogHub(null);
            log.Redactor.SetSecrets(new[] { "topsecretvalue" });
            var tail = new AgentLogTail(path, log);
            File.WriteAllText(path, "");
            var bytes = Encoding.UTF8.GetBytes("12:00:00 BERX Agent v1.0.0\n12:00:01 ✖ Сайт 500 topsecretvalue\n12:00:02 ✓ Сайттай");
            File.WriteAllBytes(path, bytes.Take(bytes.Length - 5).ToArray());   // UTF-8 тэмдэгтийн дунд тасарна
            tail.Pump();
            Assert.True(tail.Health?.Error);
            Assert.DoesNotContain("topsecretvalue", tail.Health.Message);
            File.WriteAllBytes(path, bytes.Concat(Encoding.UTF8.GetBytes(" холболт сэргэлээ\n")).ToArray());
            tail.Pump();
            Assert.Null(tail.Health);
            var lines = log.Snapshot().Where(l => l.Source == "agent").Select(l => l.Text).ToList();
            Assert.Equal(3, lines.Count);
            Assert.Equal("✓ Сайттай холболт сэргэлээ", lines[2]);     // цагийн угтвар хасагдсан, UTF-8 бүтэн
            Assert.All(lines, l => Assert.DoesNotContain("topsecretvalue", l));
            File.Delete(path);
        }
    }

    /// <summary>RconClient-ийг жинхэнэ TCP дээрх жижиг хуурамч серверээр шалгана.</summary>
    public class RconClientTests
    {
        sealed class MiniRcon : IDisposable
        {
            readonly TcpListener l = new TcpListener(IPAddress.Loopback, 0);
            public int Port => ((IPEndPoint)l.LocalEndpoint).Port;
            public MiniRcon(string pass)
            {
                l.Start();
                new Thread(() =>
                {
                    try
                    {
                        while (true)
                        {
                            var c = l.AcceptTcpClient();
                            new Thread(() => Serve(c, pass)) { IsBackground = true }.Start();
                        }
                    }
                    catch { /* stopped */ }
                }) { IsBackground = true }.Start();
            }
            static byte[] Pk(int id, int type, string body)
            {
                var b = Encoding.UTF8.GetBytes(body); var p = new byte[14 + b.Length];
                BitConverter.GetBytes(10 + b.Length).CopyTo(p, 0); BitConverter.GetBytes(id).CopyTo(p, 4); BitConverter.GetBytes(type).CopyTo(p, 8); b.CopyTo(p, 12); return p;
            }
            static void Serve(TcpClient c, string pass)
            {
                var s = c.GetStream(); var hdr = new byte[4];
                try
                {
                    while (true)
                    {
                        if (s.Read(hdr, 0, 4) < 4) return;
                        int n = BitConverter.ToInt32(hdr, 0); var buf = new byte[n]; int o = 0; while (o < n) o += s.Read(buf, o, n - o);
                        int id = BitConverter.ToInt32(buf, 0), type = BitConverter.ToInt32(buf, 4); var body = Encoding.UTF8.GetString(buf, 8, n - 10);
                        if (type == 3) { s.Write(Pk(id, 0, ""), 0, 14); var a = Pk(body == pass ? id : -1, 2, ""); s.Write(a, 0, a.Length); continue; }
                        if (body == "big") { foreach (var part in new[] { new string('a', 4000), new string('b', 4000), "end" }) { var p = Pk(id, 0, part); s.Write(p, 0, p.Length); } continue; }
                        if (body == "bye") { c.Close(); return; }
                        var r = Pk(id, 0, "echo:" + body); s.Write(r, 0, r.Length);
                    }
                }
                catch { /* closed */ }
            }
            public void Dispose() => l.Stop();
        }

        [Fact]
        public void Auth_exec_multipacket_and_disconnect()
        {
            using (var srv = new MiniRcon("pw"))
            {
                using (var c = new RconClient())
                {
                    c.Connect("127.0.0.1", srv.Port, "pw", 3000);
                    Assert.True(c.Connected);
                    Assert.Equal("echo:status", c.Exec("status"));
                    var big = c.Exec("big");
                    Assert.Equal(8003, big.Length);
                    Assert.EndsWith("end", big);
                    Assert.Throws<IOException>(() => c.Exec("bye", 1500));   // сервер холболтоо хаавал тодорхой алдаа
                    Thread.Sleep(200);
                    Assert.False(c.Connected);
                    Assert.Throws<IOException>(() => c.Exec("status"));
                }
                using (var c = new RconClient())
                    Assert.Throws<RconAuthException>(() => c.Connect("127.0.0.1", srv.Port, "wrong", 3000));
            }
        }

        [Fact]
        public void Refused_connection_is_an_error_not_a_hang()
        {
            int port; var l = new TcpListener(IPAddress.Loopback, 0); l.Start(); port = ((IPEndPoint)l.LocalEndpoint).Port; l.Stop();
            using (var c = new RconClient())
                Assert.ThrowsAny<Exception>(() => c.Connect("127.0.0.1", port, "pw", 2000));
        }
    }
}
