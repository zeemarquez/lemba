function Get-CurrentCommitHash {
    return (git rev-parse HEAD).Trim()
}

function Get-BuildHistory {
    $HistoryFile = Join-Path $PSScriptRoot "..\build-history.json"
    if (Test-Path $HistoryFile) {
        return Get-Content $HistoryFile | ConvertFrom-Json
    }
    return @{}
}

function Save-BuildHistory {
    param($History)
    $HistoryFile = Join-Path $PSScriptRoot "..\build-history.json"
    $History | ConvertTo-Json -Depth 10 | Set-Content $HistoryFile
}

function Increment-Version {
    param([string]$version)
    $parts = $version.Split('.')
    if ($parts.Count -ne 3) { return $version }
    $patch = [int]$parts[2] + 1
    return "$($parts[0]).$($parts[1]).$patch"
}

function Update-PackageVersion {
    param([string]$newVersion)
    $packagePath = Join-Path $PSScriptRoot "..\package.json"
    $package = Get-Content $packagePath | ConvertFrom-Json
    $package.version = $newVersion
    $package | ConvertTo-Json -Depth 100 | Set-Content $packagePath
}

function Get-PackageVersion {
    $packagePath = Join-Path $PSScriptRoot "..\package.json"
    $package = Get-Content $packagePath | ConvertFrom-Json
    return $package.version
}
# Utility functions for build scripts
