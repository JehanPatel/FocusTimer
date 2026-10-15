$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "frontend\src"
$dist = Join-Path $root "frontend\dist"

$rootResolved = [System.IO.Path]::GetFullPath($root)
$srcResolved = [System.IO.Path]::GetFullPath($src)
$distResolved = [System.IO.Path]::GetFullPath($dist)

if (-not $srcResolved.StartsWith($rootResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Source path escaped workspace: $srcResolved"
}

if (-not $distResolved.StartsWith($rootResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Dist path escaped workspace: $distResolved"
}

if (-not (Test-Path -LiteralPath $srcResolved)) {
    throw "Missing frontend source: $srcResolved"
}

if (Test-Path -LiteralPath $distResolved) {
    Remove-Item -LiteralPath $distResolved -Recurse -Force
}

New-Item -ItemType Directory -Path $distResolved | Out-Null
Copy-Item -LiteralPath (Join-Path $srcResolved "index.html") -Destination $distResolved
Copy-Item -LiteralPath (Join-Path $srcResolved "styles.css") -Destination $distResolved
Copy-Item -LiteralPath (Join-Path $srcResolved "app.js") -Destination $distResolved

Write-Host "Frontend built at $distResolved"

