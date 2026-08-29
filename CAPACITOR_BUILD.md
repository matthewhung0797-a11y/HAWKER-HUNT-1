# Capacitor App Build — Server URL Mode

This wraps the deployed Next.js web app into native Android/iOS apps using Capacitor.
The app loads the remote URL at runtime — no local assets needed, SSR/API routes stay on the server.

## Prerequisites

- Node.js 20+ (already installed)
- Android Studio (already installed at `C:\Program Files\Android\Android Studio`)
- Android SDK (already at `%LOCALAPPDATA%\Android\Sdk`)
- **JDK 21** (Temurin — Capacitor 8 plugins require Java 21 toolchain; Android Studio's bundled JBR is JDK 25 which is too new for Gradle)
  Install: `winget install EclipseAdoptium.Temurin.21.JDK`
  Path: `C:\Program Files\Eclipse Adoptium\jdk-21.x.x-hotspot`
- For iOS: macOS + Xcode (cannot build on Windows)

## Setup

### 1. Set the server URL

Edit `.env.local` (or set environment variable before building):

```
CAPACITOR_SERVER_URL=https://your-deployed-app.vercel.app
```

Use your Vercel/Netlify/any-host URL. For local dev testing, use your machine's LAN IP:
```
CAPACITOR_SERVER_URL=http://192.168.x.x:3000
```
(Use HTTPS in production! HTTP only for dev.)

### 2. Add native platforms

```powershell
# Set JAVA_HOME to JDK 21 (NOT Android Studio's JBR which is JDK 25)
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.x.x-hotspot"  # check actual path
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

# Add Android platform
npx cap add android

# Add iOS platform (requires macOS)
# npx cap add ios
```

### 3. Sync web assets + native plugins

```powershell
npx cap sync
```

### 4. Build Android APK

#### Option A: Via Android Studio (recommended)

```powershell
npx cap open android
```
Android Studio opens → Build → Build Bundle(s) / APK(s) → Build APK(s).

#### Option B: Via Gradle CLI

```powershell
cd android
.\gradlew assembleDebug
```

Output APK: `android/app/build/outputs/apk/debug/app-debug.apk`

### 5. Install on device

```powershell
# Enable USB debugging on phone, connect via USB
adb install android\app\build\outputs\apk\debug\app-debug.apk
```

### 6. iOS build (macOS only)

```bash
npx cap add ios
npx cap sync ios
npx cap open ios
# Xcode opens → select device/simulator → Product → Run
```

## Configuration

All settings are in `capacitor.config.ts`:
- `appId`: `com.hawkerhunt.app` (change for your own store listing)
- `appName`: `Hawker Hunt`
- `server.url`: The deployed web URL (from `CAPACITOR_SERVER_URL` env var)
- `server.cleartext`: `true` (allows HTTP dev; use HTTPS in production)

## Native permissions

The app requests these permissions:
- **Camera**: AR capture, QR scanning
- **Location (GPS)**: Map, geofence check-in
- **Motion/Gyroscope**: Gyro-based pseudo-AR

These are configured in:
- Android: `android/app/src/main/AndroidManifest.xml`
- iOS: `ios/App/App/Info.plist`

## Capacitor bridge integration

`src/lib/capacitor.ts` provides:
- `isCapacitorNative()` — detect if running inside native app
- `getCameraStream()` — native camera permission handling
- `getCurrentPosition()` — native geolocation fallback
- `useCapacitorReady()` — React hook for bridge readiness

`InstallPrompt.tsx` is automatically suppressed when running inside Capacitor.
