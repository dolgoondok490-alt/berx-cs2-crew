using System;
using System.Collections.Generic;

namespace BerxLauncher.Core
{
    public sealed class ProcInfo
    {
        public int Pid;
        public int ParentPid;
        public string Name;
        public string Path;          // уншиж чадаагүй бол null
        public string CommandLine;   // уншиж чадаагүй бол null
        public DateTime? StartTime;
    }

    public struct ProcSample
    {
        public TimeSpan Cpu;
        public long Ram;
    }

    /// <summary>Процесс/файлын үйлдлүүд. Тестэд хуурамч хувилбараар солигдоно.</summary>
    public interface IProcessHost
    {
        IList<ProcInfo> List(string exeName);
        ProcInfo Get(int pid);
        int StartServer(string exe, string args);
        int StartAgent(string nodeExe, string agentDir, string logFile);
        void Kill(int pid);
        ProcSample? Sample(int pid);
        bool FileExists(string path);
        bool DirExists(string path);
        string ReadText(string path);
        void WriteFile(string path, string text);
        void DeleteFile(string path);
        string ResolveNode(string configured);
    }

    public sealed class OpOutcome
    {
        public bool Ok;
        public string Error;
        public static OpOutcome Success() => new OpOutcome { Ok = true };
        public static OpOutcome Fail(string e) => new OpOutcome { Ok = false, Error = e };
    }

    public interface IWireGuard
    {
        bool IsActive(string tunnel);
        OpOutcome Activate(LauncherSettings s);
        OpOutcome Deactivate(LauncherSettings s);
        string Describe(string tunnel);
    }

    public interface INetProbe
    {
        long? Ping(string host, int timeoutMs);
        bool IsUdpPortInUse(int port);
    }
}
