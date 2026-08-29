"use client";

/**
 * 8th Wall SLAM 引擎載入器（2026 年 2 月起免費 Distributed Engine Binary）。
 * - 只喺手機（有觸控＋非桌面 UA）先嘗試載入；桌面直接短路 null
 * - script 載入有 timeout：CDN 唔通／舊機唔支援即快速退回 gyro 模式
 * - XR8 係全局單例：成功載入一次之後直接重用
 */

const XR8_SRC = "https://cdn.jsdelivr.net/npm/@8thwall/engine-binary@1/dist/xr.js";
const LOAD_TIMEOUT_MS = 6000;

/* 8th Wall 全局 API 最小型別（官方冇 d.ts；只描述我哋用到嘅面） */
export interface Xr8Vec3 {
  x: number;
  y: number;
  z: number;
}
export interface Xr8Quat extends Xr8Vec3 {
  w: number;
}

export interface Xr8Api {
  run: (opts: { canvas: HTMLCanvasElement }) => void;
  stop: () => void;
  isPaused: () => boolean;
  addCameraPipelineModule: (m: unknown) => void;
  addCameraPipelineModules: (m: unknown[]) => void;
  clearCameraPipelineModules: () => void;
  GlTextureRenderer: { pipelineModule: () => unknown };
  XrController: {
    pipelineModule: () => unknown;
    updateCameraProjectionMatrix: (opts: { origin: Xr8Vec3; facing: Xr8Quat }) => void;
    recenter: () => void;
    hitTest: (
      x: number,
      y: number,
      types?: string[]
    ) => { type: string; position: Xr8Vec3; rotation: Xr8Quat; distance: number }[];
    configure: (opts: Record<string, unknown>) => void;
  };
}

declare global {
  interface Window {
    XR8?: Xr8Api;
  }
}

let loadPromise: Promise<Xr8Api | null> | null = null;

/** 係咪值得試 SLAM：手機＋非 headless（桌面／爬蟲直接跳過，慳 6 秒 timeout） */
export function xr8Eligible(): boolean {
  if (typeof window === "undefined") return false;
  if (window.XR8) return true;
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua);
  const headless = /HeadlessChrome|Playwright/i.test(ua);
  return mobile && !headless && navigator.maxTouchPoints > 0;
}

/** 載入 8th Wall binary；唔適用／失敗回傳 null（caller 退回 gyro/3d） */
export function loadXr8(): Promise<Xr8Api | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.XR8) return Promise.resolve(window.XR8);
  if (!xr8Eligible()) return Promise.resolve(null);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<Xr8Api | null>((resolve) => {
    const timer = setTimeout(() => resolve(window.XR8 ?? null), LOAD_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      // xrloaded 事件先代表引擎真正就緒（script onload 只係檔案落地）
      if (window.XR8) return resolve(window.XR8);
      const onXrLoaded = () => resolve(window.XR8 ?? null);
      window.addEventListener("xrloaded", onXrLoaded, { once: true });
      setTimeout(() => {
        window.removeEventListener("xrloaded", onXrLoaded);
        resolve(window.XR8 ?? null);
      }, 3000);
    };
    const script = document.createElement("script");
    script.src = XR8_SRC;
    script.async = true;
    script.dataset.preloadChunks = "slam";
    script.onload = done;
    script.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    document.head.appendChild(script);
  }).then((api) => {
    if (!api) loadPromise = null; // 失敗容許下次重試（可能係網絡閃斷）
    return api;
  });
  return loadPromise;
}

/** 安全停止 SLAM session（離頁／切模式必 call；重複 call 無害） */
export function stopXr8() {
  const xr8 = typeof window !== "undefined" ? window.XR8 : undefined;
  if (!xr8) return;
  try {
    xr8.stop();
    xr8.clearCameraPipelineModules();
  } catch {
    /* session 未起或已停：忽略 */
  }
}
