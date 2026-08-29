"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * 木色 3D 筷子：掛喺精靈身上（parent group 跟精靈世界座標），
 * pivot billboard 對住相機 → slam/gyro/3d 三模式永遠由畫面右上斜插入嚟、透視正確。
 * 兩支筷由畫面右上一個共同「手」點發出，筷尖收攏鉗住精靈 bbox 左右兩側（converging，
 * 唔係平行）；前筷（+z 近相機）掂左側全露，後筷（−z 遠相機）筷尖被精靈身體遮住。
 * 筷尖間距由 heightM 推算（唔寫死），每隻精靈自動貼合。
 *
 * 動畫（useFrame 內插）：
 * - 瞄準（open）：筷尖微張＋輕浮動蓄勢
 * - 出手／搏鬥（closed）：快速鉗攏＋夾住震顫
 * - squeezeKey 遞增：每下擠壓脈衝（再夾細少少帶回彈）
 */
export default function Chopsticks3d({
  heightM,
  closed,
  squeezeKey,
  frenzy,
}: {
  heightM: number;
  /** snap／struggle = 鉗攏；瞄準 = 微張 */
  closed: boolean;
  /** 每下擠壓脈衝（遞增即彈一下） */
  squeezeKey: number;
  /** 狂暴：震顫更劇 */
  frenzy: boolean;
}) {
  const pivot = useRef<THREE.Group>(null);
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const squeeze = useRef(0);
  const closeAmt = useRef(closed ? 1 : 0);

  useEffect(() => {
    squeeze.current = 1;
  }, [squeezeKey]);

  const woodMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#9c6a34", roughness: 0.72, metalness: 0.04 }),
    []
  );
  useEffect(() => () => woodMat.dispose(), [woodMat]);

  // 尺寸全部由 heightM 推算（唔寫死像素）：held 端粗、筷尖細
  const rThick = heightM * 0.05;
  const rThin = heightM * 0.016;
  const depth = heightM * 0.26; // 前／後筷 z 偏移（做前後遮擋）

  // 每 frame 重算：避免 allocation
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const vHand = useRef(new THREE.Vector3());
  const vTip = useRef(new THREE.Vector3());
  const vDir = useRef(new THREE.Vector3());

  // 一支筷擺去 tip→hand：group 原點喺筷尖，local +Y 轉去指住 hand，scale.y = 長度
  const place = (g: THREE.Group | null, tx: number, ty: number, tz: number) => {
    if (!g) return;
    const tip = vTip.current.set(tx, ty, tz);
    const dir = vDir.current.subVectors(vHand.current, tip);
    const len = dir.length();
    dir.normalize();
    g.position.copy(tip);
    g.quaternion.setFromUnitVectors(up, dir);
    g.scale.set(1, len, 1);
  };

  useFrame((state, delta) => {
    const pv = pivot.current;
    if (!pv) return;
    // billboard：對住相機，令筷子永遠由畫面右上入（唔受 AR 相機轉向影響方向）
    pv.quaternion.copy(camera.quaternion);
    // 開合平滑插值（夾落快而狠）
    closeAmt.current += ((closed ? 1 : 0) - closeAmt.current) * Math.min(1, delta * 14);
    squeeze.current = Math.max(0, squeeze.current - delta * 5);
    const c = closeAmt.current;
    const t = state.clock.elapsedTime;
    // 筷尖 x 間距：夾住時貼近 bbox 兩側（≈半闊 0.45h），瞄準時張開啲
    const openGap = heightM * 0.6;
    const closeGap = heightM * 0.42;
    let gap = openGap + (closeGap - openGap) * c - squeeze.current * heightM * 0.06;
    if (gap < heightM * 0.2) gap = heightM * 0.2; // 唔好穿埋一齊
    // 搏鬥／狂暴震顫；瞄準時輕浮動蓄勢
    const shake = closed ? Math.sin(t * (frenzy ? 40 : 22)) * heightM * (frenzy ? 0.03 : 0.014) : 0;
    const float = closed ? 0 : Math.sin(t * 3) * heightM * 0.02;
    // 共同「手」點：畫面右上（billboard local 空間），兩支筷由呢度發出
    vHand.current.set(heightM * 0.7, heightM * 1.45 + float, 0);
    // 前筷掂左側（+z 近相機，全露）；後筷掂右側（−z 遠相機，筷尖被身體遮）
    place(leftRef.current, -gap + shake, float, depth);
    place(rightRef.current, gap - shake, float, -depth);
  });

  return (
    <group ref={pivot} position={[0, heightM * 0.42, 0]}>
      <group ref={leftRef}>
        <mesh position={[0, 0.5, 0]} material={woodMat}>
          <cylinderGeometry args={[rThick, rThin, 1, 12]} />
        </mesh>
      </group>
      <group ref={rightRef}>
        <mesh position={[0, 0.5, 0]} material={woodMat}>
          <cylinderGeometry args={[rThick, rThin, 1, 12]} />
        </mesh>
      </group>
    </group>
  );
}
