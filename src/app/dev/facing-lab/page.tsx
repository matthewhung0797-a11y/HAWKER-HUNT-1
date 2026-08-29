"use client";

/* 面向校準實驗室：唔靠 SPECIES_MAP，用 query 載 GLB。
 * /dev/facing-lab?id=foo&model=/models/foo.glb&yaw=0&side=player|enemy&h=0.5&rigLite=0|1&animated=1
 * 幾何同 battle facing-battle-lock.json；只供 Playwright／管線截圖。
 */
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Canvas, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import SpiritModel from "@/components/three/SpiritModel";

const PLAYER_POS: [number, number, number] = [-0.35, 0, 0.05];
const ENEMY_POS: [number, number, number] = [0.3, 0, -0.9];
const CAM_POS: [number, number, number] = [-0.46, 0.45, 1.38];
const CAM_LOOK: [number, number, number] = [0.06, 0.26, -0.5];

const YAW_LABEL: Record<string, number> = {
  "0": 0,
  "+90": Math.PI / 2,
  "-90": -Math.PI / 2,
  "180": Math.PI,
};

function LookAtGroup({
  basePos,
  targetPos,
  children,
}: {
  basePos: [number, number, number];
  targetPos: [number, number, number];
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    const g = ref.current;
    if (!g) return;
    g.position.set(basePos[0], basePos[1], basePos[2]);
    g.lookAt(targetPos[0], basePos[1], targetPos[2]);
  }, [basePos, targetPos]);
  return <group ref={ref}>{children}</group>;
}

function ReadySignal({ modelUrl }: { modelUrl: string }) {
  const { scene } = useThree();
  useEffect(() => {
    let frames = 0;
    let id = 0;
    const w = window as Window & {
      __facingLabReady?: boolean;
      __facingLabMeshes?: number;
    };
    w.__facingLabReady = false;
    const tick = () => {
      frames++;
      let meshes = 0;
      scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) meshes++;
      });
      if (frames > 45 && meshes > 0) {
        w.__facingLabReady = true;
        w.__facingLabMeshes = meshes;
        return;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [scene, modelUrl]);
  return null;
}

function CamSetup() {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(...CAM_POS);
    camera.lookAt(...CAM_LOOK);
    camera.updateProjectionMatrix();
  }, [camera]);
  return null;
}

function Inner() {
  const params = useSearchParams();
  const id = params.get("id") || "preview";
  const model = params.get("model") || "";
  const side = params.get("side") === "enemy" ? "enemy" : "player";
  const yawKey = params.get("yaw") || "0";
  const yaw = YAW_LABEL[yawKey] ?? (Number(params.get("yawRad")) || 0);
  const h = Number(params.get("h")) || 0.5;
  const rigLite = params.get("rigLite") === "1";
  const animated = params.get("animated") !== "0";
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!model) return;
    try {
      useGLTF.preload(model);
      setOk(true);
    } catch {
      setOk(false);
    }
  }, [model]);

  if (!model) {
    return (
      <main className="flex h-dvh items-center justify-center bg-[#1a120a] text-sm text-white">
        missing model=
      </main>
    );
  }

  const basePos = side === "player" ? PLAYER_POS : ENEMY_POS;
  const targetPos = side === "player" ? ENEMY_POS : PLAYER_POS;

  return (
    <main
      className="h-dvh w-full bg-[#2a1a0c]"
      data-facing-lab={id}
      data-side={side}
      data-yaw={yawKey}
    >
      <Canvas
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        camera={{ fov: 42, position: CAM_POS, near: 0.05, far: 40 }}
        onCreated={({ gl }) => {
          gl.setClearColor("#2a1a0c", 1);
        }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[2, 4, 2]} intensity={1.5} />
        <directionalLight position={[-2, 2, 1]} intensity={0.45} />
        <CamSetup />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.4]} receiveShadow>
          <circleGeometry args={[2.2, 48]} />
          <meshStandardMaterial color="#3d2a18" />
        </mesh>
        {ok && (
          <Suspense fallback={null}>
            <LookAtGroup basePos={basePos} targetPos={targetPos}>
              <SpiritModel
                speciesId={id}
                anim="idle"
                shadow
                preview={{
                  modelUrl: model,
                  modelHeightM: h,
                  modelYaw: yaw,
                  animated,
                  rigLite,
                }}
              />
            </LookAtGroup>
            <ReadySignal modelUrl={model} />
          </Suspense>
        )}
      </Canvas>
    </main>
  );
}

export default function FacingLabPage() {
  return (
    <Suspense fallback={<main className="h-dvh bg-[#1a120a]" />}>
      <Inner />
    </Suspense>
  );
}
