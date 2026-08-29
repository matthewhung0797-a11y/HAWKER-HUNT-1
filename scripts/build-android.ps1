# Hawker Hunt — Capacitor Android Build Script
# Usage: .\build-android.ps1 [-ServerUrl "https://your-app.vercel.app"]

param(
    [string]$ServerUrl = "https://hawkerhunt.app"
)

$ErrorActionPreference = "Stop"

# --- Environment setup ---
# JDK 21 required (Capacitor 8 plugins use Java 21 toolchain; Android Studio's bundled JBR is JDK 25 which Gradle can't use)
$jdk21 = Get-ChildItem "C:\Program Files\Eclipse Adoptium\jdk-21*" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
if (-not $jdk21) {
    Write-Host "JDK 21 not found. Installing..." -ForegroundColor Yellow
    winget install EclipseAdoptium.Temurin.21.JDK --accept-package-agreements --accept-source-agreements
    $jdk21 = Get-ChildItem "C:\Program Files\Eclipse Adoptium\jdk-21*" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}
$env:JAVA_HOME = $jdk21
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

# Also pick up Node.js from system PATH
$machinePath = [System.Environment]::GetEnvironmentVariable("PATH", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
$env:PATH = "$env:PATH;$machinePath;$userPath"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "=== Hawker Hunt Capacitor Build ===" -ForegroundColor Cyan
Write-Host "Server URL: $ServerUrl"
Write-Host "Project: $projectRoot"
Write-Host ""

# --- Update capacitor.config.ts server URL ---
$configPath = Join-Path $projectRoot "capacitor.config.ts"
$config = Get-Content $configPath -Raw
if ($config -match 'serverUrl\s*=\s*[^;]*') {
    $config = $config -replace 'serverUrl\s*=\s*process\.env\.\w+\s*\|\|\s*process\.env\.\w+\s*\|\|\s*"[^"]*"', "serverUrl = `"$ServerUrl`""
    Set-Content -Path $configPath -Value $config -NoNewline:$false -Encoding UTF8
    Write-Host "Updated capacitor.config.ts server URL" -ForegroundColor Green
}

# --- Sync ---
Write-Host "Syncing Capacitor..." -ForegroundColor Yellow
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw "Capacitor sync failed" }

# --- Build APK ---
Write-Host "Building debug APK..." -ForegroundColor Yellow
Set-Location (Join-Path $projectRoot "android")
.\gradlew assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) { throw "Gradle build failed" }

# --- Result ---
$apkPath = Join-Path $projectRoot "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
    $size = [math]::Round((Get-Item $apkPath).Length / 1MB, 1)
    Write-Host ""
    Write-Host "=== Build Success! ===" -ForegroundColor Green
    Write-Host "APK: $apkPath ($size MB)"
    Write-Host ""
    Write-Host "Install on device:" -ForegroundColor Cyan
    Write-Host "  adb install `"$apkPath`""
} else {
    throw "APK not found at expected path: $apkPath"
}
