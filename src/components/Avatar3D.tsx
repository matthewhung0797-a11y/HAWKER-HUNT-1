"use client";

// 地圖主角 3D avatar（public/models/player-avatar.glb）。
// 任何來源 GLB 都自動規一化：x/z 置中、腳貼 y=0、統一縮放到 1.2 單位高，
// group 落返原點令鏡頭正對模型中心 — 唔會再受 Blender 匯出尺寸／偏移影響。
// 靜態展示（bind pose 定格，不播骨架動作）；Suspense 包住 useGLTF 免成個 portal suspend。
// 輕量原則：單一 Canvas、單一模型、無 OrbitControls／陰影。

import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

const MODEL_URL = "/models/player-avatar.glb";
/** 規一化後模型高度（場景單位） */
const FIT_HEIGHT = 1.2;

function AvatarModel() {
  const { scene } = useGLTF(MODEL_URL);
  const fitted = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const height = size.y || 1;
    // 腳貼 y=0、x/z 置中，再等比縮到固定高度
    scene.position.set(-center.x, -box.min.y, -center.z);
    const group = new THREE.Group();
    group.add(scene);
    group.scale.setScalar(FIT_HEIGHT / height);
    return group;
  }, [scene]);
  return <primitive object={fitted} />;
}

export default function Avatar3D({ size = 58 }: { size?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        width: size,
        height: size,
        marginLeft: -size / 2,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <Canvas
        camera={{ fov: 35, position: [0, 0.1, 2.3] }}
        gl={{ alpha: true, antialias: true }}
        style={{ pointerEvents: "none" }}
      >
        <ambientLight intensity={1.7} />
        <directionalLight position={[2, 4, 2]} intensity={1.5} />
        <directionalLight position={[-2, 2, -1]} intensity={0.6} />
        {/* 模型規一化為 0..1.2 高 → group 落 -0.6 令中心回到原點，鏡頭正對 */}
        <group position={[0, -FIT_HEIGHT / 2, 0]}>
          <Suspense fallback={null}>
            <AvatarModel />
          </Suspense>
        </group>
      </Canvas>
    </div>
  );
}

useGLTF.preload(MODEL_URL);
