# Audio Switch Pro 1.4.0

Windows **StreamDock** audio control. This is not an Elgato Stream Deck installer.

Extract the complete `AudioSwitch-1.4.0-StreamDock.zip`, exit StreamDock from its tray icon,
and run `Install-StreamDock.bat` as your normal Windows user. Restart StreamDock and choose
one or more local audio endpoints in the Audio Switch inspector. No developer tools,
NirCmd, separate Node.js installation or downloads are needed by the end user.
The installer verifies package hashes and the compiled helper, and backs up the previous plugin folder.

Supported target: Windows 10/11, StreamDock 3.10.188.226+ with bundled Node.js 20,
.NET Framework 4.x and Windows Audio. Other hosts, macOS/Linux and Windows ARM are unverified.
A Windows CI build is not a physical StreamDock or Windows desktop audio compatibility test.
This version is a hardware-validation candidate until the acceptance checklist is completed.

Cycle through up to 32 devices, reorder them, assign short labels/icons, skip offline entries,
choose forward/reverse order, select one target, and choose normal/communications/all default roles.
The current Windows endpoint is queried before each switch. Device and mute displays refresh
approximately every two seconds. Existing two-device settings and action UUIDs are preserved.
System volume step is configurable. Native Core Audio replaces the old NirCmd dependency.
Explicit application-volume failure never falls back to a different focused application.

PTT unmutes on key-down and mutes the same endpoint on release. Cleanup runs on page/device
loss, host disconnect and graceful shutdown, with retry after a failed release. Force-killing
processes, unavailable audio endpoints and power loss cannot be made fail-safe by this plugin.
Before the first press PTT does not automatically change microphone mute state.
Media keys are not playback-state telemetry; Play/Pause intentionally uses a static icon.

Applications pinned to a specific device, ASIO and exclusive streams may not follow default
endpoint changes. Endpoint IDs are local to a Windows installation and may change after driver
reinstallation. Imported profiles must select devices on the new machine. Windows IPolicyConfig
is undocumented, so compatibility with every future Windows build is not guaranteed.

Developers: Windows + Node.js 20/npm + .NET Framework compiler, then `prepare-release.bat`.
The build uses the lockfile, compiles the helper, runs regression tests, checks manifest assets,
and emits a complete ZIP into `dist/`. `Install-StreamDock.ps1 -ValidateOnly` checks an extracted
release without installing. SHA-256 checksums detect corruption; they are not a publisher signature.

[Full Russian instructions, limitations and acceptance checklist](README_ru.md).

SDK: https://sdk.key123.vip/en/guide/manifest.html
Repository: https://github.com/WeLizard/com.lizard.switchaudio.sdPlugin

Project license: MIT, as declared by the original project. The bundled `ws` license is retained.
