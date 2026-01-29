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
function Load-EnvFile {
    param([string]$path)
    if (Test-Path $path) {
        Write-Host "Loading environment variables from $path..." -ForegroundColor Gray
        foreach ($line in Get-Content $path) {
            if ($line -match "^([^#=]+)=(.*)$") {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim().Trim("'").Trim('"')
                if ($key) {
                    [System.Environment]::SetEnvironmentVariable($key, $value)
                    # Also set it in the current process for immediate use
                    $env:$key = $value
                }
            }
        }
    }
}

# Utility functions for build scripts
