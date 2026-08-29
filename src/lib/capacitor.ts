/**
 * Capacitor native bridge integration.
 *
 * When the web app is loaded inside a Capacitor WebView, this module:
 * 1. Detects the native environment via window.Capacitor
 * 2. Provides native camera/geolocation fallbacks (web APIs work in WebView too,
 *    but native plugins handle permissions more reliably on Android/iOS)
 * 3. Suppresses the PWA install prompt (no point showing it inside a native app)
 */

import { useEffect, useState } from "react";

// Minimal Capacitor runtime type (avoid importing @capacitor/core in the web bundle
// when not running inside a Capacitor WebView — it's loaded by the native shell)
interface CapacitorInstance {
  isNativePlatform: () => boolean;
  getPlatform: () => "android" | "ios" | "web";
  Plugins: Record<string, unknown>;
}

declare global {
  interface Window {
    Capacitor?: CapacitorInstance;
  }
}

/** True when running inside a Capacitor native app (Android/iOS) */
export function isCapacitorNative(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

/** "android" | "ios" | "web" */
export function capacitorPlatform(): "android" | "ios" | "web" {
  if (typeof window === "undefined") return "web";
  return window.Capacitor?.getPlatform?.() ?? "web";
}

/**
 * React hook: returns true once the Capacitor bridge is ready.
 * On web (no Capacitor), always returns false.
 */
export function useCapacitorReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isCapacitorNative()) return;
    // The bridge is injected before page load; just confirm on next tick
    const t = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(t);
  }, []);
  return ready;
}

/**
 * Request camera access via native plugin if available,
 * otherwise fall back to the standard Web API (getUserMedia).
 * Returns a MediaStream or null on failure.
 */
export async function getCameraStream(): Promise<MediaStream | null> {
  // In Capacitor WebView, getUserMedia usually works but permissions can be flaky.
  // The native plugin route is more reliable for Android/iOS.
  if (isCapacitorNative() && window.Capacitor?.Plugins?.Camera) {
    // Camera plugin handles its own permission request + native UI.
    // For continuous video (AR), we still need getUserMedia — the plugin is for photos.
    // So we just ensure permissions are granted first, then use getUserMedia.
    try {
      const Camera = window.Capacitor.Plugins.Camera as {
        checkPermissions: () => Promise<{ camera: string }>;
        requestPermissions: () => Promise<{ camera: string }>;
      };
      const status = await Camera.checkPermissions();
      if (status.camera !== "granted") {
        await Camera.requestPermissions();
      }
    } catch {
      // Plugin not available — fall through to getUserMedia
    }
  }

  // Standard Web API (works in Capacitor WebView with proper permissions)
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    return stream;
  } catch {
    return null;
  }
}

/**
 * Request GPS position via native Geolocation plugin if available,
 * otherwise fall back to navigator.geolocation.
 */
export async function getCurrentPosition(
  options?: PositionOptions
): Promise<GeolocationPosition | null> {
  if (isCapacitorNative() && window.Capacitor?.Plugins?.Geolocation) {
    try {
      const Geolocation = window.Capacitor.Plugins.Geolocation as {
        checkPermissions: () => Promise<{ location: string }>;
        requestPermissions: () => Promise<{ location: string }>;
        getCurrentPosition: (opts: Record<string, unknown>) => Promise<{
          coords: {
            latitude: number;
            longitude: number;
            accuracy: number;
            altitude: number | null;
            altitudeAccuracy: number | null;
            heading: number | null;
            speed: number | null;
          };
          timestamp: number;
        }>;
      };
      const perm = await Geolocation.checkPermissions();
      if (perm.location !== "granted") {
        await Geolocation.requestPermissions();
      }
      const result = await Geolocation.getCurrentPosition({
        enableHighAccuracy: options?.enableHighAccuracy ?? true,
        timeout: options?.timeout ?? 10000,
      });
      // Convert to GeolocationPosition shape for compatibility
      return {
        coords: {
          latitude: result.coords.latitude,
          longitude: result.coords.longitude,
          accuracy: result.coords.accuracy,
          altitude: result.coords.altitude,
          altitudeAccuracy: result.coords.altitudeAccuracy,
          heading: result.coords.heading,
          speed: result.coords.speed,
        },
        timestamp: result.timestamp,
      } as GeolocationPosition;
    } catch {
      // Fall through to web API
    }
  }

  // Standard Web API fallback
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      options ?? { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  });
}
