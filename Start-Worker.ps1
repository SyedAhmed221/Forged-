param([switch]$Foreground)
$ErrorActionPreference = 'Stop'
$forgedRoot = $PSScriptRoot
$forgedNode = (Get-Command node -ErrorAction Stop).Source
$forgedEnv = Join-Path $forgedRoot '.env'
if (-not (Test-Path -LiteralPath $forgedEnv)) { throw 'Configure the local .env file first.' }
Push-Location -LiteralPath $forgedRoot
try {
    & $forgedNode --env-file=.env --import ./scripts/local-worker-env.mjs --import tsx scripts/local-worker-check.ts
    if ($LASTEXITCODE -ne 0) { throw 'Worker preflight failed. Review the check output above.' }
    if ($Foreground) {
        & $forgedNode --env-file=.env --import ./scripts/local-worker-env.mjs --import tsx services/worker/src/index.ts
        exit $LASTEXITCODE
    }
    $forgedRuntime = Join-Path $forgedRoot '.tmp\worker'
    New-Item -ItemType Directory -Path $forgedRuntime -Force | Out-Null
    $forgedPidFile = Join-Path $forgedRuntime 'worker-process.json'
    if (Test-Path -LiteralPath $forgedPidFile) {
        $forgedOldPid = [int]((Get-Content -LiteralPath $forgedPidFile -Raw | ConvertFrom-Json).pid)
        if (Get-Process -Id $forgedOldPid -ErrorAction SilentlyContinue) { throw 'A local worker may already be running. Use Stop-Worker.ps1 before starting another.' }
    }
    $forgedProcess = Start-Process -FilePath $forgedNode -ArgumentList @('--env-file=.env','--import','./scripts/local-worker-env.mjs','--import','tsx','services/worker/src/index.ts') -WorkingDirectory $forgedRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $forgedRuntime 'stdout.log') -RedirectStandardError (Join-Path $forgedRuntime 'stderr.log') -PassThru
    Set-Content -LiteralPath $forgedPidFile -Value (@{pid=$forgedProcess.Id;started=$forgedProcess.StartTime.ToUniversalTime().ToString('O')} | ConvertTo-Json -Compress) -NoNewline
    Write-Output "Worker started locally (process $($forgedProcess.Id)). Health: http://127.0.0.1:8080/healthz"
} finally { Pop-Location }
