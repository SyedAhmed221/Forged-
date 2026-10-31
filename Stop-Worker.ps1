$ErrorActionPreference = 'Stop'
$forgedPidFile=Join-Path $PSScriptRoot '.tmp\worker\worker-process.json'
if (-not (Test-Path -LiteralPath $forgedPidFile)) { Write-Output 'No recorded local worker.'; exit 0 }
$forgedRecorded=Get-Content -LiteralPath $forgedPidFile -Raw | ConvertFrom-Json
$forgedWorkerPid=[int]$forgedRecorded.pid
$forgedProcess=Get-Process -Id $forgedWorkerPid -ErrorAction SilentlyContinue
if ($forgedProcess) {
    $forgedNode=(Get-Command node -ErrorAction Stop).Source
    if ($forgedProcess.Path -ne $forgedNode -or $forgedProcess.StartTime.ToUniversalTime() -ne ([datetime]$forgedRecorded.started).ToUniversalTime()) { throw 'The recorded process does not match the worker. Refusing to stop it.' }
    Stop-Process -Id $forgedWorkerPid
}
Remove-Item -LiteralPath $forgedPidFile
Write-Output 'Local worker stopped. Interrupted provider completion will be reported as an unknown outcome.'
