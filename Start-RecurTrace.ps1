param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pythonExe = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $pythonExe)) {
    Write-Host 'Preparing the Python environment...'
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.10 or newer is required.' }
}
function Test-PythonDependencies {
    $ErrorActionPreference = 'Continue'
    & $pythonExe -c 'import fastapi, uvicorn, falkordb, httpx, dotenv' 2>$null
    return $LASTEXITCODE -eq 0
}
function Test-DockerReady {
    $ErrorActionPreference = 'Continue'
    & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
}
if (-not (Test-PythonDependencies)) {
    & $pythonExe -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Could not install dependencies. Check your internet connection.' }
}
Write-Host 'Checking Docker...'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install Docker Desktop, then run this launcher again.' }
if (-not (Test-DockerReady)) {
    $dockerDesktop = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (-not (Test-Path -LiteralPath $dockerDesktop)) { throw 'Install Docker Desktop, then run this launcher again.' }
    Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 2
        if (Test-DockerReady) { break }
    }
}
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw 'FalkorDB could not start. Open Docker Desktop and retry.' }
$url = 'http://127.0.0.1:8765'
$running = $false
try { $status = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 3; $running = $status.app -eq 'RecurTrace' } catch {}
if (-not $running) {
    $workDir = Join-Path $PSScriptRoot 'work'
    New-Item -ItemType Directory -Force -Path $workDir | Out-Null
    $process = Start-Process -FilePath $pythonExe -ArgumentList '-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8765' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $workDir 'server.log') -RedirectStandardError (Join-Path $workDir 'server-error.log')
    $process.Id | Set-Content -LiteralPath (Join-Path $workDir 'server.pid')
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        try { $status = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 2; if ($status.app -eq 'RecurTrace') { $running = $true; break } } catch {}
    }
    if (-not $running) { throw 'The app could not start. See work/server-error.log.' }
}
Write-Host "RecurTrace is ready: $url" -ForegroundColor Green
if (-not $NoBrowser) { Start-Process "$url/#overview" }
