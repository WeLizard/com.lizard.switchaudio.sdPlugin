using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Windows.Foundation;
using Windows.Media.Control;

namespace AudioSwitch {
    // Media control goes through the Windows System Media Transport Controls session,
    // not synthetic keystrokes: it addresses the app that is actually playing, works
    // for packaged/UWP apps that have no guessable process name, and reports which
    // transport buttons the app really supports.
    partial class Program {
        const int ManagerTimeoutMs = 3000;
        const int PropertiesTimeoutMs = 1200;
        static GlobalSystemMediaTransportControlsSessionManager mediaManager;
        static readonly object mediaGate = new object();

        static T MediaAwait<T>(IAsyncOperation<T> operation, int timeoutMs) {
            Task<T> task = operation.AsTask();
            if (!task.Wait(timeoutMs)) throw new TimeoutException("Windows media sessions did not respond in time.");
            return task.Result;
        }

        static GlobalSystemMediaTransportControlsSessionManager Manager() {
            lock (mediaGate) {
                if (mediaManager == null)
                    mediaManager = MediaAwait(GlobalSystemMediaTransportControlsSessionManager.RequestAsync(), ManagerTimeoutMs);
                return mediaManager;
            }
        }

        static Dictionary<string, object> SessionInfo(GlobalSystemMediaTransportControlsSession session) {
            if (session == null) return null;
            var playback = session.GetPlaybackInfo();
            var controls = playback.Controls;
            string title = null, artist = null, album = null;
            // Properties are cosmetic: a session that refuses them is still controllable.
            try {
                var properties = MediaAwait(session.TryGetMediaPropertiesAsync(), PropertiesTimeoutMs);
                if (properties != null) { title = properties.Title; artist = properties.Artist; album = properties.AlbumTitle; }
            } catch { }
            return Obj(
                "source", session.SourceAppUserModelId,
                "title", title, "artist", artist, "album", album,
                "playbackStatus", playback.PlaybackStatus.ToString(),
                "controls", Obj(
                    "play", controls.IsPlayEnabled, "pause", controls.IsPauseEnabled,
                    "stop", controls.IsStopEnabled, "next", controls.IsNextEnabled,
                    "previous", controls.IsPreviousEnabled, "record", controls.IsRecordEnabled,
                    "channelUp", controls.IsChannelUpEnabled, "channelDown", controls.IsChannelDownEnabled));
        }

        // Subscribes to the live session so a track change wakes the telemetry watcher
        // instead of waiting for the next heartbeat. Shares the audio generation counter:
        // one fence covers both, and a media change mid-capture marks the frame inconsistent.
        sealed class MediaWatcher : IDisposable {
            readonly DeviceNotifications sink;
            readonly object gate = new object();
            readonly TypedEventHandler<GlobalSystemMediaTransportControlsSession, MediaPropertiesChangedEventArgs> properties;
            readonly TypedEventHandler<GlobalSystemMediaTransportControlsSession, PlaybackInfoChangedEventArgs> playback;
            GlobalSystemMediaTransportControlsSessionManager manager;
            GlobalSystemMediaTransportControlsSession subscribed;
            bool started, disposed;

            public MediaWatcher(DeviceNotifications sink) {
                this.sink = sink;
                properties = delegate { sink.Signal(); };
                playback = delegate { sink.Signal(); };
            }
            public void Start() {
                lock (gate) {
                    if (disposed) return;
                    if (!started) {
                        try {
                            manager = Manager();
                            manager.CurrentSessionChanged += OnCurrentSessionChanged;
                            started = true;
                        } catch { manager = null; }
                    }
                }
                Sync();
            }
            void OnCurrentSessionChanged(GlobalSystemMediaTransportControlsSessionManager sender, CurrentSessionChangedEventArgs args) {
                sink.Signal();
                try { Sync(sender.GetCurrentSession()); } catch { }
            }
            public void Sync() { try { Sync(Manager().GetCurrentSession()); } catch { } }
            void Sync(GlobalSystemMediaTransportControlsSession session) {
                lock (gate) {
                    if (disposed || ReferenceEquals(subscribed, session)) return;
                    Detach();
                    subscribed = session;
                    if (session == null) return;
                    try {
                        session.MediaPropertiesChanged += properties;
                        session.PlaybackInfoChanged += playback;
                    } catch { Detach(); }
                }
            }
            void Detach() {
                if (subscribed == null) return;
                var old = subscribed; subscribed = null;
                try { old.MediaPropertiesChanged -= properties; } catch { }
                try { old.PlaybackInfoChanged -= playback; } catch { }
            }
            public void Dispose() {
                lock (gate) {
                    disposed = true; Detach();
                    if (manager != null) { try { manager.CurrentSessionChanged -= OnCurrentSessionChanged; } catch { } }
                    manager = null; started = false;
                }
            }
        }

        // Never throws: this runs inside the telemetry frame, and a media failure must
        // not take down audio reporting with it.
        static Dictionary<string, object> MediaInfo(MediaWatcher watcher) {
            try {
                var manager = Manager();
                var current = manager.GetCurrentSession();
                if (watcher != null) watcher.Start();
                return Obj("available", true, "sessionCount", manager.GetSessions().Count,
                    "session", SessionInfo(current));
            } catch (Exception ex) {
                return Obj("available", false, "reason", ex.Message,
                    "code", "0x" + ex.HResult.ToString("X8"));
            }
        }
        static Dictionary<string, object> MediaInfo() { return MediaInfo(null); }

        static string MediaStatus() {
            return Json(Obj("success", true, "media", MediaInfo()));
        }

        static string MediaSessions() {
            try {
                var items = new List<object>();
                foreach (var session in Manager().GetSessions()) items.Add(SessionInfo(session));
                return Json(Obj("success", true, "available", true, "sessions", items));
            } catch (Exception ex) {
                return Json(Obj("success", true, "available", false, "reason", ex.Message, "sessions", new List<object>()));
            }
        }

        static bool Capability(Dictionary<string, object> info, string name) {
            if (info == null) return false;
            var controls = info["controls"] as Dictionary<string, object>;
            return controls != null && controls.ContainsKey(name) && (bool)controls[name];
        }

        static string MediaCommand(string action) {
            Dictionary<string, object> info = MediaInfo();
            if (!(bool)info["available"])
                return Json(Obj("success", false, "available", false,
                    "error", "Windows media sessions are unavailable on this system.", "reason", info["reason"]));

            var session = Manager().GetCurrentSession();
            Dictionary<string, object> current;
            try { current = SessionInfo(session); }
            catch (Exception ex) {
                return Json(Obj("success", false, "available", true, "session", null,
                    "error", "The playing app stopped responding: " + ex.Message));
            }
            if (session == null || current == null)
                return Json(Obj("success", false, "available", true, "session", null,
                    "error", "Nothing is playing right now."));

            bool allowed;
            switch (action) {
                case "playpause":
                    bool playing = String.Equals((string)current["playbackStatus"], "Playing", StringComparison.OrdinalIgnoreCase);
                    allowed = playing ? Capability(current, "pause") : Capability(current, "play");
                    if (!allowed)
                        return Json(Obj("success", false, "available", true, "session", current,
                            "error", playing ? "This app cannot be paused." : "This app cannot be resumed."));
                    bool ok = playing ? MediaAwait(session.TryPauseAsync(), ManagerTimeoutMs) : MediaAwait(session.TryPlayAsync(), ManagerTimeoutMs);
                    return Json(Obj("success", ok, "available", true, "action", playing ? "pause" : "play",
                        "session", current, "error", ok ? null : "The app rejected the command."));
                case "play": allowed = Capability(current, "play"); break;
                case "pause": allowed = Capability(current, "pause"); break;
                case "stop": allowed = Capability(current, "stop"); break;
                case "next": allowed = Capability(current, "next"); break;
                case "previous": allowed = Capability(current, "previous"); break;
                default: throw new ArgumentException("Unknown media command.");
            }
            if (!allowed)
                return Json(Obj("success", false, "available", true, "session", current,
                    "error", "The playing app does not support this command."));

            bool result;
            switch (action) {
                case "play": result = MediaAwait(session.TryPlayAsync(), ManagerTimeoutMs); break;
                case "pause": result = MediaAwait(session.TryPauseAsync(), ManagerTimeoutMs); break;
                case "stop": result = MediaAwait(session.TryStopAsync(), ManagerTimeoutMs); break;
                case "next": result = MediaAwait(session.TrySkipNextAsync(), ManagerTimeoutMs); break;
                default: result = MediaAwait(session.TrySkipPreviousAsync(), ManagerTimeoutMs); break;
            }
            return Json(Obj("success", result, "available", true, "action", action, "session", current,
                "error", result ? null : "The app rejected the command."));
        }

        static string MediaSelfTest() {
            int tests = 0;
            var info = MediaInfo();
            if (!info.ContainsKey("available")) throw new Exception("Media availability missing");
            tests++;
            if ((bool)info["available"]) {
                if (!info.ContainsKey("sessionCount")) throw new Exception("Session count missing");
                tests++;
                var session = info["session"] as Dictionary<string, object>;
                if (session != null) {
                    if (!(session["controls"] is Dictionary<string, object>)) throw new Exception("Controls missing");
                    if (session["source"] as string == null) throw new Exception("Session source missing");
                    tests++;
                }
            }
            // Serialization must round-trip Unicode titles, which are the common case.
            string probe = Json(Obj("title", "Ж ё 中文 \" \\ \n"));
            if (!probe.Contains("\\u000a") || !probe.Contains("Ж")) throw new Exception("Media JSON escaping failed");
            tests++;
            // The watcher must survive start/stop on a machine with no media session at all.
            var sink = new DeviceNotifications();
            using (var watcher = new MediaWatcher(sink)) { watcher.Start(); watcher.Sync(); }
            tests++;
            return Json(Obj("success", true, "schemaVersion", 1, "tests", tests,
                "available", info["available"], "physicalMediaTested", (bool)info["available"] && info["session"] != null));
        }
    }
}