using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace BerxLauncher.Core
{
    /// <summary>agent\.env-ийг ЗӨВХӨН УНШИНА (berx-agent.js-тэй ижил дүрмээр). Хэзээ ч бичихгүй.</summary>
    public sealed class EnvFile
    {
        static readonly Regex Line = new Regex(@"^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$");
        static readonly Regex SecretKey = new Regex("SECRET|PASSWORD|TOKEN|KEY", RegexOptions.IgnoreCase);

        public bool Exists { get; private set; }
        public Dictionary<string, string> Values { get; } = new Dictionary<string, string>(StringComparer.Ordinal);

        public static EnvFile Parse(string text)
        {
            var env = new EnvFile { Exists = text != null };
            if (text == null) return env;
            foreach (var raw in text.Split('\n'))
            {
                var line = raw.TrimEnd('\r');
                if (line.TrimStart().StartsWith("#")) continue;
                var m = Line.Match(line);
                if (!m.Success) continue;
                var v = Regex.Replace(m.Groups[2].Value, "^[\"']|[\"']$", "");
                if (!env.Values.ContainsKey(m.Groups[1].Value)) env.Values[m.Groups[1].Value] = v;
            }
            return env;
        }

        public string Get(string key, string def = "")
            => Values.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v : def;

        public IEnumerable<string> SecretValues()
            => Values.Where(kv => SecretKey.IsMatch(kv.Key) && (kv.Value ?? "").Length >= 3).Select(kv => kv.Value);
    }

    public sealed class RconCreds
    {
        public string Host;
        public int Port;
        public string Password;
    }
}
