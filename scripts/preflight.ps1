# scripts/preflight.ps1 - Read-only environment check for EVault
$ErrorActionPreference = "Continue"

$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $projectRoot "package.json"))) {
    $projectRoot = (Get-Location).Path
}

$failCount = 0

function Report-Check {
    param(
        [int]$ItemNumber,
        [string]$Description,
        [bool]$Passed,
        [string]$Reason
    )
    if ($Passed) {
        Write-Host "PASS: (Item $ItemNumber) $Description - $Reason" -ForegroundColor Green
    } else {
        Write-Host "FAIL: (Item $ItemNumber) $Description - $Reason" -ForegroundColor Red
        $script:failCount++
    }
}

# (1) Port 8545 answers and eth_chainId is 0x7a69
$item1Passed = $false
$item1Reason = ""
try {
    $rpcRes = Invoke-RestMethod -Uri "http://127.0.0.1:8545" -Method Post -ContentType "application/json" -Body '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' -TimeoutSec 3 -ErrorAction Stop
    if ($rpcRes.result -eq "0x7a69") {
        $item1Passed = $true
        $item1Reason = "port 8545 answered and eth_chainId is 0x7a69 (Hardhat local 31337)"
    } else {
        $item1Reason = "port 8545 answered but eth_chainId was '$($rpcRes.result)' (expected 0x7a69)"
    }
} catch {
    $item1Reason = "port 8545 did not respond or connection refused ($($_.Exception.Message))"
}
Report-Check 1 "Hardhat RPC on port 8545" $item1Passed $item1Reason

# Parse backend/.env for CONTRACT_ADDRESS (without printing any secrets)
$backendEnvPath = Join-Path $projectRoot "backend\.env"
$backendContractAddress = $null

if (Test-Path $backendEnvPath) {
    $envLines = Get-Content $backendEnvPath
    foreach ($line in $envLines) {
        $trimmed = $line.Trim()
        if ($trimmed -match '^CONTRACT_ADDRESS\s*=\s*(.+)$') {
            $backendContractAddress = $matches[1].Trim()
            break
        }
    }
}

# (2) CONTRACT_ADDRESS from backend/.env has non-empty code (eth_getCode)
$item2Passed = $false
$item2Reason = ""
if (-not (Test-Path $backendEnvPath)) {
    $item2Reason = "backend/.env file not found"
} elseif ([string]::IsNullOrWhiteSpace($backendContractAddress)) {
    $item2Reason = "CONTRACT_ADDRESS not found in backend/.env"
} else {
    try {
        $bodyJson = @{
            jsonrpc = "2.0"
            method  = "eth_getCode"
            params  = @($backendContractAddress, "latest")
            id      = 1
        } | ConvertTo-Json
        $codeRes = Invoke-RestMethod -Uri "http://127.0.0.1:8545" -Method Post -ContentType "application/json" -Body $bodyJson -TimeoutSec 3 -ErrorAction Stop
        $code = $codeRes.result
        if ($code -and $code -ne "0x" -and $code.Length -gt 2) {
            $item2Passed = $true
            $item2Reason = "contract at $backendContractAddress has non-empty code"
        } else {
            $item2Reason = "no deployed contract bytecode at $backendContractAddress (eth_getCode returned '0x')"
        }
    } catch {
        $item2Reason = "failed to query eth_getCode on port 8545 ($($_.Exception.Message))"
    }
}
Report-Check 2 "Contract deployment code (eth_getCode)" $item2Passed $item2Reason

# (3) Address in lib/contract.json equals backend/.env CONTRACT_ADDRESS, case-insensitive
$item3Passed = $false
$item3Reason = ""
$libContractPath = Join-Path $projectRoot "lib\contract.json"

if (-not (Test-Path $libContractPath)) {
    $item3Reason = "lib/contract.json file not found"
} elseif ([string]::IsNullOrWhiteSpace($backendContractAddress)) {
    $item3Reason = "backend/.env CONTRACT_ADDRESS is missing; cannot compare"
} else {
    try {
        $contractJson = Get-Content $libContractPath -Raw | ConvertFrom-Json
        $frontendAddress = $contractJson.address
        if ([string]::IsNullOrWhiteSpace($frontendAddress)) {
            $item3Reason = "address property missing or empty in lib/contract.json"
        } elseif ($frontendAddress.Trim().ToLower() -eq $backendContractAddress.Trim().ToLower()) {
            $item3Passed = $true
            $item3Reason = "lib/contract.json address equals backend/.env CONTRACT_ADDRESS ($frontendAddress)"
        } else {
            $item3Reason = "mismatch between lib/contract.json ($frontendAddress) and backend/.env ($backendContractAddress)"
        }
    } catch {
        $item3Reason = "failed to parse lib/contract.json ($($_.Exception.Message))"
    }
}
Report-Check 3 "Contract address sync (lib/contract.json vs backend/.env)" $item3Passed $item3Reason

# (4) curl.exe http://localhost:3001/health returns ok
$item4Passed = $false
$item4Reason = ""
try {
    $healthRes = & curl.exe -s --max-time 3 http://localhost:3001/health
    if ($healthRes -and $healthRes.Trim() -eq "ok") {
        $item4Passed = $true
        $item4Reason = "http://localhost:3001/health responded with 'ok'"
    } else {
        $item4Reason = "http://localhost:3001/health response was '$healthRes' (expected 'ok')"
    }
} catch {
    $item4Reason = "curl.exe failed to reach http://localhost:3001/health ($($_.Exception.Message))"
}
Report-Check 4 "Backend health check (http://localhost:3001/health)" $item4Passed $item4Reason

# (5) Postgres container from backend/docker-compose.yml is running
$item5Passed = $false
$item5Reason = ""
$dockerComposeFile = Join-Path $projectRoot "backend\docker-compose.yml"
try {
    $composeOutput = & docker compose -f $dockerComposeFile ps 2>&1 | Out-String
    if ($composeOutput -match "evault-postgres" -and $composeOutput -match "(Up|running)") {
        $item5Passed = $true
        $item5Reason = "Postgres container is running (evault-postgres)"
    } else {
        $item5Reason = "Postgres container is not running in backend/docker-compose.yml"
    }
} catch {
    $item5Reason = "docker compose failed to inspect postgres container ($($_.Exception.Message))"
}
Report-Check 5 "Postgres container status" $item5Passed $item5Reason

# (6) Port 3000 is listening (the SIWE domain is hardcoded to localhost:3000)
$item6Passed = $false
$item6Reason = ""
try {
    $tcp = New-Object System.Net.Sockets.TcpClient
    $iar = $tcp.BeginConnect("127.0.0.1", 3000, $null, $null)
    $connected = $iar.AsyncWaitHandle.WaitOne(2000, $false)
    if ($connected -and $tcp.Connected) {
        $tcp.EndConnect($iar)
        $tcp.Close()
        $item6Passed = $true
        $item6Reason = "port 3000 is listening (localhost:3000 SIWE domain)"
    } else {
        $tcp.Close()
        $item6Reason = "port 3000 is not listening or connection timed out"
    }
} catch {
    $item6Reason = "failed to connect to port 3000 ($($_.Exception.Message))"
}
Report-Check 6 "Frontend port listening (port 3000)" $item6Passed $item6Reason

if ($failCount -gt 0) {
    Write-Host "`nPreflight check failed: $failCount item(s) failed." -ForegroundColor Red
    exit 1
} else {
    Write-Host "`nPreflight check passed: all 6 items OK." -ForegroundColor Green
    exit 0
}
