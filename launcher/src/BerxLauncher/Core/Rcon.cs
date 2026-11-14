using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Sockets;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

namespace BerxLauncher.Core
{
    public interface IRconClient : IDisposable
    {
        bool Connected { get; }
        void Connect(string host, int port, string password, int timeoutMs);
        string Exec(string command, int timeoutMs = 5000);
    }

    public sealed class RconAuthException : Exception
    {
        public RconAuthException() : base("RCON нууц үг буруу") { }
    }

    /// <summary>Source RCON (CS2 -usercon). Тусдаа reader thread пакетуудыг дараалалд хийнэ.</summary>
    public sealed class RconClient : IRconClient
    {
        struct Packet { public int Id, Type; public string Body; }

        TcpClient tcp;
        NetworkStream ns;
        BlockingCollection<Packet> queue;
        readonly object writeGate = new object(), execGate = new object();
        int nextId = 100;
        volatile bool alive;

        public bool Connected => alive;

        public void Connect(string host, int port, string password, int timeoutMs)
        {
            tcp = new TcpClient();
            var ar = tcp.BeginConnect(host, port, null, null);
            if (!ar.AsyncWaitHandle.WaitOne(timeoutMs))
            {
                Dispose();
                throw new TimeoutException($"RCON {host}:{port} холбогдсонгүй (timeout)");
            }
            try { tcp.EndConnect(ar); }
            catch (SocketException e) { Dispose(); throw new IOException($"RCON {host}:{port} холбогдсонгүй ({e.SocketErrorCode})"); }
            tcp.NoDelay = true;
            ns = tcp.GetStream();
            queue = new BlockingCollection<Packet>();
            alive = true;
            new Thread(ReadLoop) { IsBackground = true, Name = "rcon-reader" }.Start();

            int id = Interlocked.Increment(ref nextId);
            Send(id, 3, password ?? "");
            var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
            while (true)
            {
                int left = (int)(deadline - DateTime.UtcNow).TotalMilliseconds;
                if (left <= 0) { Dispose(); throw new TimeoutException("RCON auth хариу ирсэнгүй"); }
                if (!queue.TryTake(out var p, left))
                {
                    if (queue.IsCompleted) { Dispose(); throw new IOException("RCON холболт тасарлаа (auth)"); }
                    continue;
                }
                if (p.Type != 2) continue;
                if (p.Id == -1) { Dispose(); throw new RconAuthException(); }
                if (p.Id == id) return;
            }
        }

        void ReadLoop()
        {
            var hdr = new byte[4];
            try
            {
                while (alive)
                {
                    if (!ReadExact(hdr, 4)) break;
                    int size = BitConverter.ToInt32(hdr, 0);
                    if (size < 10 || size > (1 << 22)) break;
                    var buf = new byte[size];
                    if (!ReadExact(buf, size)) break;
                    int len = size - 10;
                    queue.Add(new Packet
                    {
                        Id = BitConverter.ToInt32(buf, 0),
                        Type = BitConverter.ToInt32(buf, 4),
                        Body = len > 0 ? Encoding.UTF8.GetString(buf, 8, len) : ""
                    });
                }
            }
            catch { /* холболт тасарсан */ }
            finally
            {
                alive = false;
                try { queue.CompleteAdding(); } catch { /* ignore */ }
            }
        }

        bool ReadExact(byte[] b, int n)
        {
            int o = 0;
            while (o < n)
            {
                int r = ns.Read(b, o, n - o);
                if (r <= 0) return false;
                o += r;
            }
            return true;
        }

        void Send(int id, int type, string body)
        {
            var b = Encoding.UTF8.GetBytes(body);
            var p = new byte[14 + b.Length];
            BitConverter.GetBytes(10 + b.Length).CopyTo(p, 0);
            BitConverter.GetBytes(id).CopyTo(p, 4);
            BitConverter.GetBytes(type).CopyTo(p, 8);
            b.CopyTo(p, 12);
            lock (writeGate) ns.Write(p, 0, p.Length);
        }

        public string Exec(string command, int timeoutMs = 5000)
        {
            lock (execGate)
            {
                if (!alive) throw new IOException("RCON холбогдоогүй");
                int id = Interlocked.Increment(ref nextId);
                Send(id, 2, command);
                var sb = new StringBuilder();
                bool got = false;
                var deadline = DateTime.UtcNow.AddMilliseconds(timeoutMs);
                while (true)
                {
                    int wait = got ? 150 : (int)Math.Max(0, (deadline - DateTime.UtcNow).TotalMilliseconds);
                    if (wait <= 0) break;
                    if (!queue.TryTake(out var p, wait))
                    {
                        if (got || queue.IsCompleted) break;
                        continue;
                    }
                    if (p.Id == id && p.Type == 0) { sb.Append(p.Body); got = true; }
                }
                if (!got && !alive) throw new IOException("RCON холболт тасарлаа");
                return sb.ToString();
            }
        }

        public void Dispose()
        {
            alive = false;
            try { ns?.Close(); } catch { /* ignore */ }
            try { tcp?.Close(); } catch { /* ignore */ }
        }
    }

    public sealed class ServerInfo
    {
        public string Map;
        public string Hostname;
        public int Humans;
        public int Bots;
        public int? MaxPlayers;
    }

    /// <summary>CS2-ийн status_json / status хариуг уян хатан уншина (CS2 update-ээр формат өөрчлөгдөж болно).</summary>
    public static class ServerStatusParser
    {
        public static ServerInfo ParseJson(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return null;
            int i = raw.IndexOf('{'), j = raw.LastIndexOf('}');
            if (i < 0 || j <= i) return null;
            Dictionary<string, object> root;
            try { root = new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.DeserializeObject(raw.Substring(i, j - i + 1)) as Dictionary<string, object>; }
            catch { return null; }
            if (root == null) return null;
            var srv = (root.TryGetValue("server", out var s) ? s as Dictionary<string, object> : null) ?? root;
            var info = new ServerInfo
            {
                Map = Str(srv, "map", "map_name", "mapname") ?? Str(root, "map", "map_name"),
                Hostname = Str(srv, "hostname", "name"),
                MaxPlayers = Int(srv, "max_players", "maxplayers", "max_clients") ?? Int(root, "max_players", "maxplayers")
            };
            var list = Arr(srv, "clients", "players") ?? Arr(root, "clients", "players");
            if (list != null)
            {
                foreach (var c in list)
                {
                    if (!(c is Dictionary<string, object> d)) continue;
                    var name = Str(d, "name", "player_name") ?? "";
                    if (name == "SourceTV" || name == "GOTV") continue;
                    if (Bool(d, "bot", "is_bot", "fakeplayer", "isbot")) info.Bots++; else info.Humans++;
                }
            }
            return info;
        }

        static readonly Regex MapSpawn = new Regex(@"\[1:\s*([\w]+)\s*\|");
        static readonly Regex MapLine = new Regex(@"(?im)^\s*map\s*:\s*([\w]+)");
        static readonly Regex HostLine = new Regex(@"(?im)^\s*hostname\s*:\s*(.+?)\s*$");
        static readonly Regex PlayerRow = new Regex(@"^\s*(\d+)\s+.*'(.*)'\s*$");

        public static ServerInfo ParseStatusText(string s)
        {
            if (string.IsNullOrEmpty(s)) return null;
            var info = new ServerInfo();
            var m = MapSpawn.Match(s); if (!m.Success) m = MapLine.Match(s);
            if (m.Success) info.Map = m.Groups[1].Value;
            var h = HostLine.Match(s); if (h.Success) info.Hostname = h.Groups[1].Value;
            foreach (var line in s.Split('\n'))
            {
                var r = PlayerRow.Match(line.TrimEnd('\r'));
                if (!r.Success || r.Groups[1].Value == "65535") continue;
                var name = r.Groups[2].Value;
                if (name == "SourceTV" || name == "GOTV") continue;
                if (Regex.IsMatch(line, @"\bBOT\b")) info.Bots++; else info.Humans++;
            }
            return info;
        }

        static string Str(Dictionary<string, object> d, params string[] keys)
        {
            foreach (var k in keys) if (d.TryGetValue(k, out var v) && v is string s && s.Length > 0) return s;
            return null;
        }
        static int? Int(Dictionary<string, object> d, params string[] keys)
        {
            foreach (var k in keys) if (d.TryGetValue(k, out var v) && v != null && int.TryParse(Convert.ToString(v), out var n)) return n;
            return null;
        }
        static bool Bool(Dictionary<string, object> d, params string[] keys)
        {
            foreach (var k in keys)
            {
                if (!d.TryGetValue(k, out var v) || v == null) continue;
                if (v is bool b) { if (b) return true; continue; }
                var s = Convert.ToString(v);
                if (s == "1" || string.Equals(s, "true", StringComparison.OrdinalIgnoreCase)) return true;
            }
            return false;
        }
        static IEnumerable<object> Arr(Dictionary<string, object> d, params string[] keys)
        {
            foreach (var k in keys)
                if (d.TryGetValue(k, out var v) && v is System.Collections.IEnumerable e && !(v is string) && !(v is Dictionary<string, object>))
                    return e.Cast<object>();
            return null;
        }
    }
}
