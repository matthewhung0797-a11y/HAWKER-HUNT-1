"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { SPECIES, SPECIES_MAP } from "@/content/species";
import { ITEM_MAP } from "@/content/items";
import { ELEMENT_INFO, getElementMultiplier } from "@/content/elements";
import { pickBattleBg, homeCentreOf, type BattleBgConfig } from "@/content/battle-bgs";
import {
  ELEMENT_FX_COLORS,
  SKILL_FX,
  DEFAULT_SKILL_FX,
  BASIC_FX,
  ARCHETYPE_IMPACT_MS,
  BASIC_IMPACT_MS,
} from "@/content/skill-fx";
import { SIGNATURE_FX } from "@/components/three/signature-fx";
import type { Skill } from "@/content/types";
import { useGameStore, spiritStatMultiplier, SPIRIT_LEVEL_CAP } from "@/lib/store";
import { hasWebGL2 } from "@/lib/webgl";
import {
  sfxCast, sfxHit, sfxCrit, sfxHeal, sfxKo, sfxVictory, sfxDefeat, sfxTap,
  sfxCharge, sfxUltHit, sfxWarn, sfxDodge, sfxEnergyFull, isMuted, setMuted,
} from "@/lib/sfx";
import { playMusic, stopMusic, setMusicMuted, isMusicMuted } from "@/lib/music";
import SpiritModel, { type SpiritAnim } from "@/components/three/SpiritModel";
import BattleFx, { type BattleFxEvent } from "@/components/three/BattleFx";
import BattleAmbience from "@/components/three/BattleAmbience";
import UIIcon from "@/components/UIIcon";
import { track } from "@/lib/analytics/track";

type Phase = "intro" | "player" | "acting" | "enemy" | "victory" | "defeat";
type Side = "player" | "enemy";
type WarnKind = "normal" | "ult";

/** HP 倍率：base hp 太細，乘大啲先似一場戰鬥 */
const HP_SCALE = 4;
// 第一視角構圖：我方喺前景偏左背向鏡頭，敵方喺遠景偏右面向鏡頭
const PLAYER_POS: [number, number, number] = [-0.35, 0, 0.05];
const ENEMY_POS: [number, number, number] = [0.3, 0, -0.9];

// ── 能量制＋閃避參數 ────────────────────────────
const ENERGY_MAX = 100;
const BASIC_ENERGY = 35; // 普攻儲能量
const BASIC_POWER = 0.75; // 普攻威力倍率
/** 技能能量跟威力分檔——以前淨係 ≥1.8→100／其餘→50，
 *  搞到 ×1.3 同 ×1.6 都顯示「能量 50」，強技永遠優於弱技冇取捨。 */
const ULT_COST = 100; // 招牌大招（power ≥ 1.8）
const SKILL_COST_HEAVY = 70; // 強中技（×1.6～×1.7）≈ 兩下普攻
const SKILL_COST = 50; // 輕中技／治療（×1.3～×1.5）
const SKILL_COST_LIGHT = 35; // 弱技（×1.0 階）＝一下普攻即用得
const WARN_NORMAL_MS = 800; // 敵方普攻預警（黃）
const WARN_ULT_MS = 1150; // 敵方大招預警（紅，長啲俾你反應）
const ENEMY_BASIC_POWER = 0.55; // 敵方普攻威力
const ENEMY_ENERGY_PER_TURN = 20; // 敵方每回合儲能
const ENEMY_ENERGY_PER_HIT = 4; // 敵方捱打儲能
const DODGE_SWIPE_PX = 44; // 掃屏判定位移（完整承諾一掃）
const DODGE_ATTEMPT_PX = 20; // 有掃但唔夠 DODGE_SWIPE_PX：當「距離唔夠」= 半閃
/** 分級閃避時間窗（由預警出現一刻計，performance.now() 記喺 ref）：
 *  ≤0.5s 完整掃屏＝全避；0.5–1s＝半閃 50% 照中；>1s＝太遲必中 */
const DODGE_CLEAN_MS = 500;
const DODGE_PARTIAL_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const skillCost = (s: Skill) => {
  if (s.power <= 0) return SKILL_COST; // 治療／輔助維持 50
  if (s.power >= 1.8) return ULT_COST;
  if (s.power >= 1.55) return SKILL_COST_HEAVY;
  if (s.power >= 1.25) return SKILL_COST;
  return SKILL_COST_LIGHT;
};
const skillTier = (s: Skill) => (s.power >= 1.8 ? 2 : s.power >= 1.3 ? 1 : 0);

/** 傷害結算時刻：同特效主體命中一刻對齊（唔再寫死 420ms） */
const impactMs = (skill: Skill | null, seriesId?: string) => {
  if (!skill) {
    const motion = (seriesId && BASIC_FX[seriesId]?.motion) || "slash";
    return BASIC_IMPACT_MS[motion];
  }
  if (skillTier(skill) === 2 && SIGNATURE_FX[skill.id]) return SIGNATURE_FX[skill.id].impactMs;
  return ARCHETYPE_IMPACT_MS[(SKILL_FX[skill.id] ?? DEFAULT_SKILL_FX).archetype];
};

interface FxPopup {
  key: number;
  side: Side;
  text: string;
  color: string;
}

/** 敵方預警光環：腳下脈動圈（黃＝普攻、紅＝大招） */
function WarnRing({ kind }: { kind: WarnKind }) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const mesh = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pulse = 0.5 + 0.5 * Math.sin(t * (kind === "ult" ? 14 : 9));
    if (mat.current) mat.current.opacity = 0.35 + pulse * 0.5;
    if (mesh.current) mesh.current.scale.setScalar(1 + pulse * 0.18);
  });
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
      <ringGeometry args={[0.24, 0.32, 40]} />
      <meshBasicMaterial
        ref={mat}
        color={kind === "ult" ? "#ff4030" : "#ffd94d"}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/** 戰鬥角色：企位、面向對手、攻擊突刺、閃避側撲、倒地補間、預警光環 */
function BattleActor({
  speciesId,
  basePos,
  targetPos,
  anim,
  lungeKey,
  dodgeKey = 0,
  dodgeDir = 1,
  hitKey = 0,
  flashKey = 0,
  timeScale = 1,
  warn = null,
  shiny = false,
  onClipEnd,
}: {
  speciesId: string;
  basePos: [number, number, number];
  /** 對手實際企位：朝向同突刺都指住佢 */
  targetPos: [number, number, number];
  anim: SpiritAnim;
  lungeKey: number;
  /** 閃避側撲觸發 key */
  dodgeKey?: number;
  /** 側撲方向：-1 左 / +1 右（相對屏幕） */
  dodgeDir?: number;
  /** 受擊擊退觸發 key */
  hitKey?: number;
  /** 受擊白閃觸發 key */
  flashKey?: number;
  /** hit-stop 慢格用 */
  timeScale?: number;
  /** 預警光環（敵方出招前） */
  warn?: WarnKind | null;
  shiny?: boolean;
  onClipEnd?: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const fallGroup = useRef<THREE.Group>(null);
  const lungeStart = useRef(-1);
  const prevLunge = useRef(lungeKey);
  const dodgeStart = useRef(-1);
  const prevDodge = useRef(dodgeKey);
  const dodgeDirRef = useRef(dodgeDir);
  const hitStart = useRef(-1);
  const prevHit = useRef(hitKey);
  const fallT = useRef(0);
  const target = useMemo(() => new THREE.Vector3(...targetPos), [targetPos]);

  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    if (prevLunge.current !== lungeKey) {
      prevLunge.current = lungeKey;
      lungeStart.current = state.clock.elapsedTime;
    }
    if (prevDodge.current !== dodgeKey) {
      prevDodge.current = dodgeKey;
      dodgeStart.current = state.clock.elapsedTime;
      dodgeDirRef.current = dodgeDir;
    }
    if (prevHit.current !== hitKey) {
      prevHit.current = hitKey;
      hitStart.current = state.clock.elapsedTime;
    }
    // 攻擊突刺：0.55s 衝去對手面前再彈返（正弦包絡）
    let dash = 0;
    if (lungeStart.current >= 0) {
      const t = (state.clock.elapsedTime - lungeStart.current) / 0.55;
      if (t < 1) dash = Math.sin(t * Math.PI) * 0.62;
      else lungeStart.current = -1;
    }
    // 閃避側撲：0.42s 向側面快撲再歸位
    let side = 0;
    if (dodgeStart.current >= 0) {
      const t = (state.clock.elapsedTime - dodgeStart.current) / 0.42;
      if (t < 1) side = Math.sin(t * Math.PI) * 0.34 * dodgeDirRef.current;
      else dodgeStart.current = -1;
    }
    // 受擊擊退：0.3s 向後彈開再歸位（疊喺 dash 上，方向相反）
    if (hitStart.current >= 0) {
      const t = (state.clock.elapsedTime - hitStart.current) / 0.3;
      if (t < 1) dash -= Math.sin(t * Math.PI) * 0.12;
      else hitStart.current = -1;
    }
    const dir = new THREE.Vector3().subVectors(target, new THREE.Vector3(...basePos)).normalize();
    // 側向量（垂直於面向）：屏幕左右側撲
    const sideVec = new THREE.Vector3(-dir.z, 0, dir.x);
    g.position.set(
      basePos[0] + dir.x * dash + sideVec.x * side,
      basePos[1],
      basePos[2] + dir.z * dash + sideVec.z * side
    );
    // 永遠面向對手
    // （注意：唔可以喺 lookAt 之後再改 g.rotation 分量——yaw 過 90° 時
    //  euler 分解會變 (180°,y,180°) 形式，逐分量寫入會整個反轉）
    g.lookAt(target.x, basePos[1], target.z);

    // 倒地托底（無 rig / 弱 rig 嘅 down clip 唔會真係瞓低）：側翻 + 沉落地
    // ——用內層 group，唔好污染 lookAt
    const species = SPECIES_MAP[speciesId];
    if (anim === "down" && (!species?.animated || species.rigLite)) {
      fallT.current = Math.min(1, fallT.current + delta * 2.2);
    } else if (anim !== "down") {
      fallT.current = Math.max(0, fallT.current - delta * 3);
    }
    const f = fallGroup.current;
    if (f) {
      f.rotation.z = -fallT.current * (Math.PI / 2) * 0.85;
      f.position.y = -fallT.current * 0.05;
    }
  });

  return (
    <group ref={group} position={basePos}>
      {warn && <WarnRing kind={warn} />}
      <group ref={fallGroup}>
        <SpiritModel
          speciesId={speciesId}
          anim={anim}
          shiny={shiny}
          timeScale={timeScale}
          flashKey={flashKey}
          onClipEnd={onClipEnd}
        />
      </group>
    </group>
  );
}

/** 運鏡：貼身膊頭後視角（第一視角感）＋緩慢呼吸浮動＋受擊震屏 */
function CameraRig({ shake, debug }: { shake: React.MutableRefObject<number>; debug?: boolean }) {
  useFrame((state, delta) => {
    if (debug) {
      state.camera.position.set(0.45, 0.5, 0.95);
      state.camera.lookAt(-0.35, 0.2, 0.05);
      return;
    }
    const t = state.clock.elapsedTime;
    const s = shake.current;
    // 壓低貼近我方膊頭後方，望向敵人胸口——我方精靈佔左下前景
    state.camera.position.set(
      -0.46 + Math.sin(t * 0.16) * 0.05 + (Math.random() - 0.5) * s,
      0.45 + Math.sin(t * 0.3) * 0.025 + (Math.random() - 0.5) * s * 0.6,
      1.38 + (Math.random() - 0.5) * s
    );
    state.camera.lookAt(0.06, 0.26, -0.5);
    shake.current = Math.max(0, s - delta * 1.6);
  });
  return null;
}

/** 擂台地面：暗色木枱 + 金圈 */
function Arena({ bg }: { bg: BattleBgConfig }) {
  return (
    <group>
      {/* 地板圓盤：透明漸出邊緣，融入背景圖地面 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[2.6, 48]} />
        <meshStandardMaterial color={bg.floorColor} roughness={0.9} transparent opacity={0.55} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[2.1, 2.2, 48]} />
        <meshBasicMaterial color={bg.ringColor} transparent opacity={bg.ringOpacity} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[0.5, 0.53, 48]} />
        <meshBasicMaterial color={bg.ringColor} transparent opacity={bg.ringOpacity * 0.45} />
      </mesh>
    </group>
  );
}

/** HP 條卡片（敵方右上、我方左下） */
function HpCard({
  name,
  level,
  hp,
  maxHp,
  element,
  align,
}: {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  element: string;
  align: "left" | "right";
}) {
  const pct = Math.max(0, (hp / maxHp) * 100);
  const low = pct <= 22 && pct > 0;
  return (
    <div
      className={`card-parchment w-[15rem] max-w-[72vw] px-3.5 py-2 ${align === "right" ? "ml-auto" : ""}`}
      style={{ boxShadow: "0 4px 14px rgba(42,26,12,.4)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-black text-ink">{name}</span>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-parchment-dark/50 px-2 py-0.5 text-[11px] font-bold text-ink-soft">
          Lv.{level}
          <UIIcon name={ELEMENT_INFO[element as keyof typeof ELEMENT_INFO].icon} size={13} />
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="relative h-3 flex-1 overflow-hidden rounded-full border border-ink/40 bg-parchment-dark/70">
          {/* 殘影條：延遲慢跟，顯示啱啱失去嘅血量 */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[#f2e2c8]"
            style={{ width: `${pct}%`, transition: "width 0.9s ease-out 0.45s" }}
          />
          <div
            className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out ${low ? "hp-low-pulse" : ""}`}
            style={{
              width: `${pct}%`,
              background:
                pct > 50
                  ? "linear-gradient(90deg,#7bc47f,#4e9a51)"
                  : pct > 22
                    ? "linear-gradient(90deg,#e8c860,#d8a12f)"
                    : "linear-gradient(90deg,#d84a2f,#b03a2e)",
            }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-bold tabular-nums text-ink-soft">
          {Math.max(0, Math.round(hp))}/{maxHp}
        </span>
      </div>
    </div>
  );
}

function BattleInner() {
  const t = useTranslations("battle");
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const params = useSearchParams();
  const store = useGameStore();
  const webglOk = useMemo(() => hasWebGL2(), []);

  // ── 選我方精靈：query uid 優先 → 多過一隻就開選擇器 → 得一隻直接出戰 ──
  // （必須響應式訂閱：zustand persist 喺 client 掛載後先 hydrate）
  const ownedSpirits = useGameStore((s) => s.ownedSpirits);
  const lastBattleUid = useGameStore((s) => s.lastBattleUid);
  const [chosenUid, setChosenUid] = useState<string | null>(null);
  const needPicker = !params.get("uid") && ownedSpirits.length > 1;
  const playerSpirit = useMemo(() => {
    const q = params.get("uid");
    if (q) return ownedSpirits.find((s) => s.uid === q) ?? null;
    if (needPicker) return chosenUid ? (ownedSpirits.find((s) => s.uid === chosenUid) ?? null) : null;
    return ownedSpirits[0] ?? null;
  }, [ownedSpirits, params, chosenUid, needPicker]);
  const playerSpecies = playerSpirit ? SPECIES_MAP[playerSpirit.speciesId] : null;

  // ── 敵方：同階段隨機野生精靈（client 先揀，避免 hydration mismatch；揀咗就唔變）──
  // 診斷可用 ?enemy=<speciesId> 固定對手
  const [enemyId, setEnemyId] = useState<string | null>(null);
  useEffect(() => {
    if (!playerSpecies || enemyId) return;
    const forced = params.get("enemy");
    if (forced && SPECIES_MAP[forced] && forced !== playerSpecies.id) {
      setEnemyId(forced);
      return;
    }
    const stage = playerSpecies.stage;
    const pool = SPECIES.filter((s) => s.stage === stage && s.id !== playerSpecies.id);
    const centreParam = params.get("centre");
    const local = centreParam ? pool.filter((s) => homeCentreOf(s.id) === centreParam) : [];
    const pickFrom = local.length ? local : pool;
    const pick = pickFrom[Math.floor(Math.random() * pickFrom.length)] ?? SPECIES[0];
    setEnemyId(pick.id);
  }, [playerSpecies, enemyId, params]);
  const enemySpecies = enemyId ? SPECIES_MAP[enemyId] : null;

  // ── 場景背景：?centre= 優先 → 敵方精靈地頭 → 隨機（client 揀一次唔變）──
  const [bg, setBg] = useState<BattleBgConfig | null>(null);
  useEffect(() => {
    if (bg || !enemyId) return;
    setBg(pickBattleBg(params.get("centre"), enemyId));
  }, [bg, enemyId, params]);

  // 場景音樂：跟背景所屬中心；離開戰鬥就淡出
  useEffect(() => {
    if (bg) playMusic(bg.id);
  }, [bg]);
  useEffect(() => () => stopMusic(), []);

  // ── 等級屬性成長：我方跟精靈等級；野生敵方低一級（進步感）──
  const pLevel = playerSpirit?.level ?? 1;
  const eLevel = Math.max(1, pLevel - 1);
  const pMul = spiritStatMultiplier(pLevel);
  const eMul = spiritStatMultiplier(eLevel);
  const playerMax = Math.round((playerSpecies?.baseStats.hp ?? 50) * HP_SCALE * pMul);
  const enemyMax = Math.round((enemySpecies?.baseStats.hp ?? 50) * HP_SCALE * eMul);

  const [phase, setPhase] = useState<Phase>("intro");
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [playerHp, setPlayerHp] = useState(playerMax);
  const [enemyHp, setEnemyHp] = useState(enemyMax);
  const playerHpRef = useRef(playerMax);
  const enemyHpRef = useRef(enemyMax);
  const [playerAnim, setPlayerAnim] = useState<SpiritAnim>("idle");
  const [enemyAnim, setEnemyAnim] = useState<SpiritAnim>("idle");
  const [playerLunge, setPlayerLunge] = useState(0);
  const [enemyLunge, setEnemyLunge] = useState(0);
  const [dodgeKey, setDodgeKey] = useState(0);
  const [dodgeDir, setDodgeDir] = useState(1);
  const [warn, setWarn] = useState<WarnKind | null>(null);
  const [log, setLog] = useState("");
  const [fx, setFx] = useState<FxPopup | null>(null);
  const fxKey = useRef(0);
  const [flash, setFlash] = useState(0);
  const [flashColor, setFlashColor] = useState("#ffffff");
  const [fx3d, setFx3d] = useState<BattleFxEvent | null>(null);
  const fx3dKey = useRef(0);
  const fireFx = useCallback((e: Omit<BattleFxEvent, "key">) => {
    fx3dKey.current += 1;
    setFx3d({ ...e, key: fx3dKey.current });
  }, []);
  const [soundOn, setSoundOn] = useState(() => !(isMuted() || isMusicMuted()));
  const shake = useRef(0);
  // ── 命中手感：hit-stop 慢格＋受擊白閃＋擊退 ──
  const [hitStop, setHitStop] = useState(1);
  const [playerHitKey, setPlayerHitKey] = useState(0);
  const [enemyHitKey, setEnemyHitKey] = useState(0);
  const [playerFlashKey, setPlayerFlashKey] = useState(0);
  const [enemyFlashKey, setEnemyFlashKey] = useState(0);
  const hitStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const impactFeel = useCallback((side: Side, heavy: boolean) => {
    (side === "player" ? setPlayerHitKey : setEnemyHitKey)((k) => k + 1);
    (side === "player" ? setPlayerFlashKey : setEnemyFlashKey)((k) => k + 1);
    // hit-stop：命中一瞬全場慢格再回速，落手先有重量
    setHitStop(0.05);
    if (hitStopTimer.current) clearTimeout(hitStopTimer.current);
    hitStopTimer.current = setTimeout(() => setHitStop(1), heavy ? 120 : 80);
  }, []);
  const rewardGiven = useRef(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // ── 能量＋閃避狀態 ──
  const [energy, setEnergy] = useState(0);
  const energyRef = useRef(0);
  const enemyEnergyRef = useRef(0);
  const endedRef = useRef(false);
  const warnInfo = useRef<{
    ult: boolean;
    startedAt: number;
    result: "clean" | "partial" | "late" | null;
    maxDx: number;
  } | null>(null);
  const [dodge2d, setDodge2d] = useState(0); // 2D 降級側撲位移
  // 首次教學
  const [tutOpen, setTutOpen] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("hh-battle-tut")) setTutOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    playerHpRef.current = playerMax;
    enemyHpRef.current = enemyMax;
    setPlayerHp(playerMax);
    setEnemyHp(enemyMax);
  }, [playerMax, enemyMax]);

  // 開場橫額 2.2s 後入回合
  useEffect(() => {
    if (phase !== "intro" || !enemySpecies) return;
    const timer = setTimeout(() => {
      setPhase("player");
      setLog(t("yourTurn"));
    }, 2200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, enemySpecies]);

  const popup = useCallback((side: Side, text: string, color: string) => {
    fxKey.current += 1;
    setFx({ key: fxKey.current, side, text, color });
  }, []);

  const addEnergy = useCallback((delta: number) => {
    const prev = energyRef.current;
    const next = Math.max(0, Math.min(ENERGY_MAX, prev + delta));
    energyRef.current = next;
    setEnergy(next);
    if (delta > 0 && prev < ENERGY_MAX && next >= ENERGY_MAX) sfxEnergyFull();
  }, []);

  /** 完場（KO 演出 → 結算畫面） */
  const finish = useCallback(
    async (win: boolean) => {
      if (endedRef.current) return;
      endedRef.current = true;
      setWarn(null);
      warnInfo.current = null;
      const defSpecies = win ? enemySpecies! : playerSpecies!;
      const defPos = win ? ENEMY_POS : PLAYER_POS;
      (win ? setEnemyAnim : setPlayerAnim)("down");
      (win ? setPlayerAnim : setEnemyAnim)("victory");
      fireFx({ kind: "ko", element: defSpecies.element, from: defPos, to: defPos });
      sfxKo();
      setLog(t("fainted", { name: defSpecies.name[locale] }));
      await sleep(1500);
      setPhase(win ? "victory" : "defeat");
    },
    [enemySpecies, playerSpecies, fireFx, locale, t]
  );

  /** 我方攻擊結算（普攻 or 技能）：回傳係咪 KO 咗敵人 */
  const playerStrike = useCallback(
    async (skill: Skill | null) => {
      const ps = playerSpecies!;
      const es = enemySpecies!;

      // 治療技
      if (skill && skill.power === 0 && skill.healPercent) {
        setLog(t("skillUsed", { name: ps.name[locale], skill: skill.name[locale] }));
        setPlayerAnim("skill");
        fireFx({ kind: "heal", skillId: skill.id, element: ps.element, from: PLAYER_POS, to: PLAYER_POS });
        sfxCast(ps.element);
        await sleep(900);
        sfxHeal();
        const amount = Math.round(playerMax * skill.healPercent);
        playerHpRef.current = Math.min(playerMax, playerHpRef.current + amount);
        setPlayerHp(playerHpRef.current);
        popup("player", `+${amount}`, "#7bc47f");
        setLog(t("healed", { name: ps.name[locale], amount }));
        await sleep(700);
        setPlayerAnim("idle");
        return false;
      }

      const mult = getElementMultiplier(ps.element, es.element);
      const crit = Math.random() < 0.1;
      const tier = skill ? skillTier(skill) : 0;
      const power = skill ? skill.power : BASIC_POWER;

      if (skill) setLog(t("skillUsed", { name: ps.name[locale], skill: skill.name[locale] }));

      // 大招蓄力演出：腳下光環聚氣＋沖天光柱
      if (tier === 2) {
        setPlayerAnim("skill");
        fireFx({ kind: "charge", skillId: skill!.id, element: ps.element, from: PLAYER_POS, to: PLAYER_POS });
        sfxCharge();
        setLog(t("charging", { name: ps.name[locale] }));
        await sleep(850);
      }

      setPlayerAnim(skill ? "skill" : "attack");
      setPlayerLunge((k) => k + 1);
      fireFx({
        kind: "skill",
        skillId: skill?.id,
        element: ps.element,
        from: PLAYER_POS,
        to: ENEMY_POS,
        crit,
        mult,
        tier,
        seriesId: ps.seriesId,
      });
      sfxCast(ps.element);
      await sleep(impactMs(skill, ps.seriesId)); // 特效主體到達對手一刻先命中

      const raw =
        ps.baseStats.attack * pMul * power * mult * (crit ? 1.5 : 1) * (0.85 + Math.random() * 0.3) -
        es.baseStats.defense * eMul * (skill ? 0.35 : 0.2);
      const dmg = Math.max(1, Math.round(raw));
      enemyHpRef.current = Math.max(0, enemyHpRef.current - dmg);
      setEnemyHp(enemyHpRef.current);
      enemyEnergyRef.current = Math.min(ENERGY_MAX, enemyEnergyRef.current + ENEMY_ENERGY_PER_HIT);

      shake.current = tier === 2 ? 0.24 : crit ? 0.16 : 0.09;
      if (tier === 2) sfxUltHit(crit);
      else if (crit) sfxCrit();
      else sfxHit();
      setFlashColor(ELEMENT_FX_COLORS[ps.element][0]);
      setFlash((f) => f + 1);
      setEnemyAnim("hit");
      impactFeel("enemy", tier === 2 || crit);
      popup("enemy", `-${dmg}`, crit ? "#ffd94d" : mult > 1 ? "#ff8c5a" : "#ffffff");
      if (crit) setLog(t("critical"));
      else if (mult > 1) setLog(t("effective"));
      else if (mult < 1) setLog(t("notEffective"));

      await sleep(700);
      setPlayerAnim("idle");
      if (enemyHpRef.current <= 0) return true;
      setEnemyAnim("idle");
      return false;
    },
    [playerSpecies, enemySpecies, playerMax, pMul, eMul, fireFx, impactFeel, locale, popup, t]
  );

  /** 敵方回合：預警（可掃屏閃避）→ 出招 → 結算；回傳係咪 KO 咗玩家 */
  const enemyTurn = useCallback(async () => {
    const es = enemySpecies!;
    const ps = playerSpecies!;

    enemyEnergyRef.current = Math.min(ENERGY_MAX, enemyEnergyRef.current + ENEMY_ENERGY_PER_TURN);
    const isUlt = enemyEnergyRef.current >= ENERGY_MAX;
    const ultSkill = isUlt
      ? ([...es.skills].filter((s) => s.power > 0).sort((a, b) => b.power - a.power)[0] ?? null)
      : null;

    // ── 預警窗口：呢段時間掃屏 = 閃避（記低出現時刻做分級判定）──
    warnInfo.current = { ult: isUlt, startedAt: performance.now(), result: null, maxDx: 0 };
    setWarn(isUlt ? "ult" : "normal");
    sfxWarn(isUlt);
    setLog(t(isUlt ? "warnUlt" : "warnIncoming"));
    if (isUlt)
      fireFx({ kind: "charge", skillId: ultSkill?.id, element: es.element, from: ENEMY_POS, to: ENEMY_POS });
    await sleep(isUlt ? WARN_ULT_MS : WARN_NORMAL_MS);

    setWarn(null);
    const wi = warnInfo.current;
    warnInfo.current = null;
    // 分級判定：clean(≤0.5s 完整掃屏)＝全避；partial(0.5–1s 或掃屏距離唔夠)＝50% 照中；
    // late(>1s) / 冇掃＝必中。判定時間戳靠 ref 記錄，避免閉包陷阱。
    let dodged: boolean;
    if (wi?.result === "clean") dodged = true;
    else if (wi?.result === "partial" || (wi != null && !wi.result && wi.maxDx >= DODGE_ATTEMPT_PX))
      dodged = Math.random() < 0.5;
    else dodged = false;

    // ── 出招 ──
    const mult = getElementMultiplier(es.element, ps.element);
    setEnemyAnim(isUlt ? "skill" : "attack");
    setEnemyLunge((k) => k + 1);
    fireFx({
      kind: "skill",
      skillId: ultSkill?.id,
      element: es.element,
      from: ENEMY_POS,
      to: PLAYER_POS,
      mult,
      tier: ultSkill ? skillTier(ultSkill) : 0,
      seriesId: es.seriesId,
    });
    sfxCast(es.element);
    await sleep(impactMs(ultSkill, es.seriesId));

    const power = isUlt ? (ultSkill?.power ?? 1.6) : ENEMY_BASIC_POWER;
    const raw =
      es.baseStats.attack * eMul * power * mult * (0.85 + Math.random() * 0.3) -
      ps.baseStats.defense * pMul * (isUlt ? 0.3 : 0.15);
    let dmg = Math.max(1, Math.round(raw));

    if (dodged && !isUlt) {
      // 普攻成功閃避：全避
      popup("player", t("miss"), "#a8e6ff");
      setLog(t("dodged"));
    } else {
      if (dodged) {
        dmg = Math.max(1, Math.round(dmg * 0.25));
        setLog(t("dodged"));
      }
      playerHpRef.current = Math.max(0, playerHpRef.current - dmg);
      setPlayerHp(playerHpRef.current);
      shake.current = isUlt ? 0.22 : 0.1;
      if (isUlt) sfxUltHit(false);
      else sfxHit();
      setFlashColor(ELEMENT_FX_COLORS[es.element][0]);
      setFlash((f) => f + 1);
      setPlayerAnim("hit");
      impactFeel("player", isUlt);
      popup("player", `-${dmg}`, dodged ? "#a8e6ff" : mult > 1 ? "#ff8c5a" : "#ffffff");
    }

    if (isUlt) enemyEnergyRef.current = 0;

    await sleep(700);
    setEnemyAnim("idle");
    if (playerHpRef.current <= 0) return true;
    setPlayerAnim("idle");
    return false;
  }, [enemySpecies, playerSpecies, pMul, eMul, fireFx, impactFeel, popup, t]);

  /** 我方行動（普攻 / 技能）→ 敵方回合 → 返到我方 */
  const doAction = useCallback(
    async (skill: Skill | null) => {
      if (phaseRef.current !== "player" || endedRef.current || tutOpen) return;
      if (skill) {
        const cost = skillCost(skill);
        if (energyRef.current < cost) return;
        addEnergy(-cost);
      } else {
        addEnergy(BASIC_ENERGY);
      }
      setPhase("acting");

      const koEnemy = await playerStrike(skill);
      if (koEnemy) {
        await finish(true);
        return;
      }

      setPhase("enemy");
      const koPlayer = await enemyTurn();
      if (koPlayer) {
        await finish(false);
        return;
      }

      setPhase("player");
      setLog(t("yourTurn"));
    },
    [tutOpen, addEnergy, playerStrike, enemyTurn, finish, t]
  );

  // ── 閃避掃屏手勢層（只喺敵方預警窗口 mount）──
  const pointer = useRef<{ id: number; x: number; dodged: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    pointer.current = { id: e.pointerId, x: e.clientX, dodged: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointer.current;
    const wi = warnInfo.current;
    if (!p || p.id !== e.pointerId || !wi || wi.result) return;
    const dx = e.clientX - p.x;
    const adx = Math.abs(dx);
    if (adx > wi.maxDx) wi.maxDx = adx; // 記低最遠掃屏距離（判「距離唔夠」用）
    if (adx > DODGE_SWIPE_PX) {
      // 完整掃屏一刻：由預警出現計時分級
      const elapsed = performance.now() - wi.startedAt;
      wi.result = elapsed <= DODGE_CLEAN_MS ? "clean" : elapsed <= DODGE_PARTIAL_MS ? "partial" : "late";
      setDodgeDir(Math.sign(dx));
      setDodgeKey((k) => k + 1);
      setDodge2d(Math.sign(dx));
      window.setTimeout(() => setDodge2d(0), 320);
      sfxDodge();
    }
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    if (pointer.current?.id === e.pointerId) pointer.current = null;
  };

  // 勝利獎勵（一次性）＋戰績記錄＋精靈經驗＋進化材料掉落（打通進化閉環）
  const [spiritReward, setSpiritReward] = useState<{ exp: number; newLevel: number | null }>({
    exp: 0,
    newLevel: null,
  });
  const [lootDrops, setLootDrops] = useState<{ itemId: string; qty: number }[]>([]);
  useEffect(() => {
    if (phase !== "victory" || rewardGiven.current) return;
    rewardGiven.current = true;
    useGameStore.setState((s) => ({ coins: s.coins + 100 }));
    store.addExp(60);
    if (playerSpecies && enemySpecies) {
      const hadAdvantage = getElementMultiplier(playerSpecies.element, enemySpecies.element) > 1;
      store.recordBattleWin(hadAdvantage);
      track("battle_win", {
        enemySpeciesId: enemySpecies.id,
        playerSpeciesId: playerSpecies.id,
        hadAdvantage,
      });
      // 掉落敵方系列嘅進化材料：打邊系爆邊系嘅料，克制優勢雙倍
      setLootDrops(store.battleLoot(enemySpecies.id, hadAdvantage));
      // TODO 埋點：battle_start（intro 開場）／battle_lose（defeat）——留返之後補
    }
    // 精靈經驗：基礎 50＋敵方階級 ×25（打高階野生更划算）
    if (playerSpirit && enemySpecies) {
      const gained = 50 + enemySpecies.stage * 25;
      const up = store.gainSpiritExp(playerSpirit.uid, gained);
      setSpiritReward({ exp: gained, newLevel: up?.newLevel ?? null });
      if (up) sfxEnergyFull(); // 升級喇叭
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 勝負音效
  useEffect(() => {
    if (phase === "victory") sfxVictory();
    else if (phase === "defeat") sfxDefeat();
  }, [phase]);

  // ── 冇精靈：引導去捕捉（等 client hydrate 完先判斷，避免 SSR 閃屏）──
  if (!hydrated) return null;

  // ── 出戰選擇器：多過一隻精靈就俾玩家自己揀（練低等仔必需）──
  if (needPicker && !chosenUid) {
    const sorted = [...ownedSpirits].sort((a, b) => {
      // 上次出戰嗰隻排最前，其餘按階級／等級降序
      if (a.uid === lastBattleUid) return -1;
      if (b.uid === lastBattleUid) return 1;
      return (
        (SPECIES_MAP[b.speciesId]?.stage ?? 0) - (SPECIES_MAP[a.speciesId]?.stage ?? 0) ||
        b.level - a.level
      );
    });
    return (
      <main className="paper-texture flex min-h-dvh flex-col overflow-hidden pb-[calc(70px_+_env(safe-area-inset-bottom))] px-5 pb-8" style={{ paddingTop: "calc(env(safe-area-inset-top) + 20px)" }}>
        <h1 className="text-center text-2xl font-black text-ink">{t("pickSpirit")}</h1>
        <p className="mt-1 text-center text-sm font-bold text-ink-soft">{t("pickSpiritHint")}</p>
        <div className="mt-5 grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto">
          {sorted.map((sp) => {
            const species = SPECIES_MAP[sp.speciesId];
            if (!species) return null;
            return (
              <button
                key={sp.uid}
                onClick={() => {
                  sfxTap();
                  store.setLastBattleUid(sp.uid);
                  setChosenUid(sp.uid);
                }}
                className="card-parchment relative flex flex-col items-center gap-1.5 px-3 pb-3 pt-4"
              >
                {sp.uid === lastBattleUid && (
                  <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[10px] font-black text-ink">
                    {t("lastUsed")}
                  </span>
                )}
                {sp.shiny && (
                  <span className="absolute right-2 top-2 text-base" aria-label="shiny">✦</span>
                )}
                <img
                  src={`/spirits/full/${sp.speciesId}.webp`}
                  alt=""
                  className="h-24 w-auto object-contain"
                  draggable={false}
                />
                <span className="truncate text-sm font-black text-ink">{species.name[locale]}</span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-ink-soft">
                  Lv.{sp.level}
                  <UIIcon name={ELEMENT_INFO[species.element as keyof typeof ELEMENT_INFO].icon} size={14} />
                  <span className="text-ink-soft/70">{"★".repeat(species.stage)}</span>
                </span>
              </button>
            );
          })}
        </div>
        <button
          onClick={() => router.back()}
          className="mt-4 self-center rounded-full border-2 border-ink/30 px-8 py-2.5 text-sm font-black text-ink-soft"
        >
          {t("retreat")}
        </button>
      </main>
    );
  }

  if (!playerSpirit || !playerSpecies) {
    return (
      <main className="paper-texture flex min-h-dvh flex-col overflow-hidden pb-[calc(70px_+_env(safe-area-inset-bottom))] items-center justify-center gap-5 px-8 text-center">
        <UIIcon name="chopsticks" size={72} />
        <p className="text-base font-bold text-ink">{t("noSpirit")}</p>
        <button onClick={() => router.push("/capture")} className="btn-gold px-10 py-3.5 text-lg font-black">
          {t("goCapture")}
        </button>
      </main>
    );
  }
  if (!enemySpecies || !enemyId || !bg) return null;

  const ended = phase === "victory" || phase === "defeat";
  const myTurn = phase === "player" && !tutOpen;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#1a0f06]">
      {/* 場景背景圖（小販中心主題） */}
      <img
        src={bg.image}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      {/* 暗化遮罩＋上下 vignette：保精靈立體感同 UI 對比度 */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `linear-gradient(180deg, rgba(10,6,2,${bg.overlayOpacity + 0.25}) 0%, rgba(10,6,2,${bg.overlayOpacity}) 30%, rgba(10,6,2,${bg.overlayOpacity * 0.5}) 55%, rgba(10,6,2,${bg.overlayOpacity + 0.3}) 100%)`,
        }}
      />
      {/* 場景光暈層 */}
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: bg.glowCss }} />

      {/* 3D 戰鬥舞台 */}
      {webglOk ? (
        <Canvas
          // 底部留位畀操作區，避免能量條／普攻掣横切精靈（誤以為面型扭曲）
          className="absolute inset-x-0 top-0 bottom-[168px]"
          style={{ position: "absolute", inset: 0 }}
          camera={{ fov: 58, position: [-0.46, 0.45, 1.38] }}
          gl={{ alpha: true, antialias: true }}
        >
          <ambientLight intensity={bg.ambientIntensity} color={bg.ambientColor} />
          <directionalLight position={[3, 5, 2]} intensity={bg.directionalIntensity} color={bg.directionalColor} />
          <pointLight position={[-2, 2.5, -1]} intensity={bg.pointIntensity} color={bg.pointColor} />
          <CameraRig shake={shake} debug={params.get("debugcam") === "1"} />
          {params.get("debug") === "1" && (
            <>
              <gridHelper args={[4, 16, "#c9a227", "#6b4a2a"]} />
              <axesHelper args={[0.8]} />
            </>
          )}
          <Arena bg={bg} />
          <BattleAmbience layers={bg.ambience} />
          <Suspense fallback={null}>
            <BattleActor
              speciesId={playerSpirit.speciesId}
              basePos={PLAYER_POS}
              targetPos={ENEMY_POS}
              anim={playerAnim}
              shiny={Boolean(playerSpirit.shiny)}
              lungeKey={playerLunge}
              dodgeKey={dodgeKey}
              dodgeDir={dodgeDir}
              hitKey={playerHitKey}
              flashKey={playerFlashKey}
              timeScale={hitStop}
              onClipEnd={() => {
                if (!endedRef.current && playerAnim !== "idle") setPlayerAnim("idle");
              }}
            />
            <BattleActor
              speciesId={enemyId}
              basePos={ENEMY_POS}
              targetPos={PLAYER_POS}
              anim={enemyAnim}
              lungeKey={enemyLunge}
              warn={warn}
              hitKey={enemyHitKey}
              flashKey={enemyFlashKey}
              timeScale={hitStop}
              onClipEnd={() => {
                if (!endedRef.current && enemyAnim !== "idle") setEnemyAnim("idle");
              }}
            />
          </Suspense>
          <BattleFx event={fx3d} tint={bg.fxTint} />
        </Canvas>
      ) : (
        // 2D 降級：兩隻立繪對峙（同一套回合邏輯，CSS 動畫演出）
        <div className="absolute inset-0">
          <img
            src={`/spirits/full/${enemyId}.webp`}
            alt=""
            className={`absolute right-8 top-[26%] h-36 w-auto transition-all ${enemyAnim === "hit" ? "animate-ping" : "float-bob"}`}
            style={
              warn
                ? { filter: `drop-shadow(0 0 14px ${warn === "ult" ? "#ff4030" : "#ffd94d"})` }
                : undefined
            }
            draggable={false}
          />
          <img
            src={`/spirits/full/${playerSpirit.speciesId}.webp`}
            alt=""
            className={`absolute bottom-[34%] left-8 h-44 w-auto -scale-x-100 transition-transform duration-200 ${playerAnim === "hit" ? "animate-ping" : "float-bob"}`}
            style={{
              transform: dodge2d ? `translateX(${dodge2d * 46}px) scaleX(-1)` : undefined,
            }}
            draggable={false}
          />
        </div>
      )}

      {/* 閃避手勢層：只喺敵方預警窗口開放（掃屏＝側撲） */}
      {warn && (
        <div
          className="absolute inset-0 z-10"
          style={{ touchAction: "none" }}
          data-dodge-layer
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        />
      )}

      {/* 敵方出招預警：屏幕邊緣脈動光（黃＝普攻、紅＝大招） */}
      {warn && (
        <div
          className="pointer-events-none absolute inset-0 z-10 animate-pulse"
          style={{
            boxShadow: `inset 0 0 90px 26px ${warn === "ult" ? "rgba(255,64,48,0.5)" : "rgba(255,217,77,0.38)"}`,
          }}
        />
      )}

      {/* 受擊閃光（攻擊元素色） */}
      {flash > 0 && (
        <div
          key={`flash-${flash}`}
          className="hit-flash pointer-events-none absolute inset-0 z-10"
          style={{ backgroundColor: `${flashColor}8c` }}
        />
      )}

      {/* 傷害/治療數字彈出（z 高過血條，唔會俾遮住） */}
      {fx && (
        <div
          key={`fx-${fx.key}`}
          className="dmg-pop pointer-events-none absolute z-[26] text-4xl font-black"
          style={{
            color: fx.color,
            textShadow: "0 2px 10px rgba(0,0,0,.7)",
            ...(fx.side === "enemy" ? { right: "18%", top: "30%" } : { left: "18%", bottom: "40%" }),
          }}
        >
          {fx.text}
        </div>
      )}

      {/* 頂部：敵方 HP */}
      <div className="pointer-events-none absolute inset-x-4 top-4 z-20" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <HpCard
          name={enemySpecies.name[locale]}
          level={eLevel}
          hp={enemyHp}
          maxHp={enemyMax}
          element={enemySpecies.element}
          align="right"
        />
      </div>

      {/* 我方 HP（操作區上方） */}
      <div className="pointer-events-none absolute inset-x-4 bottom-[210px] z-20">
        <HpCard
          name={playerSpecies.name[locale]}
          level={playerSpirit.level}
          hp={playerHp}
          maxHp={playerMax}
          element={playerSpecies.element}
          align="left"
        />
      </div>

      {/* 戰鬥訊息列（固定位置＋預留高度，唔隨內容跳位） */}
      <div className="pointer-events-none absolute inset-x-0 top-[92px] z-[22] flex min-h-[34px] items-center justify-center px-6">
        {log && (
          <span className="max-w-full rounded-full bg-black/60 px-4 py-1.5 text-center text-sm font-bold text-white shadow">
            {log}
          </span>
        )}
      </div>

      {/* 開場橫額 */}
      {phase === "intro" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/45">
          <div className="battle-banner card-parchment px-8 py-5 text-center">
            <UIIcon name="fire" size={44} />
            <p className="mt-1 text-xl font-black text-ink">
              {t("wildAppeared", { name: enemySpecies.name[locale] })}
            </p>
          </div>
        </div>
      )}

      {/* 首次教學 */}
      {tutOpen && phase !== "intro" && !ended && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-8">
          <div className="card-parchment flex w-full max-w-sm flex-col gap-3.5 px-6 py-6">
            <p className="text-center text-lg font-black text-ink">{t("tutTitle")}</p>
            <div className="flex items-center gap-3 text-sm font-bold text-ink">
              <UIIcon name="fire" size={26} />
              <span>{t("tutTap")}</span>
            </div>
            <div className="flex items-center gap-3 text-sm font-bold text-ink">
              <UIIcon name="star" size={26} />
              <span>{t("tutSkill")}</span>
            </div>
            <div className="flex items-center gap-3 text-sm font-bold text-ink">
              <UIIcon name="sparkles" size={26} />
              <span>{t("tutDodge")}</span>
            </div>
            <button
              onClick={() => {
                try {
                  localStorage.setItem("hh-battle-tut", "1");
                } catch {
                  /* ignore */
                }
                setTutOpen(false);
              }}
              className="btn-gold mt-1 px-8 py-3 text-base font-black"
            >
              {t("tutGo")}
            </button>
          </div>
        </div>
      )}

      {/* 底部操作區：能量條＋普攻掣＋技能掣 */}
      {!ended && phase !== "intro" && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 px-4 pb-5"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        >
          {/* 能量條 */}
          <div className="flex items-center gap-2" data-energy={energy}>
            <div className="relative h-3.5 flex-1 overflow-hidden rounded-full border border-ink/50 bg-black/45">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${energy >= ENERGY_MAX ? "animate-pulse" : ""}`}
                style={{
                  width: `${energy}%`,
                  background: "linear-gradient(90deg,#c9a227,#ffd94d,#fff2b0)",
                  boxShadow: energy >= ENERGY_MAX ? "0 0 12px rgba(255,217,77,.9)" : "none",
                }}
              />
            </div>
            <span
              className="text-[11px] font-black"
              style={{
                color: energy >= ENERGY_MAX ? "#ffd94d" : "rgba(255,255,255,.75)",
                textShadow: "0 1px 4px rgba(0,0,0,.8)",
              }}
            >
              {energy >= ENERGY_MAX ? t("energyFull") : `${energy}/${ENERGY_MAX}`}
            </span>
          </div>

          {/* 普攻掣：闊身大掣，永遠可用 */}
          <button
            onClick={() => {
              sfxTap();
              doAction(null);
            }}
            disabled={!myTurn}
            data-basic-attack
            className={`card-parchment flex min-h-[52px] flex-col justify-center px-4 py-2.5 text-left transition ${!myTurn ? "opacity-50" : "active:scale-95"}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-ink">{t("basicAttack")}</span>
              <span className="flex items-center gap-1.5">
                <span className="rounded-full bg-gold-light/30 px-2 py-0.5 text-[10px] font-black text-ink">
                  {t("gainEnergy", { amount: BASIC_ENERGY })}
                </span>
                <UIIcon name="chopsticks" size={16} />
              </span>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            {playerSpecies.skills.map((skill) => {
              const cost = skillCost(skill);
              const affordable = energy >= cost;
              const disabled = !myTurn || !affordable;
              const isUltSkill = skill.power >= 1.8;
              return (
                <button
                  key={skill.id}
                  onClick={() => {
                    sfxTap();
                    doAction(skill);
                  }}
                  disabled={disabled}
                  className={`card-parchment flex min-h-[62px] flex-col justify-center px-3 py-2.5 text-left transition ${
                    disabled ? "opacity-50" : "active:scale-95"
                  } ${myTurn && affordable && isUltSkill ? "animate-pulse" : ""}`}
                  style={
                    myTurn && affordable ? { boxShadow: "0 0 14px rgba(232,200,96,.75)" } : undefined
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-ink">
                      {skill.name[locale]}
                      {isUltSkill && (
                        <span className="ml-1.5 rounded bg-gradient-to-r from-amber-500 to-red-500 px-1.5 py-0.5 align-middle text-[9px] font-black text-white shadow-sm">
                          {t("ultimate")}
                        </span>
                      )}
                    </span>
                    <UIIcon name={skill.power > 0 ? "fire" : "sparkles"} size={16} />
                  </div>
                  <div className="mt-0.5 text-[10px] font-bold text-ink-soft">
                    {t("energyCost", { cost })}
                    {skill.power > 0 ? ` ・ ×${skill.power}` : ` ・ ${skill.description[locale]}`}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 結算 */}
      {ended && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/60 px-8">
          <h1
            className={`game-title text-4xl ${phase === "victory" ? "text-gold-light" : "text-white/85"}`}
          >
            {phase === "victory" ? t("victory") : t("defeat")}
          </h1>
          {phase === "victory" && (
            <div className="flex flex-col items-center gap-2.5">
              <div className="card-parchment flex items-center gap-5 px-6 py-3.5">
                <span className="flex items-center gap-1.5 text-base font-black text-ink">
                  <UIIcon name="coin" size={22} /> +100
                </span>
                <span className="flex items-center gap-1.5 text-base font-black text-ink">
                  <UIIcon name="star" size={22} /> +60 {t("expGained")}
                </span>
              </div>
              {spiritReward.exp > 0 && (
                <div className="card-parchment flex items-center gap-3 px-5 py-2.5">
                  <span className="text-sm font-black text-ink">
                    {playerSpecies.name[locale]} +{spiritReward.exp} {t("spiritExp")}
                  </span>
                  {spiritReward.newLevel !== null && (
                    <span className="reward-pop rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 px-2.5 py-1 text-xs font-black text-ink shadow">
                      {spiritReward.newLevel >= SPIRIT_LEVEL_CAP
                        ? t("levelMax")
                        : t("levelUp", { level: spiritReward.newLevel })}
                    </span>
                  )}
                </div>
              )}
              {lootDrops.length > 0 && (
                <div className="card-parchment reward-pop flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-5 py-2.5">
                  <span className="text-xs font-black text-ink-soft">{t("lootItems")}</span>
                  {lootDrops.map((d) => (
                    <span key={d.itemId} className="flex items-center gap-1.5 text-sm font-black text-ink">
                      <UIIcon name={ITEM_MAP[d.itemId]?.icon ?? "star"} size={20} />
                      {ITEM_MAP[d.itemId]?.name[locale]} ×{d.qty}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="btn-outline px-7 py-3 text-sm font-bold"
            >
              {t("battleAgain")}
            </button>
            <button onClick={() => router.push("/map")} className="btn-gold px-8 py-3 text-base font-black">
              {t("backToMap")}
            </button>
          </div>
        </div>
      )}

      {/* 退出 */}
      {!ended && (
        <button
          onClick={() => router.push("/map")}
          className="absolute left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"
          aria-label={t("backToMap")}
          style={{ marginTop: "env(safe-area-inset-top)" }}
        >
          ←
        </button>
      )}

      {/* 音效開關 */}
      {!ended && (
        <button
          onClick={() => {
            const next = !soundOn;
            setMuted(!next);
            setMusicMuted(!next);
            setSoundOn(next);
            if (next) sfxTap();
          }}
          className="absolute left-4 top-[68px] z-40 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white"
          aria-label="sound"
          data-no-press-sfx
          style={{ marginTop: "env(safe-area-inset-top)" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H2v6h4l5 4V5z" fill="currentColor" stroke="none" />
            {soundOn ? (
              <>
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path d="M18.5 5.5a9.5 9.5 0 0 1 0 13" />
              </>
            ) : (
              <>
                <line x1="16" y1="9" x2="22" y2="15" />
                <line x1="22" y1="9" x2="16" y2="15" />
              </>
            )}
          </svg>
        </button>
      )}
    </main>
  );
}

export default function BattlePage() {
  return (
    <Suspense>
      <BattleInner />
    </Suspense>
  );
}
