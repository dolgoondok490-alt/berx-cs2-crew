using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace BerxLauncher.Core
{
    /// <summary>Log-д нууц мэдээлэл гаргахгүй: .env-ийн нууц утгууд, WireGuard түлхүүр, rcon/sv нууц үг.</summary>
    public sealed class Redactor
    {
        const string Mask = "••••";
        readonly object gate = new object();
        string[] secrets = new string[0];

        static readonly Regex[] Patterns =
        {
            new Regex(@"(?i)\b(PrivateKey|PresharedKey)(\s*=\s*)\S+"),
            new Regex(@"(?i)\b(rcon_password|sv_password)(\s+)(""[^""]*""|\S+)"),
            new Regex(@"\b(SERVER_AGENT_SECRET|RCON_PASSWORD|SUPABASE_SECRET_KEY|SERVER_PASSWORD)(\s*=\s*)\S+"),
            new Regex(@"(?i)(Authorization:\s*Bearer)(\s+)\S+"),
            new Regex(@"(?i)(;\s*password)(\s+)\S+"), // "connect ip; password xxx"
        };
        static readonly Regex WgKey = new Regex(@"(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{42,43}=(?![A-Za-z0-9+/=])");

        public void SetSecrets(IEnumerable<string> values)
        {
            var arr = (values ?? Enumerable.Empty<string>()).Where(v => !string.IsNullOrEmpty(v) && v.Length >= 3)
                .Distinct().OrderByDescending(v => v.Length).ToArray();
            lock (gate) secrets = arr;
        }

        public string Apply(string text)
        {
            if (string.IsNullOrEmpty(text)) return text ?? "";
            string[] s; lock (gate) s = secrets;
            foreach (var v in s) text = text.Replace(v, Mask);
            foreach (var p in Patterns) text = p.Replace(text, m => m.Groups[1].Value + m.Groups[2].Value + Mask);
            text = WgKey.Replace(text, Mask);
            return text;
        }
    }

    public enum LogLevel { Info, Ok, Warn, Error }

    public sealed class LogLine
    {
        public DateTime Time;
        public LogLevel Level;
        public string Source;   // "launcher" | "agent"
        public string Text;
    }

    public sealed class LogHub
    {
        public Redactor Redactor { get; } = new Redactor();
        public event Action<LogLine> Line;
        readonly object fileGate = new object();
        readonly string file;
        readonly LinkedList<LogLine> recent = new LinkedList<LogLine>();

        public LogHub(string filePath)
        {
            file = filePath;
            if (file == null) return;
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(file));
                var fi = new FileInfo(file);
                if (fi.Exists && fi.Length > 4 * 1024 * 1024) { File.Copy(file, file + ".old", true); File.WriteAllText(file, ""); }
            }
            catch { /* log файлгүй ч ажиллана */ }
        }

        public void Write(LogLevel level, string source, string text)
        {
            var line = new LogLine { Time = DateTime.Now, Level = level, Source = source, Text = Redactor.Apply(text ?? "") };
            lock (recent) { recent.AddLast(line); while (recent.Count > 600) recent.RemoveFirst(); }
            if (file != null && source == "launcher")
            {
                lock (fileGate)
                {
                    try { File.AppendAllText(file, $"{line.Time:yyyy-MM-dd HH:mm:ss} {level,-5} {line.Text}\r\n", Encoding.UTF8); }
                    catch { /* ignore */ }
                }
            }
            Line?.Invoke(line);
        }

        public IList<LogLine> Snapshot() { lock (recent) return recent.ToList(); }

        public void Info(string t) => Write(LogLevel.Info, "launcher", t);
        public void Ok(string t) => Write(LogLevel.Ok, "launcher", t);
        public void Warn(string t) => Write(LogLevel.Warn, "launcher", t);
        public void Error(string t) => Write(LogLevel.Error, "launcher", t);
    }

    public sealed class AgentHealth
    {
        public bool Error;
        public string Message;
    }

    /// <summary>Agent-ийн log файлыг (launcher асаасан бол) дагаж уншина. UTF-8, хэсэгчилсэн мөрийг хүлээнэ.</summary>
    public sealed class AgentLogTail
    {
        static readonly Regex TimePrefix = new Regex(@"^\d\d:\d\d:\d\d\s+");
        readonly string path;
        readonly LogHub log;
        long pos = -1;
        byte[] pending = new byte[0];
        DateTime lastErrAt = DateTime.MinValue, lastOkAt = DateTime.MinValue;
        string lastError;

        public AgentLogTail(string path, LogHub log, int backlogBytes = 6000)
        {
            this.path = path; this.log = log;
            try
            {
                var fi = new FileInfo(path);
                if (fi.Exists) pos = Math.Max(0, fi.Length - backlogBytes);
                else pos = 0;
                skipPartialFirst = pos > 0;
            }
            catch { pos = 0; }
        }
        bool skipPartialFirst;

        public void Reset() { lastError = null; lastErrAt = lastOkAt = DateTime.MinValue; }

        public AgentHealth Health
        {
            get
            {
                var e = lastError;
                return e != null && lastErrAt > lastOkAt ? new AgentHealth { Error = true, Message = e } : null;
            }
        }

        public void Pump()
        {
            try
            {
                if (!File.Exists(path)) return;
                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    if (fs.Length < pos) { pos = 0; pending = new byte[0]; } // log шинээр эхэлсэн
                    if (fs.Length == pos) return;
                    fs.Position = pos;
                    var buf = new byte[Math.Min(fs.Length - pos, 256 * 1024)];
                    int n = fs.Read(buf, 0, buf.Length);
                    pos += n;
                    var all = new byte[pending.Length + n];
                    Buffer.BlockCopy(pending, 0, all, 0, pending.Length);
                    Buffer.BlockCopy(buf, 0, all, pending.Length, n);
                    int start = 0;
                    for (int i = 0; i < all.Length; i++)
                    {
                        if (all[i] != (byte)'\n') continue;
                        var line = Encoding.UTF8.GetString(all, start, i - start).TrimEnd('\r');
                        start = i + 1;
                        if (skipPartialFirst) { skipPartialFirst = false; continue; }
                        Handle(line);
                    }
                    pending = new byte[all.Length - start];
                    Buffer.BlockCopy(all, start, pending, 0, pending.Length);
                }
            }
            catch { /* дараагийн удаа */ }
        }

        void Handle(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return;
            var text = TimePrefix.Replace(raw, "");
            if (text.StartsWith("[debug]")) return;
            if (text.Contains("BERX Agent v")) Reset();
            var level = LogLevel.Info;
            if (text.Contains("✖")) { level = LogLevel.Error; lastError = log.Redactor.Apply(text.Replace("✖", "").Trim()); lastErrAt = DateTime.UtcNow; }
            else if (text.Contains("⚠")) level = LogLevel.Warn;
            else if (text.Contains("✓")) { level = LogLevel.Ok; lastOkAt = DateTime.UtcNow; }
            log.Write(level, "agent", text);
        }
    }
}
