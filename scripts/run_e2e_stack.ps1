<#
.SYNOPSIS
  WealthGenie E2E Stack Orchestrator
  Starts all services, polls health endpoints, runs Playwright tests, cleans up.

.DESCRIPTION
  1. Confirms MongoDB is running (Windows service)
  2. Starts Node Express server (port 5000)
  3. Starts FastAPI ml-service (port 8000)
  4. Starts Vite dev server (port 5173)
  5. Polls health endpoints until all healthy
  6. Runs: npx playwright test
  7. Cleans up all spawned processes on exit
#>

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# --- Paths ---
$ROOT = Split-Path -Parent $PSScriptRoot
$SERVER_DIR = Join-Path $ROOT "server"
$ML_DIR = Join-Path $ROOT "ml-service"
$REACT_DIR = Join-Path $ROOT "reactapp"
$LOG_DIR = Join-Path $ROOT "logs"

# Ensure logs directory exists
New-Item -ItemType Directory -Path $LOG_DIR -Force | Out-Null

# --- State ---
$script:serverProc = $null
$script:mlProc = $null
$script:viteProc = $null

function Write-Step($msg) { Write-Host "[STEP] $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Err($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Yellow }

function Kill-Port-Listeners {
    foreach ($port in @(5000, 8000, 5173)) {
        try {
            $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
            if ($conns) {
                $conns | ForEach-Object {
                    try {
                        Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
                    } catch {}
                }
            }
        } catch {}
    }
}

function Cleanup {
    Write-Info "Cleaning up spawned processes..."
    foreach ($proc in @($script:serverProc, $script:mlProc, $script:viteProc)) {
        if ($proc -and -not $proc.HasExited) {
            try {
                Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
                    Where-Object { $_.ParentProcessId -eq $proc.Id } |
                    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            } catch {
                Write-Info "Process $($proc.Id) already exited."
            }
        }
    }
    Kill-Port-Listeners
    Write-Ok "Cleanup complete."
}

function Poll-Endpoint {
    param(
        [string]$Url,
        [string]$Label,
        [int]$TimeoutSec = 45,
        [int]$IntervalSec = 2
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    Write-Info "Polling $Label at $Url (timeout: ${TimeoutSec}s)..."
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) {
                Write-Ok "$Label is healthy (HTTP 200)"
                return $true
            }
        } catch {
            # Still warming up
        }
        Start-Sleep -Seconds $IntervalSec
    }
    Write-Err "$Label failed to become healthy within ${TimeoutSec}s"
    return $false
}

# ============================
# MAIN
# ============================
try {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host "  WealthGenie E2E Stack Orchestrator" -ForegroundColor Magenta
    Write-Host "========================================" -ForegroundColor Magenta
    Write-Host ""

    # Clean up any stale listeners first
    Kill-Port-Listeners

    # --- 1. Check MongoDB ---
    Write-Step "1/6 Checking MongoDB service..."
    $mongoSvc = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
    if (-not $mongoSvc -or $mongoSvc.Status -ne "Running") {
        Write-Err "MongoDB service is not running. Start it with: net start MongoDB"
        exit 1
    }
    Write-Ok "MongoDB service is running."

    # --- 2. Start Node Express Server ---
    Write-Step "2/6 Starting Node Express server (port 5000)..."
    if (-not (Test-Path (Join-Path $SERVER_DIR "node_modules"))) {
        Write-Info "Running npm install in server/..."
        Push-Location $SERVER_DIR
        npm install --prefer-offline 2>&1 | Out-Null
        Pop-Location
    }

    $script:serverProc = Start-Process -FilePath "node" -ArgumentList "server.js" `
        -WorkingDirectory $SERVER_DIR -PassThru -WindowStyle Hidden

    if (-not (Poll-Endpoint -Url "http://127.0.0.1:5000/health" -Label "Express Server" -TimeoutSec 30)) {
        Write-Err "Express server failed to start on port 5000."
        exit 1
    }

    # --- 3. Start FastAPI ML Service ---
    Write-Step "3/6 Starting FastAPI ml-service (port 8000)..."
    $script:mlProc = Start-Process -FilePath "python" `
        -ArgumentList "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory $ML_DIR -PassThru -WindowStyle Hidden

    if (-not (Poll-Endpoint -Url "http://127.0.0.1:8000/healthz" -Label "FastAPI ML Service" -TimeoutSec 90)) {
        Write-Err "ML service failed to start on port 8000."
        exit 1
    }

    # --- 4. Start Vite Dev Server ---
    Write-Step "4/6 Starting Vite dev server (port 5173)..."
    $script:viteProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "npx vite --host 127.0.0.1 --port 5173" `
        -WorkingDirectory $REACT_DIR -PassThru -WindowStyle Hidden

    if (-not (Poll-Endpoint -Url "http://localhost:5173" -Label "Vite Dev Server" -TimeoutSec 30)) {
        Write-Err "Vite dev server failed to start on port 5173."
        exit 1
    }

    # --- 5. Install Playwright browsers if needed ---
    Write-Step "5/6 Ensuring Playwright browsers are installed..."
    Push-Location $REACT_DIR
    npx playwright install chromium 2>&1 | Out-Null
    Pop-Location
    Write-Ok "Playwright browsers ready."

    # --- 6. Run Playwright Tests ---
    Write-Step "6/6 Running Playwright E2E tests..."
    Write-Host ""
    Write-Host "----------------------------------------" -ForegroundColor White
    Push-Location $REACT_DIR
    $env:CI = "true"
    npx playwright test --reporter=list 2>&1 | ForEach-Object { Write-Host $_ }
    $testExit = $LASTEXITCODE
    Pop-Location
    Write-Host "----------------------------------------" -ForegroundColor White
    Write-Host ""

    if ($testExit -eq 0) {
        Write-Ok "All Playwright E2E tests PASSED!"
    } else {
        Write-Err "Playwright E2E tests FAILED (exit code: $testExit)"
    }

    exit $testExit

} catch {
    Write-Err "Fatal error: $_"
    exit 1
} finally {
    Cleanup
}
