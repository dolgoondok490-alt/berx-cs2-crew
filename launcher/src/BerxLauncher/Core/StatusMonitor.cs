using System;
using System.Collections.Generic;
using System.Linq;

namespace BerxLauncher.Core
{
    public enum CompState { Unknown, Stopped, Starting, Running, Error }

    public sealed class StatusSnapshot
    {
        public DateTime At = DateTime.Now;
        public bool Busy;
        public string Op;

        public CompState WireGuard; public string WireGuardDetail; public bool WireGuardManaged;
        public long? LatencyMs;

        public CompState Server; public string ServerDetail; public int? ServerPid;
        public TimeSpan? Uptime; public double? CpuPercent; public long? RamBytes;

        public CompState Rcon; public string RconDetail;
        public string Map; public int? Players; public int? Bots; public int? MaxPlayers;

        public CompState Agent; public string AgentDetail; public int? AgentPid;

        public bool Online;
        public bool AnyRunning => Server == CompState.Running || Agent == CompState.Running || Agent == CompState.Error && AgentPid != null;
    }

    /// <summary>Бүх төлөв бодит эх сурвалжаас: Windows service/NIC, процесс, RCON, ping. Хуурамч утга үүсгэхгүй.</summary>
    public sealed class StatusMonitor : IDisposable
    {
        readonly Orchestrator orch;
        readonly IProcessHost proc;
        readonly IWireGuard wg;
        readonly INetProbe net;
        readonly Func<IRconClient> rconFactory;
        readonly LogHub log;

        IRconClient client;
        DateTime nextRconTry = DateTime.MinValue;
        string authFailedFor;           // нууц үг буруу байсан .env-ийн агуулга (давтан оролдож ban авахгүйн тулд)
        readonly Dictionary<int, KeyValuePair<TimeSpan, DateTime>> cpuPrev = new Dictionary<int, KeyValuePair<TimeSpan, DateTime>>();
        CompState prevServer = CompState.Unknown, prevAgent = CompState.Unknown;

        public Func<AgentHealth> AgentHealthSource { get; set; } = () => null;

        public StatusMonitor(Orchestrator orch, IProcessHost proc, IWireGuard wg, INetProbe net, Func<IRconClient> rconFactory, LogHub log)
        {
            this.orch = orch; this.proc = proc; this.wg = wg; this.net = net; this.rconFactory = rconFactory; this.log = log;
        }

        public StatusSnapshot Poll()
        {
            var s = orch.Settings;
            var snap = new StatusSnapshot { Busy = orch.Busy, Op = orch.CurrentOp, WireGuardManaged = s.ManageWireGuard };

            // ---- WireGuard
            try
            {
                bool active = wg.IsActive(s.TunnelName);
                if (active)
                {
                    snap.LatencyMs = net.Ping(s.VpsIp, 1000);
                    snap.WireGuard = snap.LatencyMs != null ? CompState.Running : CompState.Error;
                    var d = wg.Describe(s.TunnelName);
                    snap.WireGuardDetail = snap.LatencyMs != null ? (d ?? s.TunnelName) : $"VPS {s.VpsIp} хариу өгөхгүй (handshake?)";
                }
                else
                {
                    snap.WireGuard = snap.Busy && snap.Op != "stop" && s.ManageWireGuard ? CompState.Starting : CompState.Stopped;
                    snap.WireGuardDetail = s.ManageWireGuard ? $"{s.TunnelName} · идэвхгүй" : $"{s.TunnelName} · удирдлага унтраалттай";
                }
            }
            catch (Exception e) { snap.WireGuard = CompState.Error; snap.WireGuardDetail = e.Message; }

            // ---- CS2 dedicated server (зөвхөн тохиргооны замтай)
            IList<ProcInfo> servers;
            try { servers = orch.FindServers(); } catch (Exception e) { servers = new List<ProcInfo>(); snap.ServerDetail = e.Message; }
            if (servers.Count > 0)
            {
                var p = servers[0];
                snap.Server = CompState.Running; snap.ServerPid = p.Pid;
                if (p.StartTime.HasValue) snap.Uptime = DateTime.Now - p.StartTime.Value;
                var smp = proc.Sample(p.Pid);
                if (smp.HasValue)
                {
                    snap.RamBytes = smp.Value.Ram;
                    if (cpuPrev.TryGetValue(p.Pid, out var prev))
                    {
                        var dt = (DateTime.UtcNow - prev.Value).TotalMilliseconds;
                        if (dt > 200) snap.CpuPercent = Math.Max(0, Math.Min(100, (smp.Value.Cpu - prev.Key).TotalMilliseconds / dt / Environment.ProcessorCount * 100));
                    }
                    cpuPrev[p.Pid] = new KeyValuePair<TimeSpan, DateTime>(smp.Value.Cpu, DateTime.UtcNow);
                }
                snap.ServerDetail = $"PID {p.Pid}";
            }
            else
            {
                cpuPrev.Clear();
                if (orch.ExpectServer && !snap.Busy) { snap.Server = CompState.Error; snap.ServerDetail = "Санаандгүй унтарсан"; }
                else if (snap.Busy && snap.Op != "stop") { snap.Server = CompState.Starting; snap.ServerDetail = "Асааж байна…"; }
                else { snap.Server = CompState.Stopped; snap.ServerDetail ??= "Ажиллаагүй"; }
            }

            // ---- RCON
            if (snap.Server == CompState.Running) PollRcon(snap);
            else { CloseRcon(); snap.Rcon = CompState.Stopped; snap.RconDetail = "Сервер ажиллаагүй"; }

            // ---- BERX Agent
            IList<ProcInfo> agents;
            try { agents = orch.FindAgents(); } catch { agents = new List<ProcInfo>(); }
            if (agents.Count > 0)
            {
                snap.AgentPid = agents[0].Pid;
                var h = AgentHealthSource?.Invoke();
                if (h != null && h.Error) { snap.Agent = CompState.Error; snap.AgentDetail = h.Message; }
                else { snap.Agent = CompState.Running; snap.AgentDetail = $"PID {agents[0].Pid}"; }
            }
            else if (orch.ExpectAgent && !snap.Busy) { snap.Agent = CompState.Error; snap.AgentDetail = "Санаандгүй унтарсан"; }
            else if (snap.Busy && snap.Op != "stop") { snap.Agent = CompState.Starting; snap.AgentDetail = "Хүлээж байна…"; }
            else { snap.Agent = CompState.Stopped; snap.AgentDetail = "Ажиллаагүй"; }

            snap.Online = snap.Server == CompState.Running && snap.Rcon == CompState.Running && snap.Agent == CompState.Running
                          && (!s.ManageWireGuard || snap.WireGuard == CompState.Running);

            if (!snap.Busy)
            {
                if (prevServer == CompState.Running && snap.Server == CompState.Error) log.Error("CS2 сервер санаандгүй унтарлаа!");
                if (prevAgent == CompState.Running && snap.Agent == CompState.Error && snap.AgentPid == null) log.Error("BERX Agent санаандгүй унтарлаа!");
            }
            prevServer = snap.Server; prevAgent = snap.Agent;
            return snap;
        }

        void PollRcon(StatusSnapshot snap)
        {
            RconCreds rc;
            string envText;
            try { envText = proc.ReadText(orch.Settings.EnvPath()) ?? ""; rc = orch.LoadRcon(); }
            catch (Exception e) { snap.Rcon = CompState.Error; snap.RconDetail = e.Message; return; }

            if (authFailedFor != null && authFailedFor == envText) { snap.Rcon = CompState.Error; snap.RconDetail = "Нууц үг буруу (agent\\.env RCON_PASSWORD)"; return; }
            authFailedFor = null;

            bool young = snap.Uptime.HasValue && snap.Uptime.Value.TotalSeconds < 180;
            if (client == null || !client.Connected)
            {
                CloseRcon();
                if (DateTime.UtcNow < nextRconTry) { snap.Rcon = young ? CompState.Starting : CompState.Error; snap.RconDetail = young ? "Сервер ачаалж байна…" : "Холбогдож чадсангүй"; return; }
                nextRconTry = DateTime.UtcNow.AddSeconds(4);
                var c = rconFactory();
                try { c.Connect(rc.Host, rc.Port, rc.Password, 2000); client = c; }
                catch (RconAuthException)
                {
                    c.Dispose(); authFailedFor = envText;
                    snap.Rcon = CompState.Error; snap.RconDetail = "Нууц үг буруу (agent\\.env RCON_PASSWORD)";
                    log.Error("RCON нууц үг буруу — дахин оролдохгүй (ban авахаас сэргийлж). agent\\.env-ийг засна уу.");
                    return;
                }
                catch (Exception e)
                {
                    c.Dispose();
                    snap.Rcon = young ? CompState.Starting : CompState.Error;
                    snap.RconDetail = young ? "Сервер ачаалж байна…" : e.Message;
                    return;
                }
            }
            try
            {
                var info = ServerStatusParser.ParseJson(client.Exec("status_json", 3000));
                if (info == null || info.Map == null)
                {
                    var txt = ServerStatusParser.ParseStatusText(client.Exec("status", 3000));
                    if (info == null) info = txt;
                    else if (txt != null) { info.Map = txt.Map; if (info.Humans + info.Bots == 0) { info.Humans = txt.Humans; info.Bots = txt.Bots; } }
                }
                snap.Rcon = CompState.Running;
                snap.RconDetail = $"{rc.Host}:{rc.Port}";
                if (info != null) { snap.Map = info.Map; snap.Players = info.Humans; snap.Bots = info.Bots; snap.MaxPlayers = info.MaxPlayers; }
            }
            catch (Exception e)
            {
                CloseRcon();
                snap.Rcon = CompState.Error; snap.RconDetail = e.Message;
            }
        }

        void CloseRcon()
        {
            try { client?.Dispose(); } catch { /* ignore */ }
            client = null;
        }

        public void Dispose() => CloseRcon();
    }
}
