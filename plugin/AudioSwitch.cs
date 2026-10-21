using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Globalization;

namespace AudioSwitch
{
    // Preserve native HRESULTs: every call below is checked before its outputs are used.
    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice {
        [PreserveSig] int Activate([MarshalAs(UnmanagedType.LPStruct)] Guid iid, int context, IntPtr parameters, [MarshalAs(UnmanagedType.IUnknown)] out object result);
        [PreserveSig] int OpenPropertyStore(int access, out IPropertyStore properties);
        [PreserveSig] int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetState(out int state);
    }
    [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceCollection {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int Item(int index, out IMMDevice device);
    }
    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator {
        [PreserveSig] int EnumAudioEndpoints(int flow, int mask, out IMMDeviceCollection devices);
        [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice device);
        [PreserveSig] int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        [PreserveSig] int RegisterEndpointNotificationCallback(IntPtr client);
        [PreserveSig] int UnregisterEndpointNotificationCallback(IntPtr client);
    }
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumerator { }
    [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetAt(int index, out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
        [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
        [PreserveSig] int Commit();
    }
    [StructLayout(LayoutKind.Sequential)]
    struct PropertyKey {
        public Guid fmtid; public int pid;
        public PropertyKey(Guid fmtid, int pid) { this.fmtid = fmtid; this.pid = pid; }
    }
    [StructLayout(LayoutKind.Sequential)]
    struct PropVariant {
        public ushort vt, reserved1, reserved2, reserved3;
        public IntPtr pointer; public int extra;
        public string GetString() { return vt == 31 ? Marshal.PtrToStringUni(pointer) : null; }
    }
    // Undocumented Windows interface; keep its complete vtable order.
    [ComImport, Guid("F8679F50-850A-41CF-9C72-430F290290C8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPolicyConfig {
        [PreserveSig] int GetMixFormat(string name, IntPtr format);
        [PreserveSig] int GetDeviceFormat(string name, int isDefault, IntPtr format);
        [PreserveSig] int ResetDeviceFormat(string name);
        [PreserveSig] int SetDeviceFormat(string name, IntPtr endpoint, IntPtr mix);
        [PreserveSig] int GetProcessingPeriod(string name, int isDefault, IntPtr period, IntPtr minimum);
        [PreserveSig] int SetProcessingPeriod(string name, IntPtr period);
        [PreserveSig] int GetShareMode(string name, IntPtr mode);
        [PreserveSig] int SetShareMode(string name, IntPtr mode);
        [PreserveSig] int GetPropertyValue(string name, int fx, IntPtr key, IntPtr value);
        [PreserveSig] int SetPropertyValue(string name, int fx, IntPtr key, IntPtr value);
        [PreserveSig] int SetDefaultEndpoint([MarshalAs(UnmanagedType.LPWStr)] string name, int role);
        [PreserveSig] int SetEndpointVisibility(string name, int visible);
    }
    [ComImport, Guid("870AF99C-171D-4F9E-AF0D-E63DF40C2BC9")]
    class PolicyConfigClient { }
    [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionManager2 {
        [PreserveSig] int GetAudioSessionControl(IntPtr guid, uint flags, out IAudioSessionControl control);
        [PreserveSig] int GetSimpleAudioVolume(IntPtr guid, uint flags, out ISimpleAudioVolume volume);
        [PreserveSig] int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
        [PreserveSig] int RegisterSessionNotification(IntPtr client);
        [PreserveSig] int UnregisterSessionNotification(IntPtr client);
        [PreserveSig] int RegisterDuckNotification(string id, IntPtr client);
        [PreserveSig] int UnregisterDuckNotification(IntPtr client);
    }
    [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionEnumerator {
        [PreserveSig] int GetCount(out int count);
        [PreserveSig] int GetSession(int index, out IAudioSessionControl session);
    }
    [ComImport, Guid("F4B1A599-7266-4319-A8CA-E70ACB11E8CD"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPStruct)] Guid context);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPStruct)] Guid context);
        [PreserveSig] int GetGroupingParam(out Guid grouping);
        [PreserveSig] int SetGroupingParam([MarshalAs(UnmanagedType.LPStruct)] Guid grouping, [MarshalAs(UnmanagedType.LPStruct)] Guid context);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
    }
    [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioSessionControl2 {
        [PreserveSig] int GetState(out int state);
        [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPStruct)] Guid context);
        [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string name);
        [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPStruct)] Guid context);
        [PreserveSig] int GetGroupingParam(out Guid grouping);
        [PreserveSig] int SetGroupingParam([MarshalAs(UnmanagedType.LPStruct)] Guid grouping, [MarshalAs(UnmanagedType.LPStruct)] Guid context);
        [PreserveSig] int RegisterAudioSessionNotification(IntPtr client);
        [PreserveSig] int UnregisterAudioSessionNotification(IntPtr client);
        [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string id);
        [PreserveSig] int GetProcessId(out int pid);
        [PreserveSig] int IsSystemSoundsSession();
        [PreserveSig] int SetDuckingPreference([MarshalAs(UnmanagedType.Bool)] bool optOut);
    }
    [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface ISimpleAudioVolume {
        [PreserveSig] int SetMasterVolume(float level, [MarshalAs(UnmanagedType.LPStruct)] Guid context);
        [PreserveSig] int GetMasterVolume(out float level);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, [MarshalAs(UnmanagedType.LPStruct)] Guid context);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
    }
    [ComImport, Guid("1BE09788-6894-4089-8586-9A2A6C265AC5"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMEndpoint { [PreserveSig] int GetDataFlow(out int flow); }
    [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IAudioEndpointVolume {
        [PreserveSig] int RegisterControlChangeNotify(IntPtr client);
        [PreserveSig] int UnregisterControlChangeNotify(IntPtr client);
        [PreserveSig] int GetChannelCount(out uint count);
        [PreserveSig] int SetMasterVolumeLevel(float level, ref Guid context);
        [PreserveSig] int SetMasterVolumeLevelScalar(float level, ref Guid context);
        [PreserveSig] int GetMasterVolumeLevel(out float level);
        [PreserveSig] int GetMasterVolumeLevelScalar(out float level);
        [PreserveSig] int SetChannelVolumeLevel(uint channel, float level, ref Guid context);
        [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float level, ref Guid context);
        [PreserveSig] int GetChannelVolumeLevel(uint channel, out float level);
        [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float level);
        [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool muted, ref Guid context);
        [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool muted);
        [PreserveSig] int GetVolumeStepInfo(out uint step, out uint count);
        [PreserveSig] int VolumeStepUp(ref Guid context);
        [PreserveSig] int VolumeStepDown(ref Guid context);
        [PreserveSig] int QueryHardwareSupport(out uint mask);
        [PreserveSig] int GetVolumeRange(out float min, out float max, out float increment);
    }
    class Program {
        const string Version = "1.4.0";
        static PropertyKey FriendlyName = new PropertyKey(new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), 14);
        static readonly Guid VolumeGuid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
        static readonly Guid SessionGuid = new Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F");
        [DllImport("ole32.dll")] static extern int PropVariantClear(ref PropVariant variant);
        [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
        [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
        [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
        static void Hr(int result) { Marshal.ThrowExceptionForHR(result); }
        static void Release(object value) { if (value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value); }
        static string Q(string value) {
            var b = new StringBuilder("\"");
            foreach (char c in value ?? "") {
                if (c == '\\') b.Append("\\\\");
                else if (c == '"') b.Append("\\\"");
                else if (c < 32) b.Append("\\u" + ((int)c).ToString("x4", CultureInfo.InvariantCulture));
                else b.Append(c);
            }
            return b.Append('"').ToString();
        }
        static string Bool(bool value) { return value ? "true" : "false"; }
        static int Flow(string value) {
            if (value == "input") return 1;
            if (value == "output") return 0;
            throw new ArgumentException("Device type must be input or output.");
        }
        static float Number(string value, float min, float max) {
            float n;
            if (!float.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out n) || float.IsNaN(n) || float.IsInfinity(n) || n < min || n > max)
                throw new ArgumentException("Numeric argument is outside the permitted range.");
            return n;
        }
        static string Id(IMMDevice device) { string id; Hr(device.GetId(out id)); return id; }
        static string DefaultId(IMMDeviceEnumerator e, int flow, int role) {
            IMMDevice d = null;
            try { int hr = e.GetDefaultAudioEndpoint(flow, role, out d); return hr < 0 || d == null ? "" : Id(d); }
            finally { Release(d); }
        }
        static string Name(IMMDevice device) {
            IPropertyStore props = null; PropVariant value = new PropVariant();
            try { Hr(device.OpenPropertyStore(0, out props)); Hr(props.GetValue(ref FriendlyName, out value)); return value.GetString() ?? "Audio device"; }
            finally { PropVariantClear(ref value); Release(props); }
        }
        static IMMDevice Device(IMMDeviceEnumerator e, int flow, string id) {
            IMMDevice d = null;
            try {
                if (String.IsNullOrEmpty(id)) Hr(e.GetDefaultAudioEndpoint(flow, 0, out d));
                else Hr(e.GetDevice(id, out d));
                int actualFlow, state;
                Hr(((IMMEndpoint)d).GetDataFlow(out actualFlow)); Hr(d.GetState(out state));
                if (actualFlow != flow || (state & 1) == 0) throw new InvalidOperationException("Audio device is unavailable or has the wrong direction.");
                return d;
            } catch { Release(d); throw; }
        }
        static IAudioEndpointVolume Volume(IMMDevice device) {
            object result; Hr(device.Activate(VolumeGuid, 23, IntPtr.Zero, out result));
            return (IAudioEndpointVolume)result;
        }
        static string Status(IMMDevice device, IAudioEndpointVolume volume) {
            float level; bool muted;
            Hr(volume.GetMasterVolumeLevelScalar(out level)); Hr(volume.GetMute(out muted));
            return "{\"id\":" + Q(Id(device)) + ",\"name\":" + Q(Name(device)) + ",\"volume\":" + (level * 100).ToString("0.###", CultureInfo.InvariantCulture) + ",\"muted\":" + Bool(muted) + "}";
        }
        static string ReadStatus(int flow, string id, int role) {
            IMMDeviceEnumerator e = null; IMMDevice d = null; IAudioEndpointVolume v = null;
            try {
                e = (IMMDeviceEnumerator)new MMDeviceEnumerator();
                if (String.IsNullOrEmpty(id) && role != 0) { id = DefaultId(e, flow, role); if (id.Length == 0) throw new InvalidOperationException("No default device."); }
                d = Device(e, flow, id); v = Volume(d); return Status(d, v);
            } finally { Release(v); Release(d); Release(e); }
        }
        static string MaybeStatus(int flow, int role) { try { return ReadStatus(flow, null, role); } catch { return "null"; } }
        static string ListDevices(int flow) {
            IMMDeviceEnumerator e = null; IMMDeviceCollection collection = null;
            try {
                e = (IMMDeviceEnumerator)new MMDeviceEnumerator();
                Hr(e.EnumAudioEndpoints(flow, 1, out collection)); int count; Hr(collection.GetCount(out count));
                string normal = DefaultId(e, flow, 0), media = DefaultId(e, flow, 1), comm = DefaultId(e, flow, 2);
                var items = new List<string>();
                for (int i = 0; i < count; i++) {
                    IMMDevice d = null;
                    try {
                        Hr(collection.Item(i, out d)); string id = Id(d);
                        items.Add("{\"id\":" + Q(id) + ",\"name\":" + Q(Name(d)) + ",\"default\":" + Bool(id == normal) + ",\"defaultMultimedia\":" + Bool(id == media) + ",\"defaultComm\":" + Bool(id == comm) + "}");
                    } finally { Release(d); }
                }
                return "[" + String.Join(",", items) + "]";
            } finally { Release(collection); Release(e); }
        }
        static string SetDevice(string id, int flow, string roles) {
            int[] selected;
            if (roles == "all") selected = new int[] { 0, 1, 2 };
            else if (roles == "media") selected = new int[] { 0, 1 };
            else if (roles == "communications") selected = new int[] { 2 };
            else throw new ArgumentException("Unknown device role selection.");
            IMMDeviceEnumerator e = null; IMMDevice d = null; IPolicyConfig policy = null;
            var old = new Dictionary<int, string>(); var changed = new List<int>();
            try {
                e = (IMMDeviceEnumerator)new MMDeviceEnumerator(); d = Device(e, flow, id); id = Id(d);
                foreach (int role in selected) old[role] = DefaultId(e, flow, role);
                policy = (IPolicyConfig)new PolicyConfigClient();
                try {
                    foreach (int role in selected) { Hr(policy.SetDefaultEndpoint(id, role)); changed.Add(role); }
                    foreach (int role in selected) if (DefaultId(e, flow, role) != id) throw new InvalidOperationException("Windows did not confirm the requested default device.");
                } catch {
                    foreach (int role in changed) if (old[role].Length > 0) { try { Hr(policy.SetDefaultEndpoint(old[role], role)); } catch { } }
                    throw;
                }
                return "{\"success\":true,\"id\":" + Q(id) + "}";
            } finally { Release(policy); Release(d); Release(e); }
        }
        static string ChangeEndpoint(int flow, string id, string mode, string value, bool mute) {
            IMMDeviceEnumerator e = null; IMMDevice d = null; IAudioEndpointVolume v = null;
            try {
                e = (IMMDeviceEnumerator)new MMDeviceEnumerator(); d = Device(e, flow, id); v = Volume(d); Guid context = Guid.Empty;
                if (mute) {
                    bool state; Hr(v.GetMute(out state));
                    if (value == "toggle") state = !state;
                    else if (value == "1") state = true;
                    else if (value == "0") state = false;
                    else throw new ArgumentException("Mute value must be 0, 1 or toggle.");
                    Hr(v.SetMute(state, ref context));
                } else {
                    float amount = Number(value, mode == "change" ? -100 : 0, 100) / 100f;
                    if (mode == "change") { float current; Hr(v.GetMasterVolumeLevelScalar(out current)); amount += current; }
                    else if (mode != "set") throw new ArgumentException("Volume operation must be set or change.");
                    Hr(v.SetMasterVolumeLevelScalar(Math.Max(0f, Math.Min(1f, amount)), ref context));
                }
                return "{\"success\":true,\"status\":" + Status(d, v) + "}";
            } finally { Release(v); Release(d); Release(e); }
        }
        static string CleanProcess(string value) {
            value = value.Trim();
            if (value.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) value = value.Substring(0, value.Length - 4);
            if (value.Length == 0 || value.IndexOfAny(new char[] { '\\', '/', '\r', '\n', '\0' }) >= 0) throw new ArgumentException("Enter a process name, not a file path.");
            return value;
        }
        static string AppVolume(string name, float change) {
            bool focused = name == "focused"; uint focusedId = 0;
            if (focused) GetWindowThreadProcessId(GetForegroundWindow(), out focusedId);
            else name = CleanProcess(name);
            IMMDeviceEnumerator e = null; IMMDeviceCollection devices = null; int changed = 0;
            try {
                e = (IMMDeviceEnumerator)new MMDeviceEnumerator(); Hr(e.EnumAudioEndpoints(0, 1, out devices));
                int deviceCount; Hr(devices.GetCount(out deviceCount));
                for (int di = 0; di < deviceCount; di++) {
                    IMMDevice d = null; object managerObject = null; IAudioSessionEnumerator sessions = null;
                    try {
                        Hr(devices.Item(di, out d)); Hr(d.Activate(SessionGuid, 23, IntPtr.Zero, out managerObject));
                        Hr(((IAudioSessionManager2)managerObject).GetSessionEnumerator(out sessions)); int count; Hr(sessions.GetCount(out count));
                        for (int i = 0; i < count; i++) {
                            IAudioSessionControl control = null;
                            try {
                                Hr(sessions.GetSession(i, out control)); int pid;
                                Hr(((IAudioSessionControl2)control).GetProcessId(out pid)); if (pid <= 0) continue;
                                bool match = focused && pid == focusedId;
                                if (!focused) {
                                    try { using (Process p = Process.GetProcessById(pid)) match = String.Equals(p.ProcessName, name, StringComparison.OrdinalIgnoreCase); }
                                    catch (ArgumentException) { continue; }
                                }
                                if (!match) continue;
                                var volume = (ISimpleAudioVolume)control; float old; Hr(volume.GetMasterVolume(out old));
                                Hr(volume.SetMasterVolume(Math.Max(0f, Math.Min(1f, old + change)), Guid.Empty)); changed++;
                            } finally { Release(control); }
                        }
                    } finally { Release(sessions); Release(managerObject); Release(d); }
                }
            } finally { Release(devices); Release(e); }
            if (changed == 0) throw new InvalidOperationException("No active audio sessions found for the requested application.");
            return "{\"success\":true,\"sessions\":" + changed + "}";
        }
        static bool Running(string name) {
            Process[] processes = Process.GetProcessesByName(CleanProcess(name));
            bool found = processes.Length > 0; foreach (Process p in processes) p.Dispose(); return found;
        }
        static string Launch(string path) {
            if (String.IsNullOrWhiteSpace(path) || path.IndexOfAny(new char[] { '\r', '\n', '\0' }) >= 0) throw new ArgumentException("Invalid application path.");
            // ShellExecute receives one file/URI, not a cmd.exe command string.
            var info = new ProcessStartInfo { FileName = path, UseShellExecute = true };
            using (Process p = Process.Start(info)) { }
            return "{\"success\":true}";
        }
        static string Media(string action) {
            byte key;
            switch (action) { case "playpause": key = 0xB3; break; case "next": key = 0xB0; break; case "previous": key = 0xB1; break; default: throw new ArgumentException("Unknown media key."); }
            keybd_event(key, 0, 0, UIntPtr.Zero); keybd_event(key, 0, 2, UIntPtr.Zero);
            return "{\"success\":true}";
        }
        static string SelfTest() {
            if (Q("a\"\\\n\t") != "\"a\\\"\\\\\\u000a\\u0009\"") throw new Exception("JSON escaping failed");
            if (Flow("input") != 1 || Flow("output") != 0) throw new Exception("Direction mapping failed");
            if (Number("0.25", 0, 1) != .25f) throw new Exception("Invariant numeric parsing failed");
            if (CleanProcess("TEST.ExE") != "TEST") throw new Exception("Process normalization failed");
            int expected = IntPtr.Size == 8 ? 24 : 16;
            if (Marshal.SizeOf(typeof(PropVariant)) != expected) throw new Exception("PROPVARIANT size failed");
            bool rejected = false; try { Number("NaN", 0, 1); } catch (ArgumentException) { rejected = true; }
            if (!rejected) throw new Exception("NaN validation failed");
            return "{\"success\":true,\"version\":" + Q(Version) + ",\"tests\":6}";
        }
        [STAThread]
        static int Main(string[] args) {
            Console.OutputEncoding = new UTF8Encoding(false);
            try {
                string result;
                if (args.Length == 1 && args[0] == "selftest") result = SelfTest();
                else if (args.Length == 1 && args[0] == "version") result = "{\"success\":true,\"version\":" + Q(Version) + "}";
                else if (args.Length == 1 && args[0] == "snapshot") result = "{\"success\":true,\"output\":" + MaybeStatus(0, 0) + ",\"input\":" + MaybeStatus(1, 0) + ",\"outputComm\":" + MaybeStatus(0, 2) + ",\"inputComm\":" + MaybeStatus(1, 2) + "}";
                else if (args.Length == 2 && args[0] == "list") result = ListDevices(Flow(args[1]));
                else if ((args.Length == 2 || args.Length == 3) && args[0] == "status") result = ReadStatus(Flow(args[1]), args.Length == 3 ? args[2] : null, 0);
                else if ((args.Length == 3 || args.Length == 4) && args[0] == "set") result = SetDevice(args[1], Flow(args[2]), args.Length == 4 ? args[3] : "all");
                else if ((args.Length == 3 || args.Length == 4) && args[0] == "mute") result = ChangeEndpoint(Flow(args[1]), args.Length == 4 ? args[3] : null, "", args[2], true);
                else if ((args.Length == 4 || args.Length == 5) && args[0] == "volume") result = ChangeEndpoint(Flow(args[1]), args.Length == 5 ? args[4] : null, args[2], args[3], false);
                else if (args.Length == 3 && args[0] == "appvolume") result = AppVolume(args[1], Number(args[2], -1, 1));
                else if (args.Length == 2 && args[0] == "running") result = "{\"success\":true,\"running\":" + Bool(Running(args[1])) + "}";
                else if (args.Length == 2 && args[0] == "launch") result = Launch(args[1]);
                else if (args.Length == 1 && args[0] == "soundsettings") result = Launch("ms-settings:sound");
                else if (args.Length == 2 && args[0] == "media") result = Media(args[1]);
                else throw new ArgumentException("Unknown command or wrong number of arguments.");
                Console.WriteLine(result); return 0;
            } catch (Exception ex) {
                Console.WriteLine("{\"success\":false,\"error\":" + Q(ex.Message) + ",\"code\":" + Q("0x" + ex.HResult.ToString("X8")) + "}"); return 1;
            }
        }
    }
}
