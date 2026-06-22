# Saathi launcher — runs Expo using the bundled portable Node (v20.20.2),
# so you don't need to upgrade your system Node. Usage:
#   ./start.ps1            # web (http://localhost:8081)
#   ./start.ps1 android    # open on Android (Expo Go)
#   ./start.ps1 ios        # open on iOS (Expo Go)
param([string]$platform = "web")

$ErrorActionPreference = "Stop"
$nodeDir = Join-Path $PSScriptRoot ".tools\node-v20.20.2-win-x64"
if (-not (Test-Path $nodeDir)) {
  Write-Error "Portable Node not found at $nodeDir. See README (Node >= 20.19.4 required)."
  exit 1
}
$env:Path = "$nodeDir;$env:Path"
Set-Location $PSScriptRoot
Write-Host "Using Node $(& "$nodeDir\node.exe" -v)" -ForegroundColor Green

switch ($platform) {
  "android" { & "$nodeDir\npx.cmd" expo start --android }
  "ios"     { & "$nodeDir\npx.cmd" expo start --ios }
  default   { & "$nodeDir\npx.cmd" expo start --web --port 8081 }
}
