"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CENTRE_MAP, HAWKER_CENTRES, GEOFENCE_RADIUS_TOLERANT_M } from "@/content/centres";
import { SPECIES_MAP } from "@/content/species";
import { ELEMENT_INFO } from "@/content/elements";
import { pickBattleBg } from "@/content/battle-bgs";
import { pickWildSpecies, rollWildLevel } from "@/lib/spawn";
import { useGameStore, spiritStatMultiplier, SPIRIT_LEVEL_CAP } from "@/lib/store";
import { nearestCentre, distanceM } from "@/lib/geo";
import { requestGyroPermission } from "@/lib/gyro";
import { hasWebGL2 } from "@/lib/webgl";
import { loadXr8, stopXr8, type Xr8Api } from "@/lib/xr8";
import { sfxTap, sfxAppear, sfxSnap, sfxBump, sfxGrade, sfxMiss, sfxStruggleTick, sfxEscape, sfxCapture, sfxFrenzy, sfxShiny, sfxPet, sfxThrow, sfxEat, buzz } from "@/lib/sfx";
import SpiritModel, { type SpiritAnim } from "@/components/three/SpiritModel";
import Chopsticks3d from "@/components/three/Chopsticks3d";
import { Xr8Layer, Xr8CameraSync, makeXr8Pose, type Xr8Status } from "@/components/ar/Xr8Layer";
import CaptureStage3d, { TURN_SENSITIVITY } from "@/components/capture/CaptureStage3d";
import ElementBadge from "@/components/ElementBadge";
import UIIcon from "@/components/UIIcon";
import Confetti from "@/components/Confetti";
import { SelfiePhoto } from "@/components/SelfiePhoto";
import { GyroCamera } from "@/components/three/GyroCamera";
import { track as trackEvent } from "@/lib/analytics/track";

/**
 * AR 模式決策鏈：slam（8th Wall 真平面 AR）→ gyro（陀螺儀偽 AR）
 * → 3d（小販中心 3D 場景保底）→ static（冇 WebGL 嘅 2D 降級）
 */
type ArMode = "slam" | "gyro" | "3d" | "static";
type Phase = "intro" | "aiming" | "struggle" | "success" | "failed" | "fled";
type Grade = "perfect" | "great" | "good" | "miss";

/**
 * 捕捉難度跟 stage（＋ basic 特例），唔再淨跟 rarity 字串：
 * - basic：最易，淨係溫和狂暴，冇最後關頭
 * - stage1：一般一階，輕反抗
 * - stage2：野生二階——比一階難、有狂暴／最後關頭，但狂撳仍然捉得到
 */
type CaptureDiff = "basic" | "stage1" | "stage2";
function captureDiffOf(sp: { rarity: string; stage: number } | null | undefined): CaptureDiff {
  if (!sp) return "stage1";
  if (sp.rarity === "basic") return "basic";
  if (sp.stage >= 2) return "stage2";
  return "stage1";
}

/** 縮圈週期秒數（愈難縮得愈快） */
const RING_CYCLE_S: Record<CaptureDiff, number> = {
  basic: 1.95,
  stage1: 1.7,
  stage2: 1.45,
};
/** 判定窗口倍率 */
const GRADE_WINDOW_SCALE: Record<CaptureDiff, number> = {
  basic: 1.15,
  stage1: 1.0,
  stage2: 0.9,
};
/** 判定窗口基準（貼合度誤差，會 × 難度倍率） */
const WIN_PERFECT = 0.09;
const WIN_GREAT = 0.22;
const WIN_GOOD = 0.38;
/** 基礎流失（每秒）；野生 level 會再加成。stage2：封頂 30 − 17 ≈ +13/s 淨升 */
const GRIP_DRAIN: Record<CaptureDiff, number> = {
  basic: 13,
  stage1: 18,
  stage2: 17,
};
/** 狂暴節奏 */
const FRENZY_CFG: Record<CaptureDiff, { gapMin: number; gapMax: number; dur: number }> = {
  basic: { gapMin: 3.6, gapMax: 5.4, dur: 0.7 },
  stage1: { gapMin: 2.6, gapMax: 4.2, dur: 1.0 },
  // 比一階密啲，但仍留空檔推 bar（唔好成場淨跌）
  stage2: { gapMin: 2.4, gapMax: 3.8, dur: 1.0 },
};
/** 狂暴額外流失（basic 細＝淨係「抖一下」；stage2 狂暴淨 ≈ −7/s） */
const FRENZY_DRAIN_EXTRA: Record<CaptureDiff, number> = {
  basic: 5,
  stage1: 10,
  stage2: 8,
};
const FRENZY_TAP_MULT = 0.6;
/** 時機評級 → 搏鬥起始夾實度 */
const GRADE_GRIP: Record<Exclude<Grade, "miss">, number> = {
  perfect: 52,
  great: 40,
  good: 30,
};
/** 狂撳：每一下撳中精靈補充嘅夾實度（狂暴時 ×FRENZY_TAP_MULT） */
const GRIP_PER_TAP = 7;
/** 狂撳補夾實度每秒上限（漏桶） */
const GRIP_TAP_CAP_PER_SEC = 30;
/** 「撳中」容忍半徑 */
const HOLD_TOL_MIN = 88;
const HOLD_TOL_H_MULT = 0.65;

/**
 * 最後關頭：basic 冇 cfg＝唔觸發。
 * 衝屏撞和閃走獨立判定，先判閃走再判衝屏撞，機率獨立計算。
 */
type LastStandCfg = {
  /** 閃走觸發門檻（grip） */
  dashGrip: number;
  /** 閃走觸發機率 */
  dashChance: number;
  /** 衝屏撞觸發門檻（grip） */
  chargeGrip: number;
  /** 衝屏撞觸發機率 */
  chargeChance: number;
  /** 事件後 grip 掉幾多 */
  gripDrop: number;
  /** 閃走時「真逃走」基礎機率（0 = 唔會走甩） */
  escape: number;
  /** 逃走反應窗（毫秒） */
  escapeWindowMs: number;
  /** 最大觸發次數 */
  maxTriggers: number;
};
const LAST_STAND_CFG: Record<CaptureDiff, LastStandCfg | undefined> = {
  basic: undefined,
  // stage1：閃走 grip≥70 60% 觸發1次；衝屏撞 grip≥80 30% 觸發1次
  stage1: { dashGrip: 70, dashChance: 0.60, chargeGrip: 80, chargeChance: 0.30, gripDrop: 22, escape: 0, escapeWindowMs: 0, maxTriggers: 1 },
  // stage2：閃走 grip≥72 80% 觸發2次；衝屏撞 grip≥82 30% 只觸發1次（chargeMax 硬限）
  stage2: { dashGrip: 72, dashChance: 0.80, chargeGrip: 82, chargeChance: 0.30, gripDrop: 20, escape: 0.03, escapeWindowMs: 1400, maxTriggers: 2 },
};

/** level 對流失／逃走嘅加成（相對該階「最低野生等級」） */
function levelDrainBonus(diff: CaptureDiff, level: number): number {
  if (diff === "basic") return Math.max(0, level - 1) * 0.25;
  // Lv.15 頂多 +~2.5——唔好令高階野生變淨跌
  if (diff === "stage2") return Math.max(0, level - 8) * 0.35;
  return Math.max(0, level - 1) * 0.4;
}
function levelEscapeBonus(diff: CaptureDiff, level: number): number {
  if (diff !== "stage2") return 0;
  return Math.max(0, level - 8) * 0.005;
}

/** 衝屏撞（效果 A）分段時長（毫秒）：撲前→撞擊→回彈 */
const CHARGE_IN_MS = 220;
const CHARGE_OUT_MS = 360;
/** calm/pet 對觸發率同逃走率嘅折扣 */
const LAST_STAND_CALM_MULT = 0.5;
const LAST_STAND_PET_CUT = 0.15;

/** 閃光變異機率（已停用） */
const SHINY_RATE = 0;
/** 縮圈由呢個倍數縮到 MIN；1.0 = 貼住紅圈（甜蜜點） */
const RING_MAX = 2.3;
const RING_MIN = 0.55;
const MAX_ATTEMPTS = 3;
const RING_RANGE = RING_MAX - RING_MIN;
const SWEET_PCT = ((RING_MAX - 1) / RING_RANGE) * 100;
const SPIRIT_DIST = 1.6;
/** 相機喺原點；精靈腳部錨定喺視線下方（gyro／aiming 用） */
const SPIRIT_BASE_Y = -0.55;
/** intro preview：抬高＋拉近，避免同底部開始文案重疊 */
const INTRO_SPIRIT_Y = -0.12;
const INTRO_SPIRIT_DIST = 1.35;

// ── 皮克敏式互動：摸頭＋餵食 ──
/** 每場摸頭上限；每次摸令搏鬥流失 −5%（好感度＝更易捉） */
const PET_MAX = 3;
const PET_DRAIN_CUT = 0.05;
/** 每場小食數量；餵食後「安撫」20 秒 */
const SNACK_MAX = 3;
const CALM_MS = 20000;
/** 安撫效果：縮圈慢 25%＋判定窗口 ×1.15＋流失 ×0.85＋首波狂暴延遲 */
const CALM_RING_MULT = 1.25;
const CALM_WIN_MULT = 1.15;
const CALM_DRAIN_MULT = 0.85;

interface TrackInfo {
  x: number;
  y: number;
  inFront: boolean;
  onScreen: boolean;
  /** 精靈螢幕像素高度（「按住追蹤」容忍半徑用） */
  h: number;
}


/** 柔邊圓形貼圖（白煙/塵土粒子用，radial gradient 由白過渡到透明） */
function usePuffTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d")!;
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.6, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, []);
}

/** back-out 過衝緩動（登場彈出用） */
function backOut(t: number) {
  const c = 1.70158;
  const u = t - 1;
  return 1 + (c + 1) * u * u * u + c * u * u;
}

const DUST_POOL = 12;

type AiMode = "idle" | "walk" | "jump" | "emote" | "peek";

/**
 * 皮克敏式走動精靈：喺錨點附近隨機遊走（行/跳/耍招賣萌/好奇望鏡頭），
 * 帶登場白煙、腳步塵土、動態縮影，搏鬥時掙扎扭動。
 * 同時每 frame 投影屏幕座標俾瞄準圈 / 離幕箭嘴用。
 */
function WanderingSpirit({
  anchor,
  heightM,
  speciesId,
  anim,
  frozen,
  flinchKey,
  nervous,
  shiny,
  onTrack,
  camClamp = [1.0, 2.6],
  petKey = 0,
  feed = null,
  onAte,
  charge = null,
  dash = null,
  onDashArrived,
  chop = null,
}: {
  anchor: [number, number, number];
  heightM: number;
  speciesId: string;
  anim: "idle" | "hit";
  /** 夾緊/結算期間停低唔郁 */
  frozen: boolean;
  /** 搏鬥狂撳計數：每 +1 精靈縮一縮（被揸實） */
  flinchKey: number;
  /** 金圈接近甜蜜點：精靈感覺到殺氣，緊張震 */
  nervous: boolean;
  /** 閃光變異 */
  shiny: boolean;
  onTrack: (info: TrackInfo) => void;
  /** 遊走目標同相機嘅水平距離範圍（3D 場景相機唔喺原點，要另配） */
  camClamp?: [number, number];
  /** 摸頭計數：每 +1 開心彈跳／跳舞面向鏡頭 */
  petKey?: number;
  /** 餵食：key 遞增 → 行去 pos 食嘢，食完 call onAte */
  feed?: { key: number; pos: [number, number, number] } | null;
  onAte?: () => void;
  /** 最後關頭「衝屏撞」（效果 A）：key 遞增 → 撲向鏡頭撞一下再彈返 */
  charge?: { key: number } | null;
  /** 最後關頭「閃走」（效果 B）：key 遞增 → 快閃到相機朝向 ±yawDeg 嘅新位；
   *  far = 飛到出鏡要擰身／拖屏轉返去追（AR 同 3D 皆可轉身，static 則收窄留喺畫面）。 */
  dash?: { key: number; yawDeg: number; far: boolean } | null;
  /** 閃走到位回調：offScreen = 到位時係咪已經出咗鏡（俾 parent 判逃走窗） */
  onDashArrived?: (offScreen: boolean) => void;
  /** 3D 筷子（slam/gyro/3d 用；static 保留 CSS 筷子）：show 顯示、closed 鉗攏、frenzy 震顫 */
  chop?: { show: boolean; closed: boolean; frenzy: boolean } | null;
}) {
  const group = useRef<THREE.Group>(null);
  const shadowMesh = useRef<THREE.Mesh>(null);
  const shadowMat = useRef<THREE.MeshBasicMaterial>(null);
  // 筷子跟精靈世界座標（唔跟 group 嘅 squash/loom scale）
  const chopGroup = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const sp = SPECIES_MAP[speciesId];
  const hasRig = Boolean(sp?.animated);
  // 全套 rig 嘅 walk clip 有齊腳步；弱 rig（rigLite）冇腳步，靠全幅彈跳先似行路
  const fullRig = hasRig && !sp?.rigLite;
  const [moving, setMoving] = useState(false);
  const [walkTs, setWalkTs] = useState(1);
  /** rig 精靈嘅賣萌 clip（victory 跳舞 / skill 耍招） */
  const [emote, setEmote] = useState<SpiritAnim | null>(null);
  const ai = useRef({
    // 入場先喺錨點（鏡頭正前方）望住玩家一兩秒，畀人睇清楚「精靈就喺我面前」
    // 先開始遊走——以前一 mount 就數 idle timer，GLB 載完出現嗰刻已經行開咗
    mode: "peek" as AiMode,
    timer: 1.5,
    home: new THREE.Vector3(...anchor),
    target: new THREE.Vector3(...anchor),
    speed: 0.5,
    hop: 0,
    prevStep: 0,
    jumpT: 0,
    squash: 0,
    flinch: 0,
    spawn: 0,
    /** 行到目的地之後：食嘢／好奇望鏡頭 */
    eatOnArrive: false,
    peekOnArrive: false,
    /** 最後關頭特殊動作：null / 衝屏撞 / 閃走 */
    special: null as null | "charge" | "dash",
    /** 特殊動作分段：charge 有 in/out；dash 只有 go */
    spPhase: "in" as "in" | "out" | "go",
    spT: 0,
    spFrom: new THREE.Vector3(),
    spTo: new THREE.Vector3(),
    /** 衝屏撞 looming 縮放（0→1） */
    loom: 0,
    /** 閃走到位後要回報 offScreen */
    dashReport: false,
  });
  const onAteRef = useRef(onAte);
  onAteRef.current = onAte;
  const onDashArrivedRef = useRef(onDashArrived);
  onDashArrivedRef.current = onDashArrived;
  const tmp = useRef(new THREE.Vector3());
  const world = useRef(new THREE.Vector3());
  const camDir = useRef(new THREE.Vector3());
  const toSpirit = useRef(new THREE.Vector3());
  // 投影頭頂／腳部量螢幕像素高度（按住追蹤容忍半徑）
  const vHead = useRef(new THREE.Vector3());
  const vFoot = useRef(new THREE.Vector3());

  // 塵土/白煙粒子池（sprite 世界座標，唔跟精靈郁）
  const puffTex = usePuffTexture();
  const dustRefs = useRef<(THREE.Sprite | null)[]>([]);
  const dustLife = useRef<{ life: number; big: boolean }[]>(
    Array.from({ length: DUST_POOL }, () => ({ life: 0, big: false }))
  );
  const spawnDust = useCallback(
    (x: number, y: number, z: number, count = 1, big = false) => {
      for (let n = 0; n < count; n++) {
        const i = dustLife.current.findIndex((d) => d.life <= 0);
        if (i < 0) return;
        dustLife.current[i] = { life: 1, big };
        const spread = big ? heightM * 0.5 : heightM * 0.18;
        dustRefs.current[i]?.position.set(
          x + (Math.random() - 0.5) * spread,
          y + 0.02 + (big ? Math.random() * heightM * 0.5 : 0),
          z + (Math.random() - 0.5) * spread
        );
      }
    },
    [heightM]
  );

  // gyro 錨定後更新遊走中心 + 登場白煙
  useEffect(() => {
    ai.current.home.set(anchor[0], anchor[1], anchor[2]);
    ai.current.target.copy(ai.current.home);
    ai.current.spawn = 0;
    // 重新錨定（gyro／slam 搵到平面）＝重新入場：企返錨點望住玩家先
    ai.current.mode = "peek";
    ai.current.timer = 1.5;
    group.current?.position.copy(ai.current.home);
    spawnDust(anchor[0], anchor[1], anchor[2], 6, true);
  }, [anchor, spawnDust]);

  // 搏鬥狂撳：被夾一下縮一縮
  useEffect(() => {
    if (flinchKey > 0) ai.current.flinch = 1;
  }, [flinchKey]);

  // 摸頭：開心到彈起（rig 精靈跳舞，blob 精靈原地跳）＋壓扁回彈
  useEffect(() => {
    if (petKey <= 0) return;
    const s = ai.current;
    s.eatOnArrive = false;
    s.peekOnArrive = false;
    s.squash = 1;
    setMoving(false);
    if (hasRig) {
      setEmote("victory");
      s.mode = "emote";
      s.timer = 2.4;
    } else {
      s.mode = "jump";
      s.jumpT = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petKey]);

  // 餵食：小步跑去食物位，到咗就食（emote）＋通知 parent
  useEffect(() => {
    if (!feed || feed.key <= 0) return;
    const s = ai.current;
    s.target.set(feed.pos[0], s.home.y, feed.pos[2]);
    s.eatOnArrive = true;
    s.peekOnArrive = false;
    s.speed = 0.95;
    s.mode = "walk";
    s.prevStep = 0;
    setEmote(null);
    setMoving(true);
    setWalkTs(1.5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed?.key]);

  // 最後關頭「衝屏撞」（效果 A）：撲向鏡頭撞一下再彈返 home
  useEffect(() => {
    if (!charge || charge.key <= 0) return;
    const g = group.current;
    const s = ai.current;
    s.special = "charge";
    s.spPhase = "in";
    s.spT = 0;
    s.loom = 0;
    setEmote(null);
    setMoving(false);
    const from = g ? g.position : s.home;
    s.spFrom.copy(from);
    // 撞擊點：由精靈沿水平方向撲到相機正前方 ~0.45m（填滿畫面嘅衝擊感）
    const toCam = tmp.current.set(from.x - camera.position.x, 0, from.z - camera.position.z);
    if (toCam.lengthSq() < 0.001) toCam.set(0, 0, 1);
    toCam.normalize();
    s.spTo.set(
      camera.position.x + toCam.x * 0.45,
      camera.position.y - 0.08,
      camera.position.z + toCam.z * 0.45
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge?.key]);

  // 最後關頭「閃走」（效果 B）：快閃到相機朝向 ±yawDeg 嘅新位
  useEffect(() => {
    if (!dash || dash.key <= 0) return;
    const g = group.current;
    const s = ai.current;
    // 相機水平朝向 + 偏移角，計新落腳點（同相機保持 camClamp 中距）
    const fwd = tmp.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 0.001) fwd.set(0, 0, -1);
    fwd.normalize();
    const baseYaw = Math.atan2(fwd.x, fwd.z);
    const newYaw = baseYaw + (dash.yawDeg * Math.PI) / 180;
    const dist = (camClamp[0] + camClamp[1]) / 2;
    s.spFrom.copy(g ? g.position : s.home);
    s.spTo.set(
      camera.position.x + Math.sin(newYaw) * dist,
      s.home.y,
      camera.position.z + Math.cos(newYaw) * dist
    );
    s.special = "dash";
    s.spPhase = "go";
    s.spT = 0;
    s.dashReport = true;
    setEmote(null);
    setMoving(true);
    setWalkTs(1.9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash?.key]);

  /** 平滑轉向目標 yaw */
  const turnTo = (g: THREE.Group, yaw: number, delta: number, rate = 8) => {
    let dy = yaw - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * Math.min(1, delta * rate);
  };

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    const s = ai.current;
    const t = state.clock.elapsedTime;

    // 登場：0→1 back-out 彈出
    if (s.spawn < 1) s.spawn = Math.min(1, s.spawn + delta / 0.45);

    if (s.special === "charge") {
      // ── 衝屏撞（效果 A）：撲向鏡頭 → 撞一下 → 彈返 home ──
      // 面向鏡頭衝
      turnTo(g, Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z), delta, 14);
      if (s.spPhase === "in") {
        s.spT += (delta * 1000) / CHARGE_IN_MS;
        const k = Math.min(1, s.spT);
        const e = k * k; // ease-in 加速撲埋嚟
        g.position.lerpVectors(s.spFrom, s.spTo, e);
        s.loom = e; // 愈近愈大
        if (k >= 1) {
          s.spPhase = "out";
          s.spT = 0;
          s.flinch = 1;
          spawnDust(g.position.x, s.home.y, g.position.z, 4, true);
        }
      } else {
        s.spT += (delta * 1000) / CHARGE_OUT_MS;
        const k = Math.min(1, s.spT);
        const e = 1 - (1 - k) * (1 - k); // ease-out 彈返
        g.position.lerpVectors(s.spTo, s.spFrom, e);
        s.loom = 1 - e;
        if (k >= 1) {
          g.position.copy(s.spFrom);
          s.loom = 0;
          s.special = null;
        }
      }
    } else if (s.special === "dash") {
      // ── 閃走（效果 B）：快閃到新位（帶弧形彈跳） ──
      s.spT += (delta * 1000) / 300;
      const k = Math.min(1, s.spT);
      const e = 1 - Math.pow(1 - k, 3); // ease-out cubic 急起
      g.position.lerpVectors(s.spFrom, s.spTo, e);
      g.position.y = s.home.y + Math.sin(k * Math.PI) * heightM * 0.6; // 竄跳弧線
      const dir = tmp.current.copy(s.spTo).sub(s.spFrom);
      if (dir.lengthSq() > 0.0001) turnTo(g, Math.atan2(dir.x, dir.z), delta, 16);
      if (k >= 1) {
        g.position.copy(s.spTo);
        g.position.y = s.home.y;
        s.home.copy(s.spTo); // 新落腳點成為新 home（搏鬥喺呢度繼續）
        s.target.copy(s.spTo);
        s.special = null;
        setMoving(false);
        spawnDust(g.position.x, s.home.y, g.position.z, 3);
        if (s.dashReport) {
          s.dashReport = false;
          // 到位時投影判斷係咪出咗鏡（俾 parent 決定逃走窗）
          world.current.set(g.position.x, g.position.y + heightM / 2, g.position.z);
          const p = tmp.current.copy(world.current).project(camera);
          const off = p.z >= 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1;
          onDashArrivedRef.current?.(off);
        }
      }
    } else if (!frozen) {
      s.timer -= delta;

      // ── 揀下一個行為 ──
      if (s.mode === "idle" && s.timer <= 0) {
        const roll = Math.random();
        if (roll < 0.5) {
          // 行去 home 附近新目的地：最多試 8 次，要求投影落喺屏幕中間 55% 之內
          // （以前放到 76%，精靈成日貼到畫面左右邊緣，睇落唔似「喺你面前」）
          let found = false;
          for (let i = 0; i < 8 && !found; i++) {
            const ang = Math.random() * Math.PI * 2;
            const rad = 0.3 + Math.random() * 0.9;
            s.target.set(s.home.x + Math.cos(ang) * rad, s.home.y, s.home.z + Math.sin(ang) * rad);
            // 同相機保持水平距離 camClamp：唔會貼面又唔會太遠
            const hd = Math.hypot(s.target.x - camera.position.x, s.target.z - camera.position.z);
            if (hd < camClamp[0] || hd > camClamp[1]) {
              const k = Math.min(Math.max(hd, camClamp[0]), camClamp[1]) / Math.max(hd, 0.001);
              s.target.x = camera.position.x + (s.target.x - camera.position.x) * k;
              s.target.z = camera.position.z + (s.target.z - camera.position.z) * k;
            }
            const p = tmp.current
              .set(s.target.x, s.target.y + heightM / 2, s.target.z)
              .project(camera);
            found = p.z < 1 && Math.abs(p.x) < 0.55 && Math.abs(p.y) < 0.55;
          }
          if (!found) s.target.copy(s.home); // 相機望開咗：行返 home
          s.speed = Math.random() < 0.25 ? 1.15 : 0.4 + Math.random() * 0.3;
          s.mode = "walk";
          s.prevStep = 0;
          setMoving(true);
          // 行路 clip 播速跟實際移動速度（狂奔腳步先追得上）
          setWalkTs(Math.min(1.9, Math.max(0.8, s.speed / 0.55)));
        } else if (roll < 0.62) {
          // 皮克敏式「行埋嚟」：小步走到玩家（相機）正前方，到咗抬頭望你
          const fwd = tmp.current.set(0, 0, -1).applyQuaternion(camera.quaternion);
          fwd.y = 0;
          if (fwd.lengthSq() < 0.01) fwd.set(0, 0, -1);
          fwd.normalize();
          s.target.set(
            camera.position.x + fwd.x * camClamp[0] * 1.05,
            s.home.y,
            camera.position.z + fwd.z * camClamp[0] * 1.05
          );
          s.peekOnArrive = true;
          s.speed = 0.55 + Math.random() * 0.25;
          s.mode = "walk";
          s.prevStep = 0;
          setMoving(true);
          setWalkTs(Math.min(1.9, Math.max(0.8, s.speed / 0.55)));
        } else if (roll < 0.75) {
          // 原地跳一下
          s.mode = "jump";
          s.jumpT = 0;
        } else if (roll < 0.88 && hasRig) {
          // 賣萌：跳舞 / 耍招（淨係 rig 精靈有，播完 onClipEnd 收返）
          setEmote(Math.random() < 0.5 ? "victory" : "skill");
          s.mode = "emote";
          s.timer = 3; // 保險：clip end 冇觸發都會收
        } else {
          // 好奇望鏡頭
          s.mode = "peek";
          s.timer = 1 + Math.random() * 1.2;
        }
      }

      // ── 行為執行 ──
      if (s.mode === "walk") {
        const dir = tmp.current.copy(s.target).sub(g.position);
        dir.y = 0;
        const dist = dir.length();
        if (dist < 0.06) {
          s.hop = 0;
          g.position.y = s.home.y;
          setMoving(false);
          if (s.eatOnArrive) {
            // 到達食物位：開餐（rig 精靈耍招當食嘢，blob 壓扁回彈），通知 parent 收食物＋出心心
            s.eatOnArrive = false;
            s.squash = 1;
            if (hasRig) {
              setEmote("skill");
              s.mode = "emote";
              s.timer = 2.0;
            } else {
              s.mode = "jump";
              s.jumpT = 0;
            }
            spawnDust(g.position.x, s.home.y, g.position.z, 3);
            onAteRef.current?.();
          } else if (s.peekOnArrive) {
            // 行到你面前：抬頭好奇望你
            s.peekOnArrive = false;
            s.mode = "peek";
            s.timer = 1.4 + Math.random() * 1.2;
          } else {
            s.mode = "idle";
            s.timer = 0.7 + Math.random() * 2.2;
          }
        } else {
          dir.normalize();
          // 面向行進方向（2D sprite 係 billboard，唔受影響）
          turnTo(g, Math.atan2(dir.x, dir.z), delta);
          dir.multiplyScalar(Math.min(s.speed * delta, dist));
          g.position.x += dir.x;
          g.position.z += dir.z;
          // 小碎步彈跳（狂奔時更急；全套 rig 行路 clip 有齊腳步，淨加輕微起伏）
          s.hop += delta * (s.speed > 1 ? 15 : 9);
          g.position.y = s.home.y + Math.abs(Math.sin(s.hop)) * heightM * (fullRig ? 0.05 : 0.16);
          // 每落一步踢起塵土
          const step = Math.floor(s.hop / Math.PI);
          if (step !== s.prevStep) {
            s.prevStep = step;
            spawnDust(g.position.x, s.home.y, g.position.z);
          }
        }
      } else if (s.mode === "jump") {
        s.jumpT += delta / 0.55;
        if (s.jumpT >= 1) {
          g.position.y = s.home.y;
          s.jumpT = 0;
          s.squash = 1; // 落地壓扁回彈
          s.mode = "idle";
          s.timer = 0.6 + Math.random() * 1.6;
          spawnDust(g.position.x, s.home.y, g.position.z, 3);
        } else {
          g.position.y = s.home.y + Math.sin(s.jumpT * Math.PI) * heightM * 0.5;
        }
      } else if (s.mode === "emote" || s.mode === "peek") {
        // 面向相機做嘢
        turnTo(g, Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z), delta, 6);
        if (s.timer <= 0) {
          if (s.mode === "emote") setEmote(null);
          s.mode = "idle";
          s.timer = 0.5 + Math.random() * 1.5;
        }
      }

      // 金圈迫近甜蜜點：感覺到殺氣，緊張震
      g.rotation.z = nervous && s.mode !== "jump" ? Math.sin(t * 26) * 0.028 : 0;
    } else {
      // ── 搏鬥：被筷子夾住，面向鏡頭死命扭 ──
      turnTo(g, Math.atan2(camera.position.x - g.position.x, camera.position.z - g.position.z), delta, 10);
      g.rotation.z = Math.sin(t * 22) * 0.07;
      s.flinch = Math.max(0, s.flinch - delta * 3.5);
    }

    // squash & stretch 合成：登場彈出 ×（落地擠壓 / 被夾縮一縮）× 衝屏撞 looming 放大
    s.squash = Math.max(0, s.squash - delta * 4);
    const back = s.spawn < 1 ? Math.max(0.001, backOut(s.spawn)) : 1;
    const sq = Math.max(s.squash, frozen || s.special === "charge" ? s.flinch : 0);
    const loomScale = 1 + s.loom * 1.35; // 撲到面前明顯放大
    g.scale.set(
      back * loomScale * (1 + 0.16 * sq),
      back * loomScale * (1 - 0.2 * sq),
      back * loomScale * (1 + 0.16 * sq)
    );

    // 筷子跟精靈身位（唔繼承 squash/loom scale）
    if (chopGroup.current) chopGroup.current.position.set(g.position.x, g.position.y, g.position.z);

    // 動態縮影：跳得越高影越細越淡（重量感）
    if (shadowMesh.current && shadowMat.current) {
      const lift = Math.max(0, g.position.y - s.home.y);
      const k = Math.max(0.35, 1 - lift / (heightM * 0.9));
      shadowMesh.current.position.set(g.position.x, s.home.y + 0.001, g.position.z);
      shadowMesh.current.scale.setScalar(k * back);
      shadowMat.current.opacity = 0.25 * k;
    }

    // 塵土粒子：脹大淡出
    for (let i = 0; i < DUST_POOL; i++) {
      const d = dustLife.current[i];
      const sp = dustRefs.current[i];
      if (!sp) continue;
      if (d.life <= 0) {
        sp.visible = false;
        continue;
      }
      d.life -= delta / (d.big ? 0.7 : 0.5);
      const grow = 1 - d.life;
      const base = d.big ? heightM * 0.55 : heightM * 0.26;
      sp.visible = true;
      sp.scale.setScalar(base * (0.5 + grow * 1.3));
      sp.position.y += delta * heightM * (d.big ? 0.35 : 0.15);
      (sp.material as THREE.SpriteMaterial).opacity = Math.max(0, d.life) * (d.big ? 0.85 : 0.4);
    }

    // 投影屏幕座標（身體中心）
    world.current.set(g.position.x, g.position.y + heightM / 2, g.position.z);
    camera.getWorldDirection(camDir.current);
    toSpirit.current.copy(world.current).sub(camera.position).normalize();
    const inFront = camDir.current.dot(toSpirit.current) > 0;

    const projected = tmp.current.copy(world.current).project(camera);
    let x = (projected.x * 0.5 + 0.5) * size.width;
    let y = (-projected.y * 0.5 + 0.5) * size.height;
    if (!inFront) {
      x = size.width - x;
      y = size.height - y;
    }
    const onScreen = inFront && x >= 0 && x <= size.width && y >= 0 && y <= size.height;
    // 螢幕像素高度：投影頭頂同腳部差值
    const hp = vHead.current.set(g.position.x, g.position.y + heightM, g.position.z).project(camera);
    const fp = vFoot.current.set(g.position.x, g.position.y, g.position.z).project(camera);
    const hPx = Math.abs((hp.y - fp.y) * 0.5) * size.height;
    onTrack({ x, y, inFront, onScreen, h: hPx });
  });

  // 捕捉頁所有動作只用 idle/walk：attack/hit/victory/skill 都降級為 idle
  const finalAnim: SpiritAnim =
    ai.current.special === "dash"
      ? "walk"
      : moving
        ? "walk"
        : "idle";

  return (
    <>
      <group ref={group}>
        <SpiritModel
          speciesId={speciesId}
          anim={finalAnim}
          timeScale={finalAnim === "walk" ? walkTs : 1}
          shadow={false}
          shiny={shiny}
          faceCamera={speciesId === "chilli-baby" || speciesId === "nasi-lemak-tot" ? 0 : true}
          onClipEnd={() => {
            if (ai.current.mode === "emote") {
              setEmote(null);
              ai.current.mode = "idle";
              ai.current.timer = 0.5 + Math.random() * 1.5;
            }
          }}
        />
      </group>
      {/* 動態縮影（世界座標，唔跟跳躍升降） */}
      <mesh ref={shadowMesh} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[heightM * 0.45, 32]} />
        <meshBasicMaterial ref={shadowMat} color="#000" transparent opacity={0.25} depthWrite={false} />
      </mesh>
      {/* 塵土/白煙粒子池 */}
      {Array.from({ length: DUST_POOL }, (_, i) => (
        <sprite
          key={i}
          ref={(el) => {
            dustRefs.current[i] = el;
          }}
          visible={false}
        >
          <spriteMaterial map={puffTex} color="#e8dfc8" transparent opacity={0} depthWrite={false} />
        </sprite>
      ))}
      {/* 3D 筷子：跟精靈世界座標（唔繼承 squash scale），billboard 對相機由右上斜插 */}
      {chop?.show && (
        <group ref={chopGroup}>
          <Chopsticks3d
            heightM={heightM}
            closed={chop.closed}
            squeezeKey={flinchKey}
            frenzy={chop.frenzy}
          />
        </group>
      )}
    </>
  );
}

/** 掟小食 DOM 拋物動畫：由掣飛去精靈屏幕位（Web Animations API，唔使 CSS 變量） */
function flySnackDom(x0: number, y0: number, x1: number, y1: number) {
  const img = document.createElement("img");
  img.src = "/ui/item-chicken.webp";
  img.style.cssText =
    "position:fixed;left:0;top:0;width:36px;height:36px;z-index:60;pointer-events:none;";
  document.body.appendChild(img);
  const midX = (x0 + x1) / 2;
  const midY = Math.min(y0, y1) - 130;
  img
    .animate(
      [
        { transform: `translate(${x0 - 18}px,${y0 - 18}px) scale(1) rotate(0deg)` },
        { transform: `translate(${midX - 18}px,${midY - 18}px) scale(1.2) rotate(190deg)`, offset: 0.55 },
        { transform: `translate(${x1 - 18}px,${y1 - 18}px) scale(0.72) rotate(350deg)` },
      ],
      { duration: 640, easing: "ease-in-out" }
    )
    .addEventListener("finish", () => img.remove());
}

/** ?debug=1 屏幕調試面板：真機排查 SLAM 姿態流／投影用（每 350ms 讀一次 ref） */
function DebugPanel({ get }: { get: () => Record<string, string> }) {
  const getRef = useRef(get);
  getRef.current = get;
  const [rows, setRows] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const iv = setInterval(() => setRows(getRef.current()), 350);
    const onErr = (e: ErrorEvent) => setErr(e.message.slice(0, 140));
    window.addEventListener("error", onErr);
    return () => {
      clearInterval(iv);
      window.removeEventListener("error", onErr);
    };
  }, []);
  return (
    <div className="pointer-events-none absolute left-2 top-16 z-50 max-w-[70vw] rounded-lg bg-black/80 p-2 font-mono text-[10px] leading-4 text-lime-300">
      {Object.entries(rows).map(([k, v]) => (
        <div key={k}>
          {k}: {v}
        </div>
      ))}
      {err && <div className="text-red-400">err: {err}</div>}
    </div>
  );
}

/** 掟落地嘅小食（3D 世界 sprite，精靈食咗就消失） */
function FoodSprite({ pos }: { pos: [number, number, number] }) {
  const tex = useLoader(THREE.TextureLoader, "/ui/item-chicken.webp");
  return (
    <sprite position={[pos[0], pos[1] + 0.07, pos[2]]} scale={[0.17, 0.17, 1]}>
      <spriteMaterial map={tex} depthWrite={false} transparent />
    </sprite>
  );
}

function CaptureInner() {
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const params = useSearchParams();
  const store = useGameStore();

  const webglOk = useMemo(() => hasWebGL2(), []);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>("intro");
  /** 捕捉成功後「同精靈自拍」overlay */
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [arMode, setArMode] = useState<ArMode>("static");
  const arModeRef = useRef<ArMode>("static");
  arModeRef.current = arMode;
  const [cameraOk, setCameraOk] = useState<boolean | null>(null);
  const [attempts, setAttempts] = useState(0);
  /** 縮圈當前倍數（RING_MAX → RING_MIN 循環）；1.0 = 貼住紅圈 */
  const [ringScale, setRingScale] = useState(RING_MAX);
  /** 上次出手評級（閃字用） */
  const [grade, setGrade] = useState<Grade | null>(null);
  /** 搏鬥階段夾實度 0–100 */
  const [grip, setGrip] = useState(0);
  const gripRef = useRef(0);
  /** 失敗原因：時機夾空 vs 搏鬥掙甩（提示文案唔同） */
  const [failReason, setFailReason] = useState<"miss" | "escaped">("miss");
  /** 筷子開合：open = 張開瞄準，snap = 夾落去 */
  const [pinch, setPinch] = useState<"open" | "snap">("open");
  /** 夾落一刻嘅衝擊閃光（key 遞增重播動畫） */
  const [impactKey, setImpactKey] = useState(0);
  /** 搏鬥每一下狂撳嘅擠壓脈衝（key 遞增重播動畫） */
  const [squeezeKey, setSqueezeKey] = useState(0);
  /** 精靈對白泡泡（key 遞增重播彈出動畫） */
  const [bubble, setBubble] = useState<{ text: string; key: number } | null>(null);
  const bubbleKey = useRef(0);
  const showBubble = useCallback(
    (pool: string) => {
      const lines = t.raw(`capture.${pool}`) as string[];
      bubbleKey.current += 1;
      setBubble({ text: lines[Math.floor(Math.random() * lines.length)], key: bubbleKey.current });
    },
    [t]
  );
  // 背景 NPC 對白（next-intl context 過唔到 R3F Canvas，喺度讀好再傳落去）
  const npcLines = useMemo(
    () => ({
      idle: t.raw("capture.bubblesNpc") as string[],
      watch: t.raw("capture.bubblesNpcWatch") as string[],
    }),
    [t]
  );
  const [anim, setAnim] = useState<"idle" | "hit">("idle");
  const rafRef = useRef(0);
  const gradeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [track, setTrack] = useState<TrackInfo>({ x: 0, y: 0, inFront: true, onScreen: false, h: 0 });
  const trackRef = useRef<TrackInfo>({ x: 0, y: 0, inFront: true, onScreen: false, h: 0 });
  /** 精靈模型載完並首次回報螢幕位置＝真正登場。未登場前 track 仲係初始值（onScreen:false），
      唔加呢個閘就會喺入場頭一兩秒（GLB＋draco 載入）誤報「精靈走咗出鏡」＋出箭嘴。 */
  const [tracked, setTracked] = useState(false);
  const trackedRef = useRef(false);
  /** 「按住追蹤」指尖狀態：pointerdown/move/up 更新，raf loop 只讀（跟 gripRef pattern） */
  const holdRef = useRef({ active: false, id: -1, x: 0, y: 0 });
  /** 狂撳計數：每次 pointerdown +1 並記低撳落座標；搏鬥 loop 逐 frame 消耗新撳補夾實度 */
  const tapRef = useRef({ count: 0, x: 0, y: 0 });
  /** 精靈世界座標（gyro 模式入場時錨定到相機前方） */
  const [spiritAnchor, setSpiritAnchor] = useState<[number, number, number]>([
    0,
    SPIRIT_BASE_Y,
    -SPIRIT_DIST,
  ]);

  // ── 8th Wall SLAM 狀態 ──
  const [xr8Api, setXr8Api] = useState<Xr8Api | null>(null);
  const xr8PoseRef = useRef(makeXr8Pose());
  /** null = 未開始；anchored = 平面搵到＋精靈已生成 */
  const [xr8Status, setXr8Status] = useState<Xr8Status | "anchored" | null>(null);

  // ── 皮克敏式互動狀態 ──
  const [petCount, setPetCount] = useState(0);
  const petRef = useRef(0);
  const [petFx, setPetFx] = useState(0);
  const [snacks, setSnacks] = useState(SNACK_MAX);
  const [feed, setFeed] = useState<{ key: number; pos: [number, number, number] } | null>(null);
  const [foodVisible, setFoodVisible] = useState(false);
  const throwing = useRef(false);
  /** 安撫 buff（餵食後 20 秒） */
  const [calm, setCalm] = useState(false);
  const calmRef = useRef(false);
  const calmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 摸頭/食嘢心心爆發 */
  const [hearts, setHearts] = useState<{ key: number; x: number; y: number } | null>(null);
  const heartsKey = useRef(0);
  /** 3D 場景視差偏航（拖動微調） */
  const yawRef = useRef(0);
  const dragRef = useRef<{ id: number; startX: number; startYaw: number } | null>(null);

  // 據點：?centre= 只定 spawn；冇就 GPS 最近 → 最近打卡 → 首個正式據點
  // showCentreLabel：淨係 GPS 證實人喺圍欄內——地圖帶 ?centre= 唔等於喺場
  const centreFromQuery = (() => {
    const q = params.get("centre");
    return q && CENTRE_MAP[q] ? q : null;
  })();
  const [centreId, setCentreId] = useState<string | null>(centreFromQuery);
  const [centreReady, setCentreReady] = useState(Boolean(centreFromQuery));
  const [showCentreLabel, setShowCentreLabel] = useState(false);
  useEffect(() => {
    const fallbackCentre = () => {
      const checks = useGameStore.getState().checkins;
      for (let i = checks.length - 1; i >= 0; i--) {
        if (CENTRE_MAP[checks[i].centreId]) return checks[i].centreId;
      }
      return HAWKER_CENTRES.find((c) => c.id !== "hk-test")?.id ?? "maxwell";
    };
    if (!navigator.geolocation) {
      if (!centreFromQuery) {
        setCentreId(fallbackCentre());
        setCentreReady(true);
      }
      setShowCentreLabel(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const near = nearestCentre(lat, lng);
        if (!centreFromQuery) {
          setCentreId(near.id);
          setCentreReady(true);
        }
        // 有 spawn 據點就量距嗰個；否則量最近據點——超距一律唔顯示地名
        const labelCentre = centreFromQuery ? CENTRE_MAP[centreFromQuery] : near;
        const d = distanceM(lat, lng, labelCentre.lat, labelCentre.lng);
        setShowCentreLabel(d <= GEOFENCE_RADIUS_TOLERANT_M);
      },
      () => {
        if (!centreFromQuery) {
          setCentreId(fallbackCentre());
          setCentreReady(true);
        }
        setShowCentreLabel(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 隨機精靈只可以喺 client 揀；要等據點定咗先抽，spawnPool 先啱
  const [speciesId, setSpeciesId] = useState<string | null>(() => {
    const q = params.get("species");
    return q && SPECIES_MAP[q] ? q : null;
  });
  useEffect(() => {
    if (speciesId || !centreReady || !centreId) return;
    setSpeciesId(pickWildSpecies(centreId));
  }, [speciesId, centreReady, centreId]);
  const species = speciesId ? SPECIES_MAP[speciesId] : null;
  const diff = captureDiffOf(species);

  // 野生等級：一階 1–5、二階 8–15；?level= 強制（QA）
  const [wildLevel, setWildLevel] = useState(1);
  useEffect(() => {
    if (!species) return;
    const forced = Number(params.get("level"));
    if (Number.isFinite(forced) && forced >= 1 && forced <= SPIRIT_LEVEL_CAP) {
      setWildLevel(Math.floor(forced));
    } else {
      setWildLevel(rollWildLevel(species));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesId]);

  // 閃光變異 roll（client-only 避免 hydration mismatch；?shiny=1 測試用）
  const [shiny, setShiny] = useState(false);
  useEffect(() => {
    setShiny(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 判定窗口跟難度縮；安撫中窗口放寬
  const winScale = GRADE_WINDOW_SCALE[diff] * (calm ? CALM_WIN_MULT : 1);
  const winPerfect = WIN_PERFECT * winScale;
  const winGreat = WIN_GREAT * winScale;
  const winGood = WIN_GOOD * winScale;
  const greatPct = (winGreat / RING_RANGE) * 100;
  const perfectPct = (winPerfect / RING_RANGE) * 100;

  // 搏鬥狂暴時刻（UI state＋loop 內部用 ref 讀）
  const [frenzy, setFrenzy] = useState(false);
  const frenzyRef = useRef(false);

  // ── 最後關頭（衝屏撞 / 閃走 / 逃走）──
  /** stage1 觸發1次，stage2 觸發2次——衝屏撞和閃走各自獨立配額 */
  const lastStandCountRef = useRef(0);
  const chargeCountRef = useRef(0);
  const lastStandMaxRef = useRef(1);
  /** cutscene 進行中：暫停流失、封住重複觸發 */
  const lastStandActiveRef = useRef(false);
  const pauseDrainRef = useRef(false);
  /** 衝屏撞（效果 A）觸發：key 遞增傳落 WanderingSpirit */
  const [chargeFx, setChargeFx] = useState<{ key: number } | null>(null);
  /** 閃走（效果 B）觸發 */
  const [dashFx, setDashFx] = useState<{ key: number; yawDeg: number; far: boolean } | null>(null);
  const fxKey = useRef(0);
  /** 撞擊震屏／裂痕疊層（key 遞增重播） */
  const [bumpKey, setBumpKey] = useState(0);
  /** 全屏震（撞擊一刻加喺 <main>，播完自動除返） */
  const [screenShake, setScreenShake] = useState(false);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 閃走殘影條疊層（key 遞增重播） */
  const [streakKey, setStreakKey] = useState(0);
  /** 逃走追逐窗：非 null = 追逐中；escaping = 係「博命」嗰次，追唔返會 fled */
  const [chase, setChase] = useState<{ escaping: boolean } | null>(null);
  const chaseRef = useRef<{ escaping: boolean } | null>(null);
  const escapeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 閃走中途暫存：到位（onDashArrived）時先落 grip／判逃走 */
  const pendingDashRef = useRef<{ escaping: boolean; cfg: LastStandCfg } | null>(null);
  /** 最近一次最後關頭種類（QA hook 用） */
  const lastKindRef = useRef<"charge" | "dash-flee" | "dash-escape" | null>(null);

  /** SLAM 實驗開關：Distributed Engine Binary 嘅姿態數據喺真機上未流通
   *  （相機唔跟手機轉），MVP 期間預設用穩陣嘅 gyro 偽 AR，?slam=1 先開 SLAM 試 */
  const slamAllowed = params.get("slam") === "1";
  /** ?debug=1：屏幕調試面板（真機排查 SLAM 姿態用） */
  const debugOn = params.get("debug") === "1";
  /** ?ls=charge|dash|escape：強制最後關頭結果（QA／截圖驗證；亦令首次夾必中入搏鬥） */
  const lsForce = (() => {
    const v = params.get("ls");
    return v === "charge" || v === "dash" || v === "escape" ? v : null;
  })();
  /** ?mode=3d|gyro|static：QA 強制 AR 模式（截圖驗證用） */
  const modeForce = (() => {
    const v = params.get("mode");
    return v === "3d" || v === "gyro" || v === "static" ? (v as ArMode) : null;
  })();

  // 預載 8th Wall SLAM 引擎（背景進行，唔阻 intro；桌面／唔支援即返 null）
  useEffect(() => {
    if (!slamAllowed) return;
    let on = true;
    loadXr8().then((api) => {
      if (on) setXr8Api(api);
    });
    return () => {
      on = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slamAllowed]);

  // 開鏡頭：intro 背景＋gyro/static 模式用。
  // slam 模式由 XR8 自己揸相機（唔可以兩邊同時開），3d 模式唔使鏡頭。
  const needVideo = phase === "intro" || arMode === "gyro" || arMode === "static";
  /** video 真係出咗第一幀先當 live——否則空 <video> 會顯示底層黑屏 */
  const [videoLive, setVideoLive] = useState(false);
  useEffect(() => {
    if (!needVideo) {
      setVideoLive(false);
      return;
    }
    let stream: MediaStream | null = null;
    let active = true;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      setVideoLive(false);
      for (let attempt = 0; attempt < 3 && active; attempt++) {
        try {
          // 等一吓再要 stream：模式切換／slam 放手相機後 iOS 需要 cooldown
          if (attempt > 0) await sleep(180 * attempt);
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
          if (!active) {
            stream.getTracks().forEach((tr) => tr.stop());
            stream = null;
            return;
          }
          const video = videoRef.current;
          if (!video) {
            stream.getTracks().forEach((tr) => tr.stop());
            stream = null;
            await sleep(120);
            continue;
          }
          video.srcObject = stream;
          await video.play();
          // 等有真實幀先亮——避免黑 mon
          if (video.videoWidth <= 0) {
            await new Promise<void>((resolve) => {
              const done = () => {
                video.removeEventListener("loadeddata", done);
                resolve();
              };
              video.addEventListener("loadeddata", done);
              setTimeout(done, 800);
            });
          }
          if (!active) {
            stream.getTracks().forEach((tr) => tr.stop());
            stream = null;
            return;
          }
          setCameraOk(true);
          setVideoLive(true);
          return;
        } catch {
          stream?.getTracks().forEach((tr) => tr.stop());
          stream = null;
          if (attempt === 2 && active) {
            setCameraOk(false);
            setVideoLive(false);
          }
        }
      }
    })();
    return () => {
      active = false;
      setVideoLive(false);
      stream?.getTracks().forEach((tr) => tr.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [needVideo]);

  // 縮圈循環（瞄準階段）：金圈由大縮到細，縮到 1.0x 一刻 = 貼住紅圈甜蜜點。
  // 用累積進度而非取模：安撫 buff 生效時縮速即時放慢而唔會跳圈。
  const ringScaleRef = useRef(RING_MAX);
  useEffect(() => {
    if (phase !== "aiming") return;
    const base = RING_CYCLE_S[diff] * 1000;
    let prog = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const cycle = base * (calmRef.current ? CALM_RING_MULT : 1);
      prog = (prog + (now - last) / cycle) % 1;
      last = now;
      const s = RING_MAX - (RING_MAX - RING_MIN) * prog;
      ringScaleRef.current = s;
      setRingScale(s);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, diff]);

  // 搏鬥階段：夾實度持續流失，玩家狂撳補充；跌到 0 掙甩、堆到 100 捕獲。
  // 精靈間唔中「狂暴」爆發：流失加倍＋狂撳效果減半，要頂住個波先推得郁。
  useEffect(() => {
    if (phase !== "struggle" || !speciesId) return;
    // 入搏鬥：重置最後關頭狀態（maxTriggers 由 cfg 控制，衝屏撞和閃走各自計數）
    lastStandCountRef.current = 0;
    chargeCountRef.current = 0;
    lastStandActiveRef.current = false;
    pauseDrainRef.current = false;
    const drain = GRIP_DRAIN[diff] + levelDrainBonus(diff, wildLevel);
    const fz = FRENZY_CFG[diff];
    const frenzyExtra = FRENZY_DRAIN_EXTRA[diff];
    const gap = () => (fz.gapMin + Math.random() * (fz.gapMax - fz.gapMin)) * 1000;
    let last = performance.now();
    // 第一波嚟早啲，即刻感受到反抗；安撫中會遲好多先發作
    let nextFrenzyAt = last + gap() * 0.55 * (calmRef.current ? 1.7 : 1);
    let frenzyUntil = 0;
    // 狂撳：逐 frame 消耗「自上 frame 起嘅新撳數」（tapRef 由 onHoldDown 累加）
    let consumedTaps = tapRef.current.count;
    // 漏桶：已用嘅每秒補充配額（每 frame 以 capNow 速率回補），令狂撳補夾實度封頂喺原按住速率
    let tapGainUsed = 0;
    /** 撳落座標喺唔喺精靈螢幕位容忍半徑內＝撳中 */
    const tapWithin = () =>
      trackRef.current.onScreen &&
      Math.hypot(tapRef.current.x - trackRef.current.x, tapRef.current.y - trackRef.current.y) <=
        Math.max(HOLD_TOL_MIN, trackRef.current.h * HOLD_TOL_H_MULT);
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      // 消耗自上 frame 起嘅新撳；撳落精靈上先算「撳中」
      const newTaps = tapRef.current.count - consumedTaps;
      consumedTaps = tapRef.current.count;
      const tapOnSpirit = newTaps > 0 && tapWithin();

      // 最後關頭 cutscene（衝屏撞演出／閃走追逐窗）進行中：暫停流失同狂暴排程
      if (pauseDrainRef.current) {
        nextFrenzyAt += dt * 1000; // 順延狂暴，唔好一 resume 即爆
        frenzyUntil += dt * 1000;
        // 博命追逐窗（閃走後 pauseDrain 未解）：撳中精靈＝夾返佢
        if (chaseRef.current?.escaping && tapOnSpirit) resolveChaseCaught();
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      if (!frenzyRef.current && now >= nextFrenzyAt) {
        frenzyRef.current = true;
        frenzyUntil = now + fz.dur * 1000;
        setFrenzy(true);
        sfxFrenzy();
        showBubble("bubblesFrenzy");
        setAnim("hit");
        setTimeout(() => setAnim("idle"), 500);
      } else if (frenzyRef.current && now >= frenzyUntil) {
        frenzyRef.current = false;
        nextFrenzyAt = now + gap();
        setFrenzy(false);
      }

      // 安撫 ×0.85＋每次摸頭 −5%（好感度令佢冇咁想走）
      const drainMul =
        (calmRef.current ? CALM_DRAIN_MULT : 1) * (1 - PET_DRAIN_CUT * petRef.current);
      const rate = (frenzyRef.current ? drain + frenzyExtra : drain) * drainMul;
      gripRef.current = Math.max(0, gripRef.current - rate * dt);

      // 每秒補充上限（狂暴打折）；漏桶配額逐 frame 回補
      const capNow = frenzyRef.current ? GRIP_TAP_CAP_PER_SEC * FRENZY_TAP_MULT : GRIP_TAP_CAP_PER_SEC;
      tapGainUsed = Math.max(0, tapGainUsed - capNow * dt);

      // ── 狂撳補夾實度：每一下撳中精靈補一舊（狂暴時打折）；封頂喺原按住速率＝要不停撳──
      let within = false;
      if (tapOnSpirit && !lastStandActiveRef.current) {
        if (chaseRef.current?.escaping) {
          resolveChaseCaught(); // 博命追逐：撳中即解
        } else {
          within = true;
          const tierPer = TIER_GRIP[selectedTierRef.current] ?? GRIP_PER_TAP;
          const per = frenzyRef.current ? tierPer * FRENZY_TAP_MULT : tierPer;
          const want = per * newTaps;
          const give = Math.max(0, Math.min(want, capNow - tapGainUsed)); // 超過每秒上限嘅撳唔再計
          if (give > 0) {
            gripRef.current = Math.min(100, gripRef.current + give);
            tapGainUsed += give;
          }
          setSqueezeKey((k) => k + 1); // 擠壓脈衝＋精靈縮一縮
          sfxStruggleTick(gripRef.current / 100);
          buzz(12);
        }
      }

      setGrip(gripRef.current);

      // 堆到 100：捕獲成功（同原本狂撳成功路徑等價）
      if (gripRef.current >= 100) {
        if (!centreId) return;
        frenzyRef.current = false;
        setFrenzy(false);
        useGameStore.getState().captureSpirit(speciesId, centreId, shiny, wildLevel);
        trackEvent("capture_success", {
          speciesId,
          centreId,
          arMode: arModeRef.current,
          shiny,
          level: wildLevel,
          stage: species?.stage,
        });
        setPhase("success");
        sfxCapture();
        if (shiny) setTimeout(() => sfxShiny(), 600);
        return;
      }

      // 夾實升穿門檻先 roll 最後關頭（每回合一次，內部有 guard）
      if (within) maybeLastStand();

      if (gripRef.current <= 0) {
        frenzyRef.current = false;
        setFrenzy(false);
        setFailReason("escaped");
        sfxEscape();
        setAnim("hit");
        setTimeout(() => setAnim("idle"), 600);
        const next = attempts + 1;
        setAttempts(next);
        setPhase(next >= MAX_ATTEMPTS ? "fled" : "failed");
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafRef.current);
      frenzyRef.current = false;
      setFrenzy(false);
      pauseDrainRef.current = false;
      lastStandActiveRef.current = false;
      holdRef.current.active = false;
      if (escapeTimerRef.current) clearTimeout(escapeTimerRef.current);
      chaseRef.current = null;
      setChase(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, speciesId, centreId, shiny, diff, wildLevel]);

  // 瞄準階段：精靈間唔中挑釁一句（曇花一現）
  useEffect(() => {
    if (phase !== "aiming") return;
    setBubble(null);
    let hide: ReturnType<typeof setTimeout>;
    const say = () => {
      showBubble("bubblesIdle");
      hide = setTimeout(() => setBubble(null), 2200);
    };
    const first = setTimeout(say, 1500);
    const iv = setInterval(say, 6000);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
      clearTimeout(hide);
    };
  }, [phase, showBubble]);

  // 搏鬥階段：被夾住不斷嘈——就嚟甩會挑釁、就嚟被捉會求饒
  useEffect(() => {
    if (phase !== "struggle") return;
    const say = () => {
      const g = gripRef.current;
      showBubble(g > 70 ? "bubblesDesperate" : g < 35 ? "bubblesTaunt" : "bubblesStruggle");
    };
    // 首句遲少少先出（俾「俾你夾中！」嗰句有時間讀）
    const first = setTimeout(say, 1300);
    const iv = setInterval(say, 1800);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
      setBubble(null);
    };
  }, [phase, showBubble]);

  const chopsticks = useGameStore((s) => s.items["chopsticks"] ?? 0);
  const [needChopsticks, setNeedChopsticks] = useState(false);

  // 筷子層級選擇
  const CHOPSTICK_TIERS = [
    { id: "wooden", name: { en: "Wooden", zh: "木筷" }, mult: 1, gripPer: 7 },
    { id: "copper", name: { en: "Copper", zh: "銅筷" }, mult: 1.25, gripPer: 9 },
    { id: "silver", name: { en: "Silver", zh: "銀筷" }, mult: 1.5, gripPer: 11 },
    { id: "golden", name: { en: "Golden", zh: "金筷" }, mult: 2, gripPer: 14 },
  ] as const;
  const [selectedTier, setSelectedTier] = useState<string>("wooden");
  const selectedTierRef = useRef("wooden");
  selectedTierRef.current = selectedTier;
  const allChopsticks = useGameStore((s) => s.items);

  // 筷子層級 → 搏鬥每次撳補充嘅夾實度
  const TIER_GRIP: Record<string, number> = { wooden: 7, copper: 9, silver: 11, golden: 14 };

  const startAiming = useCallback(async () => {
    sfxTap();
    // 0 筷：攔截入場，引導打卡（搏鬥開始先扣，呢度淨係閘）
    const tierKey = selectedTier === "wooden" ? "chopsticks" : `chopsticks_${selectedTier}`;
    if ((useGameStore.getState().items[tierKey] ?? 0) < 1) {
      setNeedChopsticks(true);
      return;
    }
    setNeedChopsticks(false);
    // ?mode=3d|gyro|static：QA 強制 AR 模式（截圖驗證用；玩家唔會撞到）
    if (modeForce) {
      setArMode(modeForce);
      sfxAppear();
      if (shiny) setTimeout(() => sfxShiny(), 500);
      setPhase("aiming");
      return;
    }
    // 模式決策鏈：slam（?slam=1 實驗）→ gyro → 3d → static
    if (slamAllowed && xr8Api && webglOk) {
      setArMode("slam"); // 精靈等平面錨定先生成（sfxAppear 喺 onXr8Anchor 先響）
    } else {
      const perm = await requestGyroPermission();
      if (perm === "granted" && webglOk && cameraOk !== false) {
        setArMode("gyro");
      } else {
        setArMode(webglOk ? "3d" : "static");
      }
      sfxAppear();
      if (shiny) setTimeout(() => sfxShiny(), 500);
    }
    setPhase("aiming");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slamAllowed, xr8Api, webglOk, cameraOk, shiny]);

  // SLAM 狀態：failed 即退回 3d（iOS 拒相機時 gyro 一樣冇戲，直接落 3d 保底）
  const onXr8Status = useCallback(
    (s: Xr8Status) => {
      setXr8Status((prev) => (prev === "anchored" ? prev : s));
      if (s === "failed") {
        stopXr8();
        setArMode(webglOk ? "3d" : "static");
      }
    },
    [webglOk]
  );

  // SLAM 平面錨定：精靈喺真實地面／枱面生成。
  // 水平位置以「鎖定一刻嘅相機視線」為準——掃描期間部機周圍咁郁，
  // hitTest 樣本點可能落咗喺你而家冇望嘅方向；淨係攞佢嘅地面高度，
  // 保證精靈喺你望緊嘅正前方現身，唔會一出場就喺鏡頭外。
  const onXr8Anchor = useCallback(
    (pos: [number, number, number]) => {
      const p = xr8PoseRef.current;
      // 相機世界 forward（-Z 經四元數旋轉）投影落水平面
      const fx = -2 * (p.qx * p.qz + p.qw * p.qy);
      const fz = -(1 - 2 * (p.qx * p.qx + p.qy * p.qy));
      const len = Math.hypot(fx, fz) || 1;
      // 地面高度用 hit 樣本，但要合理咁低過相機（0.45m–2.2m），異常值當企地下
      const gy = Math.min(Math.max(pos[1], p.py - 2.2), p.py - 0.45);
      setSpiritAnchor([p.px + (fx / len) * SPIRIT_DIST, gy, p.pz + (fz / len) * SPIRIT_DIST]);
      setXr8Status("anchored");
      sfxAppear();
      if (shiny) setTimeout(() => sfxShiny(), 500);
    },
    [shiny]
  );

  // 模式手動切換：AR（slam/gyro）⇄ 3D 場景（AR 環境差／發熱時嘅出路）
  const canUseAr = Boolean(xr8Api) || cameraOk !== false;
  const toggleMode = useCallback(() => {
    sfxTap();
    if (arMode === "3d") {
      if (slamAllowed && xr8Api) {
        setXr8Status(null);
        setArMode("slam");
      } else {
        requestGyroPermission().then((perm) => {
          if (perm === "granted") {
            setSpiritAnchor([0, SPIRIT_BASE_Y, -SPIRIT_DIST]);
            setArMode("gyro");
          }
        });
      }
    } else {
      stopXr8();
      setXr8Status(null);
      setArMode("3d");
    }
  }, [arMode, slamAllowed, xr8Api]);

  // 入 3d 模式：精靈錨定到場景金圈中心地面
  useEffect(() => {
    if (arMode === "3d") setSpiritAnchor([0, 0, -0.7]);
  }, [arMode]);

  // 3D 場景背景：跟 ?centre=，冇就用精靈地頭中心（同切磋頁共用素材）
  const bg3d = useMemo(
    () => (speciesId ? pickBattleBg(params.get("centre"), speciesId) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [speciesId]
  );

  /** 心心爆發（摸頭/餵食）；冇 track 座標（2D 降級）就用屏幕中間 */
  const spawnHearts = useCallback((x: number, y: number) => {
    heartsKey.current += 1;
    setHearts({
      key: heartsKey.current,
      x: x || window.innerWidth / 2,
      y: y || window.innerHeight * 0.42,
    });
  }, []);

  /** 摸頭：開心動作＋心心＋好感度（搏鬥流失 −5%/次，上限 3 次） */
  const petSpirit = useCallback(() => {
    if (phase !== "aiming" || petRef.current >= PET_MAX) return;
    petRef.current += 1;
    setPetCount(petRef.current);
    setPetFx((k) => k + 1);
    sfxPet();
    buzz([15, 20, 15]);
    spawnHearts(trackRef.current.x, trackRef.current.y - 46);
    showBubble("bubblesPet");
  }, [phase, spawnHearts, showBubble]);

  /** 餵食後（精靈行到食物位食完）：安撫 20 秒 */
  const onAte = useCallback(() => {
    setFoodVisible(false);
    throwing.current = false;
    sfxEat();
    spawnHearts(trackRef.current.x, trackRef.current.y - 46);
    showBubble("bubblesFeed");
    calmRef.current = true;
    setCalm(true);
    if (calmTimer.current) clearTimeout(calmTimer.current);
    calmTimer.current = setTimeout(() => {
      calmRef.current = false;
      setCalm(false);
    }, CALM_MS);
  }, [spawnHearts, showBubble]);
  useEffect(() => () => {
    if (calmTimer.current) clearTimeout(calmTimer.current);
  }, []);

  /** 掟小食：DOM 拋物飛去精靈位 → 3D 世界生成食物 → 精靈行去食 */
  const throwSnack = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (phase !== "aiming" || snacks <= 0 || throwing.current) return;
      throwing.current = true;
      setSnacks((n) => n - 1);
      sfxThrow();
      const r = e.currentTarget.getBoundingClientRect();
      flySnackDom(r.left + r.width / 2, r.top + r.height / 2, trackRef.current.x, trackRef.current.y);
      // 世界落點：精靈 home 附近、微微偏向鏡頭
      const pos: [number, number, number] = [
        spiritAnchor[0] + (Math.random() - 0.5) * 0.5,
        spiritAnchor[1],
        spiritAnchor[2] + 0.25 + Math.random() * 0.2,
      ];
      setTimeout(() => {
        setFeed((f) => ({ key: (f?.key ?? 0) + 1, pos }));
        setFoodVisible(true);
      }, 640);
    },
    [phase, snacks, spiritAnchor]
  );

  /** gyro 首次讀數：將精靈錨定到相機水平前方 SPIRIT_DIST 米 */
  const anchorSpirit = useCallback((camera: THREE.Camera) => {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 0.001) forward.set(0, 0, -1); // 手機平放指天/地時嘅保底
    forward.normalize().multiplyScalar(SPIRIT_DIST);
    setSpiritAnchor([camera.position.x + forward.x, SPIRIT_BASE_Y, camera.position.z + forward.z]);
  }, []);

  /** 瞄準階段出手：按縮圈同紅圈嘅貼合度評級（窗口跟稀有度縮） */
  function clamp() {
    if (phase !== "aiming" || pinch === "snap" || !speciesId) return;
    const diff = Math.abs(ringScaleRef.current - 1); // 0 = 完美貼合
    let g: Grade;
    if (diff < winPerfect) g = "perfect";
    else if (diff < winGreat) g = "great";
    else if (diff < winGood) g = "good";
    else g = "miss";
    // QA 強制模式（?ls=…）：首夾必中入搏鬥，方便驗證最後關頭
    if (lsForce && g === "miss") g = "great";

    // 筷子飛快夾埋 + 衝擊閃光（評級字延遲少少，等夾嘅動作先到位）
    setPinch("snap");
    sfxSnap();
    // 夾嘅一刻震動：夾中短促有力，夾空單下輕震
    buzz(g === "miss" ? 20 : [30, 40, 60]);
    setImpactKey((k) => k + 1);
    if (gradeTimer.current) clearTimeout(gradeTimer.current);
    gradeTimer.current = setTimeout(() => setGrade(null), 1100);
    setTimeout(() => {
      setGrade(g);
      if (g === "miss") sfxMiss();
      else sfxGrade(g);
    }, 180);

    if (g === "miss") {
      // 夾空：精靈閃避兼恥笑你，筷子夾唔中彈返開，消耗一次機會
      setFailReason("miss");
      setAnim("hit");
      setTimeout(() => setAnim("idle"), 600);
      setTimeout(() => setPinch("open"), 450);
      setTimeout(() => showBubble("bubblesMiss"), 200);
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setTimeout(() => setPhase(nextAttempts >= MAX_ATTEMPTS ? "fled" : "failed"), 900);
      return;
    }
    // 夾中：開始搏鬥扣 1 筷（失敗唔退）；唔夠就當夾空機會耗盡
    if (!useGameStore.getState().spendChopstick(selectedTier === "wooden" ? undefined : selectedTier)) {
      setNeedChopsticks(true);
      setFailReason("miss");
      setTimeout(() => setPinch("open"), 450);
      const nextAttempts = attempts + 1;
      setAttempts(nextAttempts);
      setTimeout(() => setPhase(nextAttempts >= MAX_ATTEMPTS ? "fled" : "failed"), 900);
      return;
    }
    // 夾中：進入搏鬥，評級愈高起始夾實度愈高
    setTimeout(() => showBubble("bubblesHit"), 200);
    gripRef.current = GRADE_GRIP[g];
    setGrip(gripRef.current);
    setTimeout(() => setPhase("struggle"), 220);
  }

  /** cutscene 演完回復流失 */
  const resumeDrain = useCallback(() => {
    pauseDrainRef.current = false;
    lastStandActiveRef.current = false;
  }, []);

  /** 衝屏撞（效果 A）：撲向鏡頭 → 撞一下（震屏＋裂痕＋掉 grip）→ 彈返，回復流失 */
  function startCharge(cfg: LastStandCfg) {
    lastKindRef.current = "charge";
    fxKey.current += 1;
    setChargeFx({ key: fxKey.current });
    showBubble("bubblesLastStand");
    buzz(20);
    // 撲到面前撞一下
    setTimeout(() => {
      setBumpKey((k) => k + 1);
      setScreenShake(true);
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = setTimeout(() => setScreenShake(false), 420);
      sfxBump();
      gripRef.current = Math.max(8, gripRef.current - cfg.gripDrop);
      setGrip(gripRef.current);
    }, CHARGE_IN_MS);
    setTimeout(resumeDrain, CHARGE_IN_MS + CHARGE_OUT_MS + 60);
  }

  /** 閃走（效果 B）：快閃到另一方位；rare 有細機率係「博命」逃走（開追逐窗） */
  function startDash(cfg: LastStandCfg, forceEscape?: boolean) {
    const escapeP =
      (cfg.escape + levelEscapeBonus(diff, wildLevel)) *
      (calmRef.current ? LAST_STAND_CALM_MULT : 1) *
      (1 - LAST_STAND_PET_CUT * petRef.current);
    const escaping =
      forceEscape ?? (cfg.escape > 0 && Math.random() < escapeP);
    // 所有模式都用大幅閃走（±90度），玩家要擰身追返
    const mag = escaping ? 90 : 70;
    const yawDeg = (Math.random() < 0.5 ? -1 : 1) * mag;
    lastKindRef.current = escaping ? "dash-escape" : "dash-flee";
    pendingDashRef.current = { escaping, cfg };
    fxKey.current += 1;
    setDashFx({ key: fxKey.current, yawDeg, far: escaping });
    setStreakKey((k) => k + 1);
    showBubble(escaping ? "bubblesEscapeTele" : "bubblesFlee");
    sfxEscape();
    buzz(escaping ? [0, 30, 20, 30, 20, 40] : 30);
  }

  /** 閃走到位（WanderingSpirit 回報）：落 grip；博命就開追逐窗，否則回復流失 */
  const onDashArrived = useCallback(
    (offScreen: boolean) => {
      const pend = pendingDashRef.current;
      pendingDashRef.current = null;
      const cfg = pend?.cfg;
      if (cfg) {
        gripRef.current = Math.max(8, gripRef.current - cfg.gripDrop);
        setGrip(gripRef.current);
      }
      if (pend?.escaping) {
        // 博命逃走窗：追唔返（時限到）就真走甩
        chaseRef.current = { escaping: true };
        setChase({ escaping: true });
        if (escapeTimerRef.current) clearTimeout(escapeTimerRef.current);
        escapeTimerRef.current = setTimeout(() => {
          if (!chaseRef.current?.escaping) return;
          chaseRef.current = null;
          setChase(null);
          resumeDrain();
          setFailReason("escaped");
          sfxEscape();
          const next = attempts + 1;
          setAttempts(next);
          setPhase("fled"); // 真走甩：直接飛咗，唔理仲剩幾多次
        }, cfg?.escapeWindowMs ?? 1300);
      } else {
        // 普通閃走：即刻回復流失，靠 turnToFind 箭嘴／繼續狂撳追返
        void offScreen;
        chaseRef.current = null;
        setChase(null);
        resumeDrain();
      }
    },
    [attempts, resumeDrain]
  );

  /** 博命追逐成功：喺鏡頭範圍內夾返，取消逃走窗＋反應獎勵，回復搏鬥 */
  function resolveChaseCaught() {
    if (escapeTimerRef.current) clearTimeout(escapeTimerRef.current);
    chaseRef.current = null;
    setChase(null);
    resumeDrain();
    gripRef.current = Math.min(100, gripRef.current + 8);
    setGrip(gripRef.current);
    setSqueezeKey((k) => k + 1);
    sfxStruggleTick(gripRef.current / 100);
  }

  /** 檢查係咪要觸發最後關頭（每回合一次，calm/pet 降低觸發率）。
   *  ?ls=charge|dash|escape 可強制結果（QA／截圖驗證用，玩家唔會撞到）。 */
  function maybeLastStand() {
    const cfg = LAST_STAND_CFG[diff];
    if (!cfg) return;
    if (lastStandActiveRef.current) return;

    const force = lsForce;
    const grip = gripRef.current;
    const calmMult = calmRef.current ? LAST_STAND_CALM_MULT : 1;
    const petCut = 1 - LAST_STAND_PET_CUT * petRef.current;
    /** 兩機制完全獨立：各自有 maxTriggers 配額（lastStandCountRef = 閃走、chargeCountRef = 衝屏撞） */

    // 衝屏撞（grip ≥ chargeGrip，獨立判定，到達門檻立即擲骰；每場戰鬥最多 1 次）
    if (force === "charge") {
      if (chargeCountRef.current < 1) {
        chargeCountRef.current++;
        lastStandActiveRef.current = true;
        pauseDrainRef.current = true;
        startCharge(cfg);
      }
      return;
    }
    if (!force && chargeCountRef.current < 1 && grip >= cfg.chargeGrip) {
      const chargeP = cfg.chargeChance * calmMult * petCut;
      if (Math.random() < chargeP) {
        chargeCountRef.current++;
        lastStandActiveRef.current = true;
        pauseDrainRef.current = true;
        startCharge(cfg);
      }
    }

    // 閃走（grip ≥ dashGrip，獨立判定，到達門檻立即擲骰；觸發咗衝屏撞都要繼續判）
    if (force === "dash") {
      if (lastStandCountRef.current < cfg.maxTriggers && !lastStandActiveRef.current) {
        lastStandCountRef.current++;
        lastStandActiveRef.current = true;
        pauseDrainRef.current = true;
        startDash(cfg, false);
      }
      return;
    }
    if (force === "escape") {
      if (lastStandCountRef.current < cfg.maxTriggers && !lastStandActiveRef.current) {
        lastStandCountRef.current++;
        lastStandActiveRef.current = true;
        pauseDrainRef.current = true;
        startDash(cfg, true);
      }
      return;
    }
    if (!force && lastStandCountRef.current < cfg.maxTriggers && grip >= cfg.dashGrip && !lastStandActiveRef.current) {
      const dashP = cfg.dashChance * calmMult * petCut;
      if (Math.random() < dashP) {
        lastStandCountRef.current++;
        lastStandActiveRef.current = true;
        pauseDrainRef.current = true;
        startDash(cfg, false);
      }
    }
  }

  /** 搏鬥「按住追蹤」：指尖座標寫入 ref（raf loop 只讀 ref 計夾實度）；
   *  3d 模式同一手勢兼做拖屏轉身，方便追返閃走嘅精靈。用 pointer capture。 */
  const onHoldDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      holdRef.current = { active: true, id: e.pointerId, x: e.clientX, y: e.clientY };
      // 狂撳：每一下撳記一票（搏鬥 loop 消耗，撳中精靈先補夾實度）
      tapRef.current = { count: tapRef.current.count + 1, x: e.clientX, y: e.clientY };
      if (arMode === "3d")
        dragRef.current = { id: e.pointerId, startX: e.clientX, startYaw: yawRef.current };
      // pointer capture 對合成事件可能拋錯，包住免得斷咗 hold
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* 冇 active pointer：忽略 */
      }
    },
    [arMode]
  );
  const onHoldMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const h = holdRef.current;
      if (!h.active || h.id !== e.pointerId) return;
      h.x = e.clientX;
      h.y = e.clientY;
      // 3d 模式：夾住精靈嗰陣唔轉鏡（唔好整成「追住手指」死循環）；
      // 手指離開精靈（例如追返閃走／甩到出鏡嘅精靈）先當拖屏轉身。
      const d = dragRef.current;
      if (arMode === "3d" && d && d.id === e.pointerId) {
        const tolR = Math.max(HOLD_TOL_MIN, trackRef.current.h * HOLD_TOL_H_MULT);
        // 死區放大到 1.5× 半徑：夾住或輕微漂出都唔轉鏡，避免「甩鏡→精靈彈開→追→再甩鏡」循環；
        // 手指明顯遠離（或精靈出鏡）先當拖屏轉身追返
        const dist = trackRef.current.onScreen
          ? Math.hypot(e.clientX - trackRef.current.x, e.clientY - trackRef.current.y)
          : Infinity;
        if (dist <= tolR * 1.5) {
          // 夾住緊：唔轉，同時不斷更新轉身錨點，一離開就由呢點計
          d.startX = e.clientX;
          d.startYaw = yawRef.current;
        } else {
          yawRef.current = d.startYaw - (e.clientX - d.startX) * TURN_SENSITIVITY;
        }
      }
    },
    [arMode]
  );
  const onHoldUp = useCallback(() => {
    holdRef.current.active = false;
    dragRef.current = null;
  }, []);

  /** 由 failed 重試：重置筷子開合 */
  function retry() {
    sfxTap();
    setPinch("open");
    setGrade(null);
    setPhase("aiming");
  }

  const onTrack = useCallback((info: TrackInfo) => {
    trackRef.current = info;
    if (!trackedRef.current) {
      trackedRef.current = true;
      setTracked(true);
    }
    setTrack((prev) =>
      Math.abs(prev.x - info.x) > 2 ||
      Math.abs(prev.y - info.y) > 2 ||
      prev.onScreen !== info.onScreen ||
      prev.inFront !== info.inFront
        ? info
        : prev
    );
  }, []);

  // QA 觀察 hook：淨係 ?ls=／?debug=1 先掛（玩家唔會撞到）——俾診斷腳本讀 phase／grip 等狀態
  useEffect(() => {
    if (!lsForce && !debugOn) return;
    const api = {
      get: () => ({
        phase,
        grip: Math.round(gripRef.current),
        frenzy: frenzyRef.current,
        arMode,
        onScreen: trackRef.current.onScreen,
        trackX: Math.round(trackRef.current.x),
        trackY: Math.round(trackRef.current.y),
        trackH: Math.round(trackRef.current.h),
        holdActive: holdRef.current.active,
        chase: chaseRef.current,
        bumpKey,
        streakKey,
        lastKind: lastKindRef.current,
        bubble: bubble?.text ?? null,
        selfieOpen,
      }),
      // 跳過捕捉 loop 直入成功畫面／自拍（驗證展示尺寸、接地陰影等）
      showSuccess: () => {
        setSelfieOpen(false);
        setPhase("success");
      },
      openSelfie: async () => {
        setPhase("success");
        setSelfieOpen(true);
      },
    };
    (window as unknown as Record<string, unknown>).__cap = Object.assign(api.get, api);
  }, [phase, arMode, bumpKey, streakKey, lsForce, debugOn, bubble, selfieOpen]);

  if (!species || !speciesId || !centreId) return null;
  const inGame = phase === "aiming" || phase === "struggle";
  /** slam 模式要等平面錨定先生成精靈；其他模式即時 ready */
  const spiritReady = arMode !== "slam" || xr8Status === "anchored";
  /** 縮圈接近甜蜜點時發光提示（俾玩家學時機；窗口跟稀有度縮） */
  const nearSweet = phase === "aiming" && Math.abs(ringScale - 1) < winGreat;
  /** 力度計指針位置（縮圈進度 0–100%） */
  const ringPct = ((RING_MAX - ringScale) / RING_RANGE) * 100;

  // 2D 降級模式（冇 WebGL2）：瞄準圈固定置中（用 CSS % 避免 SSR/client 唔一致）
  const ringX: number | string = webglOk ? track.x : "50%";
  const ringY: number | string = webglOk ? track.y : "45%";
  const ringVisible = webglOk ? track.onScreen : true;

  // 離幕箭嘴：沿精靈方向擺喺屏幕中央半徑邊緣（未登場唔算出鏡，見 tracked）
  let arrow: { x: number; y: number; deg: number } | null = null;
  if (webglOk && tracked && !track.onScreen && inGame) {
    const cx = typeof window !== "undefined" ? window.innerWidth / 2 : 195;
    const cy = typeof window !== "undefined" ? window.innerHeight / 2 : 422;
    const dx = track.x - cx;
    const dy = track.y - cy;
    const len = Math.max(Math.hypot(dx, dy), 0.001);
    const radius = Math.min(cx, cy) - 70;
    arrow = {
      x: cx + (dx / len) * radius,
      y: cy + (dy / len) * radius,
      deg: (Math.atan2(dy, dx) * 180) / Math.PI,
    };
  }

  return (
    <main className={`relative h-dvh w-full overflow-hidden bg-black ${screenShake ? "screen-shake" : ""}`}>
      {/* 背景層：gyro/static/intro = 鏡頭映像；slam = XR8 相機 canvas；3d = 場景天幕；冇鏡頭／未出幀 = 羊皮紙（唔好露黑 mon） */}
      {needVideo && (
        <>
          <div className="paper-texture absolute inset-0" />
          <video
            ref={videoRef}
            playsInline
            muted
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
              videoLive ? "opacity-100" : "opacity-0"
            }`}
          />
        </>
      )}
      {arMode === "3d" && inGame && !bg3d && <div className="paper-texture absolute inset-0" />}
      {arMode === "slam" && inGame && xr8Api && (
        <Xr8Layer xr8={xr8Api} poseRef={xr8PoseRef} onStatus={onXr8Status} onAnchor={onXr8Anchor} />
      )}

      {/* 3D 場景光暈層（燈籠氣氛，同切磋頁同款做法）＋慢呼吸 */}
      {arMode === "3d" && inGame && bg3d && (
        <div className="glow-breathe pointer-events-none absolute inset-0 z-[2]" style={{ background: bg3d.glowCss }} />
      )}

      {/* 3D 疊加層（WebGL2 可用先渲染） */}
      {webglOk && (inGame || phase === "intro") && (
        <Canvas
          className="absolute inset-0"
          style={{ position: "absolute", inset: 0 }}
          camera={{ fov: 60, position: [0, 0, 0] }}
          gl={{ alpha: true, antialias: true }}
        >
          {arMode !== "3d" && (
            <>
              <ambientLight intensity={1.1} />
              <directionalLight position={[2, 4, 2]} intensity={1.2} />
            </>
          )}
          {arMode === "slam" ? (
            <Xr8CameraSync poseRef={xr8PoseRef} />
          ) : (
            <GyroCamera
              enabled={arMode === "gyro" && phase !== "intro"}
              onFirstOrientation={anchorSpirit}
            />
          )}
          {/* 場景同精靈分開 Suspense：一邊載入中唔會連累另一邊消失（避免 3D 模式黑屏） */}
          <Suspense fallback={null}>
            {arMode === "3d" && inGame && bg3d && (
              <CaptureStage3d
                bg={bg3d}
                yawRef={yawRef}
                npcLines={npcLines}
                npcWatching={phase === "struggle"}
              />
            )}
          </Suspense>
          <Suspense fallback={null}>
            {spiritReady && (
              <WanderingSpirit
                anchor={
                  phase === "intro"
                    ? [0, INTRO_SPIRIT_Y, -INTRO_SPIRIT_DIST]
                    : spiritAnchor
                }
                heightM={species.modelHeightM ?? 0.5}
                speciesId={speciesId}
                anim={anim}
                frozen={phase === "struggle"}
                flinchKey={squeezeKey}
                nervous={phase === "aiming" && pinch === "open" && Math.abs(ringScale - 1) < winGreat}
                shiny={shiny}
                onTrack={onTrack}
                camClamp={arMode === "3d" ? [1.2, 2.2] : arMode === "slam" ? [0.9, 3.0] : [1.0, 2.6]}
                petKey={petFx}
                feed={feed}
                onAte={onAte}
                charge={chargeFx}
                dash={dashFx}
                onDashArrived={onDashArrived}
                chop={{
                  show: inGame && arMode !== "static",
                  closed: pinch === "snap" || phase === "struggle",
                  frenzy,
                }}
              />
            )}
            {foodVisible && feed && <FoodSprite pos={feed.pos} />}
          </Suspense>
        </Canvas>
      )}

      {/* 3D 場景拖動轉身層（拖屏環繞轉一圈追返閃走嘅精靈；掣照撳得） */}
      {arMode === "3d" && inGame && (
        <div
          data-testid="turn3d"
          className="absolute inset-0 z-[3]"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            dragRef.current = { id: e.pointerId, startX: e.clientX, startYaw: yawRef.current };
          }}
          onPointerMove={(e) => {
            const d = dragRef.current;
            if (!d || d.id !== e.pointerId) return;
            // 3D 場景：拖屏自由轉一圈（追返閃走嘅精靈），唔再夾 ±15°
            yawRef.current = d.startYaw - (e.clientX - d.startX) * TURN_SENSITIVITY;
          }}
          onPointerUp={() => (dragRef.current = null)}
          onPointerCancel={() => (dragRef.current = null)}
        />
      )}

      {/* 搏鬥「按住追蹤」全屏層：一隻手指按住精靈持續回補（raf loop 讀指尖 ref）；
          3d 模式同一手勢兼做拖屏轉身，方便追返閃走嘅精靈。gyro/slam 靠郁手機轉身，掃過呢層唔影響 */}
      {phase === "struggle" && (
        <div
          data-testid="hold"
          className="absolute inset-0 z-[21]"
          style={{ touchAction: "none" }}
          onPointerDown={onHoldDown}
          onPointerMove={onHoldMove}
          onPointerUp={onHoldUp}
          onPointerCancel={onHoldUp}
        />
      )}

      {/* 夾熱區：撳精靈本身即出手夾（透明 button 疊喺精靈位，唔要全局按鈕音效） */}
      {phase === "aiming" && spiritReady && ringVisible && (
        <button
          data-no-press-sfx
          data-testid="clamp"
          onClick={clamp}
          aria-label={t("capture.clamp")}
          className="absolute z-[12] h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: ringX, top: ringY, touchAction: "manipulation" }}
        />
      )}

      {/* 心心爆發（摸頭/餵食） */}
      {hearts && (
        <div key={hearts.key} className="pointer-events-none absolute z-[26]" style={{ left: hearts.x, top: hearts.y }}>
          {[-34, -16, 0, 15, 32, 8].map((hx, i) => (
            <span
              key={i}
              className="heart-float absolute text-xl"
              style={{
                ["--hx" as never]: `${hx}px`,
                color: i % 2 ? "#ff6b81" : "#ff8fa3",
                animationDelay: `${i * 0.07}s`,
                textShadow: "0 1px 6px rgba(0,0,0,.35)",
              }}
            >
              ♥
            </span>
          ))}
        </div>
      )}

      {/* SLAM 掃描引導：追蹤穩定＋錨定前顯示 */}
      {arMode === "slam" && inGame && !spiritReady && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/45 px-8 text-center">
          <div className="scan-sweep text-6xl">📱</div>
          <h2 className="text-xl font-black text-white">{t("capture.scanTitle")}</h2>
          <p className="max-w-xs text-sm font-bold text-white/85">{t("capture.scanHintSlam")}</p>
          {xr8Status === "tracking" && (
            <p className="text-xs font-bold text-gold-light">{t("capture.scanAlmost")}</p>
          )}
        </div>
      )}

      {/* 2D 降級：精靈用大 icon 置中疊加 */}
      {!webglOk && inGame && (
        <div
          className="pointer-events-none absolute z-[5]"
          style={{ left: ringX, top: ringY, transform: "translate(-50%, -50%)" }}
        >
          <div className={anim === "hit" ? "animate-ping" : "float-bob"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/spirits/full/${speciesId}.webp`}
              alt=""
              className="h-44 w-auto drop-shadow-[0_12px_14px_rgba(0,0,0,0.5)]"
              draggable={false}
            />
          </div>
        </div>
      )}

      {/* 狂暴紅色 vignette（危機感） */}
      {frenzy && <div className="frenzy-vignette pointer-events-none absolute inset-0 z-[9]" />}

      {/* 博命逃走：紅色急促邊緣警示 */}
      {chase?.escaping && <div className="escape-edge pointer-events-none absolute inset-0 z-[9]" />}

      {/* 最後關頭「衝屏撞」：撞擊白閃＋裂痕（震一震） */}
      {bumpKey > 0 && phase === "struggle" && (
        <div
          key={`bump-${bumpKey}`}
          className="pointer-events-none absolute inset-0 z-[40] overflow-hidden"
        >
          {/* 白光爆閃（自動淡出） */}
          <div
            className="bump-flash absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 46%, rgba(255,255,255,0.95), rgba(255,255,255,0) 60%)",
            }}
          />
          {/* 幾條斜裂（撞嗰下閃現，停留約 3 秒後慢慢退去；捕捉成功離開 struggle 即消失） */}
          <svg
            className="crack-pop absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            fill="none"
            stroke="rgba(255,255,255,0.92)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 0 2px rgba(170,215,255,0.9))" }}
          >
            <polyline vectorEffect="non-scaling-stroke" points="50,46 45,33 48,20 42,6" />
            <polyline vectorEffect="non-scaling-stroke" points="45,33 37,28" />
            <polyline vectorEffect="non-scaling-stroke" points="50,46 63,39 76,43 90,32" />
            <polyline vectorEffect="non-scaling-stroke" points="76,43 82,54" />
            <polyline vectorEffect="non-scaling-stroke" points="50,46 57,60 53,75 61,94" />
            <polyline vectorEffect="non-scaling-stroke" points="50,46 37,52 24,66 10,77" />
            <polyline vectorEffect="non-scaling-stroke" points="24,66 20,55" />
          </svg>
          {/* 擴散衝擊波環 */}
          <div className="shockwave absolute left-1/2 top-[46%] h-44 w-44 rounded-full" />
          {/* BAM 漫畫字爆 */}
          <div
            className="bam-pop absolute left-1/2 top-[46%] select-none text-[64px] font-black italic leading-none"
            style={{
              color: "#f4d76b",
              WebkitTextStroke: "3px #b02a1e",
              textShadow: "0 4px 0 #b02a1e, 4px 8px 0 rgba(0,0,0,0.35)",
            }}
          >
            {t("capture.bam")}
          </div>
        </div>
      )}

      {/* 最後關頭「閃走」：金色殘影橫掃 */}
      {streakKey > 0 && (
        <div
          key={`streak-${streakKey}`}
          className="pointer-events-none absolute inset-x-0 top-1/2 z-[38] -translate-y-1/2"
        >
          <div
            className="dash-streak h-20 w-full"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(232,200,96,0.75) 45%, rgba(255,255,255,0.6) 55%, transparent 100%)",
            }}
          />
        </div>
      )}

      {/* 追逐提示橫額：博命＝快啲追返；普通閃走＝轉身追返佢 */}
      {chase && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-[41] flex justify-center">
          <div
            className={`chase-pulse rounded-full px-5 py-2 text-base font-black text-white shadow-lg ${
              chase.escaping ? "bg-chilli" : "bg-black/70"
            }`}
          >
            {t(chase.escaping ? "capture.escapeWarn" : "capture.chaseBack")}
          </div>
        </div>
      )}

      {/* AR 掃描框四角 */}
      {inGame && (
        <div className="pointer-events-none absolute inset-6 z-10">
          {["top-0 left-0 border-t-4 border-l-4", "top-0 right-0 border-t-4 border-r-4", "bottom-0 left-0 border-b-4 border-l-4", "bottom-0 right-0 border-b-4 border-r-4"].map(
            (cls) => (
              <div key={cls} className={`absolute h-10 w-10 rounded-sm border-gold-light ${cls}`} />
            )
          )}
        </div>
      )}

      {/* 頂部精靈資訊 */}
      {phase !== "success" && (
        <header className="absolute inset-x-0 top-0 z-20 flex flex-col items-center gap-1 pt-5">
          <div
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 ${
              shiny ? "bg-black/70 ring-2 ring-gold-light shadow-[0_0_18px_rgba(232,200,96,0.8)]" : "bg-black/55"
            }`}
          >
            <span className="text-base font-black text-white">{species.name[locale]}</span>
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-black text-white">
              Lv.{wildLevel}
            </span>
            <UIIcon name={ELEMENT_INFO[species.element].icon} size={16} />
          </div>
          {shiny && (
            <span className="shiny-badge rounded-full px-3 py-1 text-[11px] font-black text-ink">
              ✦ {t("capture.shiny")}
            </span>
          )}
          {calm && (
            <span className="rounded-full bg-[#7bc47f]/90 px-3 py-1 text-[11px] font-black text-white shadow">
              ♥ {t("capture.calmLabel")}
            </span>
          )}
          {arMode === "3d" && inGame && (
            <span className="rounded-full bg-black/55 px-3 py-1 text-[11px] font-bold text-white/85">
              {t("capture.mode3dActive")}
            </span>
          )}
          {cameraOk === false && arMode === "static" && (
            <span className="rounded-full bg-chilli/90 px-3 py-1 text-[11px] font-bold text-white">
              {t("capture.arNotSupported")}
            </span>
          )}
          {!webglOk && (
            <span className="rounded-full bg-chilli/90 px-3 py-1 text-[11px] font-bold text-white">
              {t("capture.no3d")}
            </span>
          )}
        </header>
      )}

      {/* 離幕指示箭嘴 */}
      {arrow && (
        <div
          className="pointer-events-none absolute z-20 flex flex-col items-center"
          style={{ left: arrow.x, top: arrow.y, transform: "translate(-50%, -50%)" }}
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gold text-2xl text-ink shadow-lg"
            style={{ transform: `rotate(${arrow.deg}deg)` }}
          >
            ➜
          </div>
          <span className="mt-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">
            {t("capture.turnToFind")}
          </span>
        </div>
      )}

      {/* 瞄準紅圈 + 縮圈時機（PoGo 式：金圈縮到貼住紅圈嗰刻出手） */}
      {inGame && ringVisible && (
        <div
          data-ring="target"
          className="pointer-events-none absolute z-10 flex items-center justify-center"
          style={{ left: ringX, top: ringY, transform: "translate(-50%, -50%)" }}
        >
          <div
            className={`flex h-48 w-48 items-center justify-center rounded-full border-4 transition-colors ${
              frenzy
                ? "border-chilli"
                : phase === "struggle"
                  ? "border-gold-light"
                  : nearSweet
                    ? "border-[#7bc47f]"
                    : "border-chilli"
            }`}
            style={{
              boxShadow: frenzy
                ? "0 0 42px rgba(216,74,47,0.95)"
                : nearSweet
                  ? "0 0 32px rgba(123,196,127,0.75)"
                  : "0 0 24px rgba(216,74,47,0.5)",
            }}
          >
            <div
              className={`absolute -top-8 rounded-full px-3 py-0.5 text-xs font-black tracking-widest text-white ${
                frenzy ? "frenzy-label bg-chilli" : "bg-chilli"
              }`}
            >
              {frenzy
                ? t("capture.frenzyTitle")
                : phase === "struggle"
                  ? t("capture.struggleTitle")
                  : t("capture.targeted")}
            </div>
          </div>
          {/* 縮緊嘅金圈（出手一刻凍結消失，等視線落喺筷子上） */}
          {phase === "aiming" && pinch === "open" && (
            <div
              className="absolute rounded-full border-[5px]"
              style={{
                width: 192,
                height: 192,
                transform: `scale(${ringScale})`,
                borderColor: nearSweet ? "#7bc47f" : "#e8c860",
                boxShadow: "0 0 14px rgba(232,200,96,0.65), inset 0 0 8px rgba(232,200,96,0.35)",
                opacity: 0.95,
              }}
            />
          )}
          {/* 精靈對白泡泡 */}
          {bubble && (
            <div
              key={bubble.key}
              className="absolute left-1/2 top-1/2"
              style={{ transform: "translate(48px, -98px)" }}
            >
              <div className="bubble-pop relative whitespace-nowrap rounded-2xl border-2 border-ink/20 bg-white/95 px-3.5 py-1.5 text-sm font-black text-ink shadow-lg">
                {bubble.text}
                <span className="absolute -bottom-[7px] left-4 h-3 w-3 rotate-45 border-b-2 border-r-2 border-ink/20 bg-white/95" />
              </div>
            </div>
          )}
          {/* 評級閃字 */}
          {grade && (
            <div
              className={`grade-pop absolute text-3xl font-black drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] ${
                grade === "perfect"
                  ? "text-[#ffd94d]"
                  : grade === "great"
                    ? "text-[#7bc47f]"
                    : grade === "good"
                      ? "text-white"
                      : "text-chilli"
              }`}
            >
              {t(`capture.grade${grade[0].toUpperCase() + grade.slice(1)}`)}
            </div>
          )}
        </div>
      )}

      {/* 筷子：由右上角斜插入嚟嘅一對木筷（近乎平行、透視感），瞄準時筷尖微張浮動蓄勢，
          出手一刻快速鉗攏鉗住精靈兩側（帶回彈），搏鬥時夾實震動＋每下狂撳擠壓 */}
      {inGame && ringVisible && (
        <div
          className={`pointer-events-none absolute z-10 ${
            phase === "struggle" ? (frenzy ? "struggle-shake-hard" : "struggle-shake") : ""
          }`}
          style={{ left: ringX, top: ringY, transform: "translate(-50%, -50%)" }}
        >
          {/* CSS 筷子淨係 static（無 3D 場景）fallback；slam/gyro/3d 用 Chopsticks3d */}
          {(!webglOk || arMode === "static") &&
            (() => {
            const closed = pinch === "snap" || phase === "struggle";
            return (
              <div
                key={phase === "struggle" ? squeezeKey : -1}
                className={phase === "struggle" ? "squeeze-pulse" : pinch === "open" ? "chopstick-ready" : ""}
              >
                {[-1, 1].map((side) => {
                  // side -1 = 左筷（筷尖偏左）／side 1 = 右筷（筷尖偏右）
                  // 兩支繞筷尖旋轉，向右上角斜插；合埋時筷尖收窄＋夾角收細＝擠壓感
                  const tipGap = closed ? 14 : 26; // 筷尖距精靈中心
                  const rot = 41 + side * (closed ? 3.5 : 8); // 夾角：開 16°／合 7°
                  return (
                    <div
                      key={side}
                      style={{
                        position: "absolute",
                        width: 30,
                        height: 320,
                        left: side * tipGap,
                        top: 0,
                        marginLeft: -15,
                        marginTop: -320, // 底端（筷尖）落喺精靈中心
                        transformOrigin: "50% 100%", // 繞筷尖旋轉
                        transform: `rotate(${rot}deg)`,
                        // 夾落去快而狠（帶過衝回彈），張返開慢啲有重量感
                        transition: closed
                          ? "left .12s cubic-bezier(.3,1.7,.5,1), transform .12s cubic-bezier(.3,1.7,.5,1)"
                          : "left .3s ease-out, transform .3s ease-out",
                        // 入畫端粗、去到筷尖細（透視）
                        clipPath: "polygon(16% 0, 84% 0, 58% 100%, 42% 100%)",
                        // 木色圓柱（側光暗邊），唔用紅金
                        background:
                          "linear-gradient(105deg,#6b4423 0%,#8a5a2e 22%,#caa063 50%,#9c6a34 78%,#5f3c1f 100%)",
                        borderRadius: "7px 7px 3px 3px",
                        boxShadow: "0 3px 10px rgba(0,0,0,.5)",
                      }}
                    />
                  );
                })}
              </div>
            );
          })()}
          {/* 夾落一刻嘅衝擊閃光 */}
          {impactKey > 0 && pinch === "snap" && (
            <div key={impactKey} className="pinch-impact absolute left-1/2 top-1/2 -ml-14 -mt-14 h-28 w-28">
              <div className="absolute inset-0 rounded-full border-4 border-white/90" />
              {[0, 45, 90, 135].map((deg) => (
                <div
                  key={deg}
                  className="absolute left-1/2 top-1/2 h-1.5 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85"
                  style={{ transform: `translate(-50%,-50%) rotate(${deg}deg)` }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* intro + aiming：筷子選擇器 */}
      {(phase === "intro" || phase === "aiming") && (
        <div className="absolute right-3 flex flex-col gap-2" style={{ zIndex: 9998, top: "150px" }}>
          {CHOPSTICK_TIERS.map((tier) => {
            const tierKey = tier.id === "wooden" ? "chopsticks" : `chopsticks_${tier.id}`;
            const tierCount = allChopsticks[tierKey] ?? 0;
            const imgSrc = `/ui/chopstick-${tier.id}.png`;
            return (
              <button
                key={tier.id}
                onClick={(e) => { e.stopPropagation(); setSelectedTier(tier.id); }}
                onPointerDown={(e) => { e.stopPropagation(); }}
                className={`flex flex-col items-center gap-0.5 rounded-xl p-1.5 transition-all ${
                  selectedTier === tier.id
                    ? "ring-2 ring-gold scale-110 bg-white/80"
                    : "opacity-50 bg-white/40"
                }`}
                style={{ touchAction: "manipulation" }}
              >
                <img
                  src={imgSrc}
                  alt={tier.name[locale]}
                  style={{ width: 36, height: 36 }}
                  draggable={false}
                />
                <span style={{ fontSize: "11px", fontWeight: 900, color: "#4a2c14" }}>×{tierCount}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* intro：開始畫面 */}
      {phase === "intro" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-end gap-4 bg-gradient-to-t from-black/70 via-transparent pb-16">
          <p className="max-w-xs px-6 text-center text-sm font-bold text-white drop-shadow">
            {t("onboarding.step3Body")}
          </p>
          <p className="flex items-center gap-1.5 rounded-full bg-black/55 px-4 py-1.5 text-sm font-bold text-white">
            <img src={`/ui/chopstick-${selectedTier}.png`} alt="" style={{ width: 18, height: 18 }} draggable={false} />
            {(() => {
              const tk = selectedTier === "wooden" ? "chopsticks" : `chopsticks_${selectedTier}`;
              return allChopsticks[tk] ?? 0;
            })()}
          </p>
          <button
            onClick={startAiming}
            data-testid="start"
            className="btn-gold flex items-center gap-2 px-10 py-4 text-xl font-black"
          >
            <UIIcon name="chopsticks" size={26} /> {t("common.start")}
          </button>
        </div>
      )}

      {/* 冇筷子：攔截＋引導打卡 */}
      {needChopsticks && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 px-8 text-center">
          <UIIcon name="chopsticks" size={48} />
          <p className="text-lg font-black text-white">{t("capture.noChopsticksTitle")}</p>
          <p className="max-w-xs text-sm font-bold text-white/85">{t("capture.noChopsticksHint")}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => router.push("/checkin")}
              className="btn-gold px-8 py-3 text-base font-black"
            >
              {t("capture.goCheckin")}
            </button>
            <button
              onClick={() => {
                setNeedChopsticks(false);
                if (phase !== "intro") {
                  setPhase("intro");
                  setPinch("open");
                }
              }}
              className="btn-outline px-6 py-3 font-bold text-white"
            >
              {t("common.back")}
            </button>
          </div>
        </div>
      )}

      {/* 底部操作區（瞄準）：力度計（同縮圈同步）+ 時機提示 + 夾！＋小食掣 */}
      {phase === "aiming" && spiritReady && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 pb-6"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
        >
          {/* 小食掣（PoGo 樹果位）：掟俾精靈食，安撫 20 秒更易捉 */}
          {webglOk && snacks > 0 && (
            <button
              data-no-press-sfx
              onPointerDown={throwSnack}
              className="absolute bottom-24 left-5 z-10 flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-gold bg-black/55 shadow-lg active:scale-90"
              style={{ touchAction: "manipulation" }}
              aria-label={t("capture.snackLabel")}
            >
              <UIIcon name="item-chicken" size={34} />
              <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-gold text-xs font-black text-ink shadow">
                {snacks}
              </span>
            </button>
          )}
          {/* 摸頭掣：好感度 −5% 流失/次（撳精靈本身而家係「夾」，摸頭改用專掣） */}
          {petCount < PET_MAX && (
            <button
              data-no-press-sfx
              data-testid="pet"
              onPointerDown={petSpirit}
              className="absolute bottom-24 right-5 z-10 flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 border-[#ff8fa3] bg-black/55 shadow-lg active:scale-90"
              style={{ touchAction: "manipulation" }}
              aria-label={t("capture.petLabel")}
            >
              <span className="text-3xl leading-none text-[#ff8fa3]">♥</span>
              <span className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[#ff8fa3] text-xs font-black text-ink shadow">
                {PET_MAX - petCount}
              </span>
            </button>
          )}
          <span className="rounded-full bg-black/55 px-4 py-1.5 text-xs font-bold text-white">
            {t("capture.ringHint")}
          </span>
          <div className="w-72">
            <div className="relative h-5 overflow-hidden rounded-full border-2 border-ink bg-parchment-light">
              {/* 甜蜜區（同縮圈 great/perfect 判定完全一致，跟稀有度縮窄） */}
              <div
                className="absolute inset-y-0"
                style={{
                  left: `${SWEET_PCT - greatPct}%`,
                  width: `${greatPct * 2}%`,
                  background: "linear-gradient(90deg,#a8d3aa,#7bc47f,#a8d3aa)",
                }}
              />
              <div
                className="absolute inset-y-0"
                style={{
                  left: `${SWEET_PCT - perfectPct}%`,
                  width: `${perfectPct * 2}%`,
                  background: "linear-gradient(90deg,#4e9a51,#2f7a33,#4e9a51)",
                }}
              />
              {/* 指針：跟金圈縮細進度移動 */}
              <div
                className="absolute top-0 h-full w-1.5 rounded bg-chilli transition-none"
                style={{ left: `calc(${ringPct}% - 3px)` }}
              />
            </div>
            <div className="mt-0.5 text-center text-[11px] font-black text-white drop-shadow">
              {t("capture.power")}
            </div>
          </div>
          {/* 精靈行出咗鏡頭：冇得撳精靈夾，引導玩家跟箭嘴搵返佢先（未登場唔好誤報） */}
          {tracked && !ringVisible && (
            <span className="rounded-full bg-black/70 px-6 py-3 text-sm font-black text-gold-light">
              {t("capture.findFirst")}
            </span>
          )}
        </div>
      )}

      {/* 底部操作區（搏鬥）：夾實度 + 狂撳 */}
      {phase === "struggle" && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 pb-6"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
        >
          <div className="w-72">
            <div className="relative h-6 overflow-hidden rounded-full border-2 border-ink bg-parchment-light">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-none"
                style={{
                  width: `${grip}%`,
                  background:
                    grip > 55
                      ? "linear-gradient(90deg,#7bc47f,#4e9a51)"
                      : grip > 25
                        ? "linear-gradient(90deg,#e8c860,#d8a12f)"
                        : "linear-gradient(90deg,#d84a2f,#b03a2e)",
                }}
              />
            </div>
            <div className="mt-0.5 text-center text-[11px] font-black text-white drop-shadow">
              {t("capture.grip")}
            </div>
          </div>
          {track.onScreen || !tracked ? (
            <span
              data-testid="hold-hint"
              className="rounded-full bg-black/60 px-6 py-2.5 text-base font-black text-white"
            >
              {t("capture.holdHint")}
            </span>
          ) : (
            /* 閃走／走出鏡頭：夾唔到，跟金箭嘴轉身對焦返佢先 */
            <span className="chase-pulse rounded-full bg-black/70 px-6 py-3 text-base font-black text-gold-light">
              {t("capture.chaseBack")}
            </span>
          )}
        </div>
      )}

      {/* 失敗提示（仲有機會） */}
      {phase === "failed" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/60 px-8 text-center">
          <UIIcon name="dash" size={64} />
          <h2 className="text-2xl font-black text-white">
            {failReason === "escaped" ? t("capture.escaped") : t("capture.failed")}
          </h2>
          <p className="text-sm font-bold text-white/85">
            {failReason === "escaped" ? t("capture.struggleHint") : t("capture.failedHint")}
          </p>
          <p className="text-xs text-white/60">
            {attempts}/{MAX_ATTEMPTS}
          </p>
          <button onClick={retry} className="btn-gold px-10 py-3.5 text-lg font-black">
            {t("common.retry")}
          </button>
        </div>
      )}

      {/* 精靈逃走 */}
      {phase === "fled" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/70 px-8 text-center">
          <UIIcon name="dash" size={64} />
          <h2 className="text-2xl font-black text-white">{t("capture.failed")}</h2>
          <button onClick={() => router.push("/map")} className="btn-gold px-10 py-3.5 text-lg font-black">
            {t("capture.keepExploring")}
          </button>
        </div>
      )}

      {/* 捕捉成功 */}
      {phase === "success" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center gap-[clamp(0.6rem,1.6dvh,1.1rem)] overflow-y-auto overflow-x-hidden bg-gradient-to-b from-[#2a1a0c] to-[#4a2c14] px-4 py-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:py-[max(1.5rem,env(safe-area-inset-top))]">
          <Confetti />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {[0, 0.2, 0.4].map((d) => (
              <div
                key={d}
                className="burst-ring absolute h-64 w-64 rounded-full border-4 border-gold-light"
                style={{ animationDelay: `${d}s` }}
              />
            ))}
          </div>

          <h1 className="mt-auto text-center text-[clamp(28px,8vw,42px)] font-black text-gold-light drop-shadow-[0_0_20px_rgba(232,200,96,0.7)]">
            {t("capture.success")}
          </h1>
          {shiny && (
            <span className="shiny-badge rounded-full px-4 py-1.5 text-sm font-black text-ink">
              ✦ {t("capture.shinyCaught")} ✦
            </span>
          )}

          {/* 以前 h-72＋0.85m 歸一化，煎蕊仔呢類矮肥寵會頂到標題同資料卡；收細到 h-52＋0.55m */}
          {/* 自適應：以視窗高度為上限，細機唔會擠爆、大機保持最大 208px */}
          <div className="flex aspect-square w-[min(208px,32dvh)] shrink-0 items-center justify-center">
            {webglOk && species.modelUrl ? (
              <Canvas camera={{ fov: 45, position: [0, 0.35, 1.35] }} gl={{ alpha: true }}>
                <ambientLight intensity={1.2} />
                <directionalLight position={[2, 4, 2]} intensity={1.3} />
                <Suspense fallback={null}>
                  {/* 展示歸一化：唔理隻寵真實身高（modelHeightM），統一到顯示高 0.55m */}
                  <group
                    position={[0, -0.28, 0]}
                    scale={0.55 / (species.modelHeightM ?? 0.5)}
                  >
                    <SpiritModel speciesId={speciesId} spin shiny={shiny} faceCamera={speciesId === "chilli-baby" || speciesId === "nasi-lemak-tot" ? 0 : true} />
                  </group>
                </Suspense>
              </Canvas>
            ) : (
              <div className="float-bob">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/spirits/full/${speciesId}.webp`}
                  alt=""
                  className="h-[min(176px,26dvh)] w-auto max-w-full object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.6)]"
                  draggable={false}
                />
              </div>
            )}
          </div>

          <div className="card-parchment w-full max-w-xs shrink-0 p-3.5 sm:p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-lg font-black text-ink">
                {species.name[locale]}{" "}
                <span className="text-sm font-bold text-ink-soft">Lv.{wildLevel}</span>
              </span>
              <ElementBadge element={species.element} showFlavor size="sm" />
            </div>
            <div className="grid grid-cols-4 gap-1 text-center text-xs">
              {(
                [
                  ["hp", species.baseStats.hp],
                  ["attack", species.baseStats.attack],
                  ["defense", species.baseStats.defense],
                  ["speed", species.baseStats.speed],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-parchment-dark/60 py-1.5">
                  <div className="font-black text-ink">
                    {Math.round(v * spiritStatMultiplier(wildLevel))}
                  </div>
                  <div className="text-[10px] text-ink-soft">{t(`dex.${k}`)}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-0.5 text-[11px] text-ink-soft">
              {species.skills.map((s) => (
                <div key={s.id} className="flex items-center gap-1">
                  <UIIcon name="sparkles" size={13} /> {s.name[locale]}
                </div>
              ))}
              <div className="flex items-center gap-1">
                <UIIcon name="book" size={13} /> {t("capture.capturedOn")}:{" "}
                {new Date().toLocaleDateString(locale === "zh" ? "zh-TW" : "en-SG")}
              </div>
              {showCentreLabel && centreId && CENTRE_MAP[centreId] && (
                <div className="flex items-center gap-1">
                  <UIIcon name="pin" size={13} /> {t("capture.capturedAt")}:{" "}
                  {CENTRE_MAP[centreId].name[locale]}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setSelfieOpen(true)}
            data-testid="selfie-open"
            className="btn-outline flex w-full max-w-xs items-center justify-center gap-1.5 px-6 py-3 text-sm font-bold sm:w-auto"
          >
            <UIIcon name="camera" size={18} /> {t("capture.photoMode")}
          </button>

          <div className="mb-auto flex w-full max-w-xs flex-wrap items-center justify-center gap-2 sm:gap-3">
            <button
              onClick={() => router.push(`/dex/${speciesId}`)}
              className="btn-outline flex min-w-32 flex-1 items-center justify-center gap-1.5 px-4 py-3 text-sm font-bold sm:px-6"
            >
              <UIIcon name="book" size={18} /> {t("nav.dex")}
            </button>
            <button
              onClick={() => router.push("/map")}
              className="btn-gold min-w-32 flex-1 px-4 py-3 text-base font-black sm:px-8"
            >
              {t("capture.keepExploring")}
            </button>
          </div>
        </div>
      )}

      {/* 同精靈自拍 overlay */}
      {selfieOpen && speciesId && (
        <SelfiePhoto speciesId={speciesId} webglOk={webglOk} onClose={() => setSelfieOpen(false)} />
      )}

      {/* ?debug=1 調試面板：真機排查 SLAM 姿態／投影 */}
      {debugOn && (
        <DebugPanel
          get={() => {
            const p = xr8PoseRef.current;
            const tr = trackRef.current;
            const f = (n: number) => n.toFixed(2);
            return {
              mode: `${arMode} | ${phase} | xr8:${xr8Status ?? "-"}`,
              pose: `has:${p.has} pos(${f(p.px)}, ${f(p.py)}, ${f(p.pz)})`,
              quat: `(${f(p.qx)}, ${f(p.qy)}, ${f(p.qz)}, ${f(p.qw)}) intr:${p.intrinsics ? "16" : "無"}`,
              anchor: `(${f(spiritAnchor[0])}, ${f(spiritAnchor[1])}, ${f(spiritAnchor[2])})`,
              track: `x:${Math.round(track.x)} y:${Math.round(track.y)} on:${tr.onScreen ? "Y" : "N"} front:${tr.inFront ? "Y" : "N"}`,
            };
          }}
        />
      )}

      {/* 退出按鈕 */}
      {phase !== "success" && (
        <button
          onClick={() => router.push("/map")}
          className="absolute left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"
          aria-label={t("capture.exit")}
        >
          ←
        </button>
      )}

      {/* AR ⇄ 3D 模式切換（AR 環境差／發熱時嘅出路） */}
      {inGame && webglOk && (arMode === "3d" ? canUseAr : true) && (
        <button
          onClick={toggleMode}
          className="absolute right-4 top-4 z-40 flex h-10 items-center justify-center rounded-full bg-black/50 px-4 text-xs font-black text-white"
          aria-label={arMode === "3d" ? t("capture.switchAr") : t("capture.switch3d")}
        >
          {arMode === "3d" ? t("capture.modeAr") : t("capture.mode3d")}
        </button>
      )}
    </main>
  );
}

export default function CapturePage() {
  return (
    <Suspense>
      <CaptureInner />
    </Suspense>
  );
}
