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
