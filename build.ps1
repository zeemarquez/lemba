[CmdletBinding()]
param(
    [string]$Version
)

$scriptDir = $PSScriptRoot
if (-not $scriptDir) { $scriptDir = "." }
. "$scriptDir\scripts\build-utils.ps1"
Load-EnvFile (Join-Path $scriptDir ".env.local")

Write-Host ">>> Starting Multi-Platform Build <<<" -ForegroundColor Cyan

$currentHash = Get-CurrentCommitHash
$history = Get-BuildHistory
$currentPkgVersion = Get-PackageVersion

# Determine which platforms need building
$buildWin = $true
$buildMac = $true

if (-not $Version) {
    if ($history.win -and $history.win.hash -eq $currentHash) {
        Write-Host "[SKIP] Windows: Hash $currentHash already built (v$($history.win.version))." -ForegroundColor Cyan
        $buildWin = $false
    }
    if ($history.mac -and $history.mac.hash -eq $currentHash) {
        Write-Host "[SKIP] macOS: Hash $currentHash already built (v$($history.mac.version))." -ForegroundColor Cyan
        $buildMac = $false
    }
} else {
    Write-Host "Force building version $Version as requested." -ForegroundColor Yellow
}

if (-not $buildWin -and -not $buildMac) {
    Write-Host "Nothing to build. All platforms are up to date with commit $currentHash." -ForegroundColor Green
    exit 0
}

# Handle Versioning
$targetVersion = if ($Version) { $Version } else { Increment-Version $currentPkgVersion }
Write-Host "Build Version: $targetVersion" -ForegroundColor Gray

if ($targetVersion -ne $currentPkgVersion) {
    Update-PackageVersion $targetVersion
}

$verboseFlag = if ($PSBoundParameters['Verbose']) { "-Verbose" } else { "" }
$versionArg = "-Version $targetVersion"

$winJob = $null
$macJob = $null

if ($buildWin) {
    Write-Host "[INIT] Starting Windows build job..." -ForegroundColor Gray
    $winJob = Start-Job -ScriptBlock {
        param($path, $v, $ver)
        Set-Location $path
        Invoke-Expression ".\build-win.ps1 $v $ver"
    } -ArgumentList $scriptDir, $verboseFlag, $versionArg
}

if ($buildMac) {
    Write-Host "[INIT] Starting macOS build job..." -ForegroundColor Gray
    $macJob = Start-Job -ScriptBlock {
        param($path, $v, $ver)
        Set-Location $path
        Invoke-Expression ".\build-mac.ps1 -Branch 'main' $v $ver"
    } -ArgumentList $scriptDir, $verboseFlag, $versionArg
}

Write-Host "Running builds..." -ForegroundColor Gray

$winDone = if ($winJob) { $false } else { $true }
$macDone = if ($macJob) { $false } else { $true }

while (-not ($winDone -and $macDone)) {
    if ($winJob) {
        $winLogs = Receive-Job -Job $winJob
        foreach ($log in $winLogs) {
            if ($PSBoundParameters['Verbose']) {
                Write-Host "[WIN] $log" -ForegroundColor White
            } elseif ($log -match "Building|Running|success|failed") {
                Write-Host "[WIN] $log" -ForegroundColor White
            }
        }
        if ($winJob.State -ne "Running") { $winDone = $true }
    }

    if ($macJob) {
        $macLogs = Receive-Job -Job $macJob
        foreach ($log in $macLogs) {
            if ($PSBoundParameters['Verbose']) {
                Write-Host "[MAC] $log" -ForegroundColor Cyan
            } elseif ($log -match "Building|Waiting|success|failed") {
                Write-Host "[MAC] $log" -ForegroundColor Cyan
            }
        }
        if ($macJob.State -ne "Running") { $macDone = $true }
    }

    Start-Sleep -Seconds 2
}

# Final result analysis
Write-Host "----------------------------------------------" -ForegroundColor Gray
$winFinal = if ($winJob) { Get-Job -Id $winJob.Id } else { $null }
$macFinal = if ($macJob) { Get-Job -Id $macJob.Id } else { $null }

$winSuccess = if ($winJob) { $winFinal.State -eq "Completed" } else { $true }
$macSuccess = if ($macJob) { $macFinal.State -eq "Completed" } else { $true }

# Cleanup
if ($winJob) { Remove-Job $winJob }
if ($macJob) { Remove-Job $macJob }

if ($winSuccess -and $macSuccess) {
    Write-Host "==============================================" -ForegroundColor Green
    Write-Host "   ALL BUILDS COMPLETED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "   Artifacts: dist/win/ and dist/mac/" -ForegroundColor Green
    Write-Host "==============================================" -ForegroundColor Green
} else {
    Write-Host "==============================================" -ForegroundColor Red
    Write-Host "   SOME BUILDS FAILED. CHECK LOGS ABOVE." -ForegroundColor Red
    Write-Host "==============================================" -ForegroundColor Red
    exit 1
}
