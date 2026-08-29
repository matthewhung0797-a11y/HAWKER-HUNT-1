"use client";

import * as THREE from "three";

/**
 * DeviceOrientation → 相機四元數（iOS Safari 冇 WebXR，用陀螺儀偽 AR）
 * 參考 three.js 已移除嘅 DeviceOrientationControls 實現。
 */
const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 around x

export function orientationToQuaternion(
  out: THREE.Quaternion,
  alpha: number,
  beta: number,
  gamma: number,
  screenOrientation: number
) {
  const degToRad = Math.PI / 180;
  euler.set(beta * degToRad, alpha * degToRad, -gamma * degToRad, "YXZ");
  out.setFromEuler(euler);
  out.multiply(q1);
  out.multiply(q0.setFromAxisAngle(zee, -screenOrientation * degToRad));
}

export type GyroPermission = "granted" | "denied" | "unsupported";

/** iOS 13+ 需要用戶手勢觸發權限請求 */
export async function requestGyroPermission(): Promise<GyroPermission> {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
    return "unsupported";
  }
  const DOE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  if (typeof DOE.requestPermission === "function") {
    try {
      const res = await DOE.requestPermission();
      return res === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }
  return "granted";
}
