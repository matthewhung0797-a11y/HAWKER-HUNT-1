"use client";

let cached: boolean | null = null;

/** 檢測 WebGL2 是否可用（MapLibre v5 同 Three.js 新版都必須要） */
export function hasWebGL2(): boolean {
  if (cached !== null) return cached;
  if (typeof document === "undefined") return true;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    cached = !!gl;
    // iOS Safari 對同時存活嘅 WebGL context 有數量上限（爆咗會殺最舊嗰個，
    // 令地圖／場景凍結）——探測完即刻釋放，唔好白霸一個名額
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
