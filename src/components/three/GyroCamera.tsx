"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { orientationToQuaternion } from "@/lib/gyro";

/**
 * 陀螺儀相機控制 + 首次讀數錨定回調。
 * 精靈必須錨定喺「入場時相機水平朝向」前方，否則 compass 方向任意，精靈可能喺玩家背後。
 */
export function GyroCamera({
  enabled,
  onFirstOrientation,
}: {
  enabled: boolean;
  onFirstOrientation: (camera: THREE.Camera) => void;
}) {
  const { camera } = useThree();
  const quat = useRef(new THREE.Quaternion());
  const data = useRef({ alpha: 0, beta: 90, gamma: 0, orient: 0, has: false });
  const anchored = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.alpha === null) return;
      data.current.alpha = e.alpha ?? 0;
      data.current.beta = e.beta ?? 90;
      data.current.gamma = e.gamma ?? 0;
      data.current.has = true;
    };
    const onScreen = () => {
      data.current.orient =
        (screen.orientation?.angle as number | undefined) ?? (window.orientation as number) ?? 0;
    };
    window.addEventListener("deviceorientation", onOrient);
    window.addEventListener("orientationchange", onScreen);
    onScreen();
    return () => {
      window.removeEventListener("deviceorientation", onOrient);
      window.removeEventListener("orientationchange", onScreen);
    };
  }, [enabled]);

  useFrame(() => {
    if (!enabled || !data.current.has) return;
    orientationToQuaternion(
      quat.current,
      data.current.alpha,
      data.current.beta,
      data.current.gamma,
      data.current.orient
    );
    if (!anchored.current) {
      // 首次讀數：直接設定相機方向（唔 slerp），然後通知 parent 錨定精靈
      camera.quaternion.copy(quat.current);
      anchored.current = true;
      onFirstOrientation(camera);
    } else {
      camera.quaternion.slerp(quat.current, 0.25);
    }
  });

  return null;
}
