# FocusTimer

<img width="1919" height="1021" alt="focus-ui-smoke" src="https://github.com/user-attachments/assets/fa88e38f-0c7b-42c7-b37c-83fc98494fc5" />

A high-contrast monochrome Pomodoro desktop app built with Go and Wails.

The app includes a frameless desktop UI, editable tasks, editable break durations, local audio import/playback, Spotify OAuth connection support, keyboard shortcuts, and an always-on-top footer toggle.

## Features

- Frameless Wails desktop window
- 15 minute focus timer with session dots
- Editable task list with add/remove/complete states
- Editable short and long break durations
- Local audio import with playback
- Spotify connection flow using Authorization Code with PKCE
- Footer shortcuts and always-on-top toggle
- Installer bundle for Windows

## Requirements

- Windows
- Go
- Wails CLI, or the workspace-local CLI at `tools/wails.exe`
- Microsoft Edge WebView2 Runtime

The installer script can download WebView2 if it is missing.

## Spotify Setup

Spotify OAuth requires a Spotify Developer app Client ID. No Client Secret is needed because this desktop app uses PKCE.

In the Spotify Developer Dashboard, add this redirect URI:

```text
http://127.0.0.1:8000/callback
```

Do not use `localhost`. Spotify requires an explicit loopback IP literal for local redirect URIs.

## Development

Build the static frontend:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-frontend.ps1
```

Run tests:

```powershell
$env:GOTELEMETRY='off'
$env:GOTELEMETRYDIR=(Join-Path (Get-Location) '.gotelemetry')
$env:GOCACHE=(Join-Path (Get-Location) '.gocache')
$env:GOMODCACHE=(Join-Path (Get-Location) '.gomodcache')
go test ./...
```

Build the Windows executable:

```powershell
$env:GOTELEMETRY='off'
$env:GOTELEMETRYDIR=(Join-Path (Get-Location) '.gotelemetry')
$env:GOCACHE=(Join-Path (Get-Location) '.gocache')
$env:GOMODCACHE=(Join-Path (Get-Location) '.gomodcache')
.\tools\wails.exe build
```

The executable is generated at:

```text
build/bin/FocusTimer.exe
```

## Installer

Build the app first, then create the installer bundle:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-installer.ps1
```

If NSIS is installed, Wails can also create a native installer:

```powershell
.\tools\wails.exe build -nsis -webview2 download
```

Current fallback installer bundle:

```text
build/installer/FocusTimerInstaller.zip
```

Extract it and run:

```text
Install-FocusTimer.cmd
```

The installer copies the app, creates Start Menu/Desktop shortcuts, checks for WebView2, and launches FocusTimer.

## Keyboard Shortcuts

- `Space`: pause/resume timer or audio
- `R`: reset timer
- `S`: open Spotify connect
- `N`: exit

## Repository Notes

To download, check the zip from versions
