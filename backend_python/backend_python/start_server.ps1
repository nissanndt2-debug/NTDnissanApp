param(
    [int]$Port = 3001,
    [switch]$NoReload
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonExe = Join-Path $scriptDir "venv\Scripts\python.exe"
$envFile = Join-Path $scriptDir ".env.local"

if (-not (Test-Path $envFile)) {
    $envFile = Join-Path $scriptDir ".env"
}

if (-not (Test-Path $pythonExe)) {
    Write-Error "Python virtual environment not found at $pythonExe"
    exit 1
}

if (-not (Test-Path $envFile)) {
    Write-Error "Environment file not found (.env.local or .env) in $scriptDir"
    exit 1
}

$launchParams = @(
    "-m", "uvicorn",
    "main:app",
    "--app-dir", $scriptDir,
    "--env-file", $envFile,
    "--host", "127.0.0.1",
    "--port", $Port
)

if (-not $NoReload -and $env:NODE_ENV -ne "production") {
    $launchParams += "--reload"
}

if ($env:NODE_ENV -eq "production" -and -not $NoReload) {
    Write-Warning "NODE_ENV=production detected; starting without --reload"
}

& $pythonExe @launchParams
