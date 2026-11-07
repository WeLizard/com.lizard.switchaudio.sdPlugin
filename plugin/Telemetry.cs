using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Diagnostics;

namespace AudioSwitch
{
    // Implemented by this process (CCW), NOT by Windows. Callbacks only signal work.
    [ComVisible(true), Guid("7991EEC9-7E89-4D85-8390-6C703CEC60C0"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IMMNotificationClient {
        [PreserveSig] int OnDeviceStateChanged([MarshalAs(UnmanagedType.LPWStr)] string id, uint state);
        [PreserveSig] int OnDeviceAdded([MarshalAs(UnmanagedType.LPWStr)] string id);
        [PreserveSig] int OnDeviceRemoved([MarshalAs(UnmanagedType.LPWStr)] string id);
        [PreserveSig] int OnDefaultDeviceChanged(int flow, int role, [MarshalAs(UnmanagedType.LPWStr)] string id);
        [PreserveSig] int OnPropertyValueChanged([MarshalAs(UnmanagedType.LPWStr)] string id, PropertyKey key);
    }

    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    public sealed class DeviceNotifications : IMMNotificationClient {
        public readonly AutoResetEvent Changed = new AutoResetEvent(false);
        long generation;
        public long Generation { get { return Interlocked.Read(ref generation); } }
        int Signal() { Interlocked.Increment(ref generation); Changed.Set(); return 0; }
        public int OnDeviceStateChanged(string id, uint state) { return Signal(); }
        public int OnDeviceAdded(string id) { return Signal(); }
        public int OnDeviceRemoved(string id) { return Signal(); }
        public int OnDefaultDeviceChanged(int flow, int role, string id) { return Signal(); }
        public int OnPropertyValueChanged(string id, PropertyKey key) { return Signal(); }
        // Changed is deliberately kept alive through process exit: COM can have an in-flight
        // callback during unregister. Never close a wait handle underneath such a callback.
    }

    partial class Program {
        static readonly string[] RoleNames = { "console", "multimedia", "communications" };
        const int NotFound = unchecked((int)0x80070490);
        static Dictionary<string, object> Obj(params object[] pairs) {
            var result = new Dictionary<string, object>();
            for (int i = 0; i < pairs.Length; i += 2) result.Add((string)pairs[i], pairs[i + 1]);
            return result;
        }
        // Small serializer for our own finite, bounded data types; no external JSON/runtime package.
        static string Json(object value) {
            if (value == null) return "null";
            if (value is string) return Q((string)value);
            if (value is bool) return Bool((bool)value);
            var dict = value as IDictionary;
            if (dict != null) {
                var fields = new List<string>();
                foreach (DictionaryEntry entry in dict) fields.Add(Q((string)entry.Key) + ":" + Json(entry.Value));
                return "{" + String.Join(",", fields) + "}";
            }
            var list = value as IEnumerable;
            if (list != null) {
                var items = new List<string>(); foreach (object item in list) items.Add(Json(item));
                return "[" + String.Join(",", items) + "]";
            }
            if (value is int || value is long || value is uint || value is double || value is float)
                return Convert.ToString(value, CultureInfo.InvariantCulture);
            throw new ArgumentException("Unsupported telemetry value");
        }
        static Dictionary<string, object> ReadError(Exception ex) {
            return Obj("status", "error", "error", ex.Message, "code", "0x" + ex.HResult.ToString("X8"));
        }
        static Dictionary<string, object> DefaultInfo(IMMDeviceEnumerator enumerator, int flow, int role) {
            IMMDevice device = null;
            try {
                int hr = enumerator.GetDefaultAudioEndpoint(flow, role, out device);
                // A known empty assignment is not an audio-service/COM failure.
                if (hr == NotFound) return Obj("status", "ok", "id", null);
                Hr(hr);
                if (device == null) throw new InvalidOperationException("Windows returned a null endpoint on success");
                return Obj("status", "ok", "id", Id(device));
            } catch (Exception ex) { var error = ReadError(ex); error["id"] = null; return error; }
            finally { Release(device); }
        }
        static Dictionary<string, object> Inventory(IMMDeviceEnumerator enumerator, int flow) {
            IMMDeviceCollection collection = null;
            var entries = new List<Dictionary<string, object>>();
            var result = Obj("status", "ok", "complete", true, "devices", entries);
            try {
                Hr(enumerator.EnumAudioEndpoints(flow, 15, out collection)); // ACTIVE|DISABLED|NOTPRESENT|UNPLUGGED
                int count; Hr(collection.GetCount(out count));
                if (count > 512) throw new InvalidOperationException("Audio endpoint inventory limit exceeded");
                for (int i = 0; i < count; i++) {
                    IMMDevice device = null;
                    try {
                        Hr(collection.Item(i, out device));
                        string id = Id(device);
                        var entry = Obj("id", id, "state", null);
                        try { int state; Hr(device.GetState(out state)); entry["state"] = state; }
                        catch (Exception ex) { entry["stateError"] = ReadError(ex); }
                        // Names are decorative. A bad property must not hide an endpoint's identity.
                        try { entry["name"] = Name(device); }
                        catch (Exception ex) { entry["name"] = ""; entry["nameError"] = ReadError(ex); }
                        entries.Add(entry);
                    } catch (Exception ex) {
                        result["complete"] = false; result["error"] = ex.Message;
                    } finally { Release(device); }
                }
                entries.Sort(delegate(Dictionary<string, object> a, Dictionary<string, object> b) {
                    return StringComparer.Ordinal.Compare((string)a["id"], (string)b["id"]);
                });
            } catch (Exception ex) {
                result["status"] = "error"; result["complete"] = false;
                result["error"] = ex.Message; result["code"] = "0x" + ex.HResult.ToString("X8");
            } finally { Release(collection); }
            return result;
        }
        static Dictionary<string, object> FlowInfo(IMMDeviceEnumerator enumerator, int flow) {
            var defaults = new Dictionary<string, object>();
            for (int i = 0; i < 3; i++) defaults[RoleNames[i]] = DefaultInfo(enumerator, flow, i);
            return Obj("inventory", Inventory(enumerator, flow), "defaults", defaults);
        }
        static Dictionary<string, object> FlowFailure(Exception ex) {
            return Obj("inventory", Obj("status", "error", "complete", false, "devices", new object[0], "error", ex.Message),
                "defaults", Obj("console", ReadError(ex), "multimedia", ReadError(ex), "communications", ReadError(ex)));
        }
        static Dictionary<string, object> Controls(IMMDeviceEnumerator enumerator, Dictionary<string, object> flow, int direction) {
            var defaults = (Dictionary<string, object>)flow["defaults"];
            var normal = (Dictionary<string, object>)defaults["console"];
            object idObject;
            if ((string)normal["status"] != "ok" || !normal.TryGetValue("id", out idObject) || idObject == null) return null;
            string id = (string)idObject;
            IMMDevice device = null; IAudioEndpointVolume volume = null;
            var info = Obj("id", id, "muted", null, "volume", null);
            try {
                device = Device(enumerator, direction, id); volume = Volume(device);
                try { bool muted; Hr(volume.GetMute(out muted)); info["muted"] = muted; } catch (Exception ex) { info["muteError"] = ReadError(ex); }
                try { float level; Hr(volume.GetMasterVolumeLevelScalar(out level));
                    if (!float.IsNaN(level) && !float.IsInfinity(level)) info["volume"] = Math.Round(level * 100.0, 3);
                } catch (Exception ex) { info["volumeError"] = ReadError(ex); }
            } catch (Exception ex) { info["error"] = ex.Message; }
            finally { Release(volume); Release(device); }
            return info;
        }

        sealed class TelemetryHost : IDisposable {
            IMMDeviceEnumerator enumerator;
            readonly DeviceNotifications notifications = new DeviceNotifications();
            readonly string session = Guid.NewGuid().ToString("N");
            long revision;
            bool registered;
            public DeviceNotifications Notifications { get { return notifications; } }
            public TelemetryHost() { TryConnect(); }
            void TryConnect() {
                if (enumerator == null) { try { enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator(); } catch { return; } }
                if (!registered) {
                    try { Hr(enumerator.RegisterEndpointNotificationCallback(notifications)); registered = true; } catch { }
                }
            }
            Dictionary<string, object> ReadFlows() {
                if (enumerator == null) {
                    var ex = new InvalidOperationException("Windows audio enumerator is unavailable");
                    return Obj("output", FlowFailure(ex), "input", FlowFailure(ex));
                }
                return Obj("output", FlowInfo(enumerator, 0), "input", FlowInfo(enumerator, 1));
            }
            public string Capture(long requestId) {
                TryConnect();
                Dictionary<string, object> flows = null, controls = null;
                bool consistent = false; long generation = 0;
                // Windows has no atomic multi-role read. Double-read plus callback generation
                // protects against visible churn; bounded retries never claim transactional atomicity.
                for (int attempt = 0; attempt < 3; attempt++) {
                    generation = notifications.Generation;
                    var first = ReadFlows(); flows = ReadFlows();
                    controls = Obj("output", enumerator == null ? null : Controls(enumerator, (Dictionary<string, object>)flows["output"], 0),
                        "input", enumerator == null ? null : Controls(enumerator, (Dictionary<string, object>)flows["input"], 1));
                    consistent = generation == notifications.Generation && Json(first) == Json(flows);
                    if (consistent) break;
                }
                return Json(Obj("success", true, "schemaVersion", 2, "version", Version,
                    "session", session, "revision", ++revision, "requestId", requestId,
                    "generation", notifications.Generation, "consistent", consistent, "watching", registered,
                    "flows", flows, "controls", controls));
            }
            public void Dispose() {
                if (registered && enumerator != null) {
                    try { Hr(enumerator.UnregisterEndpointNotificationCallback(notifications)); } catch { }
                }
                registered = false; Release(enumerator); enumerator = null;
                GC.KeepAlive(notifications);
            }
        }

        static string SnapshotV2() { using (var host = new TelemetryHost()) return host.Capture(0); }
        static int Watch() {
            using (var host = new TelemetryHost()) {
                int stopping = 0; long requested = 0;
                Action stop = delegate { Interlocked.Exchange(ref stopping, 1); host.Notifications.Changed.Set(); };
                ConsoleCancelEventHandler cancel = delegate(object sender, ConsoleCancelEventArgs e) { e.Cancel = true; stop(); };
                Console.CancelKeyPress += cancel;
                // EOF is our parent-lifetime signal: closing/crashing Node closes its private pipe.
                var input = new Thread(delegate() {
                    var line = new StringBuilder(); bool overflow = false;
                    try {
                        int c;
                        while ((c = Console.In.Read()) >= 0) {
                            if (c == '\r') continue;
                            if (c == '\n') {
                                string command = line.ToString(); line.Length = 0;
                                if (!overflow && command == "quit") { stop(); return; }
                                long id;
                                if (!overflow && command.StartsWith("refresh ", StringComparison.Ordinal) &&
                                    long.TryParse(command.Substring(8), NumberStyles.None, CultureInfo.InvariantCulture, out id) && id >= 0 && id <= 9007199254740991L) {
                                    // Only the newest requested fence matters; capture reads it BEFORE collecting.
                                    Interlocked.Exchange(ref requested, Math.Max(Interlocked.Read(ref requested), id));
                                    host.Notifications.Changed.Set();
                                }
                                overflow = false;
                            } else if (line.Length < 80 && !overflow) line.Append((char)c);
                            else { overflow = true; line.Length = 0; }
                        }
                    } catch { } finally { stop(); }
                });
                input.IsBackground = true; input.Name = "AudioSwitch stdin"; input.Start();
                bool first = true;
                try {
                    while (Interlocked.CompareExchange(ref stopping, 0, 0) == 0) {
                        if (!first) {
                            bool signalled = host.Notifications.Changed.WaitOne(2000); // Heartbeat + mute/volume verification.
                            if (signalled) {
                                var debounce = Stopwatch.StartNew();
                                while (debounce.ElapsedMilliseconds < 250 && host.Notifications.Changed.WaitOne(75)) { }
                            }
                        }
                        first = false;
                        if (Interlocked.CompareExchange(ref stopping, 0, 0) != 0) break;
                        long fence = Interlocked.Read(ref requested);
                        Console.WriteLine(host.Capture(fence)); Console.Out.Flush();
                    }
                } catch (System.IO.IOException) { return 0; } // Parent/pipe gone; no unsolicited writes.
                finally { stop(); Console.CancelKeyPress -= cancel; }
            }
            return 0;
        }
        static string TelemetrySelfTest() {
            var sink = new DeviceNotifications();
            sink.OnDeviceAdded("a"); sink.OnDeviceRemoved("a"); sink.OnDefaultDeviceChanged(0, 1, null);
            sink.OnDeviceStateChanged("a", 8); sink.OnPropertyValueChanged("a", new PropertyKey(Guid.Empty, 0));
            if (sink.Generation != 5 || !sink.Changed.WaitOne(0)) throw new Exception("Notification generation test failed");
            if (Json(Obj("id", null, "state", 1, "ok", true)) != "{\"id\":null,\"state\":1,\"ok\":true}") throw new Exception("Telemetry serializer test failed");
            return "{\"success\":true,\"schemaVersion\":2,\"tests\":2}";
        }
    }
}
