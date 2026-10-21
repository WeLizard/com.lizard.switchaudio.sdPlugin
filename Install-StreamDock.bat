@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-StreamDock.ps1"
if errorlevel 1 (
  echo Installation failed. See the error above. Nothing requires administrator rights.
  pause
  exit /b 1
)
pause
