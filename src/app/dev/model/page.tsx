"use client";

// 開發用模型檢視器：/dev/model?species=laksa-warrior&anim=attack
// 會喺 console 印出 bbox 診斷數字，方便 Playwright 自動驗證

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SPECIES_MAP } from "@/content/species";
import SpiritModel, { type SpiritAnim } from "@/components/three/SpiritModel";

function BboxLogger({ speciesId }: { speciesId: string }) {
  const { scene } = useThree();
  const logged = useRef(false);
  useEffect(() => {
    const t = setInterval(() => {
      if (logged.current) return;
      const url = SPECIES_MAP[speciesId]?.modelUrl;
      if (!url) return;
      let found = false;
      scene.traverse((o) => {
        const sm = o as THREE.SkinnedMesh;
        if (!sm.isSkinnedMesh || found) return;
        found = true;
        sm.skeleton.update();
        sm.computeBoundingBox();
        const local = sm.boundingBox!;
        const world = local.clone().applyMatrix4(sm.matrixWorld);
        const ls = local.getSize(new THREE.Vector3());
        const ws = world.getSize(new THREE.Vector3());
        console.log(
          `BBOX local=[${ls.x.toFixed(3)},${ls.y.toFixed(3)},${ls.z.toFixed(3)}] world=[${ws.x.toFixed(3)},${ws.y.toFixed(3)},${ws.z.toFixed(3)}] worldMin.y=${world.min.y.toFixed(3)}`
        );
        logged.current = true;
      });
    }, 500);
    return () => clearInterval(t);
  }, [scene, speciesId]);
  return null;
}

/** 複現戰鬥企位：position + lookAt 同 /battle 一致 */
function BattlePose({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useEffect(() => {
    ref.current?.position.set(-0.35, 0, 0.05);
    ref.current?.lookAt(0.35, 0, -0.05);
  }, []);
  return <group ref={ref}>{children}</group>;
}

function Inner() {
  const params = useSearchParams();
  const speciesId = params.get("species") ?? "laksa-warrior";
  const anim = (params.get("anim") ?? "idle") as SpiritAnim;
  const battle = params.get("battle") === "1";
  const yaw = (Number(params.get("yaw")) || 0) * (Math.PI / 180);
  const url = SPECIES_MAP[speciesId]?.modelUrl;
  useMemo(() => {
    if (url) useGLTF.preload(url);
  }, [url]);

  return (
    <main className="h-dvh w-full bg-[#2a1a0c]">
      <Canvas camera={{ fov: 45, position: battle ? [1.5, 1.2, 2.4] : [0, 0.5, 1.6] }}>
        <ambientLight intensity={1.0} />
        <directionalLight position={[2, 4, 2]} intensity={1.4} />
        <gridHelper args={[4, 16, "#c9a227", "#6b4a2a"]} />
        <axesHelper args={[0.5]} />
        <BboxLogger speciesId={speciesId} />
        <Suspense fallback={null}>
          {battle ? (
            <BattlePose>
              <SpiritModel speciesId={speciesId} anim={anim} />
            </BattlePose>
          ) : (
            <group rotation={[0, yaw, 0]}>
              <SpiritModel speciesId={speciesId} anim={anim} />
            </group>
          )}
        </Suspense>
        <OrbitControls target={[0, 0.25, 0]} />
      </Canvas>
      <div className="absolute left-2 top-2 rounded bg-black/60 px-3 py-1 text-xs text-white">
        {speciesId} / {anim}
      </div>
    </main>
  );
}

export default function DevModelPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
