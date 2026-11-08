@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20+ is required for BUILDING from source. & exit /b 1)
where npm >nul 2>nul || (echo npm is required for BUILDING from source. & exit /b 1)
where python >nul 2>nul || (echo Python 3 is required to compile the native helper. & exit /b 1)
pushd plugin
call npm ci --omit=dev --ignore-scripts
if errorlevel 1 (popd & exit /b 1)
popd
python tools\build-native.py
if errorlevel 1 exit /b 1
copy /y build\AudioSwitch.exe plugin\AudioSwitch.exe >nul
if errorlevel 1 exit /b 1
node --test
if errorlevel 1 exit /b 1
node tools\package.mjs
if errorlevel 1 exit /b 1
for /f "usebackq delims=" %%v in (`node -p "require('./manifest.json').Version"`) do set "VER=%%v"
echo Ready: dist\AudioSwitch-%VER%-StreamDock.zip