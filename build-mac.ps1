[CmdletBinding()]
param(
    [string]$Branch = "main",
    [string]$Version
)

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
. "$scriptDir\scripts\build-utils.ps1"

$currentHash = Get-CurrentCommitHash
$history = Get-BuildHistory
$lastMacHash = if ($history.mac) { $history.mac.hash } else { $null }

if ($currentHash -eq $lastMacHash -and -not $Version) {
    Write-Host "macOS build skipped: Commit hash matches latest build ($currentHash)." -ForegroundColor Cyan
    exit 0
}

Write-Host "Building macOS (Remote)..." -ForegroundColor Cyan

# Versioning (Local record)
$currentPkgVersion = Get-PackageVersion
$targetVersion = if ($Version) { $Version } else { Increment-Version $currentPkgVersion }
Write-Host "Target Version: $targetVersion" -ForegroundColor Gray
Update-PackageVersion $targetVersion

# Check if authenticated
Write-Verbose "Checking GitHub CLI authentication..."
$null = gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "GitHub CLI is not authenticated. Please run 'gh auth login'."
    exit 1
}

# 1. Trigger the workflow
Write-Verbose "Triggering 'build-electron.yml' on branch '$Branch'..."
$null = gh workflow run build-electron.yml --ref $Branch 2>$null
if ($LASTEXITCODE -ne 0) { 
    Write-Error "Failed to trigger GitHub workflow." 
    exit 1
}

# 2. Get the ID of the run we just started
Write-Verbose "Waiting for run to appear in GitHub..."
Start-Sleep -Seconds 8 
$runId = gh run list --workflow build-electron.yml --branch $Branch --limit 1 --json databaseId --jq '.[0].databaseId' 2>$null

if (-not $runId) {
    Write-Error "Could not find the triggered run ID."
    exit 1
}

Write-Verbose "Detected Run ID: $runId"

# 3. Wait for the run to complete
Write-Host "Waiting for GitHub Action..." -ForegroundColor Yellow
$status = "queued"
$startTime = Get-Date

while ($status -ne "completed") {
    $runInfo = gh run view $runId --json status,conclusion 2>$null | ConvertFrom-Json
    if ($runInfo) {
        $status = $runInfo.status
        $conclusion = $runInfo.conclusion
    }
    
    if ($PSBoundParameters['Verbose']) {
        $elapsed = (Get-Date) - $startTime
        Write-Host "      Status: $status | Time elapsed: $("{0:mm}:{0:ss}" -f $elapsed)" -ForegroundColor Gray
    }
    
    if ($status -ne "completed") {
        Start-Sleep -Seconds 30
    }
}

if ($conclusion -ne "success") {
    if (-not $PSBoundParameters['Verbose']) {
        Write-Host "GitHub Action failed: $conclusion." -ForegroundColor Red
    }
    exit 1
}

# 4. Download the artifacts
Write-Verbose "Downloading artifacts..."
$macDist = Join-Path "dist" "mac"
if (Test-Path $macDist) {
    Remove-Item -Path $macDist -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $macDist -Force | Out-Null

$tempDir = Join-Path "dist" "mac-temp"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Path $tempDir | Out-Null

$null = gh run download $runId -n electron-macos -D $tempDir 2>$null

# 5. Move files to dist/mac and cleanup
Get-ChildItem -Path $tempDir -Include "*.dmg", "*.zip" -Recurse | ForEach-Object {
    $dest = Join-Path $macDist $_.Name
    Move-Item -Path $_.FullName -Destination $dest -Force
    Write-Verbose "Downloaded: $($_.Name)"
}

Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

# Save History
$history.mac = @{
    hash = $currentHash
    version = $targetVersion
    date = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
}
Save-BuildHistory $history

Write-Host "macOS build success (v$targetVersion)." -ForegroundColor Green
