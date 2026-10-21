@echo off
setlocal
rem Compatibility entry point for SOURCE builds. End users use Install-StreamDock.bat in the release ZIP.
call "%~dp0prepare-release.bat"
if errorlevel 1 exit /b 1
echo Extract the generated ZIP and run Install-StreamDock.bat to install.
pause
