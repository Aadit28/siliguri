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
$env:EXPO_PUBLIC_API_BASE_URL = "http://localhost:8788"

function Ensure-LocalApi {
  $apiPort = 8788
  $open = Get-NetTCPConnection -LocalPort $apiPort -State Listen -ErrorAction SilentlyContinue
  if ($open) {
    Write-Host "Saathi local API already running on http://localhost:$apiPort" -ForegroundColor Green
    return
  }

  Write-Host "Starting Saathi local API on http://localhost:$apiPort" -ForegroundColor Green
  Start-Process `
    -FilePath "$nodeDir\node.exe" `
    -ArgumentList "scripts\dev-api.js" `
    -WorkingDirectory $PSScriptRoot `
    -WindowStyle Hidden
}

switch ($platform) {
  "android" { Ensure-LocalApi; & "$nodeDir\npx.cmd" expo start --android }
  "ios"     { Ensure-LocalApi; & "$nodeDir\npx.cmd" expo start --ios }
  default   { Ensure-LocalApi; & "$nodeDir\npx.cmd" expo start --web --port 8081 }
}
