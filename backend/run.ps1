# Run the Aegis backend using the project venv (not global Python).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = Join-Path $Root "venv\Scripts\python.exe"

if (-not (Test-Path $Python)) {
    Write-Host "Creating virtual environment..."
    python -m venv (Join-Path $Root ".venv")
    & $Python -m pip install --upgrade pip
    & (Join-Path $Root ".venv\Scripts\pip.exe") install -r (Join-Path $Root "requirements.txt")
}

Set-Location $Root
& $Python -m uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 8000
