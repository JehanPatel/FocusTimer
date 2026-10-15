$ErrorActionPreference = "Stop"

$appName = "FocusTimer"
$exeName = "FocusTimer.exe"
$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourceExe = Join-Path $sourceDir $exeName

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-WebView2Runtime {
    $clientId = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
    $paths = @(
        "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$clientId",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\$clientId",
        "HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\$clientId"
    )

    foreach ($path in $paths) {
        if (Test-Path -LiteralPath $path) {
            return $true
        }
    }
    return $false
}

function Install-WebView2Runtime {
    if (Test-WebView2Runtime) {
        return
    }

    $installer = Join-Path $env:TEMP "MicrosoftEdgeWebView2Setup.exe"
    $uri = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"

    try {
        Invoke-WebRequest -Uri $uri -OutFile $installer -UseBasicParsing
    } catch {
        $client = New-Object System.Net.WebClient
        $client.DownloadFile($uri, $installer)
    }

    Start-Process -FilePath $installer -ArgumentList "/silent /install" -Wait
}

function New-Shortcut {
    param(
        [Parameter(Mandatory = $true)] [string] $Path,
        [Parameter(Mandatory = $true)] [string] $Target,
        [Parameter(Mandatory = $true)] [string] $WorkingDirectory,
        [string] $Icon,
        [string] $Arguments
    )

    $folder = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $folder -Force | Out-Null

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($Path)
    $shortcut.TargetPath = $Target
    $shortcut.WorkingDirectory = $WorkingDirectory
    if ($Arguments) {
        $shortcut.Arguments = $Arguments
    }
    if ($Icon) {
        $shortcut.IconLocation = $Icon
    }
    $shortcut.Save()
}

if (-not (Test-Path -LiteralPath $sourceExe)) {
    throw "Missing installer payload: $sourceExe"
}

$installDir = if (Test-Administrator) {
    Join-Path $env:ProgramFiles $appName
} else {
    Join-Path $env:LOCALAPPDATA "Programs\$appName"
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item -LiteralPath $sourceExe -Destination (Join-Path $installDir $exeName) -Force

Install-WebView2Runtime

$installedExe = Join-Path $installDir $exeName
$startMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$appName"
$desktopDir = [Environment]::GetFolderPath("Desktop")

New-Shortcut -Path (Join-Path $startMenuDir "$appName.lnk") -Target $installedExe -WorkingDirectory $installDir -Icon $installedExe
New-Shortcut -Path (Join-Path $desktopDir "$appName.lnk") -Target $installedExe -WorkingDirectory $installDir -Icon $installedExe

$uninstallPath = Join-Path $installDir "Uninstall-FocusTimer.ps1"
$uninstallScript = @"
`$ErrorActionPreference = "SilentlyContinue"
Remove-Item -LiteralPath "$($startMenuDir.Replace('"', '""'))" -Recurse -Force
Remove-Item -LiteralPath "$((Join-Path $desktopDir "$appName.lnk").Replace('"', '""'))" -Force
Start-Sleep -Milliseconds 250
Remove-Item -LiteralPath "$($installDir.Replace('"', '""'))" -Recurse -Force
"@
Set-Content -LiteralPath $uninstallPath -Value $uninstallScript -Encoding UTF8
New-Shortcut -Path (Join-Path $startMenuDir "Uninstall $appName.lnk") -Target "powershell.exe" -WorkingDirectory $installDir -Icon "powershell.exe" -Arguments "-NoProfile -ExecutionPolicy Bypass -File `"$uninstallPath`""

Start-Process -FilePath $installedExe

