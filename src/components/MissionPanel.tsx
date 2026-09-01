"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useGameStore } from "@/lib/store";
import { SPECIES } from "@/content/species";
import { ITEM_MAP } from "@/content/items";
import { getActiveMissions } from "@/lib/admin/actions";
import type { GameMission } from "@/lib/admin/types";

export type MissionType = "daily" | "special";
export type MissionGoal = "capture" | "checkin" | "catch-specific" | "capture_unique" | "battle_win" | "evolve";

export interface Mission {
  id: string;
  type: MissionType;
  goal: MissionGoal;
  description: string;
  target: number;
  progress: number;
  reward: { coins: number; diamonds: number; items?: Record<string, number> };
  done: boolean;
  claimed: boolean;
}

const DAILY_MISSION_POOL: { goal: MissionGoal; descZh: (n: number) => string; descEn: (n: number) => string; target: number; reward: { coins: number; diamonds: number } }[] = [
  { goal: "capture", descZh: (n) => `捕捉 ${n} 隻精靈`, descEn: (n) => `Catch ${n} spirits`, target: 3, reward: { coins: 100, diamonds: 1 } },
  { goal: "capture", descZh: (n) => `捕捉 ${n} 隻精靈`, descEn: (n) => `Catch ${n} spirits`, target: 5, reward: { coins: 200, diamonds: 2 } },
  { goal: "capture", descZh: (n) => `捕捉 ${n} 隻不同精靈`, descEn: (n) => `Catch ${n} different spirits`, target: 2, reward: { coins: 150, diamonds: 1 } },
  { goal: "checkin", descZh: (n) => `到 ${n} 個據點打卡`, descEn: (n) => `Check in at ${n} locations`, target: 1, reward: { coins: 80, diamonds: 1 } },
  { goal: "checkin", descZh: (n) => `到 ${n} 個據點打卡`, descEn: (n) => `Check in at ${n} locations`, target: 2, reward: { coins: 150, diamonds: 2 } },
  { goal: "catch-specific", descZh: (n) => `捕捉指定精靈 ${n} 隻`, descEn: (n) => `Catch a specific spirit ${n} times`, target: 1, reward: { coins: 120, diamonds: 1 } },
];

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function generateDailyMissions(locale: "zh" | "en"): Mission[] {
  const pool = [...DAILY_MISSION_POOL];
  const shuffled = pool.sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 3);
  return picked.map((p, i) => ({
    id: `daily-${getTodayKey()}-${i}`,
    type: "daily" as MissionType,
    goal: p.goal,
    description: locale === "en" ? p.descEn(p.target) : p.descZh(p.target),
    target: p.target,
    progress: 0,
    reward: p.reward,
    done: false,
    claimed: false,
  }));
}

// ── DB 任務（後台「任務管理」）：每日基準值進度 + 領取標記 ──

function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLS(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** 每日任務基準：當日首見時記低現值，進度 = 現值 − 基準（真正每日重置） */
function dailyBaseline(key: string, current: number): number {
  const k = `hh-mbase-${key}`;
  const raw = readLS(k);
  const n = raw === null ? Number.NaN : Number(raw);
  if (!Number.isFinite(n)) {
    writeLS(k, String(current));
    return current;
  }
  return n;
}

/** 一次性任務基準：任務首見時記低（唔帶日期） */
function onceBaseline(missionId: string, current: number): number {
  return dailyBaseline(`once-${missionId}`, current);
}

function claimedKey(m: { id: string; period: "daily" | "once" }): string {
  return m.period === "daily" ? `hh-mclaim-${getTodayKey()}-${m.id}` : `hh-mclaim-once-${m.id}`;
}

// 每日抽選數：後台 active 每日任務池中隨機抽幾多個出嚟做「今日任務」
const DAILY_PICK_COUNT = 3;

/**
 * 後台每日任務池 → 每日隨機抽 3 個（當日鎖定：同一天內容固定，跨日重抽）。
 * 抽選結果存 localStorage（hh-mdaily-pick-{todayKey}），每部機各自隨機；
 * 舊抽選中已過期/停用的任務自動剔除並補抽，池不足 3 個則全顯示。
 */
function pickDailyMissions(pool: GameMission[], todayKey: string): string[] {
  if (typeof window === "undefined") return pool.map((m) => m.id); // SSR 不抽，等 client
  const key = `hh-mdaily-pick-${todayKey}`;
  let picked: string[] = [];
  try {
    const raw = readLS(key);
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr)) picked = arr.filter((x) => typeof x === "string");
  } catch {
    /* ignore */
  }
  const activeIds = new Set(pool.map((m) => m.id));
  picked = picked.filter((id) => activeIds.has(id)); // 剔除已落架嘅舊抽選
  const remaining = pool.filter((m) => !picked.includes(m.id));
  const need = Math.max(0, Math.min(DAILY_PICK_COUNT, pool.length) - picked.length);
  if (need > 0) {
    const shuffled = [...remaining].sort(() => Math.random() - 0.5);
    picked = [...picked, ...shuffled.slice(0, need).map((m) => m.id)];
    writeLS(key, JSON.stringify(picked));
  }
  return picked;
}

function goalDescription(m: GameMission, locale: "zh" | "en"): string {
  const n = m.target;
  if (locale === "en") {
    switch (m.goal) {
      case "capture": return `Catch ${n} spirits`;
      case "capture_unique": return `Catch ${n} different spirits`;
      case "checkin": return `Check in at ${n} locations`;
      case "battle_win": return `Win ${n} battles`;
      case "evolve": return `Evolve ${n} spirits`;
      default: return m.title.en || m.title.zh;
    }
  }
  switch (m.goal) {
    case "capture": return `捕捉 ${n} 隻精靈`;
    case "capture_unique": return `捕捉 ${n} 種不同精靈`;
    case "checkin": return `到 ${n} 個據點打卡`;
    case "battle_win": return `切磋獲勝 ${n} 場`;
    case "evolve": return `精靈進化 ${n} 次`;
    default: return m.title.zh;
  }
}

export function useMissions() {
  const store = useGameStore();
  const locale = useLocale() as "zh" | "en";
  const t = useTranslations("mission");
  const [dbMissions, setDbMissions] = useState<GameMission[] | null>(null);
  const [legacyMissions, setLegacyMissions] = useState<Mission[]>([]);
  /** bump 令領取後重新計算 claimed */
  const [claimTick, setClaimTick] = useState(0);

  const todayKey = getTodayKey();

  // 拉 DB 任務（未配置 Supabase / 全空 → fallback 硬編碼池）
  useEffect(() => {
    let cancelled = false;
    getActiveMissions().then(
      (ms) => {
        // battle_win（切磋）任務已隱藏：切磋入口未開放，唔顯示亦唔抽選
        if (!cancelled) setDbMissions(ms.filter((m) => m.goal !== "battle_win"));
      },
      () => {
        if (!cancelled) setDbMissions([]);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // legacy 每日任務（原有 localStorage 邏輯，DB 無任務時先用）
  useEffect(() => {
    if (dbMissions === null || dbMissions.length > 0) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const saved = typeof window !== "undefined" ? localStorage.getItem(`hh-missions-${todayKey}`) : null;
      if (saved) {
        try {
          setLegacyMissions(JSON.parse(saved));
        } catch {
          setLegacyMissions(generateDailyMissions(locale));
        }
      } else {
        const fresh = generateDailyMissions(locale);
        setLegacyMissions(fresh);
        if (typeof window !== "undefined") {
          localStorage.setItem(`hh-missions-${todayKey}`, JSON.stringify(fresh));
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dbMissions, todayKey, locale]);

  // store 現值（DB 任務各 goal 用）
  const totals = useMemo(
    () => ({
      capture: Object.values(store.captureCounts || {}).reduce((a: number, b: number) => a + b, 0),
      capture_unique: Object.keys(store.captureCounts || {}).length,
      checkin: store.checkins?.length || 0,
      battle_win: store.battleWins || 0,
      evolve: store.evolveCount || 0,
    }),
    [store.captureCounts, store.checkins, store.battleWins, store.evolveCount]
  );

  // DB 任務 → Mission（每日基準值進度；一次性 = 首見基準）
  const dbAsMissions = useMemo<Mission[]>(() => {
    if (!dbMissions) return [];
    return dbMissions.map((m) => {
      const current = totals[m.goal] ?? 0;
      const base = m.period === "daily" ? dailyBaseline(`${todayKey}-${m.id}`, current) : onceBaseline(m.id, current);
      const progress = Math.max(0, Math.min(m.target, current - base));
      const claimed = readLS(claimedKey(m)) === "1";
      return {
        id: m.id,
        type: m.period === "daily" ? "daily" : "special",
        goal: m.goal,
        description: goalDescription(m, locale),
        target: m.target,
        progress,
        reward: {
          coins: m.reward?.coins ?? 0,
          diamonds: m.reward?.gems ?? 0,
          items: m.reward?.items,
        },
        done: progress >= m.target,
        claimed,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbMissions, totals, todayKey, claimTick, locale]);

  // legacy 進度（原有行為：總量）
  const updatedLegacy = useMemo(() => {
    if (dbMissions === null || dbMissions.length > 0) return [];
    const captureCount = Object.values(store.captureCounts || {}).reduce((a: number, b: number) => a + b, 0);
    const uniqueCaptured = Object.keys(store.captureCounts || {}).length;
    const checkinCount = store.checkins?.length || 0;

    return legacyMissions.map((m) => {
      let progress = m.progress;
      if (m.goal === "capture") {
        progress = Math.min(m.target, captureCount);
      } else if (m.goal === "checkin") {
        progress = Math.min(m.target, checkinCount);
      } else if (m.goal === "catch-specific") {
        progress = Math.min(m.target, captureCount > 0 ? 1 : 0);
      }
      return { ...m, progress, done: progress >= m.target };
    });
  }, [legacyMissions, dbMissions, store.captureCounts, store.checkins]);

  useEffect(() => {
    if (updatedLegacy.length > 0 && typeof window !== "undefined") {
      localStorage.setItem(`hh-missions-${todayKey}`, JSON.stringify(updatedLegacy));
    }
  }, [updatedLegacy, todayKey]);

  const claimMission = useCallback((id: string) => {
    // DB 任務
    const dbm = (dbMissions ?? []).find((m) => m.id === id);
    if (dbm) {
      writeLS(claimedKey(dbm), "1");
      useGameStore.getState().applyGift({
        coins: dbm.reward?.coins,
        gems: dbm.reward?.gems,
        items: dbm.reward?.items,
      });
      setClaimTick((t) => t + 1);
      return;
    }
    // legacy 任務
    setLegacyMissions((prev) => {
      const updated = prev.map((m) => {
        if (m.id === id && m.done && !m.claimed) {
          useGameStore.setState((s) => ({
            coins: s.coins + m.reward.coins,
            gems: s.gems + m.reward.diamonds,
          }));
          return { ...m, claimed: true };
        }
        return m;
      });
      if (typeof window !== "undefined") {
        localStorage.setItem(`hh-missions-${todayKey}`, JSON.stringify(updated));
      }
      return updated;
    });
  }, [dbMissions, todayKey]);

  const usingDb = (dbMissions?.length ?? 0) > 0;
  // 後台每日任務池隨機抽 3（當日固定；池 ≤3 全顯示）。一次性任務不受影響。
  const dailyPick = useMemo(() => {
    if (!usingDb) return new Set<string>();
    return new Set(pickDailyMissions(dbMissions!.filter((m) => m.period === "daily"), todayKey));
  }, [dbMissions, todayKey, usingDb]);
  return {
    dailyMissions: usingDb
      ? dbAsMissions.filter((m) => m.type === "daily" && dailyPick.has(m.id))
      : updatedLegacy,
    specialMissions: usingDb ? dbAsMissions.filter((m) => m.type === "special") : [],
    claimMission,
  };
}

export function MissionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center rounded-full border-2 border-gold bg-black/60 shadow-lg backdrop-blur-sm active:scale-90 transition-transform"
      style={{ width: 52, height: 52, touchAction: "manipulation", position: "fixed", top: "50%", left: "max(0px, calc(50vw - min(50vw, calc(50vh * 9 / 16))))", zIndex: 30, transform: "translateY(-100%)" }}
      aria-label="Missions"
    >
      <img src="/ui/mission-new.png" alt="" style={{ width: 52, height: 52, objectFit: "contain" }} draggable={false} />
    </button>
  );
}

export function MissionPanel({
  missions,
  onClose,
  onClaim,
}: {
  missions: Mission[];
  onClose: () => void;
  onClaim: (id: string) => void;
}) {
  const t = useTranslations("mission");
  const [tab, setTab] = useState<"daily" | "special">("daily");
  const daily = missions.filter((m) => m.type === "daily");
  const special = missions.filter((m) => m.type === "special");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="card-parchment relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl text-ink" style={{ fontWeight: 400 }}>{t("title")}</h2>
          <button onClick={onClose} className="text-2xl text-ink-soft" style={{ fontWeight: 400 }}>✕</button>
        </div>

        {/* 分頁按鈕：每日任務 / 特別任務 */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setTab("daily")}
            className={`flex-1 rounded-full border-2 py-2 text-sm transition-transform active:scale-95 ${
              tab === "daily"
                ? "border-gold bg-gold/20 text-ink"
                : "border-ink-soft/25 bg-white/40 text-ink-soft"
            }`}
            style={{ fontWeight: 400 }}
          >
            {t("daily")}
          </button>
          <button
            onClick={() => setTab("special")}
            className={`flex-1 rounded-full border-2 py-2 text-sm transition-transform active:scale-95 ${
              tab === "special"
                ? "border-chilli bg-chilli/15 text-ink"
                : "border-ink-soft/25 bg-white/40 text-ink-soft"
            }`}
            style={{ fontWeight: 400 }}
          >
            {t("special")}
          </button>
        </div>

        {/* 每日任務 */}
        {tab === "daily" && (
          <div className="mb-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm text-ink" style={{ fontWeight: 400 }}>
              <span className="rounded-full bg-gold px-2 py-0.5 text-xs text-ink">{t("daily")}</span>
              {t("dailyTitle")}
            </h3>
            <div className="flex flex-col gap-2">
              {daily.length === 0 ? (
                <p className="text-xs text-ink-soft">{t("noDaily")}</p>
              ) : (
                daily.map((m) => (
                  <MissionCard key={m.id} mission={m} onClaim={onClaim} />
                ))
              )}
            </div>
          </div>
        )}

        {/* 特別任務 */}
        {tab === "special" && (
          <div className="mb-2">
            <h3 className="mb-2 flex items-center gap-2 text-sm text-ink" style={{ fontWeight: 400 }}>
              <span className="rounded-full bg-chilli px-2 py-0.5 text-xs text-white">{t("special")}</span>
              {t("specialTitle")}
            </h3>
            <div className="flex flex-col gap-2">
              {special.length === 0 ? (
                <p className="text-xs text-ink-soft">{t("noSpecial")}</p>
              ) : (
                special.map((m) => (
                  <MissionCard key={m.id} mission={m} onClaim={onClaim} />
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MissionCard({ mission, onClaim }: { mission: Mission; onClaim: (id: string) => void }) {
  const t = useTranslations("mission");
  const locale = useLocale() as "zh" | "en";
  const pct = Math.round((mission.progress / mission.target) * 100);
  return (
    <div
      className={`rounded-xl border-2 p-3 ${
        mission.claimed
          ? "border-ink-soft/20 bg-parchment-dark/50 opacity-60"
          : mission.done
            ? "border-gold bg-gold/10"
            : "border-ink-soft/30 bg-white/50"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-ink" style={{ fontWeight: 400 }}>{mission.description}</p>
        <div className="flex shrink-0 items-center gap-1 text-xs" style={{ fontWeight: 400 }}>
          <span className="text-gold">🪙{mission.reward.coins}</span>
          <span className="text-blue-500">💎{mission.reward.diamonds}</span>
          {mission.reward.items &&
            Object.entries(mission.reward.items).map(([id, qty]) => (
              <span key={id} className="text-pandan">
                {(locale === "en" ? ITEM_MAP[id]?.name?.en : ITEM_MAP[id]?.name?.zh) ?? id}×{qty}
              </span>
            ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-parchment-dark">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-ink-soft" style={{ fontWeight: 400 }}>
          {mission.progress}/{mission.target}
        </span>
        {mission.done && !mission.claimed && (
          <button
            onClick={() => onClaim(mission.id)}
            className="btn-gold rounded-full px-3 py-1 text-xs"
            style={{ fontWeight: 400 }}
          >
            {t("claim")}
          </button>
        )}
        {mission.claimed && <span className="text-xs text-pandan" style={{ fontWeight: 400 }}>{t("claimed")}</span>}
      </div>
    </div>
  );
}
