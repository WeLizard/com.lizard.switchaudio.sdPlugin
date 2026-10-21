@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20+ is required for BUILDING from source. & exit /b 1)
where npm >nul 2>nul || (echo npm is required for BUILDING from source. & exit /b 1)
call npm ci --prefix plugin --omit=dev --ignore-scripts
if errorlevel 1 exit /b 1
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (echo .NET Framework compiler was not found. & exit /b 1)
pushd plugin
"%CSC%" /nologo /optimize+ /platform:anycpu /target:exe /out:AudioSwitch.exe AudioSwitch.cs
if errorlevel 1 (popd & exit /b 1)
popd
node --test
if errorlevel 1 exit /b 1
node tools\package.mjs
if errorlevel 1 exit /b 1
echo Ready: dist\AudioSwitch-1.4.0-StreamDock.zip
