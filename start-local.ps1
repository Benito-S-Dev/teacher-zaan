$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$localRuntime = Join-Path $PSScriptRoot '.runtime/node-v22.16.0-win-x64'
if (-not (Test-Path -LiteralPath (Join-Path $localRuntime 'node.exe'))) {
    throw 'The project-local Node.js 22 runtime is missing. See LOCAL_SETUP.md.'
}
$env:PATH = "$localRuntime;$env:PATH"
$env:DATA_DIR = Join-Path $PSScriptRoot 'data'
$env:COOKIE_SECURE = 'false'
$env:NEXT_TELEMETRY_DISABLED = '1'
& (Join-Path $localRuntime 'npm.cmd') run dev -- --hostname 127.0.0.1 --port 3000
