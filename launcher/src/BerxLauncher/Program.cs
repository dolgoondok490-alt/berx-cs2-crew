using System;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using BerxLauncher.Core;
using BerxLauncher.Platform;
using BerxLauncher.UI;

namespace BerxLauncher
{
    public sealed class CliOptions
    {
        public bool Minimized, Start, StopAfter, CreateShortcut;
        public string SettingsPath, Screenshot, ScreenshotSettings;
        public int WaitSec = 60;
        public bool IsAutomation => Screenshot != null || ScreenshotSettings != null || Start;

        public static CliOptions Parse(string[] args)
        {
            var o = new CliOptions();
            for (int i = 0; i < args.Length; i++)
            {
                string Next() => i + 1 < args.Length ? args[++i] : null;
                switch (args[i].ToLowerInvariant())
                {
                    case "--minimized": o.Minimized = true; break;
                    case "--settings": o.SettingsPath = Next(); break;
                    case "--screenshot": o.Screenshot = Next(); break;
                    case "--screenshot-settings": o.ScreenshotSettings = Next(); break;
                    case "--start": o.Start = true; break;
                    case "--stop-after": o.StopAfter = true; break;
                    case "--wait": int.TryParse(Next(), out o.WaitSec); break;
                    case "--create-shortcut": o.CreateShortcut = true; break;
                }
            }
            return o;
        }
    }

    static class Program
    {
        const string MutexName = @"Local\BERX_ARENA_Launcher";
        const string ShowEventName = @"Local\BERX_ARENA_Launcher_Show";

        [STAThread]
        static int Main(string[] args)
        {
            var cli = CliOptions.Parse(args);

            if (cli.CreateShortcut)
            {
                try { var p = DesktopShortcut.CreateDesktop(Application.ExecutablePath); MessageBox.Show("Desktop shortcut үүслээ:\n" + p, "BERX ARENA"); return 0; }
                catch (Exception e) { MessageBox.Show("Shortcut үүссэнгүй: " + e.Message, "BERX ARENA"); return 1; }
            }

            // Нэг л launcher ажиллана — дахин нээвэл байгаа цонхыг гаргаж ирнэ
            bool created;
            using (var mutex = new Mutex(true, MutexName, out created))
            {
                if (!created && !cli.IsAutomation)
                {
                    try { using (var ev = EventWaitHandle.OpenExisting(ShowEventName)) ev.Set(); } catch { /* ignore */ }
                    return 0;
                }

                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.ThreadException += (s, e) => ShowCrash(e.Exception);
                AppDomain.CurrentDomain.UnhandledException += (s, e) => ShowCrash(e.ExceptionObject as Exception);

                var settingsPath = cli.SettingsPath ?? LauncherSettings.DefaultPath;
                var settings = LauncherSettings.Load(settingsPath, out var warn);
                if (!File.Exists(settingsPath) && cli.SettingsPath == null)
                {
                    try { settings.Save(settingsPath); } catch { /* ignore */ }
                }

                var form = new MainForm(settings, settingsPath, cli, warn);
                using (var showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName))
                {
                    var t = new Thread(() =>
                    {
                        while (true)
                        {
                            try { showEvent.WaitOne(); } catch { return; }
                            try { if (form.IsHandleCreated) form.ShowWindow(); } catch { return; }
                        }
                    }) { IsBackground = true, Name = "show-signal" };
                    t.Start();
                    Application.Run(form);
                }
                GC.KeepAlive(mutex);
                return form.ExitCode;
            }
        }

        static void ShowCrash(Exception e)
        {
            try
            {
                var path = Path.Combine(LauncherSettings.AppDir, "logs", "crash.log");
                Directory.CreateDirectory(Path.GetDirectoryName(path));
                File.AppendAllText(path, DateTime.Now + "\r\n" + e + "\r\n\r\n");
                MessageBox.Show("Гэнэтийн алдаа гарлаа:\n" + e?.Message + "\n\nДэлгэрэнгүй: " + path, "BERX ARENA Launcher", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            catch { /* ignore */ }
        }
    }
}
