"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { PerspectiveCamera } from "three";
import type { MutableRefObject } from "react";
import { stopXr8, type Xr8Api } from "@/lib/xr8";

/**
 * 8th Wall SLAM 層：雙 canvas 架構。
 * - 底層 canvas（本組件）：XR8 接管，畫相機映像＋跑 SLAM
 * - 頂層 R3F canvas（透明）：精靈／粒子照舊由 R3F 渲染，
 *   每 frame 由 <Xr8CameraSync> 將 SLAM 相機 pose＋投影矩陣同步過去
 * 咁樣 SpiritModel／WanderingSpirit／shiny 全部原封不動重用。
 */

export interface Xr8Pose {
  has: boolean;
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  intrinsics: number[] | null;
}

export const makeXr8Pose = (): Xr8Pose => ({
  has: false,
  px: 0,
  py: 1.5,
  pz: 2,
  qx: 0,
  qy: 0,
  qz: 0,
  qw: 1,
  intrinsics: null,
});

export type Xr8Status = "starting" | "scanning" | "tracking" | "failed";

export function Xr8Layer({
  xr8,
  poseRef,
  onStatus,
  onAnchor,
}: {
  xr8: Xr8Api;
  poseRef: MutableRefObject<Xr8Pose>;
  onStatus: (s: Xr8Status) => void;
  /** SLAM 穩定＋平面 hit 收斂後回報生成點（世界座標，y≈地面） */
  onAnchor: (pos: [number, number, number]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cbRef = useRef({ onStatus, onAnchor });
  cbRef.current = { onStatus, onAnchor };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dead = false;
    let anchored = false;
    let trackingOk = false;
    let hitTimer: ReturnType<typeof setInterval> | null = null;
    let bailTimer: ReturnType<typeof setTimeout> | null = null;
    const hits: [number, number, number][] = [];

    const emit = (s: Xr8Status) => {
      if (!dead) cbRef.current.onStatus(s);
    };
    const anchor = (pos: [number, number, number]) => {
      if (dead || anchored) return;
      anchored = true;
      if (hitTimer) clearInterval(hitTimer);
      if (bailTimer) clearTimeout(bailTimer);
      cbRef.current.onAnchor(pos);
    };

    // 追蹤穩定後：連續 hitTest 屏幕中心，收 6 個樣本取中位數做生成點；
    // 4 秒都收唔夠（弱紋理地面）就用相機前方 1.3m 保底
    const startAnchoring = () => {
      bailTimer = setTimeout(() => {
        const p = poseRef.current;
        // 相機水平前方 1.3m、地面高度 0
        const fx = 2 * (p.qx * p.qz + p.qw * p.qy);
        const fz = 1 - 2 * (p.qx * p.qx + p.qy * p.qy);
        const len = Math.hypot(fx, fz) || 1;
        anchor([p.px - (fx / len) * 1.3, 0, p.pz - (fz / len) * 1.3]);
      }, 4000);
      hitTimer = setInterval(() => {
        try {
          const results = xr8.XrController.hitTest(0.5, 0.5, [
            "FEATURE_POINT",
            "ESTIMATED_SURFACE",
            "DETECTED_SURFACE",
          ]);
          const h = results?.[0];
          if (h && h.distance < 6) {
            hits.push([h.position.x, h.position.y, h.position.z]);
            if (hits.length >= 6) {
              const mid = (k: 0 | 1 | 2) => {
                const v = hits.map((x) => x[k]).sort((a, b) => a - b);
                return v[Math.floor(v.length / 2)];
              };
              anchor([mid(0), mid(1), mid(2)]);
            }
          }
        } catch {
          /* hitTest 未就緒：下個 tick 再試 */
        }
      }, 220);
    };

    const poseModule = {
      name: "hh-pose",
      onCameraStatusChange: ({ status }: { status: string }) => {
        if (status === "failed") emit("failed");
        if (status === "hasVideo") emit("scanning");
      },
      onUpdate: ({ processCpuResult }: { processCpuResult?: { reality?: Record<string, unknown> } }) => {
        const r = processCpuResult?.reality as
          | {
              rotation?: { x: number; y: number; z: number; w: number };
              position?: { x: number; y: number; z: number };
              intrinsics?: number[];
            }
          | undefined;
        if (!r?.rotation || !r.position) return;
        const p = poseRef.current;
        p.px = r.position.x;
        p.py = r.position.y;
        p.pz = r.position.z;
        p.qx = r.rotation.x;
        p.qy = r.rotation.y;
        p.qz = r.rotation.z;
        p.qw = r.rotation.w;
        if (r.intrinsics) p.intrinsics = r.intrinsics;
        p.has = true;
      },
      onException: () => emit("failed"),
      listeners: [
        {
          event: "reality.trackingstatus",
          process: (e: { detail?: { status?: string } }) => {
            const st = e.detail?.status;
            if (st === "NORMAL" && !trackingOk) {
              trackingOk = true;
              emit("tracking");
              startAnchoring();
            }
          },
        },
      ],
    };

    try {
      emit("starting");
      xr8.clearCameraPipelineModules();
      xr8.addCameraPipelineModules([
        xr8.GlTextureRenderer.pipelineModule(),
        xr8.XrController.pipelineModule(),
        poseModule,
      ]);
      // 相機初始高度 1.5m：SLAM responsive scale 下 y=0 即係地面／枱面附近
      xr8.XrController.updateCameraProjectionMatrix({
        origin: { x: 0, y: 1.5, z: 2 },
        facing: { w: 1, x: 0, y: 0, z: 0 },
      });
      xr8.run({ canvas });
    } catch {
      emit("failed");
    }

    return () => {
      dead = true;
      if (hitTimer) clearInterval(hitTimer);
      if (bailTimer) clearTimeout(bailTimer);
      stopXr8();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xr8]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />;
}

/** 掛喺 R3F Canvas 入面：每 frame 將 SLAM pose 同步到 R3F 相機 */
export function Xr8CameraSync({ poseRef }: { poseRef: MutableRefObject<Xr8Pose> }) {
  const { camera } = useThree();
  const get = useThree((s) => s.get);
  useEffect(() => {
    // 停止 R3F 喺 resize 時重算投影（SLAM intrinsics 全權接管）
    (camera as unknown as { manual?: boolean }).manual = true;
    return () => {
      (camera as unknown as { manual?: boolean }).manual = false;
      // SLAM intrinsics 直接蓋寫咗投影矩陣；唔還原嘅話，切去 3D 場景／gyro 模式
      // 會繼續用 SLAM 嘅投影＋姿態去 render（黑屏／精靈錯位）。重置返標準透視。
      const cam = camera as PerspectiveCamera;
      if (cam.isPerspectiveCamera) {
        const { size } = get();
        cam.fov = 60;
        cam.aspect = size.width / size.height;
        cam.near = 0.1;
        cam.far = 1000;
        cam.position.set(0, 0, 0);
        cam.quaternion.identity();
        cam.updateProjectionMatrix();
      }
    };
  }, [camera, get]);

  useFrame(() => {
    const p = poseRef.current;
    if (!p.has) return;
    camera.position.set(p.px, p.py, p.pz);
    camera.quaternion.set(p.qx, p.qy, p.qz, p.qw);
    if (p.intrinsics && p.intrinsics.length === 16) {
      camera.projectionMatrix.fromArray(p.intrinsics);
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
  });
  return null;
}
