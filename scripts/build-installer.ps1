$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $root "build"
$binDir = Join-Path $buildDir "bin"
$installerDir = Join-Path $buildDir "installer"
$stagingDir = Join-Path $installerDir "staging"
$sourceExe = Join-Path $binDir "FocusTimer.exe"
$installerScript = Join-Path $root "installer\Install-FocusTimer.ps1"
$setupExe = Join-Path $installerDir "FocusTimerSetup.exe"
$sedPath = Join-Path $installerDir "FocusTimerSetup.sed"

$rootResolved = [System.IO.Path]::GetFullPath($root)
$installerResolved = [System.IO.Path]::GetFullPath($installerDir)
$stagingResolved = [System.IO.Path]::GetFullPath($stagingDir)

if (-not $installerResolved.StartsWith($rootResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Installer path escaped workspace: $installerResolved"
}
if (-not $stagingResolved.StartsWith($rootResolved, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Staging path escaped workspace: $stagingResolved"
}
if (-not (Test-Path -LiteralPath $sourceExe)) {
    throw "Build the app first. Missing: $sourceExe"
}
if (-not (Test-Path -LiteralPath $installerScript)) {
    throw "Missing installer script: $installerScript"
}

if (Test-Path -LiteralPath $stagingResolved) {
    Remove-Item -LiteralPath $stagingResolved -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingResolved -Force | Out-Null
New-Item -ItemType Directory -Path $installerResolved -Force | Out-Null

Copy-Item -LiteralPath $sourceExe -Destination (Join-Path $stagingResolved "FocusTimer.exe") -Force
Copy-Item -LiteralPath $installerScript -Destination (Join-Path $stagingResolved "Install-FocusTimer.ps1") -Force

$sed = @"
[Version]
Class=IEXPRESS
SEDVersion=3

[Options]
PackagePurpose=InstallApp
ShowInstallProgramWindow=0
HideExtractAnimation=1
UseLongFileName=1
InsideCompressed=0
CAB_FixedSize=0
CAB_ResvCodeSigning=0
RebootMode=N
InstallPrompt=
DisplayLicense=
FinishMessage=FocusTimer has been installed.
TargetName=$setupExe
FriendlyName=FocusTimer Setup
AppLaunched=powershell.exe -NoProfile -ExecutionPolicy Bypass -File Install-FocusTimer.ps1
PostInstallCmd=<None>
AdminQuietInstCmd=
UserQuietInstCmd=
SourceFiles=SourceFiles

[Strings]
FILE0="FocusTimer.exe"
FILE1="Install-FocusTimer.ps1"

[SourceFiles]
SourceFiles0=$stagingResolved

[SourceFiles0]
%FILE0%=
%FILE1%=
"@

Set-Content -LiteralPath $sedPath -Value $sed -Encoding ASCII

$iexpress = Join-Path $env:WINDIR "system32\iexpress.exe"
if (-not (Test-Path -LiteralPath $iexpress)) {
    throw "IExpress was not found at $iexpress"
}

Start-Process -FilePath $iexpress -ArgumentList "/N `"$sedPath`"" -Wait -NoNewWindow

if (-not (Test-Path -LiteralPath $setupExe)) {
    throw "Installer was not created: $setupExe"
}

Write-Host "Installer created at $setupExe"
