"use client";

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { GroundedSkybox } from "three/examples/jsm/objects/GroundedSkybox.js";
import type { MutableRefObject } from "react";
import type { BattleBgConfig } from "@/content/battle-bgs";
import BattleAmbience from "@/components/three/BattleAmbience";
import BackgroundLife, { type NpcLines } from "@/components/capture/BackgroundLife";

/**
 * 3D 保底捕捉場景（AR 用唔到時嘅完整體驗，參考 PoGo 關 AR 嘅捕捉畫面）：
 * 站立人視角＋360° 全景地面投影（GroundedSkybox）＋氛圍粒子。
 * 有 panorama（完整 2:1 equirect，含地板）：全景下半球投影落 y=0 地平面，
 * 精靈直接企喺相片地板上，透視自然銜接（PoGo 式）；
 * 冇 panorama 就退回舊平面天幕＋主色地盤。
 * 精靈由 WanderingSpirit 喺地面遊走（page 級掛入，唔喺呢度）。
 */

const CAM_HEIGHT = 1.0;
const CAM_RADIUS = 1.6;
/** 全景拍攝眼高（生成圖以企人視角出圖）：控制地面投影嘅縮放比例 */
const PANO_EYE_HEIGHT = 1.5;
/** 全景球半徑：要夠大包住相機（CAM_RADIUS）連視差活動範圍 */
const PANO_RADIUS = 14;
/** yaw=0 時望向距離（令初始視角望到 z=-0.7 嘅精靈位；等於 CAM_RADIUS + 0.7） */
const LOOK_H = CAM_RADIUS + 0.7;
const LOOK_Y = 0.38;
/** 拖屏轉身靈敏度（弧度／像素）：0.006 ≈ 半個機身掃就轉到 ~180° */
export const TURN_SENSITIVITY = 0.006;

/** 站立人視角：相機企喺原地「轉頭」（first-person），拖屏可以轉足一圈——
 *  閃走嘅精靈飛到身後都可以擰身追返（同 AR 陀螺儀一致）。
 *  疊一層極慢 idle 漂移（雙頻 sine ±~1.5°＋輕微高度浮動）：
 *  模擬「企喺現場微微望嚟望去」，令靜態全景相都有生命感 */
export function Stage3dCamera({ yawRef }: { yawRef: MutableRefObject<number> }) {
  const { camera } = useThree();
  const yaw = useRef(0);
  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const drift = Math.sin(t * 0.42) * 0.02 + Math.sin(t * 0.13 + 1.7) * 0.012;
    yaw.current += (yawRef.current + drift - yaw.current) * Math.min(1, delta * 7);
    const y = yaw.current;
    const h = CAM_HEIGHT + Math.sin(t * 0.3) * 0.02;
    // 位置固定、只轉朝向：yaw=0 時同舊版 orbit 睇齊（望向 (0,0.38,-0.7)）
    camera.position.set(0, h, CAM_RADIUS);
    camera.lookAt(Math.sin(y) * LOOK_H, LOOK_Y, CAM_RADIUS - Math.cos(y) * LOOK_H);
  });
  return null;
}

/** 主題點光動畫：按 panoFlicker 幅度郁 intensity——
 *  火場猛烈跳動、水場慢速脈動、金場微閃；光埋落精靈身上，動態同場景聯動 */
function AnimatedPointLight({ bg }: { bg: BattleBgConfig }) {
  const ref = useRef<THREE.PointLight>(null);
  const seed = useRef(Math.random() * 100);
  const base = bg.pointIntensity * 0.6;
  const amp = bg.panoFlicker ?? 0.12;
  // 閃爍愈勁，頻率愈快（爐火 vs 呼吸）
  const freq = 1 + amp * 4;
  useFrame((state) => {
    const l = ref.current;
    if (!l) return;
    const t = state.clock.elapsedTime + seed.current;
    const wave =
      Math.sin(t * 1.6 * freq) * 0.5 +
      Math.sin(t * 4.1 * freq + 1.3) * 0.35 +
      Math.sin(t * 8.7 * freq + 2.1) * 0.15;
    l.intensity = base * (1 + amp * wave);
  });
  return <pointLight ref={ref} color={bg.pointColor} intensity={base} position={[0, 2.2, -1.5]} distance={9} />;
}

/** 天窗光柱軟邊貼圖：垂直漸變（頂實底散）×水平軟邊 */
function useShaftTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const v = ctx.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, "rgba(255,255,255,0.9)");
    v.addColorStop(0.75, "rgba(255,255,255,0.32)");
    v.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 64, 256);
    // 水平軟邊：兩側溶走
    const h = ctx.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, "rgba(255,255,255,0)");
    h.addColorStop(0.3, "rgba(255,255,255,1)");
    h.addColorStop(0.7, "rgba(255,255,255,1)");
    h.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 64, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

/** 天窗光柱（god rays）：斜插 additive 長條，慢速呼吸＋輕微擺動 */
function LightShafts({ color, count }: { color: string; count: number }) {
  const tex = useShaftTexture();
  const group = useRef<THREE.Group>(null);
  const cfg = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: -3.5 + (i + 0.5) * (7 / count) + (Math.random() - 0.5) * 1.2,
        z: -5 - Math.random() * 2.5,
        tilt: 0.14 + Math.random() * 0.12,
        phase: Math.random() * Math.PI * 2,
        w: 0.9 + Math.random() * 0.7,
      })),
    [count]
  );
  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    g.children.forEach((m, i) => {
      const c = cfg[i];
      const mat = (m as THREE.Mesh).material as THREE.MeshBasicMaterial;
      mat.opacity = 0.16 + 0.13 * (0.5 + 0.5 * Math.sin(t * 0.35 + c.phase));
      m.rotation.z = c.tilt + Math.sin(t * 0.18 + c.phase) * 0.02;
    });
  });
  return (
    <group ref={group}>
      {cfg.map((c, i) => (
        <mesh key={i} position={[c.x, 3.4, c.z]} rotation={[0, 0, c.tilt]}>
          <planeGeometry args={[c.w, 7]} />
          <meshBasicMaterial
            map={tex}
            color={color}
            transparent
            opacity={0.2}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

/** radial 淡出遮罩：地板邊緣溶入全景／背景，避免硬邊 */
function useFadeTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createRadialGradient(128, 128, 30, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.62, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

/** 精靈企位金圈（同切磋擂台一致嘅視覺語言） */
function FocusRing({ bg }: { bg: BattleBgConfig }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, -0.7]}>
      <ringGeometry args={[1.15, 1.22, 48]} />
      <meshBasicMaterial color={bg.ringColor} transparent opacity={bg.ringOpacity * 0.6} />
    </mesh>
  );
}

/** 舊地面（fallback）：主色圓盤＋radial 淡出邊緣融入背景 */
function Ground({ bg }: { bg: BattleBgConfig }) {
  const fadeTex = useFadeTexture();
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -1]}>
        <circleGeometry args={[7, 48]} />
        <meshStandardMaterial color={bg.floorColor} roughness={0.95} transparent alphaMap={fadeTex} />
      </mesh>
      <FocusRing bg={bg} />
    </group>
  );
}

/** 舊遠景天幕（fallback）：小販中心背景圖大平面（唔受霧影響） */
function Backdrop({ bg }: { bg: BattleBgConfig }) {
  const tex = useLoader(THREE.TextureLoader, bg.image);
  tex.colorSpace = THREE.SRGBColorSpace;
  return (
    <mesh position={[0, 2.6, -7.5]}>
      <planeGeometry args={[17, 9.8]} />
      <meshBasicMaterial map={tex} fog={false} depthWrite={false} />
    </mesh>
  );
}

/** 全景模式場景：GroundedSkybox 地面投影——全景下半球攤平做 y=0 地面，
 *  精靈直接企喺「相片入面嘅地板」上，透視自動銜接，唔使再砌假地氈 */
function PanoScene({
  bg,
  npcLines,
  npcWatching,
}: {
  bg: BattleBgConfig;
  npcLines?: NpcLines;
  npcWatching?: boolean;
}) {
  const tex = useLoader(THREE.TextureLoader, bg.panorama!);
  const skybox = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    const sky = new GroundedSkybox(tex, PANO_EYE_HEIGHT, PANO_RADIUS);
    // 抬高 height 令投影地平面貼喺 y=0；轉 180° 令 equirect 接縫留喺初始視角背後
    sky.position.y = PANO_EYE_HEIGHT - 0.01;
    sky.rotation.y = Math.PI;
    return sky;
  }, [tex]);
  useEffect(
    () => () => {
      skybox.geometry.dispose();
      (skybox.material as THREE.Material).dispose();
    },
    [skybox]
  );
  return (
    <>
      {/* 冇霧：相片地面自己有透視同明暗，落霧反而變得矇 */}
      <ambientLight color={bg.ambientColor} intensity={bg.ambientIntensity * 1.25} />
      <directionalLight
        color={bg.directionalColor}
        intensity={bg.directionalIntensity}
        position={[2.5, 4, 2]}
      />
      <AnimatedPointLight bg={bg} />
      <primitive object={skybox} />
      <FocusRing bg={bg} />
      {bg.panoShafts && <LightShafts color={bg.panoShafts.color} count={bg.panoShafts.count} />}
      {bg.panoLife && (
        <BackgroundLife
          life={bg.panoLife}
          ambientColor={bg.ambientColor}
          lines={npcLines}
          watching={npcWatching}
        />
      )}
    </>
  );
}

/** 後備場景：唔使載任何圖片（燈光＋主色地面），
 *  全景圖載入中／載入失敗（慢網絡、舊機）時保證有嘢見，唔會黑屏 */
function LiteScene({ bg }: { bg: BattleBgConfig }) {
  return (
    <>
      <fog attach="fog" args={[bg.floorColor, 6, 12]} />
      <ambientLight color={bg.ambientColor} intensity={bg.ambientIntensity} />
      <directionalLight
        color={bg.directionalColor}
        intensity={bg.directionalIntensity}
        position={[2.5, 4, 2]}
      />
      <pointLight color={bg.pointColor} intensity={bg.pointIntensity * 0.6} position={[0, 2.2, -1.5]} distance={9} />
      <Ground bg={bg} />
    </>
  );
}

/** R3F 場景錯誤欄柵：貼圖載入失敗（404／解碼錯）時退回 LiteScene，唔好拖冧成個 Canvas */
class SceneErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** 舊版場景（冇 panorama 嘅主題）：平面天幕＋主色地盤 */
function ClassicScene({ bg }: { bg: BattleBgConfig }) {
  return (
    <>
      <fog attach="fog" args={[bg.floorColor, 6, 12]} />
      <ambientLight color={bg.ambientColor} intensity={bg.ambientIntensity} />
      <directionalLight
        color={bg.directionalColor}
        intensity={bg.directionalIntensity}
        position={[2.5, 4, 2]}
      />
      <pointLight color={bg.pointColor} intensity={bg.pointIntensity * 0.6} position={[0, 2.2, -1.5]} distance={9} />
      <Backdrop bg={bg} />
      <Ground bg={bg} />
    </>
  );
}

export default function CaptureStage3d({
  bg,
  yawRef,
  npcLines,
  npcWatching = false,
}: {
  bg: BattleBgConfig;
  yawRef: MutableRefObject<number>;
  /** 背景 NPC 對白（i18n 喺 Canvas 外讀好傳入） */
  npcLines?: NpcLines;
  /** 玩家搏鬥中：NPC 停低圍觀 */
  npcWatching?: boolean;
}) {
  // 全景大空間：粒子加密加大＋出生範圍攤開（切磋頁繼續用原版 bg.ambience）
  const panoAmbience = useMemo(
    () =>
      bg.ambience.map((l) => ({
        ...l,
        count: Math.round(l.count * 1.8),
        size: (l.size ?? 1) * 1.25,
        opacity: Math.min(1, (l.opacity ?? 0.6) * 1.2),
        spread: 1.8,
      })),
    [bg]
  );
  return (
    <>
      <Stage3dCamera yawRef={yawRef} />
      <SceneErrorBoundary fallback={<LiteScene bg={bg} />}>
        <Suspense fallback={<LiteScene bg={bg} />}>
          {bg.panorama ? (
            <PanoScene bg={bg} npcLines={npcLines} npcWatching={npcWatching} />
          ) : (
            <ClassicScene bg={bg} />
          )}
        </Suspense>
      </SceneErrorBoundary>
      <BattleAmbience layers={bg.panorama ? panoAmbience : bg.ambience} />
    </>
  );
}
