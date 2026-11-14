using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Management;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Principal;
using System.ServiceProcess;
using System.Text;
using BerxLauncher.Core;
using Microsoft.Win32;

namespace BerxLauncher.Platform
{
    public sealed class WindowsProcessHost : IProcessHost
    {
        const string Columns = "ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine, CreationDate";

        public IList<ProcInfo> List(string exeName)
        {
            var safe = (exeName ?? "").Replace("'", "").Replace("\\", "");
            return Query($"SELECT {Columns} FROM Win32_Process WHERE Name = '{safe}'");
        }

        public ProcInfo Get(int pid)
        {
            if (pid <= 0) return null;
            return Query($"SELECT {Columns} FROM Win32_Process WHERE ProcessId = {pid}").FirstOrDefault();
        }

        static List<ProcInfo> Query(string wql)
        {
            var res = new List<ProcInfo>();
            using (var searcher = new ManagementObjectSearcher(wql))
            using (var col = searcher.Get())
            {
                foreach (ManagementObject m in col)
                {
                    using (m)
                    {
                        var p = new ProcInfo
                        {
                            Pid = Convert.ToInt32(m["ProcessId"]),
                            ParentPid = Convert.ToInt32(m["ParentProcessId"]),
                            Name = m["Name"] as string,
                            Path = m["ExecutablePath"] as string,
                            CommandLine = m["CommandLine"] as string
                        };
                        try { if (m["CreationDate"] is string cd) p.StartTime = ManagementDateTimeConverter.ToDateTime(cd); } catch { /* ignore */ }
                        res.Add(p);
                    }
                }
            }
            return res;
        }

        public int StartServer(string exe, string args)
        {
            var psi = new ProcessStartInfo(exe, args ?? "")
            {
                UseShellExecute = true,
                WorkingDirectory = Path.GetDirectoryName(exe) ?? "",
                WindowStyle = ProcessWindowStyle.Minimized
            };
            using (var p = Process.Start(psi))
            {
                if (p == null) throw new InvalidOperationException("процесс үүссэнгүй");
                return p.Id;
            }
        }

        public int StartAgent(string nodeExe, string agentDir, string logFile)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(logFile));
            try
            {
                var fi = new FileInfo(logFile);
                if (fi.Exists && fi.Length > 5 * 1024 * 1024) { File.Copy(logFile, logFile + ".old", true); File.WriteAllText(logFile, ""); }
            }
            catch { /* ignore */ }
            // cmd /c ... >> log : launcher хаагдсан ч agent ажилласаар, гаралт файлд бичигдэнэ
            var inner = $"\"{nodeExe}\" berx-agent.js >> \"{logFile}\" 2>&1";
            var cmd = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe";
            var psi = new ProcessStartInfo(cmd, $"/d /s /c \"{inner}\"")
            {
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = agentDir
            };
            using (var p = Process.Start(psi))
            {
                if (p == null) throw new InvalidOperationException("процесс үүссэнгүй");
                return p.Id;
            }
        }

        public void Kill(int pid)
        {
            try { using (var p = Process.GetProcessById(pid)) { p.Kill(); p.WaitForExit(5000); } }
            catch (ArgumentException) { /* аль хэдийн гарсан */ }
            catch (InvalidOperationException) { /* аль хэдийн гарсан */ }
        }

        public ProcSample? Sample(int pid)
        {
            try
            {
                using (var p = Process.GetProcessById(pid))
                {
                    p.Refresh();
                    return new ProcSample { Cpu = p.TotalProcessorTime, Ram = p.WorkingSet64 };
                }
            }
            catch { return null; }
        }

        public bool FileExists(string path) { try { return File.Exists(path); } catch { return false; } }
        public bool DirExists(string path) { try { return Directory.Exists(path); } catch { return false; } }

        public string ReadText(string path)
        {
            try
            {
                if (!File.Exists(path)) return null;
                using (var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
                {
                    if (fs.Length > 2 * 1024 * 1024) fs.Position = fs.Length - 64 * 1024;
                    using (var r = new StreamReader(fs, new UTF8Encoding(false), true)) return r.ReadToEnd();
                }
            }
            catch { return null; }
        }

        public void WriteFile(string path, string text) => File.WriteAllText(path, text ?? "");
        public void DeleteFile(string path) { try { if (File.Exists(path)) File.Delete(path); } catch { /* ignore */ } }

        public string ResolveNode(string configured)
        {
            if (!string.IsNullOrWhiteSpace(configured)) return File.Exists(configured) ? configured : null;
            var paths = (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';').Where(p => p.Trim().Length > 0);
            foreach (var dir in paths)
            {
                try { var c = Path.Combine(dir.Trim().Trim('"'), "node.exe"); if (File.Exists(c)) return c; } catch { /* ignore */ }
            }
            foreach (var root in new[] { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
                                         Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs") })
            {
                if (string.IsNullOrEmpty(root)) continue;
                var c = Path.Combine(root, "nodejs", "node.exe");
                if (File.Exists(c)) return c;
            }
            return null;
        }
    }

    /// <summary>WireGuard for Windows: tunnel бүр "WireGuardTunnel$NAME" service. Зөвхөн нэрээр заасан tunnel-ийг удирдана.</summary>
    public sealed class WindowsWireGuard : IWireGuard
    {
        static string Svc(string t) => "WireGuardTunnel$" + t;

        public bool IsActive(string tunnel)
        {
            try { using (var sc = new ServiceController(Svc(tunnel))) return sc.Status == ServiceControllerStatus.Running; }
            catch (InvalidOperationException) { return false; }
        }

        static bool ServiceExists(string tunnel)
        {
            try { using (var sc = new ServiceController(Svc(tunnel))) { var _ = sc.Status; return true; } }
            catch { return false; }
        }

        public OpOutcome Activate(LauncherSettings s)
        {
            if (ServiceExists(s.TunnelName))
                return RunElevated(Path.Combine(Environment.SystemDirectory, "sc.exe"), $"start \"{Svc(s.TunnelName)}\"");
            if (!File.Exists(s.WireGuardExe))
                return OpOutcome.Fail($"WireGuard програм олдсонгүй: {s.WireGuardExe}");
            return RunElevated(s.WireGuardExe, $"/installtunnelservice \"{s.ResolveTunnelConfig()}\"",
                $"Tunnel тохиргоо: {s.ResolveTunnelConfig()} (Тохиргоо → «WireGuard config» замыг шалгана уу)");
        }

        public OpOutcome Deactivate(LauncherSettings s)
        {
            if (!ServiceExists(s.TunnelName)) return OpOutcome.Success();
            if (File.Exists(s.WireGuardExe))
                return RunElevated(s.WireGuardExe, $"/uninstalltunnelservice \"{s.TunnelName}\"");
            return RunElevated(Path.Combine(Environment.SystemDirectory, "sc.exe"), $"stop \"{Svc(s.TunnelName)}\"");
        }

        public string Describe(string tunnel)
        {
            try
            {
                var nic = NetworkInterface.GetAllNetworkInterfaces().FirstOrDefault(n => string.Equals(n.Name, tunnel, StringComparison.OrdinalIgnoreCase));
                if (nic == null) return tunnel;
                var ip = nic.GetIPProperties().UnicastAddresses.FirstOrDefault(a => a.Address.AddressFamily == AddressFamily.InterNetwork);
                return ip != null ? $"{tunnel} · {ip.Address}" : tunnel;
            }
            catch { return tunnel; }
        }

        public static bool IsElevated()
        {
            try { using (var id = WindowsIdentity.GetCurrent()) return new WindowsPrincipal(id).IsInRole(WindowsBuiltInRole.Administrator); }
            catch { return false; }
        }

        static OpOutcome RunElevated(string exe, string args, string hint = null)
        {
            var psi = new ProcessStartInfo(exe, args) { UseShellExecute = true, WindowStyle = ProcessWindowStyle.Hidden };
            if (!IsElevated()) psi.Verb = "runas";
            try
            {
                using (var p = Process.Start(psi))
                {
                    if (p == null) return OpOutcome.Fail("процесс үүссэнгүй");
                    if (!p.WaitForExit(45000)) return OpOutcome.Fail($"{Path.GetFileName(exe)} хариу өгсөнгүй (timeout)");
                    return p.ExitCode == 0 ? OpOutcome.Success()
                        : OpOutcome.Fail($"{Path.GetFileName(exe)} алдааны код {p.ExitCode}." + (hint != null ? " " + hint : ""));
                }
            }
            catch (Win32Exception e) when (e.NativeErrorCode == 1223)
            {
                return OpOutcome.Fail("Windows Administrator зөвшөөрлийг цуцалсан.");
            }
            catch (Exception e) { return OpOutcome.Fail(e.Message); }
        }
    }

    public sealed class WindowsNetProbe : INetProbe
    {
        public long? Ping(string host, int timeoutMs)
        {
            if (string.IsNullOrWhiteSpace(host)) return null;
            try
            {
                using (var p = new Ping())
                {
                    var r = p.Send(host, timeoutMs);
                    return r != null && r.Status == IPStatus.Success ? r.RoundtripTime : (long?)null;
                }
            }
            catch { return null; }
        }

        public bool IsUdpPortInUse(int port)
        {
            try { return IPGlobalProperties.GetIPGlobalProperties().GetActiveUdpListeners().Any(e => e.Port == port); }
            catch { return false; }
        }
    }

    public static class Autostart
    {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string Name = "BERX ARENA Launcher";

        public static void Apply(bool enabled, string exePath)
        {
            using (var k = Registry.CurrentUser.CreateSubKey(RunKey))
            {
                if (k == null) return;
                if (enabled) k.SetValue(Name, $"\"{exePath}\" --minimized");
                else if (k.GetValue(Name) != null) k.DeleteValue(Name, false);
            }
        }

        public static bool IsEnabled()
        {
            using (var k = Registry.CurrentUser.OpenSubKey(RunKey)) return k?.GetValue(Name) != null;
        }
    }

    public static class DesktopShortcut
    {
        /// <summary>Desktop дээр .lnk үүсгэнэ (WScript.Shell COM — нэмэлт сан хэрэггүй).</summary>
        public static string CreateDesktop(string exePath)
        {
            var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            var lnkPath = Path.Combine(desktop, "BERX ARENA Launcher.lnk");
            var t = Type.GetTypeFromProgID("WScript.Shell") ?? throw new InvalidOperationException("WScript.Shell олдсонгүй");
            object shell = Activator.CreateInstance(t);
            object lnk = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnkPath });
            var lt = lnk.GetType();
            lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, lnk, new object[] { exePath });
            lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, lnk, new object[] { Path.GetDirectoryName(exePath) });
            lt.InvokeMember("IconLocation", BindingFlags.SetProperty, null, lnk, new object[] { exePath + ",0" });
            lt.InvokeMember("Description", BindingFlags.SetProperty, null, lnk, new object[] { "BERX ARENA — CS2 server launcher" });
            lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, lnk, null);
            return lnkPath;
        }
    }
}
