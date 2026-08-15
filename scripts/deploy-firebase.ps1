$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

function Invoke-Checked {
  param([Parameter(Mandatory = $true)][scriptblock]$Command)
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" }
}

Write-Host "TCC Safe Travel - Firebase release" -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not installed. Install Node.js 22 LTS before deployment."
}

if (-not (Test-Path ".env.local")) {
  Copy-Item ".env.firebase.example" ".env.local"
  Write-Host "Created .env.local. Fill in Firebase Web App values, then run this script again." -ForegroundColor Yellow
  exit 2
}

if (-not (Test-Path "node_modules")) {
  Invoke-Checked { npm ci }
}

# Console login and CLI login are separate. This opens Google's official sign-in only when needed.
& npx firebase-tools projects:list --json *> $null
if ($LASTEXITCODE -ne 0) {
  Invoke-Checked { npx firebase-tools login }
}

Invoke-Checked { npx firebase-tools use tcc-safe-travel }
Invoke-Checked { npm run firebase:release }

Write-Host "Release and post-deploy smoke test completed." -ForegroundColor Green
Write-Host "Site: https://tcc-safe-travel.web.app"
Write-Host "Dashboard: https://tcc-safe-travel.web.app/dashboard"
