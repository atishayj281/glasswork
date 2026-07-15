# Create venv and install dependencies (run once, or after requirements change).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Venv = Join-Path $Root ".venv"

if (-not (Test-Path $Venv)) {
    python -m venv $Venv
}

$Python = Join-Path $Venv "Scripts\python.exe"
$Pip = Join-Path $Venv "Scripts\pip.exe"

& $Python -m pip install --upgrade pip
& $Pip install -r (Join-Path $Root "requirements.txt")

Write-Host "Done. Activate with: .\.venv\Scripts\Activate.ps1"
Write-Host "Or run backend with: .\run.ps1"
