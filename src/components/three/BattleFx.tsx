"use client";

import { useMemo, useRef, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import {
  SKILL_FX,
  DEFAULT_SKILL_FX,
  BASIC_FX,
  ELEMENT_FX_COLORS,
  ELEMENT_FX_PHYSICS,
  type SkillFxConfig,
  type FoodParticleKind,
} from "@/content/skill-fx";
import { getFoodTexture, TINTABLE } from "./food-particles";
import { SIGNATURE_FX, type SigCtx } from "./signature-fx";
import type { ElementType } from "@/content/types";

/**
 * 戰鬥特效系統：粒子池＋時間軸調度。
 * 「假 bloom」= 每粒粒子由「大而淡嘅光暈＋細而亮嘅核心」兩層 additive sprite 組成，
 * 唔使 EffectComposer（透明 Canvas 疊 CSS 背景圖，post-processing 會壓走 alpha）。
 */

export type FxKind = "skill" | "heal" | "ko" | "charge";

export interface BattleFxEvent {
  key: number;
  kind: FxKind;
  skillId?: string;
  element: ElementType;
  /** 攻擊/施術方位置 */
  from: [number, number, number];
  /** 受擊方位置（heal/ko 用 from） */
  to: [number, number, number];
  crit?: boolean;
  /** 元素相剋倍率（>1 效果拔群加密） */
  mult?: number;
  /** 技能層級：0 普攻／1 小技／2 大招（規模、密度、震波全面加碼） */
  tier?: number;
  /** 攻擊方系列（普攻查 BASIC_FX 用） */
  seriesId?: string;
}

const POOL = 220;
const RING_POOL = 5;
const ARC_POOL = 4;

interface Particle {
  life: number; // 1 → 0
  decay: number; // 每秒衰減
  vel: THREE.Vector3;
  gravity: number;
  drag: number;
  size0: number;
  size1: number;
  sway: number;
  swayPhase: number;
  /** 自轉速度（美食粒子先有，光點唔轉） */
  spin: number;
}

interface ScheduledAction {
  t: number; // 絕對時間（clock.elapsedTime）
  fn: () => void;
}

interface Mover {
  core: THREE.Sprite;
  halo: THREE.Sprite;
  from: THREE.Vector3;
  ctrl: THREE.Vector3; // 二次貝塞爾控制點（拋物線/弧線）
  to: THREE.Vector3;
  t0: number;
  dur: number;
  size: number;
  active: boolean;
  spin: number;
  onArrive?: () => void;
}

function makeGlowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 月牙弧光貼圖：沿弧線鋪光點、中段最亮兩端漸隱，做揮擊 trail */
function makeArcTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const R = 46;
  const STEPS = 48;
  const SWEEP = Math.PI * 0.78;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const a = -SWEEP / 2 + SWEEP * t;
    const x = 64 + Math.sin(a) * R;
    const y = 64 - Math.cos(a) * R;
    const alpha = Math.sin(t * Math.PI); // 中段亮、兩端淡
    const w = 7 + alpha * 8; // 中段闊、兩端收窄成月牙
    const grad = ctx.createRadialGradient(x, y, 0.5, x, y, w);
    grad.addColorStop(0, `rgba(255,255,255,${0.85 * alpha})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${0.35 * alpha})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, w, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export default function BattleFx({
  event,
  tint,
}: {
  event: BattleFxEvent | null;
  /** 場景色溫（battle-bgs fxTint），同元素色混合 */
  tint: string;
}) {
  const tex = useMemo(makeGlowTexture, []);
  const arcTex = useMemo(makeArcTexture, []);
  const group = useRef<THREE.Group>(null);
  const particles = useRef<Particle[]>(
    Array.from({ length: POOL }, () => ({
      life: 0,
      decay: 1,
      vel: new THREE.Vector3(),
      gravity: 0,
      drag: 1,
      size0: 0.1,
      size1: 0.02,
      sway: 0,
      swayPhase: 0,
      spin: 0,
    }))
  );
  const coreRefs = useRef<(THREE.Sprite | null)[]>([]);
  const haloRefs = useRef<(THREE.Sprite | null)[]>([]);
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ringLife = useRef<number[]>(Array.from({ length: RING_POOL }, () => 0));
  const arcRefs = useRef<(THREE.Sprite | null)[]>([]);
  const arcState = useRef(
    Array.from({ length: ARC_POOL }, () => ({ life: 0, spin: 0, size: 0.34 }))
  );
  const flashLight = useRef<THREE.PointLight>(null);
  const schedule = useRef<ScheduledAction[]>([]);
  const movers = useRef<Mover[]>([]);
  const prevKey = useRef(0);
  const tintColor = useMemo(() => new THREE.Color(tint), [tint]);

  /** 元素色＋場景 tint 混合 */
  const mix = useMemo(() => {
    return (hex: string) => new THREE.Color(hex).lerp(tintColor, 0.18);
  }, [tintColor]);

  // ── 粒子發射 ──────────────────────────────────
  const emit = (
    pos: THREE.Vector3,
    colors: string[],
    element: ElementType,
    opts: {
      count: number;
      speed?: number;
      size?: number;
      up?: number; // 額外向上初速
      spread?: number; // 方向錐角（1 = 全方向）
      dir?: THREE.Vector3; // 主方向
      decay?: number;
      /** 美食粒子形狀（唔傳 = 傳統光點） */
      food?: FoodParticleKind;
    }
  ) => {
    const phys = ELEMENT_FX_PHYSICS[element];
    const baseDir = opts.dir?.clone().normalize() ?? null;
    const foodTex = opts.food ? getFoodTexture(opts.food) : null;
    for (let n = 0; n < opts.count; n++) {
      const i = particles.current.findIndex((p) => p.life <= 0);
      if (i < 0) return;
      const p = particles.current[i];
      p.life = 1;
      p.decay = (opts.decay ?? 1.6) * (0.8 + Math.random() * 0.5);
      const spread = opts.spread ?? 1;
      const rnd = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ).normalize();
      const dir = baseDir ? baseDir.clone().lerp(rnd, spread).normalize() : rnd;
      const spd = (opts.speed ?? 0.9) * phys.speed * (0.5 + Math.random() * 0.8);
      p.vel.copy(dir).multiplyScalar(spd);
      p.vel.y += opts.up ?? 0.25;
      p.gravity = phys.gravity;
      p.drag = 2.2;
      // 美食粒子要大隻先睇得清形狀，慢啲衰減
      p.size0 = (opts.size ?? 0.075) * (0.7 + Math.random() * 0.7) * (foodTex ? 1.7 : 1);
      p.size1 = p.size0 * (foodTex ? 0.55 : 0.25);
      p.sway = phys.sway;
      p.swayPhase = Math.random() * Math.PI * 2;
      p.spin = foodTex ? (Math.random() - 0.5) * 9 : 0;
      const col = mix(colors[n % colors.length]);
      const core = coreRefs.current[i];
      const halo = haloRefs.current[i];
      if (core) {
        core.position.copy(pos);
        const mat = core.material as THREE.SpriteMaterial;
        // 換貼圖＋混合模式：食物形狀用 normal blending 保真色，光點用 additive
        const wantMap = foodTex ?? tex;
        if (mat.map !== wantMap) {
          mat.map = wantMap;
          mat.blending = foodTex ? THREE.NormalBlending : THREE.AdditiveBlending;
          mat.needsUpdate = true;
        }
        mat.rotation = Math.random() * Math.PI * 2;
        if (foodTex && opts.food && !TINTABLE.has(opts.food)) {
          mat.color.set("#ffffff"); // 食物本色
        } else if (foodTex) {
          mat.color.copy(col); // 可 tint 食物（醬滴／椰絲）跟技能色
        } else {
          mat.color.copy(col).lerp(new THREE.Color("#ffffff"), 0.35);
        }
      }
      if (halo) {
        halo.position.copy(pos);
        (halo.material as THREE.SpriteMaterial).color.copy(col);
      }
    }
  };

  /** 震波環 */
  const ring = (pos: THREE.Vector3, colorHex: string) => {
    const i = ringLife.current.findIndex((l) => l <= 0);
    if (i < 0) return;
    ringLife.current[i] = 1;
    const m = ringRefs.current[i];
    if (m) {
      m.position.set(pos.x, 0.02, pos.z);
      (m.material as THREE.MeshBasicMaterial).color.copy(mix(colorHex));
    }
  };

  /** 揮擊弧光：月牙 trail 快速旋掃＋淡出（普攻／斬擊類嘅「出招感」） */
  const arc = (
    pos: THREE.Vector3,
    colorHex: string,
    opts?: { size?: number; spin?: number; rot?: number }
  ) => {
    const i = arcState.current.findIndex((a) => a.life <= 0);
    if (i < 0) return;
    const st = arcState.current[i];
    st.life = 0.82;
    st.size = Math.min(opts?.size ?? 0.34, 0.4);
    st.spin = opts?.spin ?? (Math.random() < 0.5 ? -1 : 1) * 7;
    const sp = arcRefs.current[i];
    if (sp) {
      sp.position.copy(pos);
      const mat = sp.material as THREE.SpriteMaterial;
      mat.color.copy(mix(colorHex)).lerp(new THREE.Color("#ffffff"), 0.12);
      mat.rotation = opts?.rot ?? Math.random() * Math.PI * 2;
    }
  };

  /** 光爆（點光閃一下） */
  const flash = (pos: THREE.Vector3, colorHex: string, intensity: number) => {
    const l = flashLight.current;
    if (!l) return;
    l.position.copy(pos).setY(pos.y + 0.15);
    l.color.copy(mix(colorHex));
    l.intensity = intensity;
  };

  /** 投射物（貝塞爾飛行）：food = 用美食貼圖做彈體（辣椒炮／半熟蛋／蒜頭雨…） */
  const launch = (
    from: THREE.Vector3,
    to: THREE.Vector3,
    colorHex: string,
    opts: {
      dur: number;
      arc?: number;
      size?: number;
      onArrive?: () => void;
      t0: number;
      food?: FoodParticleKind;
    }
  ) => {
    const m = movers.current.find((mv) => !mv.active);
    if (!m) return;
    const foodTex = opts.food ? getFoodTexture(opts.food) : null;
    m.active = true;
    m.from.copy(from);
    m.to.copy(to);
    m.ctrl
      .copy(from)
      .lerp(to, 0.5)
      .setY(Math.max(from.y, to.y) + (opts.arc ?? 0.35));
    m.t0 = opts.t0;
    m.dur = opts.dur;
    m.size = (opts.size ?? 0.14) * (foodTex ? 1.5 : 1);
    m.spin = foodTex ? (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 5) : 0;
    m.onArrive = opts.onArrive;
    const col = mix(colorHex);
    const coreMat = m.core.material as THREE.SpriteMaterial;
    const wantMap = foodTex ?? tex;
    if (coreMat.map !== wantMap) {
      coreMat.map = wantMap;
      coreMat.blending = foodTex ? THREE.NormalBlending : THREE.AdditiveBlending;
      coreMat.needsUpdate = true;
    }
    if (foodTex && opts.food && !TINTABLE.has(opts.food)) coreMat.color.set("#ffffff");
    else if (foodTex) coreMat.color.copy(col);
    else coreMat.color.copy(col).lerp(new THREE.Color("#ffffff"), 0.5);
    (m.halo.material as THREE.SpriteMaterial).color.copy(col);
    m.core.position.copy(from);
    m.halo.position.copy(from);
  };

  // ── 事件 → 原型時間軸 ──────────────────────────
  useEffect(() => {
    if (!event || event.key === prevKey.current) return;
    prevKey.current = event.key;
    // 用 performance 時間排程：schedule 內存絕對秒數，喺 useFrame 對 clock 執行
    // 呢度先儲低「相對秒 → fn」，開場時 useFrame 會補上基準時間
    pendingEvent.current = event;
  }, [event]);

  const pendingEvent = useRef<BattleFxEvent | null>(null);

  const buildTimeline = (ev: BattleFxEvent, now: number) => {
    const fx: SkillFxConfig = (ev.skillId && SKILL_FX[ev.skillId]) || DEFAULT_SKILL_FX;
    const colors = fx.colors ?? ELEMENT_FX_COLORS[ev.element];
    // tier 2 = 大招：規模／密度全面加碼，令進化技一睇就知唔同咖啡
    const ult = ev.tier === 2;
    const tierMul = ult ? 1.5 : ev.tier === 1 ? 1 : 0.75;
    const scale = (fx.scale ?? 1) * (ult ? 1.25 : 1);
    const density =
      (fx.density ?? 1) * tierMul * (ev.mult && ev.mult > 1 ? 1.3 : 1) * (ev.crit ? 1.3 : 1);
    const from = new THREE.Vector3(...ev.from).setY(ev.from[1] + 0.18);
    const to = new THREE.Vector3(...ev.to).setY(ev.to[1] + 0.16);
    // 武器錨位：出手特效由「前伸手位」發出，唔係身體中心
    const dir = to.clone().sub(from).setY(0).normalize();
    const hand = from.clone().add(dir.clone().multiplyScalar(0.22)).setY(from.y + 0.12);
    const S = schedule.current;
    const at = (dt: number, fn: () => void) => S.push({ t: now + dt, fn });

    // 大招蓄力：施術者腳下光環＋螺旋聚氣＋沖天光柱（混入該招美食粒，蓄力都有辨識度）
    if (ev.kind === "charge") {
      ring(from, colors[0]);
      for (let k = 0; k < 8; k++)
        at(0.07 * k, () => {
          const a = (k / 8) * Math.PI * 2 + Math.random();
          const p = from
            .clone()
            .add(new THREE.Vector3(Math.cos(a) * 0.3, -0.05, Math.sin(a) * 0.3));
          emit(p, colors, ev.element, {
            count: 4,
            speed: 0.35,
            size: 0.06,
            up: 0.85,
            spread: 0.25,
            dir: new THREE.Vector3(0, 1, 0),
            decay: 1.2,
            food: k % 3 === 1 ? fx.food : undefined,
          });
          flash(from, colors[k % colors.length], 6 + k * 2);
        });
      at(0.62, () => {
        // 聚氣完成：光柱爆發
        emit(from.clone().setY(from.y + 0.1), colors, ev.element, {
          count: 30,
          speed: 0.9,
          size: 0.09,
          up: 1.4,
          spread: 0.2,
          dir: new THREE.Vector3(0, 1, 0),
          decay: 1.4,
        });
        ring(from, colors[1] ?? colors[0]);
        flash(from, "#ffffff", 30);
      });
      return;
    }

    const impact = (dt: number, big = false) => {
      at(dt, () => {
        emit(to, colors, ev.element, {
          count: Math.round((big ? 26 : 16) * density),
          speed: (big ? 1.2 : 0.9) * (ult ? 1.3 : 1),
          size: 0.08 * scale,
          up: 0.3,
        });
        flash(to, colors[0], (big ? 26 : 14) * (ult ? 1.6 : 1));
        if (big || fx.secondary || ev.crit || ult) ring(to, colors[1] ?? colors[0]);
      });
      if (fx.secondary || ult)
        at(dt + 0.18, () => {
          emit(to, colors, ev.element, { count: Math.round(14 * density), speed: 1.5, size: 0.06 * scale, up: 0.5 });
          ring(to, colors[0]);
          flash(to, colors[1] ?? colors[0], 18);
        });
      // 大招第三波：白熱餘爆＋雙震波，收尾有份量
      if (ult)
        at(dt + 0.34, () => {
          emit(to, [...colors, "#ffffff"], ev.element, {
            count: Math.round(18 * density),
            speed: 1.9,
            size: 0.05 * scale,
            up: 0.65,
          });
          ring(to, "#ffffff");
          flash(to, "#ffffff", 24);
        });
    };

    if (ev.kind === "heal") {
      // 施術者身上升起光粒＋美食粒（0–1s，命中頁面 900ms 結算）
      for (let k = 0; k < 5; k++)
        at(0.12 * k, () =>
          emit(from, colors, ev.element, {
            count: 5,
            speed: 0.25,
            size: 0.06,
            up: 0.55,
            decay: 1.1,
            food: k % 2 === 0 ? fx.food : undefined,
          })
        );
      at(0.85, () => {
        ring(from, colors[0]);
        flash(from, colors[0], 12);
      });
      return;
    }
    if (ev.kind === "ko") {
      at(0.35, () => {
        emit(to, ["#c8b8a0", "#a89880", "#e8dcc8"], "earth", { count: 14, speed: 0.6, size: 0.09, up: 0.15 });
      });
      return;
    }

    // ── 普攻：冇 skillId，按系列武器動作出招 ──
    if (!ev.skillId) {
      const basic = (ev.seriesId && BASIC_FX[ev.seriesId]) || null;
      const bColors = basic?.colors ?? colors;
      const bFood = basic?.food;
      const motion = basic?.motion ?? "slash";
      // 起手一吸
      at(0.02, () => flash(hand, bColors[0], 5));
      const hitBurst = (dt: number) =>
        at(dt, () => {
          emit(to, bColors, ev.element, { count: 10, speed: 0.8, size: 0.06, up: 0.25, food: bFood });
          flash(to, bColors[0], 10);
        });
      switch (motion) {
        case "stab":
          // 三連刺：手位向對手方向連環戳出粒子束
          for (let k = 0; k < 3; k++)
            at(0.18 + k * 0.06, () => {
              emit(hand, bColors, ev.element, {
                count: 5,
                dir,
                spread: 0.12,
                speed: 2.6,
                size: 0.05,
                up: 0.05,
                decay: 2.8,
                food: k === 1 ? bFood : undefined,
              });
            });
          at(0.3, () => arc(to, bColors[0], { size: 0.24, spin: 10 }));
          hitBurst(0.34);
          break;
        case "slash":
          // 弧光橫掃：中途手位掃出月牙，命中對手再補一記
          at(0.2, () => {
            arc(hand.clone().lerp(to, 0.35), bColors[0], { size: 0.3 });
            emit(hand, bColors, ev.element, { count: 6, dir, spread: 0.4, speed: 1.6, size: 0.05, decay: 2.4, food: bFood });
          });
          at(0.3, () => arc(to, bColors[1] ?? bColors[0], { size: 0.28 }));
          hitBurst(0.34);
          break;
        case "smash":
          // 掄起重砸：對手頭頂弧光落錘＋落點塵爆震環
          at(0.16, () => arc(to.clone().add(new THREE.Vector3(0, 0.35, 0)), bColors[0], { size: 0.34, spin: -9 }));
          at(0.2, () =>
            launch(to.clone().add(new THREE.Vector3(0, 0.75, 0)), to, bColors[0], {
              t0: now + 0.2,
              dur: 0.16,
              arc: 0,
              size: 0.14,
              food: bFood,
            })
          );
          at(0.38, () => {
            emit(to, bColors, ev.element, { count: 14, speed: 0.9, size: 0.07, up: 0.2, spread: 0.7, dir: new THREE.Vector3(0, 1, 0), food: bFood });
            ring(to, bColors[0]);
            flash(to, bColors[0], 14);
          });
          break;
        case "shoot":
          // 武器位射出食物彈
          at(0.12, () =>
            launch(hand, to, bColors[0], { t0: now + 0.12, dur: 0.26, arc: 0.25, size: 0.12, food: bFood })
          );
          hitBurst(0.4);
          break;
      }
      return;
    }

    // ── 大招 signature：有專屬時間軸就全權接管 ──
    if (ev.tier === 2 && SIGNATURE_FX[ev.skillId]) {
      const ctx: SigCtx = {
        at,
        emit: (pos, opts) => emit(pos, opts.colors ?? colors, ev.element, opts),
        launch: (dt, f, t, opts) =>
          at(dt, () => launch(f, t, opts?.color ?? colors[0], { ...opts, t0: now + dt, dur: opts?.dur ?? 0.25 })),
        ring: (pos, color) => ring(pos, color ?? colors[0]),
        flash: (pos, color, intensity) => flash(pos, color ?? colors[0], intensity ?? 14),
        arc: (pos, opts) => arc(pos, opts?.color ?? colors[0], opts),
        from,
        to,
        hand,
        dir,
        colors,
        food: fx.food,
        density,
        scale,
        crit: Boolean(ev.crit),
      };
      SIGNATURE_FX[ev.skillId].build(ctx);
      return;
    }

    // skill：蓄力 → 原型主體 → 命中（頁面按 ARCHETYPE_IMPACT_MS 結算傷害）
    at(0.02, () => {
      emit(hand, colors, ev.element, { count: 6, speed: 0.3, size: 0.05 * scale, up: 0.3, decay: 2.4 });
      flash(hand, colors[0], 6);
    });

    switch (fx.archetype) {
      case "projectile":
        at(0.12, () =>
          launch(hand, to, colors[0], {
            t0: now + 0.12,
            dur: 0.28,
            arc: 0.4,
            size: 0.15 * scale,
            food: fx.food,
            onArrive: () => {},
          })
        );
        impact(0.42, scale > 1.2);
        break;
      case "splash": {
        at(0.15, () =>
          emit(hand, colors, ev.element, {
            count: Math.round(18 * density),
            dir,
            spread: 0.45,
            speed: 2.0 * scale,
            size: 0.065 * scale,
            up: 0.35,
            decay: 1.3,
            food: fx.food,
          })
        );
        impact(0.42);
        break;
      }
      case "slash": {
        // 出手一道弧光，再喺對手身上連續三點劃弧（每點帶月牙）
        const side = new THREE.Vector3(-(to.z - from.z), 0, to.x - from.x).normalize();
        at(0.18, () => arc(hand.clone().lerp(to, 0.3), colors[0], { size: 0.36 * scale }));
        for (let k = 0; k < 3; k++)
          at(0.3 + k * 0.055, () => {
            const p = to
              .clone()
              .add(side.clone().multiplyScalar(0.16 - k * 0.16))
              .setY(to.y + 0.22 - k * 0.07);
            emit(p, colors, ev.element, { count: Math.round(6 * density), speed: 0.7, size: 0.055 * scale, spread: 0.6, dir: side.clone().negate(), decay: 2.6, food: fx.food });
            arc(p, colors[k % colors.length], { size: 0.24 * scale });
          });
        impact(0.44, scale > 1.3);
        break;
      }
      case "barrage": {
        const n = Math.round(5 * density);
        for (let k = 0; k < n; k++)
          at(0.1 + k * 0.05, () => {
            const drop = to
              .clone()
              .add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.9 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4));
            launch(drop, to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.35, 0, (Math.random() - 0.5) * 0.3)), colors[k % colors.length], {
              t0: now + 0.1 + k * 0.05,
              dur: 0.22,
              arc: 0.05,
              size: 0.1 * scale,
              food: fx.food,
            });
          });
        impact(0.45, scale > 1.3);
        break;
      }
      case "breath": {
        for (let k = 0; k < 6; k++)
          at(0.12 + k * 0.06, () =>
            emit(hand, colors, ev.element, {
              count: Math.round(7 * density),
              dir,
              spread: 0.3,
              speed: 2.4 * scale,
              size: 0.085 * scale,
              up: 0.1,
              decay: 1.5,
              // 噴吐錐：食物粒同光粒相間，有形又有勢
              food: k % 2 === 0 ? fx.food : undefined,
            })
          );
        impact(0.45, true);
        break;
      }
      case "smash":
        at(0.15, () =>
          launch(to.clone().add(new THREE.Vector3(0, 1.0, 0)), to, colors[0], {
            t0: now + 0.15,
            dur: 0.24,
            arc: 0,
            size: 0.2 * scale,
            food: fx.food, // 重物本身就係食物：砂鍋／油條／吐司／排骨砸落
          })
        );
        at(0.42, () => {
          emit(to, colors, ev.element, {
            count: Math.round(20 * density),
            speed: 1.1,
            size: 0.08 * scale,
            up: 0.2,
            spread: 0.7,
            dir: new THREE.Vector3(0, 1, 0),
          });
          ring(to, colors[0]);
          flash(to, colors[0], 20);
        });
        if (fx.secondary)
          at(0.6, () => {
            emit(to, colors, ev.element, { count: Math.round(12 * density), speed: 1.6, size: 0.06 * scale, up: 0.45 });
            ring(to, colors[1] ?? colors[0]);
          });
        break;
      case "heal":
      case "shield": {
        // 攻擊性 shield（胡椒鐵壁）都會有 impact；純 shield 圍身迴旋
        for (let k = 0; k < 8; k++)
          at(0.08 * k, () => {
            const a = (k / 8) * Math.PI * 2;
            const p = from.clone().add(new THREE.Vector3(Math.cos(a) * 0.22, 0.05 + k * 0.02, Math.sin(a) * 0.22));
            emit(p, colors, ev.element, { count: 3, speed: 0.15, size: 0.055, up: 0.25, decay: 1.6, food: k % 2 === 0 ? fx.food : undefined });
          });
        at(0.5, () => flash(from, colors[0], 10));
        impact(0.42);
        break;
      }
    }
  };

  // ── 主循環 ──────────────────────────────────
  useFrame((state, delta) => {
    const now = state.clock.elapsedTime;

    // 接新事件 → 起時間軸
    if (pendingEvent.current) {
      buildTimeline(pendingEvent.current, now);
      pendingEvent.current = null;
    }

    // 執行到期動作
    if (schedule.current.length) {
      const due = schedule.current.filter((a) => a.t <= now);
      if (due.length) {
        schedule.current = schedule.current.filter((a) => a.t > now);
        for (const a of due) a.fn();
      }
    }

    // 粒子模擬
    for (let i = 0; i < POOL; i++) {
      const p = particles.current[i];
      const core = coreRefs.current[i];
      const halo = haloRefs.current[i];
      if (!core || !halo) continue;
      if (p.life <= 0) {
        core.visible = false;
        halo.visible = false;
        continue;
      }
      p.life = Math.max(0, p.life - p.decay * delta);
      p.vel.y -= p.gravity * delta;
      p.vel.multiplyScalar(Math.max(0, 1 - p.drag * delta));
      core.position.addScaledVector(p.vel, delta);
      if (p.spin !== 0) (core.material as THREE.SpriteMaterial).rotation += p.spin * delta;
      if (p.sway > 0) core.position.x += Math.sin(now * 6 + p.swayPhase) * p.sway * delta * 0.3;
      if (core.position.y < 0.01) core.position.y = 0.01;
      halo.position.copy(core.position);
      const s = p.size1 + (p.size0 - p.size1) * p.life;
      core.scale.setScalar(s);
      halo.scale.setScalar(s * 2.6);
      const fade = p.life * p.life;
      (core.material as THREE.SpriteMaterial).opacity = fade;
      (halo.material as THREE.SpriteMaterial).opacity = fade * 0.45;
      core.visible = true;
      halo.visible = true;
    }

    // 投射物
    for (const m of movers.current) {
      if (!m.active) {
        m.core.visible = false;
        m.halo.visible = false;
        continue;
      }
      const t = (now - m.t0) / m.dur;
      if (t >= 1) {
        m.active = false;
        m.onArrive?.();
        continue;
      }
      if (t < 0) continue;
      // 二次貝塞爾
      const a = m.from.clone().lerp(m.ctrl, t);
      const b = m.ctrl.clone().lerp(m.to, t);
      const pos = a.lerp(b, t);
      m.core.position.copy(pos);
      m.halo.position.copy(pos);
      if (m.spin !== 0) (m.core.material as THREE.SpriteMaterial).rotation += m.spin * delta;
      m.core.scale.setScalar(m.size * (0.8 + t * 0.4));
      m.halo.scale.setScalar(m.size * 2.8);
      (m.core.material as THREE.SpriteMaterial).opacity = 1;
      (m.halo.material as THREE.SpriteMaterial).opacity = 0.5;
      m.core.visible = true;
      m.halo.visible = true;
    }

    // 揮擊弧光：快速旋掃、放大、二次方淡出（0.27s 內完成）
    for (let i = 0; i < ARC_POOL; i++) {
      const sp = arcRefs.current[i];
      if (!sp) continue;
      const st = arcState.current[i];
      if (st.life <= 0) {
        sp.visible = false;
        continue;
      }
      st.life = Math.max(0, st.life - delta * 5.2);
      const t = 1 - st.life;
      sp.visible = true;
      sp.scale.setScalar(st.size * (0.68 + t * 0.38));
      const mat = sp.material as THREE.SpriteMaterial;
      mat.rotation += st.spin * delta;
      mat.opacity = st.life * st.life * 0.5;
    }

    // 震波環
    for (let i = 0; i < RING_POOL; i++) {
      const m = ringRefs.current[i];
      if (!m) continue;
      const l = ringLife.current[i];
      if (l <= 0) {
        m.visible = false;
        continue;
      }
      ringLife.current[i] = Math.max(0, l - delta * 2.2);
      const t = 1 - ringLife.current[i];
      m.visible = true;
      m.scale.setScalar(0.2 + t * 1.6);
      (m.material as THREE.MeshBasicMaterial).opacity = ringLife.current[i] * 0.7;
    }

    // 光爆衰減
    if (flashLight.current && flashLight.current.intensity > 0.01) {
      flashLight.current.intensity *= Math.max(0, 1 - delta * 9);
    }
  });

  // 初始化 movers（4 個投射物位）
  const moverSprites = useMemo(() => Array.from({ length: 4 }, () => null), []);

  return (
    <group ref={group}>
      {particles.current.map((_, i) => (
        <group key={i}>
          <sprite ref={(el) => void (haloRefs.current[i] = el)} visible={false}>
            <spriteMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
          <sprite ref={(el) => void (coreRefs.current[i] = el)} visible={false}>
            <spriteMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        </group>
      ))}
      {moverSprites.map((_, i) => (
        <group
          key={`mv-${i}`}
          ref={(g) => {
            if (!g || movers.current[i]) return;
            const [halo, core] = g.children as THREE.Sprite[];
            movers.current[i] = {
              core,
              halo,
              from: new THREE.Vector3(),
              ctrl: new THREE.Vector3(),
              to: new THREE.Vector3(),
              t0: 0,
              dur: 1,
              size: 0.14,
              active: false,
              spin: 0,
            };
          }}
        >
          <sprite visible={false}>
            <spriteMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
          <sprite visible={false}>
            <spriteMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        </group>
      ))}
      {Array.from({ length: ARC_POOL }).map((_, i) => (
        <sprite key={`arc-${i}`} ref={(el) => void (arcRefs.current[i] = el)} visible={false}>
          <spriteMaterial map={arcTex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
      {Array.from({ length: RING_POOL }).map((_, i) => (
        <mesh
          key={`ring-${i}`}
          ref={(el) => void (ringRefs.current[i] = el)}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.02, 0]}
          visible={false}
        >
          <ringGeometry args={[0.42, 0.5, 40]} />
          <meshBasicMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
      ))}
      <pointLight ref={flashLight} intensity={0} distance={3.5} decay={2} />
    </group>
  );
}
