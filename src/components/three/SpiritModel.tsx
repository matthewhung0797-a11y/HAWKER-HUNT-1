"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { SPECIES_MAP } from "@/content/species";

export type SpiritAnim =
  | "idle"
  | "walk"
  | "attack"
  | "skill"
  | "hit"
  | "down"
  | "victory"
  | "none";

/** 一次性動作（播完自動停格或者返回 idle） */
const ONE_SHOT: SpiritAnim[] = ["attack", "skill", "hit", "down", "victory"];

/** GLB 模型：有 rig 動畫 clips 就播，冇就淨擺 mesh（由父層程序化動畫托底） */
function GlbSpirit({
  url,
  heightM,
  anim,
  timeScale = 1,
  yaw = 0,
  stripRoot = false,
  onClipEnd,
}: {
  url: string;
  heightM: number;
  anim: SpiritAnim;
  timeScale?: number;
  /** 正面朝向修正（弧度），bbox 計算前先烘入 root */
  yaw?: number;
  /** 剔除 clip 內根骨嘅旋轉/位移軌（Tripo 將 root motion 烘入 keyframe，
   *  會搶走遊戲嘅 lookAt 朝向控制） */
  stripRoot?: boolean;
  onClipEnd?: () => void;
}) {
  const { scene, animations } = useGLTF(url);
  // 診斷用：`diag-yaw-sweep` 設 window.__dbgYaw／__dbgYawFor；生產唔設就用 species yaw
  const dbgYaw =
    typeof window !== "undefined"
      ? (window as Window & { __dbgYaw?: number; __dbgYawFor?: string }).__dbgYaw
      : undefined;
  const dbgFor =
    typeof window !== "undefined"
      ? (window as Window & { __dbgYawFor?: string }).__dbgYawFor
      : undefined;
  const effectiveYaw =
    typeof dbgYaw === "number" && (!dbgFor || url.includes(dbgFor)) ? dbgYaw : yaw;
  // skinned mesh 一定要用 SkeletonUtils clone，否則骨架引用會斷
  const cloned = useMemo(() => {
    const c = cloneSkinned(scene);
    c.rotation.y = effectiveYaw;
    return c;
  }, [scene, effectiveYaw]);
  const filteredAnims = useMemo(() => {
    if (!stripRoot) return animations;
    return animations.map((clip) => {
      const tracks = clip.tracks.filter((t) => !/Root\.(quaternion|position)$/.test(t.name));
      return new THREE.AnimationClip(clip.name, clip.duration, tracks);
    });
  }, [animations, stripRoot]);
  const group = useRef<THREE.Group>(null);
  const { actions, names, mixer } = useAnimations(filteredAnims, group);
  // timeScale 改變唔應該重播 clip：主 effect 用 ref 讀，另開 effect 熱更新
  const tsRef = useRef(timeScale);
  tsRef.current = timeScale;
  const currentAction = useRef<THREE.AnimationAction | null>(null);
  useEffect(() => {
    currentAction.current?.setEffectiveTimeScale(timeScale);
  }, [timeScale]);

  const { scale, offset } = useMemo(() => {
    // skinned mesh 嘅頂點跟骨骼行，唔跟 node transform：
    // 一定要用 SkinnedMesh.computeBoundingBox()（skin-aware）計實際渲染尺寸
    cloned.updateMatrixWorld(true);
    const box = new THREE.Box3();
    cloned.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const sm = mesh as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh) {
        sm.frustumCulled = false; // 靜態 bbox 唔啱，防止被錯誤剔除
        sm.skeleton.update(); // 首次 render 前 boneMatrices 係空，唔行呢步 bbox 會塌成 0
        sm.computeBoundingBox();
        if (sm.boundingBox) box.union(sm.boundingBox.clone().applyMatrix4(sm.matrixWorld));
      } else {
        mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox)
          box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
      }
    });
    const size = box.getSize(new THREE.Vector3());
    const s = heightM / Math.max(size.y, 0.0001);
    const center = box.getCenter(new THREE.Vector3());
    return {
      scale: s,
      offset: new THREE.Vector3(-center.x * s, -box.min.y * s, -center.z * s),
    };
  }, [cloned, heightM, url]);

  useEffect(() => {
    if (names.length === 0 || anim === "none") return;
    const clip = names.includes(anim) ? anim : names.includes("idle") ? "idle" : names[0];
    const action = actions[clip];
    if (!action) return;
    const oneShot = ONE_SHOT.includes(clip as SpiritAnim);
    action.reset().fadeIn(0.18).setEffectiveTimeScale(tsRef.current);
    currentAction.current = action;
    if (oneShot) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.play();

    let finished: ((e: { action: THREE.AnimationAction }) => void) | null = null;
    if (oneShot) {
      finished = (e) => {
        if (e.action === action) onClipEnd?.();
      };
      mixer.addEventListener("finished", finished);
    }
    return () => {
      if (finished) mixer.removeEventListener("finished", finished);
      action.fadeOut(0.18);
    };
  }, [anim, actions, names, mixer, onClipEnd]);

  return (
    <group ref={group} scale={scale} position={offset}>
      <primitive object={cloned} />
    </group>
  );
}

/** 全身 2D 插圖 billboard sprite（永遠面向相機，Pokémon GO 風格） */
function SpriteSpirit({ speciesId, heightM }: { speciesId: string; heightM: number }) {
  const tex = useLoader(THREE.TextureLoader, `/spirits/full/${speciesId}.webp`);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = tex.image as HTMLImageElement | undefined;
  const aspect = img && img.height ? img.width / img.height : 1;
  return (
    <sprite position={[0, heightM / 2, 0]} scale={[heightM * aspect, heightM, 1]}>
      <spriteMaterial map={tex} transparent alphaTest={0.05} />
    </sprite>
  );
}

/** 閃光精靈環繞閃粉：幾粒加色小光點圍住身體明滅 */
function ShinyAura({ heightM }: { heightM: number }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
    grad.addColorStop(0, "rgba(255,240,180,1)");
    grad.addColorStop(0.5, "rgba(255,215,120,0.5)");
    grad.addColorStop(1, "rgba(255,215,120,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  }, []);
  const refs = useRef<(THREE.Sprite | null)[]>([]);
  const seeds = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        ang: (i / 7) * Math.PI * 2 + Math.random(),
        rad: heightM * (0.35 + Math.random() * 0.3),
        h: heightM * (0.15 + Math.random() * 0.85),
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 0.7,
      })),
    [heightM]
  );
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    seeds.forEach((s, i) => {
      const sp = refs.current[i];
      if (!sp) return;
      const a = s.ang + t * s.speed;
      sp.position.set(Math.cos(a) * s.rad, s.h + Math.sin(t * 1.7 + s.phase) * heightM * 0.06, Math.sin(a) * s.rad);
      const tw = Math.max(0, Math.sin(t * 2.6 + s.phase));
      sp.scale.setScalar(heightM * 0.1 * (0.4 + tw));
      (sp.material as THREE.SpriteMaterial).opacity = tw * 0.9;
    });
  });
  return (
    <>
      {seeds.map((_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <spriteMaterial
            map={tex}
            color="#ffe9a8"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </sprite>
      ))}
    </>
  );
}

/** 管線／診斷預覽：唔靠 SPECIES_MAP（未 publish 嘅 draft 都影到） */
export type SpiritModelPreview = {
  modelUrl: string;
  modelHeightM?: number;
  modelYaw?: number;
  animated?: boolean;
  rigLite?: boolean;
};

/**
 * 精靈 3D 模型：有 modelUrl 用 GLB（有 clips 播骨骼動畫），否則 2D billboard。
 * 程序化 idle 浮動 + hit 搖晃係托底（無 rig 模型都有生命感）。
 */
export default function SpiritModel({
  speciesId,
  preview,
  anim = "idle",
  spin = false,
  timeScale = 1,
  shadow = true,
  shiny = false,
  flashKey = 0,
  onClipEnd,
}: {
  speciesId: string;
  /** 有就覆蓋 SPECIES_MAP（facing-lab／未入圖鑑 draft） */
  preview?: SpiritModelPreview;
  anim?: SpiritAnim;
  spin?: boolean;
  /** 骨骼動畫播放速度（行路快慢同步用） */
  timeScale?: number;
  /** 內置定位陰影；父層自己管陰影（例如跳起要縮影）就閂咗佢 */
  shadow?: boolean;
  /** 閃光變異：模型維持 100% 原色，淨靠環繞閃粉（ShinyAura）＋✦ 徽章區別 */
  shiny?: boolean;
  /** 受擊白閃觸發 key（戰鬥命中手感用；唔傳就無效果） */
  flashKey?: number;
  onClipEnd?: () => void;
}) {
  const catalog = SPECIES_MAP[speciesId];
  const species = preview?.modelUrl
    ? {
        id: speciesId,
        modelUrl: preview.modelUrl,
        modelHeightM: preview.modelHeightM ?? catalog?.modelHeightM ?? 0.5,
        modelYaw: preview.modelYaw ?? 0,
        animated: preview.animated ?? catalog?.animated,
        rigLite: preview.rigLite ?? catalog?.rigLite,
      }
    : catalog;
  const groupRef = useRef<THREE.Group>(null);
  const [hitT, setHitT] = useState(0);
  // 程序化出擊：靜態／弱 rig（rigLite）冇大幅 root motion，攻擊會好硬——補一個
  // 「蓄力後仰 → 前撲一擊 → 回彈」嘅身體動作（唔燒 credits，即刻有出擊感）
  const atkT = useRef(0);
  const prevAnim = useRef<SpiritAnim>(anim);
  // 受擊白閃：additive 光暈罩住全身一閃即逝（唔郁共享材質，capture 頁零影響）
  const flashSprite = useRef<THREE.Sprite>(null);
  const flashT = useRef(0);
  const prevFlashKey = useRef(flashKey);
  const flashTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => {
    if (prevFlashKey.current !== flashKey) {
      prevFlashKey.current = flashKey;
      flashT.current = 1;
    }
  }, [flashKey]);
  // 全套 rig（Meshy 人形骨架）唔使程序化托底；
  // 弱 rig（rigLite，Tripo 簡骨架幅度細）程序化動畫疊喺 clip 上補生命感
  const fullRig = Boolean(species?.animated) && !species?.rigLite;

  useEffect(() => {
    if (anim === "hit" && !fullRig) setHitT(1);
  }, [anim, fullRig]);

  // 進入 attack/skill 一刻觸發程序化出擊（只限非 fullRig；fullRig 播真 clip 唔使補）
  useEffect(() => {
    if (prevAnim.current !== anim) {
      prevAnim.current = anim;
      if ((anim === "attack" || anim === "skill") && !fullRig) atkT.current = 1;
    }
  }, [anim, fullRig]);

  useFrame((state, delta) => {
    // 白閃衰減（獨立於 rig 類型）
    const fs = flashSprite.current;
    if (fs) {
      if (flashT.current > 0) {
        flashT.current = Math.max(0, flashT.current - delta * 7);
        fs.visible = true;
        (fs.material as THREE.SpriteMaterial).opacity = flashT.current * 0.9;
      } else {
        fs.visible = false;
      }
    }
    const g = groupRef.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (spin) {
      g.rotation.y += delta * 0.6;
    } else if (!fullRig) {
      g.rotation.y = Math.sin(t * 1.1) * 0.12;
    }
    if (fullRig) return;
    // 非 fullRig：idle 浮動 + 程序化出擊 + 受擊搖晃，全部疊加後一次過寫落 transform
    let posY = anim === "none" ? 0 : Math.sin(t * 2.2) * 0.02;
    let rotX = 0;
    let rotZ = 0;
    let scale = 1;

    // 程序化出擊：前 28% 蓄力後仰，之後前撲一擊（正弦包絡）再回彈；~0.42s
    if (atkT.current > 0) {
      atkT.current = Math.max(0, atkT.current - delta * 2.4);
      const p = 1 - atkT.current; // 進度 0→1
      const lean =
        p < 0.28
          ? -(p / 0.28) * 0.22 // 蓄力後仰
          : Math.sin(((p - 0.28) / 0.72) * Math.PI) * 0.5; // 前撲一擊
      rotX = -lean; // 負 = 頂部傾向對手（前撲/俯衝）
      posY += Math.max(0, lean) * 0.04; // 出擊帶少少彈起
      scale *= 1 + Math.max(0, lean) * 0.08; // 一擊放大少少加力量感
    }

    // 受擊搖晃衰減
    if (hitT > 0) {
      rotZ = Math.sin(t * 40) * 0.12 * hitT;
      scale *= 1 - 0.08 * hitT;
      setHitT(Math.max(0, hitT - delta * 2));
    }

    g.position.y = posY;
    g.rotation.x = rotX;
    g.rotation.z = rotZ;
    g.scale.setScalar(scale);
  });

  if (!species) return null;

  return (
    <group ref={groupRef}>
      {species.modelUrl ? (
        <GlbSpirit
          url={species.modelUrl}
          heightM={species.modelHeightM}
          anim={anim}
          timeScale={timeScale}
          yaw={species.modelYaw ?? 0}
          stripRoot={Boolean(species.rigLite)}
          onClipEnd={onClipEnd}
        />
      ) : (
        <SpriteSpirit speciesId={speciesId} heightM={species.modelHeightM} />
      )}
      {shiny && <ShinyAura heightM={species.modelHeightM} />}
      {/* 受擊白閃罩 */}
      <sprite
        ref={flashSprite}
        visible={false}
        position={[0, species.modelHeightM * 0.5, 0]}
        scale={[species.modelHeightM * 1.15, species.modelHeightM * 1.15, 1]}
      >
        <spriteMaterial
          map={flashTex}
          transparent
          opacity={0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      {/* 定位陰影 */}
      {shadow && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
          <circleGeometry args={[species.modelHeightM * 0.45, 32]} />
          <meshBasicMaterial color="#000" transparent opacity={0.25} />
        </mesh>
      )}
    </group>
  );
}
