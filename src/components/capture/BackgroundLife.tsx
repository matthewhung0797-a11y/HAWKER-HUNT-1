"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { PanoLifeConfig } from "@/content/battle-bgs";
import { SPECIES_MAP } from "@/content/species";
import SpiritModel from "@/components/three/SpiritModel";

/**
 * 全景場景「背景小劇場」：令張全景相有嘢喺度發生緊。
 * - NpcWalker：遠景 NPC 精靈（3D GLB 模型播 walk 骨骼動畫，真係邁腿行）喺檔口
 *   通道行來行去、停低、面向行進方向；玩家搏鬥時（watching）停低面向擂台圍觀，
 *   間中講句唔幸災樂禍嘅閒話（Html 泡泡）。冇 3D 模型嘅品種 SpiritModel 自動退回 2D。
 * - TossStall：檔口位食材定時彈拋物線＋自旋（「有人喺度拋鑊／執料」嘅印象）
 * 貼地手段：模型受場景燈光照＋定位陰影；食材 sprite 用色溫 tint＋blob shadow。
 */

/** NPC 對白（i18n 喺 Canvas 外讀好傳入，因為 next-intl context 過唔到 R3F） */
export interface NpcLines {
  /** 平時閒逛：市井閒話 */
  idle: string[];
  /** 玩家捉緊時圍觀：打氣但唔幫拖 */
  watch: string[];
}

/** NPC 遊走帶深度（負 z 愈深；每隻再錯開，避免重疊） */
const NPC_Z = -6.2;
/** 遊走 x 範圍（全景通道闊度內） */
const NPC_X_RANGE = 4.6;
/** 泡泡顯示時長（秒） */
const BUBBLE_DUR = 2.6;

/** 橢圓 blob shadow 貼圖：radial 漸變黑圈貼地，平價但有效嘅貼地線索 */
function useBlobShadowTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(0.6, "rgba(0,0,0,0.28)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
}

function NpcWalker({
  speciesId,
  index,
  lines,
  watching,
}: {
  speciesId: string;
  index: number;
  lines?: NpcLines;
  watching: boolean;
}) {
  // 3D 模型用品種原生身高，但太細嘅喺遠景會睇唔清——放大到至少 0.55m 顯示高度
  const { displayH, modelScale } = useMemo(() => {
    const h = SPECIES_MAP[speciesId]?.modelHeightM ?? 0.5;
    const scale = Math.max(1, 0.55 / h);
    return { displayH: h * scale, modelScale: scale };
  }, [speciesId]);
  const group = useRef<THREE.Group>(null);
  const st = useRef({
    x: (index % 2 ? 1 : -1) * (1.6 + index * 1.2),
    target: (index % 2 ? 1 : -1) * (1.6 + index * 1.2),
    pause: 1.2 + index * 1.9,
    speed: 0.55,
    yaw: 0,
    // 對白節奏（clock 秒）：兩隻 NPC 用 index 錯開，唔會同時開口
    nextTalkAt: 6 + index * 7,
    hideAt: 0,
    lastLine: -1,
    wasWatching: false,
  });
  const [walking, setWalking] = useState(false);
  const [bubble, setBubble] = useState<{ text: string; key: number } | null>(null);
  const bubbleKey = useRef(0);
  const z = NPC_Z - index * 1.5;

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const s = st.current;
    const t = state.clock.elapsedTime;

    // —— 圍觀切換 ——
    if (watching !== s.wasWatching) {
      s.wasWatching = watching;
      if (watching) {
        // 開波即刻有反應：第一隻好快開口，第二隻遲幾秒
        s.nextTalkAt = t + 0.8 + index * 3.8;
      } else {
        s.nextTalkAt = t + 5 + Math.random() * 6;
      }
    }

    // —— 移動 ——（targetYaw：行緊面向行進方向，企定／圍觀面向鏡頭／擂台）
    let moving = false;
    let targetYaw = 0;
    if (watching) {
      // 圍觀：企定微微側身望向擂台（x=0 方向）
      targetYaw = s.x > 0 ? -0.5 : 0.5;
    } else if (s.pause > 0) {
      s.pause -= delta;
      if (s.pause <= 0) {
        s.target = (Math.random() * 2 - 1) * NPC_X_RANGE;
        s.speed = 0.45 + Math.random() * 0.35;
      }
    } else {
      const dx = s.target - s.x;
      const step = Math.sign(dx) * s.speed * delta;
      if (Math.abs(dx) <= Math.abs(step)) {
        s.x = s.target;
        s.pause = 1.5 + Math.random() * 3.2;
      } else {
        s.x += step;
        moving = true;
        // 模型正面朝 +z（鏡頭方向）：轉 ±90° 面向行進方向
        targetYaw = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
    if (moving !== walking) setWalking(moving);

    // 平滑轉身
    s.yaw += (targetYaw - s.yaw) * Math.min(1, delta * 6);
    g.position.x = s.x;
    g.rotation.y = s.yaw;

    // —— 對白 ——（企定先開口，行緊唔講）
    if (bubble && t >= s.hideAt) setBubble(null);
    if (lines && !bubble && t >= s.nextTalkAt && (watching || s.pause > 0)) {
      const pool = watching ? lines.watch : lines.idle;
      if (pool.length) {
        let idx = Math.floor(Math.random() * pool.length);
        if (pool.length > 1 && idx === s.lastLine) idx = (idx + 1) % pool.length;
        s.lastLine = idx;
        bubbleKey.current += 1;
        setBubble({ text: pool[idx], key: bubbleKey.current });
        s.hideAt = t + BUBBLE_DUR;
      }
      // 圍觀嗰陣密啲（緊張感），閒逛疏啲
      s.nextTalkAt = t + (watching ? 8 + Math.random() * 5 : 11 + Math.random() * 7);
    }
  });

  return (
    <group ref={group} position={[st.current.x, 0, z]}>
      <group scale={modelScale}>
        {/* 真 3D 模型行路：walk 骨骼動畫＋受場景燈光照；冇 GLB 嘅品種自動退回 2D 立繪 */}
        <SpiritModel speciesId={speciesId} anim={walking ? "walk" : "idle"} timeScale={1.1} />
      </group>
      {bubble && (
        <Html
          position={[0, displayH + 0.3, 0]}
          center
          zIndexRange={[5, 0]}
          style={{ pointerEvents: "none" }}
        >
          <div
            key={bubble.key}
            className="bubble-pop whitespace-nowrap rounded-xl border-2 border-ink/20 bg-white/90 px-2.5 py-1 text-[11px] font-black text-ink shadow-md"
          >
            {bubble.text}
          </div>
        </Html>
      )}
    </group>
  );
}

const TOSS_SIZE = 0.26;
/** 一次拋鑊歷時（秒） */
const TOSS_DUR = 0.95;

function TossStall({
  items,
  pos,
  index,
  tint,
}: {
  items: string[];
  pos: [number, number, number];
  index: number;
  tint: THREE.Color;
}) {
  const texs = useLoader(
    THREE.TextureLoader,
    items.map((i) => `/ui/${i}.webp`)
  ) as THREE.Texture[];
  useMemo(() => {
    texs.forEach((t) => (t.colorSpace = THREE.SRGBColorSpace));
  }, [texs]);
  const shadowTex = useBlobShadowTexture();
  const sprite = useRef<THREE.Sprite>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const st = useRef({
    wait: 1.5 + index * 2.3,
    t: 0,
    item: 0,
    side: 1,
    spin: 1,
  });
  const restY = pos[1] + TOSS_SIZE * 0.42;

  useFrame((_, delta) => {
    const sp = sprite.current;
    if (!sp) return;
    const s = st.current;
    const mat = sp.material as THREE.SpriteMaterial;

    let h = 0;
    let x = pos[0];
    if (s.wait > 0) {
      s.wait -= delta;
      sp.position.set(pos[0], restY, pos[2]);
      mat.rotation = 0;
      if (s.wait <= 0) {
        s.t = 0;
        s.side = Math.random() < 0.5 ? -1 : 1;
        s.spin = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.random());
      }
    } else {
      s.t += delta / TOSS_DUR;
      if (s.t >= 1) {
        // 落返地：換下一款食材，抖返陣先再拋
        s.wait = 2.6 + Math.random() * 3.4;
        s.item = (s.item + 1) % texs.length;
        mat.map = texs[s.item];
        mat.needsUpdate = true;
        sp.position.set(pos[0], restY, pos[2]);
        mat.rotation = 0;
      } else {
        // 拋物線＋自旋（似俾人喺鑊入面拋起）
        h = 4 * s.t * (1 - s.t);
        x = pos[0] + s.t * 0.3 * s.side;
        sp.position.set(x, restY + h * 0.85, pos[2]);
        mat.rotation = s.t * Math.PI * 2 * s.spin;
      }
    }

    // 影跟住 x 位；飛得愈高影愈細愈淡（貼地線索）
    const sh = shadow.current;
    if (sh) {
      sh.position.set(x, pos[1] + 0.012, pos[2]);
      const k = 1 - h * 0.45;
      sh.scale.set(k, k, 1);
      (sh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, 0.8 - h * 0.5);
    }
  });

  return (
    <group>
      <sprite ref={sprite} position={[pos[0], restY, pos[2]]} scale={[TOSS_SIZE, TOSS_SIZE, 1]}>
        {/* tint：乘場景色溫，令食材融入場景唔自己發光 */}
        <spriteMaterial map={texs[0]} color={tint} transparent depthWrite={false} />
      </sprite>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]} position={[pos[0], pos[1] + 0.012, pos[2]]}>
        <planeGeometry args={[TOSS_SIZE * 1.35, TOSS_SIZE * 0.9]} />
        <meshBasicMaterial map={shadowTex} transparent opacity={0.8} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function BackgroundLife({
  life,
  ambientColor,
  lines,
  watching = false,
}: {
  life: PanoLifeConfig;
  ambientColor: string;
  lines?: NpcLines;
  watching?: boolean;
}) {
  // 場景色溫 tint：ambient 溝白留返少少，令 sprite 跟場景光暗唔似貼紙咁發光
  const tint = useMemo(() => new THREE.Color(ambientColor).lerp(new THREE.Color("#ffffff"), 0.45), [ambientColor]);
  return (
    <>
      {life.npcs?.map((id, i) => (
        // 每隻 NPC 獨立 Suspense：GLB 載入中唔會拖住成個全景場景
        <Suspense key={id} fallback={null}>
          <NpcWalker speciesId={id} index={i} lines={lines} watching={watching} />
        </Suspense>
      ))}
      {life.toss?.map((t, i) => (
        <TossStall key={i} items={t.items} pos={t.pos} index={i} tint={tint} />
      ))}
    </>
  );
}
