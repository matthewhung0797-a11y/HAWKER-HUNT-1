"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AmbienceLayer } from "@/content/battle-bgs";

/**
 * 場景氛圍粒子：全程循環（同 BattleFx 一次性事件相反），
 * 粒子死亡即重生。佈局避開擂台中心精靈企位，集中喺邊緣、深處同上空。
 */

interface AmbParticle {
  layerIdx: number;
  /** 0→1 進度；>=1 重生 */
  t: number;
  /** 週期（秒） */
  dur: number;
  origin: THREE.Vector3;
  drift: THREE.Vector3;
  size: number;
  /** twinkle/擺動相位 */
  phase: number;
  color: THREE.Color;
}

function makeSoftTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** 每種原語嘅重生規則：出生點、漂移向量、週期 */
function spawn(p: AmbParticle, layer: AmbienceLayer, initial = false) {
  const speed = layer.speed ?? 1;
  switch (layer.primitive) {
    case "steam": {
      // 兩側升騰：avoid 中心 |x| < 1
      const side = Math.random() < 0.5 ? -1 : 1;
      p.origin.set(side * rnd(1.0, 2.3), rnd(-0.1, 0.4), rnd(-2.2, 0.4));
      p.drift.set(side * rnd(-0.06, 0.12), rnd(0.14, 0.24) * speed, rnd(-0.03, 0.03));
      p.dur = rnd(7, 12) / speed;
      break;
    }
    case "embers": {
      if (layer.falling) {
        // 由上空灑落（金塵）
        p.origin.set(rnd(-0.9, 1.1), rnd(1.6, 2.6), rnd(-1.8, -0.3));
        p.drift.set(rnd(-0.04, 0.04), -rnd(0.12, 0.22) * speed, rnd(-0.02, 0.02));
        p.dur = rnd(8, 13) / speed;
      } else {
        // 擂台邊緣升起
        const a = Math.random() * Math.PI * 2;
        const r = rnd(1.7, 2.5);
        p.origin.set(Math.cos(a) * r, rnd(0, 0.15), Math.sin(a) * r * 0.8 - 0.4);
        p.drift.set(rnd(-0.05, 0.05), rnd(0.3, 0.55) * speed, rnd(-0.04, 0.04));
        p.dur = rnd(2.6, 4.5) / speed;
      }
      break;
    }
    case "bubbles": {
      const side = Math.random() < 0.5 ? -1 : 1;
      p.origin.set(side * rnd(0.7, 2.2), rnd(0, 0.1), rnd(-2.0, 0.6));
      p.drift.set(0, rnd(0.18, 0.3) * speed, 0);
      p.dur = rnd(5, 8) / speed;
      break;
    }
    case "sparkle": {
      p.origin.set(rnd(-2.2, 2.2), rnd(0.2, 2.2), rnd(-2.6, 0.3));
      p.drift.set(rnd(-0.02, 0.02), rnd(-0.015, 0.03), 0);
      p.dur = rnd(4, 7);
      break;
    }
    case "rain": {
      p.origin.set(rnd(-2.6, 2.6), rnd(2.4, 3.2), rnd(-3, 0.8));
      p.drift.set(rnd(-0.15, 0.05), -rnd(4.5, 6.5) * speed, 0);
      p.dur = (p.origin.y + 0.1) / -p.drift.y;
      break;
    }
    case "ripple": {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(0.9, 2.2);
      p.origin.set(Math.cos(a) * r, 0.015, Math.sin(a) * r * 0.7 - 0.5);
      p.dur = rnd(2.2, 3.5) / speed;
      break;
    }
  }
  // spread：出生點 x/z 攤開（全景大空間用），y／漂移唔變
  const spread = layer.spread ?? 1;
  if (spread !== 1) {
    p.origin.x *= spread;
    p.origin.z *= spread;
  }
  p.phase = Math.random() * Math.PI * 2;
  // 初始鋪開週期，避免成批粒子同步出生
  p.t = initial ? Math.random() : 0;
}

export default function BattleAmbience({ layers }: { layers: AmbienceLayer[] }) {
  const tex = useMemo(makeSoftTexture, []);

  const particles = useMemo(() => {
    const list: AmbParticle[] = [];
    layers.forEach((layer, layerIdx) => {
      for (let i = 0; i < layer.count; i++) {
        const p: AmbParticle = {
          layerIdx,
          t: 0,
          dur: 1,
          origin: new THREE.Vector3(),
          drift: new THREE.Vector3(),
          size: (layer.size ?? 1) * 0.08,
          phase: 0,
          color: new THREE.Color(layer.colors[i % layer.colors.length]),
        };
        // 原語基準尺寸
        const base =
          layer.primitive === "steam" ? 0.85 :
          layer.primitive === "rain" ? 0.05 :
          layer.primitive === "bubbles" ? 0.045 :
          0.05;
        p.size = base * (layer.size ?? 1) * rnd(0.7, 1.4);
        spawn(p, layer, true);
        list.push(p);
      }
    });
    return list;
  }, [layers]);

  const spriteRefs = useRef<(THREE.Sprite | null)[]>([]);
  const rippleRefs = useRef<(THREE.Mesh | null)[]>([]);

  // ripple 用 mesh，其他用 sprite——分兩份索引
  const rippleIdx = useMemo(
    () => particles.map((p, i) => (layers[p.layerIdx].primitive === "ripple" ? i : -1)).filter((i) => i >= 0),
    [particles, layers]
  );

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const layer = layers[p.layerIdx];
      p.t += delta / p.dur;
      if (p.t >= 1) spawn(p, layer);

      const maxOpacity = layer.opacity ?? 0.6;
      // 淡入淡出包絡：頭 15% 淡入，尾 25% 淡出
      const env = Math.min(1, p.t / 0.15) * Math.min(1, (1 - p.t) / 0.25);

      if (layer.primitive === "ripple") {
        const m = rippleRefs.current[rippleIdx.indexOf(i)];
        if (!m) continue;
        m.position.copy(p.origin);
        const s = 0.25 + p.t * 1.4;
        m.scale.setScalar(s);
        (m.material as THREE.MeshBasicMaterial).opacity = (1 - p.t) * maxOpacity;
        m.visible = true;
        continue;
      }

      const s = spriteRefs.current[i];
      if (!s) continue;
      const elapsed = p.t * p.dur;
      s.position.set(
        p.origin.x + p.drift.x * elapsed,
        p.origin.y + p.drift.y * elapsed,
        p.origin.z + p.drift.z * elapsed
      );
      const mat = s.material as THREE.SpriteMaterial;

      switch (layer.primitive) {
        case "steam":
          s.position.x += Math.sin(now * 0.4 + p.phase) * 0.08;
          s.scale.setScalar(p.size * (1 + p.t * 0.9));
          mat.rotation = p.phase + now * 0.05;
          mat.opacity = env * maxOpacity;
          break;
        case "embers":
          s.position.x += Math.sin(now * 2.2 + p.phase) * 0.05;
          s.scale.setScalar(p.size * (1 - p.t * 0.4));
          mat.opacity = env * maxOpacity;
          break;
        case "bubbles":
          s.position.x += Math.sin(now * 1.6 + p.phase) * 0.03;
          s.scale.setScalar(p.size);
          mat.opacity = env * maxOpacity;
          break;
        case "sparkle": {
          s.scale.setScalar(p.size);
          // 明滅 twinkle
          const tw = 0.5 + 0.5 * Math.sin(now * rnd2(p.phase) + p.phase * 3);
          mat.opacity = env * maxOpacity * (0.25 + 0.75 * tw * tw);
          break;
        }
        case "rain":
          s.scale.set(p.size * 0.22, p.size * 5.5, 1);
          mat.opacity = env * maxOpacity;
          break;
      }
      s.visible = true;
    }
  });

  return (
    <group>
      {particles.map((p, i) => {
        const layer = layers[p.layerIdx];
        if (layer.primitive === "ripple") return null;
        // steam 用 normal blending 先似霧；發光粒子用 additive
        const additive = layer.primitive !== "steam" && layer.primitive !== "rain";
        return (
          <sprite key={i} ref={(el) => void (spriteRefs.current[i] = el)} visible={false}>
            <spriteMaterial
              map={tex}
              color={p.color}
              transparent
              opacity={0}
              depthWrite={false}
              blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
            />
          </sprite>
        );
      })}
      {rippleIdx.map((pi, k) => (
        <mesh
          key={`rip-${k}`}
          ref={(el) => void (rippleRefs.current[k] = el)}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        >
          <ringGeometry args={[0.4, 0.48, 36]} />
          <meshBasicMaterial
            color={particles[pi].color}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}

/** 由 phase 推一個穩定嘅 twinkle 頻率（3–7Hz），避免逐粒儲多一個欄位 */
function rnd2(phase: number) {
  return 3 + ((phase * 137.5) % 4);
}
