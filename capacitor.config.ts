import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration — Server URL mode.
 *
 * The app loads the deployed Next.js web app from a remote server,
 * preserving SSR / API routes / Supabase. Set CAPACITOR_SERVER_URL
 * (or NEXT_PUBLIC_APP_URL) to your deployed URL before building.
 *
 * Build steps:
 *   1. Deploy Next.js to Vercel (or any hosting)
 *   2. Set the URL in .env.local: CAPACITOR_SERVER_URL=https://your-app.vercel.app
 *   3. npx cap sync android
 *   4. cd android && ./gradlew assembleDebug
 *   5. APK: android/app/build/outputs/apk/debug/app-debug.apk
 */

const serverUrl =
  process.env.CAPACITOR_SERVER_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://hawkerhunt.app";

const config: CapacitorConfig = {
  appId: "com.hawkerhunt.app",
  appName: "Hawker Hunt",
  webDir: "public",
  server: {
    // Load the deployed web app instead of local assets.
    // This preserves Next.js SSR, API routes, and Supabase integration.
    url: serverUrl,
    cleartext: true, // allow HTTP during dev (use HTTPS in production!)
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#f0e2c4",
  },
  ios: {
    backgroundColor: "#f0e2c4",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#f0e2c4",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#b03a2e",
    },
  },
};

export default config;
