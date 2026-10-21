# Isolated fixture: never touches the runner's real StreamDock user profile.
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot
$bundle = Join-Path $repo 'dist\AudioSwitch-1.4.0-StreamDock'
$originalAppData = $env:APPDATA
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('AudioSwitch test ' + [char]0x0416 + ' ' + [Guid]::NewGuid().ToString('N'))
try {
    $env:APPDATA = Join-Path $fixture 'User Profile'
    $hostRoot = Join-Path $env:APPDATA 'HotSpot\StreamDock'
    New-Item -ItemType Directory -Path $hostRoot -Force | Out-Null
    & (Join-Path $bundle 'Install-StreamDock.ps1')
    $plugin = Join-Path $hostRoot 'plugins\com.lizard.switchaudio.sdPlugin'
    if (!(Test-Path -LiteralPath (Join-Path $plugin 'plugin\AudioSwitch.exe'))) { throw 'Fresh installation is incomplete.' }
    $manifest = Get-Content -LiteralPath (Join-Path $plugin 'manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.Version -ne '1.4.0') { throw 'Wrong installed version.' }
    Set-Content -LiteralPath (Join-Path $plugin 'previous-version-marker.txt') -Value 'Keep this in backup'
    & (Join-Path $bundle 'Install-StreamDock.ps1')
    if (Test-Path -LiteralPath (Join-Path $plugin 'previous-version-marker.txt')) { throw 'Upgrade did not replace the folder cleanly.' }
    $backups = @(Get-ChildItem -LiteralPath (Join-Path $hostRoot 'AudioSwitch-backups') -Recurse -Filter 'previous-version-marker.txt')
    if ($backups.Count -ne 1) { throw 'Previous plugin backup missing.' }
    $code = "const p=require(process.argv[1]);if(typeof p.createController!=='function')process.exit(1);"
    & node -e $code (Join-Path $plugin 'plugin\main.js')
    if ($LASTEXITCODE -ne 0) { throw 'Packaged JavaScript cannot be loaded from a relocated Unicode path.' }
    & node -e "require(require.resolve('ws',{paths:[process.argv[1]]}));" (Join-Path $plugin 'plugin')
    if ($LASTEXITCODE -ne 0) { throw 'Packaged WebSocket dependency missing.' }
    $targetAsset = Join-Path $bundle 'com.lizard.switchaudio.sdPlugin\property.html'
    $original = [IO.File]::ReadAllBytes($targetAsset)
    try {
        Add-Content -LiteralPath $targetAsset -Value 'tamper-test'
        $rejected = $false
        try { & (Join-Path $bundle 'Install-StreamDock.ps1') -ValidateOnly } catch { $rejected = $true }
        if (!$rejected) { throw 'Corrupted package was accepted.' }
    } finally { [IO.File]::WriteAllBytes($targetAsset,$original) }
    Write-Host 'Installer smoke passed: fresh install, upgrade, backup, Unicode/spaced path, dependency loading and corrupted-package rejection.'
} finally {
    $env:APPDATA = $originalAppData
    if (Test-Path -LiteralPath $fixture) { Remove-Item -LiteralPath $fixture -Recurse -Force }
}
