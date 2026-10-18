$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'work\server.pid'
if (Test-Path -LiteralPath $pidFile) {
    $serverProcessId = [int](Get-Content -LiteralPath $pidFile)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$serverProcessId"
    $expectedPython = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
    if ($process -and $process.ExecutablePath -eq $expectedPython -and $process.CommandLine -like '*uvicorn app.main:app*') {
        Stop-Process -Id $serverProcessId
        Write-Host 'RecurTrace web server stopped. The graph remains available in Docker.'
    } else { Write-Host 'No matching RecurTrace server process found.' }
} else { Write-Host 'No launcher-managed server is recorded.' }
