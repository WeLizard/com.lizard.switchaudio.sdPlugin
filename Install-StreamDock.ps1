# Install a prebuilt package. No compilation, npm, downloads or administrator rights.
[CmdletBinding()]
param([switch]$ValidateOnly)
$ErrorActionPreference = 'Stop'
$id = 'com.lizard.switchaudio.sdPlugin'
$source = Join-Path $PSScriptRoot $id
if (!(Test-Path -LiteralPath $source -PathType Container)) { throw 'Extract the complete ZIP before running the installer.' }
$required = @('manifest.json','property.html','property.js','property-appvolume.html','plugin\main.js','plugin\settings.js','plugin\AudioSwitch.exe','plugin\node_modules\ws\package.json')
foreach ($file in $required) { if (!(Test-Path -LiteralPath (Join-Path $source $file))) { throw "Incomplete package: $file" } }
$manifest = Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw | ConvertFrom-Json
$helper = Join-Path $source 'plugin\AudioSwitch.exe'
$native = & $helper selftest | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or !$native.success -or $native.version -ne $manifest.Version) { throw 'Native helper validation failed.' }
$checksumFile = Join-Path $PSScriptRoot 'SHA256SUMS.txt'
if (!(Test-Path -LiteralPath $checksumFile)) { throw 'Package checksums are missing.' }
foreach ($line in Get-Content -LiteralPath $checksumFile) {
    if ($line -notmatch '^([a-f0-9]{64})  (.+)$') { throw 'Invalid checksum list.' }
    $expected = $Matches[1]; $relative = $Matches[2]
    if ([IO.Path]::IsPathRooted($relative) -or ($relative -split '[\\/]') -contains '..') { throw 'Unsafe checksum path.' }
    $file = Join-Path $PSScriptRoot $relative
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw "Damaged package: $relative" }
}
if ($ValidateOnly) { Write-Host 'Package validation passed.'; return }
if (Get-Process -Name 'StreamDock*' -ErrorAction SilentlyContinue) { throw 'Exit StreamDock from its system-tray menu, then run this installer again.' }
if (!$env:APPDATA) { throw 'APPDATA is not defined.' }
$hostRoot = Join-Path $env:APPDATA 'HotSpot\StreamDock'
if (!(Test-Path -LiteralPath $hostRoot -PathType Container)) { throw 'StreamDock user-data directory was not found. Install and run StreamDock first. This is not an Elgato installer.' }
$plugins = Join-Path $hostRoot 'plugins'
$target = Join-Path $plugins $id
foreach ($dir in @($hostRoot,$plugins,$target)) {
    if (Test-Path -LiteralPath $dir) {
        if ((Get-Item -LiteralPath $dir -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Refusing to replace a linked directory: $dir" }
    }
}
New-Item -ItemType Directory -Path $plugins -Force | Out-Null
$stamp = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
$staging = Join-Path $plugins ('.audio-install-' + $stamp)
$backup = Join-Path (Join-Path $hostRoot 'AudioSwitch-backups') $stamp
$moved = $false
try {
    Copy-Item -LiteralPath $source -Destination $staging -Recurse
    if (Test-Path -LiteralPath $target) {
        New-Item -ItemType Directory -Path (Split-Path $backup) -Force | Out-Null
        Move-Item -LiteralPath $target -Destination $backup
        $moved = $true
    }
    try { Move-Item -LiteralPath $staging -Destination $target }
    catch {
        if ($moved -and !(Test-Path -LiteralPath $target)) { Move-Item -LiteralPath $backup -Destination $target }
        throw
    }
    Write-Host "Installed Audio Switch Pro $($manifest.Version). Start StreamDock and configure the device list."
    if ($moved) { Write-Host "Previous plugin backup: $backup" }
} finally {
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
}
