"use client";

// 地圖主角 3D avatar（public/models/player-avatar.glb）。
// 靜態展示（不播骨架動作，bind pose 定格）；掛喺既有 marker DOM 結構（scaler 內），
// canvas 尺寸＝root 方形。輕量原則：單一 Canvas、單一模型、無 OrbitControls／陰影。

import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";

function AvatarModel() {
  const { scene } = useGLTF("/models/player-avatar.glb");
  // 不使用 useAnimations：靜態定格
  return <primitive object={scene} />;
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
        camera={{ fov: 35, position: [0, 0.85, 1.55] }}
        gl={{ alpha: true, antialias: true }}
        style={{ pointerEvents: "none" }}
      >
        <ambientLight intensity={1.35} />
        <directionalLight position={[2, 4, 2]} intensity={1.2} />
        <group position={[0, -0.5, 0]}>
          <AvatarModel />
        </group>
      </Canvas>
    </div>
  );
}
