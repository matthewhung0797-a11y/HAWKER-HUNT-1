"use client";

// 地圖主角 3D avatar（public/models/player-avatar.glb，walk-in-place 骨架動作）。
// 掛喺既有 marker DOM 結構（scaler 內），canvas 尺寸＝root 方形；
// 舊 2D player-avatar.png 被取代。輕量原則：單一 Canvas、單一模型、
// 無 OrbitControls／無陰影，蒙版只開 alpha。

import { Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";

function AvatarModel() {
  const { scene, animations } = useGLTF("/models/player-avatar.glb");
  const { actions } = useAnimations(animations, scene);
  // GLB 自帶唯一動作「骨架動作」：直接全播
  useEffect(() => {
    const first = Object.values(actions)[0];
    first?.reset().fadeIn(0.3).play();
    return () => {
      first?.fadeOut(0.3);
    };
  }, [actions]);
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
        <Suspense fallback={null}>
          <group position={[0, -0.5, 0]}>
            <AvatarModel />
          </group>
        </Suspense>
      </Canvas>
    </div>
  );
}
