# 2.0.0 — real media control, zero configuration

- Media buttons now drive the app that is actually playing via Windows SMTC (System Media Transport Controls),
  including UWP apps such as Yandex.Music. No process name, path or URI configuration anymore.
- Play/Pause, Next and Previous act on the current Windows media session; unsupported commands fail explicitly.
- The track title appears on the Play/Pause key; the inspector shows a live track/artist/app status card.
- If nothing is playing, Play/Pause reopens the last music app and retries.
- Telemetry schema v3: media state is pushed with audio state; media events wake the watcher immediately.
- Removed synthetic media keystrokes and the native process-launch surface; Sound Settings opens via Windows URI from JS.
- Friendly diagnosis when AudioSwitch.exe is missing (antivirus quarantine), instead of a bare ENOENT.
- Installer verifies every runtime module and rolls back if antivirus removes the helper during install.
- Play/Pause inspector rewritten: no fields to fill in, localized status (en/ru/zh).

# 1.4.0 — multi-device / packaging validation candidate

- Replace the hard-coded pair with an ordered list of up to 32 endpoints; legacy settings still work.
- Actual Windows defaults, offline skipping, forward/reverse cycle, single selection, role choice,
  short labels and configurable icons. Input/output lists are separate.
- Serialize audio operations; fix reversed PTT and remute the originally held microphone.
- Handle PTT page/device loss, host disconnect and graceful shutdown; retry failed releases.
- Use native Core Audio for mute, system/app volume; report errors rather than silently changing another app.
- Use argument arrays without shell interpolation; validate/clamp numeric settings and JSON responses.
- Correct COM HRESULT preservation, Unicode JSON, default reporting for input devices and native resource cleanup.
- Verify role changes and attempt rollback after partial failure.
- Correct image payloads and stop presenting a media-key counter as real playback telemetry.
- Adjustable system volume step; keep 0% valid. Remove misleading file picker fallback to a bare filename.
- Mandatory freshly compiled helper, pinned ws, all inspectors and assets; no NirCmd in distributable.
- Version alignment, reproducible Windows build, regression tests, native self-tests and package verification.
- User installer without developer dependencies, backup/rollback, integrity check and explicit host/OS limitations.

Hardware acceptance remains required. No claim of universal Windows, Elgato or StreamDock-clone compatibility.
