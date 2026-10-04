# scripts/dev-up.ps1 - Start the local EVault dev stack
[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = "Continue"

$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $projectRoot "package.json"))) {
    $projectRoot = (Get-Location).Path
}
$backendDir = Join-Path $projectRoot "backend"
$backendEnvPath = Join-Path $backendDir ".env"
$preflightScript = Join-Path $PSScriptRoot "preflight.ps1"

function Get-PortOwnerProcess {
    param([int]$Port)
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn) {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            return @{
                Pid  = $conn.OwningProcess
                Name = if ($proc) { $proc.ProcessName } else { "Unknown" }
            }
        }
    } catch {}

    $netstat = netstat -ano | Select-String ":$Port\s+.*LISTENING\s+(\d+)"
    if ($netstat) {
        if ($netstat.Matches[0].Groups[1].Value) {
            $pidVal = [int]$netstat.Matches[0].Groups[1].Value
            $proc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
            return @{
                Pid  = $pidVal
                Name = if ($proc) { $proc.ProcessName } else { "Unknown" }
            }
        }
    }
    return $null
}

if ($DryRun) {
    Write-Host "`n=== [DRY-RUN] EVault dev-up preview (no actions performed) ===`n" -ForegroundColor Yellow

    Write-Host "Step 1 (Port conflict check):" -ForegroundColor Cyan
    Write-Host "  Action: Inspect listening ports 8545, 3001, 3000 to ensure they are free."
    foreach ($port in @(8545, 3001, 3000)) {
        $owner = Get-PortOwnerProcess -Port $port
        if ($owner) {
            Write-Host "  Status: Port $port is currently in use by process '$($owner.Name)' (PID $($owner.Pid)). In real mode without ports free, dev-up will refuse to start and exit 1." -ForegroundColor DarkYellow
        } else {
            Write-Host "  Status: Port $port is free." -ForegroundColor Green
        }
    }

    Write-Host "`nStep 2 (Hardhat Node):" -ForegroundColor Cyan
    Write-Host "  Action: Launch 'npx hardhat node' in a new PowerShell window."
    Write-Host "  Window Command: powershell -NoExit -Command `"cd '$projectRoot'; npx hardhat node`""
    Write-Host "  Wait: Poll http://127.0.0.1:8545 (eth_chainId) until responsive."

    Write-Host "`nStep 3 (Smart Contract Deployment):" -ForegroundColor Cyan
    Write-Host "  Action: Run 'npm run deploy:local' in repository root."
    Write-Host "  Output: Read deployed contract address using regex 'deployed to:\s*(0x[a-fA-F0-9]{40})'."

    Write-Host "`nStep 4 (Backend Environment Sync):" -ForegroundColor Cyan
    Write-Host "  Action: Update ONLY the line matching '(?m)^CONTRACT_ADDRESS[ \t]*=[^\r\n]*' in backend/.env (preserves byte encoding and line endings, writes with no BOM; prints 'backend/.env already up to date' if unchanged)."
    Write-Host "  File Edit: backend/.env -> CONTRACT_ADDRESS=<deployed_address>"

    Write-Host "`nStep 5 (Database Startup):" -ForegroundColor Cyan
    Write-Host "  Action: Run 'docker compose up -d' in backend/ directory."
    Write-Host "  Wait: Poll 'docker inspect --format ''{{.State.Health.Status}}'' evault-postgres' until 'healthy' (60s timeout)."

    Write-Host "`nStep 6 (Backend API Server):" -ForegroundColor Cyan
    Write-Host "  Action: Launch 'cargo run' in backend/ directory in a new PowerShell window."
    Write-Host "  Window Command: powershell -NoExit -Command `"cd '$backendDir'; cargo run`""
    Write-Host "  Wait: Poll http://localhost:3001/health until response is 'ok'."

    Write-Host "`nStep 7 (Frontend Next.js Dev Server):" -ForegroundColor Cyan
    Write-Host "  Action: Launch 'npm run dev' from repo root in a new PowerShell window."
    Write-Host "  Window Command: powershell -NoExit -Command `"cd '$projectRoot'; npm run dev`""
    Write-Host "  Wait: Poll TCP connection on 127.0.0.1:3000 until responsive (60s timeout)."

    Write-Host "`nStep 8 (Preflight Verification):" -ForegroundColor Cyan
    Write-Host "  Action: Execute 'scripts/preflight.ps1' to verify all 6 environment requirements."

    Write-Host "`nStep 9 (Post-Startup Reminder):" -ForegroundColor Cyan
    Write-Host "  Action: Print post-startup reminder:"
    Write-Host "    - Clear MetaMask's nonce data for each account you use: Settings > Developer tools > Delete activity and nonce data."
    Write-Host "    - If vault lists look wrong, dev database may hold rows from an earlier chain run."
    Write-Host "    - To reset dev database data: cd backend; docker compose down -v; docker compose up -d"

    Write-Host "`n=== [DRY-RUN COMPLETE] ===`n" -ForegroundColor Yellow
    exit 0
}

# ==============================================================================
# REAL STARTUP
# ==============================================================================

# Step 1: Port conflict check
Write-Host "Step 1: Checking for port conflicts on 8545, 3001, 3000..." -ForegroundColor Cyan
$conflictFound = $false
foreach ($port in @(8545, 3001, 3000)) {
    $owner = Get-PortOwnerProcess -Port $port
    if ($owner) {
        Write-Host "Error: Port $port is already in use by process '$($owner.Name)' (PID $($owner.Pid))." -ForegroundColor Red
        $conflictFound = $true
    }
}
if ($conflictFound) {
    Write-Host "`nRefusing to start: Conflicting ports are in use. Stop the owning processes and retry." -ForegroundColor Red
    exit 1
}
Write-Host "All required ports (8545, 3001, 3000) are free." -ForegroundColor Green

# Step 2: Start Hardhat Node
Write-Host "`nStep 2: Starting Hardhat node (port 8545)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot'; Write-Host '--- Hardhat Node (port 8545) ---' -ForegroundColor Cyan; npx hardhat node"

$hardhatReady = $false
$maxAttempts = 30
for ($i = 1; $i -le $maxAttempts; $i++) {
    Start-Sleep -Seconds 1
    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:8545" -Method Post -ContentType "application/json" -Body '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($res.result -eq "0x7a69") {
            $hardhatReady = $true
            break
        }
    } catch {}
}
if (-not $hardhatReady) {
    Write-Host "Error in Step 2: Timed out waiting for Hardhat node on port 8545." -ForegroundColor Red
    exit 1
}
Write-Host "Hardhat node is ready (chainId 0x7a69)." -ForegroundColor Green

# Step 3: Deploy contract locally
Write-Host "`nStep 3: Deploying contract via npm run deploy:local..." -ForegroundColor Cyan
$deployOutput = & npm.cmd run deploy:local 2>&1 | Out-String
Write-Host $deployOutput
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error in Step 3: npm run deploy:local failed with exit code $LASTEXITCODE." -ForegroundColor Red
    exit 1
}
$deployedAddress = $null
if ($deployOutput -match 'deployed to:\s*(0x[a-fA-F0-9]{40})') {
    $deployedAddress = $Matches[1]
} else {
    Write-Host "Error in Step 3: Could not parse deployed address using regex 'deployed to:\s*(0x[a-fA-F0-9]{40})' from deploy:local output." -ForegroundColor Red
    exit 1
}
Write-Host "Contract deployed at: $deployedAddress" -ForegroundColor Green

# Step 4: Update ONLY CONTRACT_ADDRESS in backend/.env (byte-safe, no BOM)
Write-Host "`nStep 4: Updating CONTRACT_ADDRESS in backend/.env..." -ForegroundColor Cyan
if (-not (Test-Path $backendEnvPath)) {
    Write-Host "Error in Step 4: backend/.env file not found." -ForegroundColor Red
    exit 1
}
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$envText = [System.IO.File]::ReadAllText($backendEnvPath, $utf8NoBom)
$exactTargetLine = "CONTRACT_ADDRESS=$deployedAddress"

if ($envText -match '(?m)^CONTRACT_ADDRESS[ \t]*=[ \t]*' + [regex]::Escape($deployedAddress) + '[ \t]*(\r?)$') {
    Write-Host "backend/.env already up to date" -ForegroundColor Green
} elseif ($envText -match '(?m)^CONTRACT_ADDRESS[ \t]*=[^\r\n]*') {
    $newText = [regex]::Replace($envText, '(?m)^CONTRACT_ADDRESS[ \t]*=[^\r\n]*', $exactTargetLine)
    [System.IO.File]::WriteAllText($backendEnvPath, $newText, $utf8NoBom)
    Write-Host "Updated CONTRACT_ADDRESS in backend/.env to $deployedAddress" -ForegroundColor Green
} else {
    Write-Host "Error in Step 4: Could not find CONTRACT_ADDRESS line in backend/.env to replace." -ForegroundColor Red
    exit 1
}

# Step 5: Start Postgres via docker compose up -d
Write-Host "`nStep 5: Starting Postgres via docker compose in backend/..." -ForegroundColor Cyan
Push-Location $backendDir
try {
    $composeUp = & docker compose up -d 2>&1
    Write-Host ($composeUp | Out-String)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error in Step 5: docker compose up -d failed with exit code $LASTEXITCODE." -ForegroundColor Red
        exit 1
    }
} finally {
    Pop-Location
}

$postgresHealthy = $false
$maxPgAttempts = 60
for ($i = 1; $i -le $maxPgAttempts; $i++) {
    Start-Sleep -Seconds 1
    $healthStatus = (& docker inspect --format '{{.State.Health.Status}}' evault-postgres 2>&1 | Out-String).Trim()
    if ($healthStatus -eq "healthy") {
        $postgresHealthy = $true
        break
    }
}
if (-not $postgresHealthy) {
    Write-Host "Error in Step 5: Timed out waiting for Postgres container (evault-postgres) to become healthy (status was '$healthStatus')." -ForegroundColor Red
    exit 1
}
Write-Host "Postgres is healthy." -ForegroundColor Green

# Step 6: Start backend via cargo run
Write-Host "`nStep 6: Starting backend via cargo run (port 3001)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; Write-Host '--- EVault Backend (port 3001) ---' -ForegroundColor Cyan; cargo run"

$backendReady = $false
$maxBackendAttempts = 40
for ($i = 1; $i -le $maxBackendAttempts; $i++) {
    Start-Sleep -Seconds 1
    try {
        $health = & curl.exe -s --max-time 2 http://localhost:3001/health 2>&1 | Out-String
        if ($health -and $health.Trim() -eq "ok") {
            $backendReady = $true
            break
        }
    } catch {}
}
if (-not $backendReady) {
    Write-Host "Error in Step 6: Timed out waiting for backend on http://localhost:3001/health." -ForegroundColor Red
    exit 1
}
Write-Host "Backend is healthy (http://localhost:3001/health returned 'ok')." -ForegroundColor Green

# Step 7: Start Next.js frontend via npm run dev and wait for port 3000
Write-Host "`nStep 7: Starting Next.js frontend via npm run dev (port 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot'; Write-Host '--- Next.js Frontend (port 3000) ---' -ForegroundColor Cyan; npm run dev"

$frontendReady = $false
$maxFrontendAttempts = 60
for ($i = 1; $i -le $maxFrontendAttempts; $i++) {
    Start-Sleep -Seconds 1
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", 3000, $null, $null)
        $connected = $iar.AsyncWaitHandle.WaitOne(1000, $false)
        if ($connected -and $tcp.Connected) {
            $tcp.EndConnect($iar)
            $tcp.Close()
            $frontendReady = $true
            break
        }
        $tcp.Close()
    } catch {}
}
if (-not $frontendReady) {
    Write-Host "Error in Step 7: Timed out waiting for frontend on port 3000." -ForegroundColor Red
    exit 1
}
Write-Host "Frontend is listening on port 3000." -ForegroundColor Green

# Step 8: Run preflight script
Write-Host "`nStep 8: Running preflight checks..." -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -File $preflightScript
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error in Step 8: Preflight check reported failures." -ForegroundColor Red
    exit 1
}

# Step 9: Post-startup reminder
Write-Host "`n================================================================================" -ForegroundColor Yellow
Write-Host "DEV STACK IS READY!" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Yellow
Write-Host "Reminder:" -ForegroundColor Yellow
Write-Host "  * Clear MetaMask's nonce data for each account you use: Settings > Developer tools > Delete activity and nonce data."
Write-Host "  * If vault lists look wrong, the dev database may still hold rows from an"
Write-Host "    earlier chain run. You can reset dev database data with:"
Write-Host "      cd backend; docker compose down -v; docker compose up -d"
Write-Host "    (The database is not reset automatically)."
Write-Host "================================================================================`n" -ForegroundColor Yellow
