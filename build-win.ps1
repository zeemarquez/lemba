[CmdletBinding()]
param(
    [string]$Version
)

$scriptDir = $PSScriptRoot
. "$scriptDir\scripts\build-utils.ps1"

$currentHash = Get-CurrentCommitHash
$history = Get-BuildHistory
$lastWinHash = if ($history.win) { $history.win.hash } else { $null }

if ($currentHash -eq $lastWinHash -and -not $Version) {
    Write-Host "Windows build skipped: Commit hash matches latest build ($currentHash)." -ForegroundColor Cyan
    exit 0
}

# Load environment variables
Load-EnvFile (Join-Path $scriptDir ".env.local")

# Check required variables
$requiredVars = @(
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "NEXT_PUBLIC_AUTH_HANDLER_URL"
)

$missingVars = @()
foreach ($var in $requiredVars) {
    if (-not $env:$var) { $missingVars += $var }
}

if ($missingVars.Count -gt 0) {
    Write-Host "Warning: The following environment variables are missing:" -ForegroundColor Yellow
    foreach ($var in $missingVars) { Write-Host "  - $var" -ForegroundColor Yellow }
    Write-Host "Cloud sync will NOT work in this build." -ForegroundColor Yellow
    
    $choice = Read-Host "Do you want to proceed anyway? (y/n)"
    if ($choice -ne "y") { exit 1 }
}

Write-Host "Building Windows exe..." -ForegroundColor Cyan

# Versioning
$currentPkgVersion = Get-PackageVersion
$targetVersion = if ($Version) { $Version } else { Increment-Version $currentPkgVersion }
Write-Host "Target Version: $targetVersion" -ForegroundColor Gray
Update-PackageVersion $targetVersion

# Clean and Prep
$winDist = Join-Path "dist" "win"
if (Test-Path $winDist) {
    Remove-Item -Path $winDist -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $winDist -Force | Out-Null

Write-Verbose "Installing dependencies..."
if ($PSBoundParameters['Verbose']) {
    npm install
} else {
    npm install --quiet --no-progress 2>$null
}

Write-Host "Running electron builder (Windows)..." -ForegroundColor Yellow
$buildCmd = "npm run electron:build:win"
if ($PSBoundParameters['Verbose']) {
    Invoke-Expression $buildCmd
} else {
    Invoke-Expression "$buildCmd 2>`$null"
}

if ($LASTEXITCODE -eq 0) {
    # Move artifacts to dist/win
    Write-Verbose "Organizing artifacts..."
    Get-ChildItem -Path "dist" -Exclude "win", "mac" | Move-Item -Destination $winDist -Force -ErrorAction SilentlyContinue
    
    # Save History
    $history.win = @{
        hash = $currentHash
        version = $targetVersion
        date = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    }
    Save-BuildHistory $history
    
    Write-Host "Windows build success (v$targetVersion)." -ForegroundColor Green
} else {
    if (-not $PSBoundParameters['Verbose']) {
        Write-Host "Windows build failed. Run with -Verbose for details." -ForegroundColor Red
    }
    exit $LASTEXITCODE
}
