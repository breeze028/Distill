$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$venv = Join-Path $root "python\.venv"
$python = Join-Path $venv "Scripts\python.exe"

if (-not (Test-Path $python)) {
  python -m venv $venv
}

& $python -m pip install --upgrade pip
& $python -m pip install -r (Join-Path $root "python\requirements.txt")

Write-Host "STT environment ready: $python"
Write-Host "Use DISTILL_PYTHON_COMMAND=$python and select Python Worker in Settings."
