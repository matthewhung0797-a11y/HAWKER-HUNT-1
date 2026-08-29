"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useGameStore } from "@/lib/store";
import { HAWKER_CENTRES } from "@/content/centres";
import { SPECIES } from "@/content/species";

export type MissionType = "daily" | "special";
export type MissionGoal = "capture" | "checkin" | "catch-specific";

export interface Mission {
  id: string;
  type: MissionType;
  goal: MissionGoal;
  description: string;
  target: number;
  progress: number;
  reward: { coins: number; diamonds: number };
  done: boolean;
  claimed: boolean;
}

const DAILY_MISSION_POOL: { goal: MissionGoal; desc: (n: number) => string; target: number; reward: { coins: number; diamonds: number } }[] = [
  { goal: "capture", desc: (n) => `捕捉 ${n} 隻精靈`, target: 3, reward: { coins: 100, diamonds: 1 } },
  { goal: "capture", desc: (n) => `捕捉 ${n} 隻精靈`, target: 5, reward: { coins: 200, diamonds: 2 } },
  { goal: "capture", desc: (n) => `捕捉 ${n} 隻不同精靈`, target: 2, reward: { coins: 150, diamonds: 1 } },
  { goal: "checkin", desc: (n) => `到 ${n} 個據點打卡`, target: 1, reward: { coins: 80, diamonds: 1 } },
  { goal: "checkin", desc: (n) => `到 ${n} 個據點打卡`, target: 2, reward: { coins: 150, diamonds: 2 } },
  { goal: "catch-specific", desc: (n) => `捕捉指定精靈 ${n} 隻`, target: 1, reward: { coins: 120, diamonds: 1 } },
];

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function generateDailyMissions(): Mission[] {
  const pool = [...DAILY_MISSION_POOL];
  const shuffled = pool.sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 3);
  return picked.map((p, i) => ({
    id: `daily-${getTodayKey()}-${i}`,
    type: "daily" as MissionType,
    goal: p.goal,
    description: p.desc(p.target),
    target: p.target,
    progress: 0,
    reward: p.reward,
    done: false,
    claimed: false,
  }));
}

export function useMissions() {
  const store = useGameStore();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [specialMissions, setSpecialMissions] = useState<Mission[]>([]);

  const todayKey = getTodayKey();

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(`hh-missions-${todayKey}`) : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setMissions(parsed);
      } catch {
        setMissions(generateDailyMissions());
      }
    } else {
      const fresh = generateDailyMissions();
      setMissions(fresh);
      if (typeof window !== "undefined") {
        localStorage.setItem(`hh-missions-${todayKey}`, JSON.stringify(fresh));
      }
    }
  }, [todayKey]);

  // Update progress from store data
  const updatedMissions = useMemo(() => {
    const captureCount = Object.values(store.captureCounts || {}).reduce((a: number, b: number) => a + b, 0);
    const uniqueCaptured = Object.keys(store.captureCounts || {}).length;
    const checkinCount = store.checkins?.length || 0;

    return missions.map((m) => {
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
  }, [missions, store.captureCounts, store.checkins]);

  useEffect(() => {
    if (typeof window !== "undefined" && updatedMissions.length > 0) {
      localStorage.setItem(`hh-missions-${todayKey}`, JSON.stringify(updatedMissions));
    }
  }, [updatedMissions, todayKey]);

  function claimMission(id: string) {
    setMissions((prev) => {
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
  }

  return { dailyMissions: updatedMissions, specialMissions, claimMission };
}

export function MissionButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 border-gold bg-black/60 shadow-lg backdrop-blur-sm active:scale-90 transition-transform"
      style={{ width: 52, height: 52, touchAction: "manipulation", left: "max(12px, calc(50vw - min(50vw, calc(50vh * 9 / 16))) + 12px)" }}
      aria-label="任務"
    >
      <img src="/ui/mission.png" alt="任務" style={{ width: 32, height: 32 }} draggable={false} />
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
  const t = useTranslations();
  const daily = missions.filter((m) => m.type === "daily");
  const special = missions.filter((m) => m.type === "special");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="card-parchment relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-black text-ink">任務</h2>
          <button onClick={onClose} className="text-2xl font-bold text-ink-soft">✕</button>
        </div>

        {/* 每日任務 */}
        <div className="mb-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-ink">
            <span className="rounded-full bg-gold px-2 py-0.5 text-xs text-ink">每日</span>
            每日任務
          </h3>
          <div className="flex flex-col gap-2">
            {daily.length === 0 ? (
              <p className="text-xs text-ink-soft">暫無每日任務</p>
            ) : (
              daily.map((m) => (
                <MissionCard key={m.id} mission={m} onClaim={onClaim} />
              ))
            )}
          </div>
        </div>

        {/* 特別任務 */}
        <div className="mb-2">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-black text-ink">
            <span className="rounded-full bg-chilli px-2 py-0.5 text-xs text-white">特別</span>
            特別任務
          </h3>
          <div className="flex flex-col gap-2">
            {special.length === 0 ? (
              <p className="text-xs text-ink-soft">暫無特別任務</p>
            ) : (
              special.map((m) => (
                <MissionCard key={m.id} mission={m} onClaim={onClaim} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MissionCard({ mission, onClaim }: { mission: Mission; onClaim: (id: string) => void }) {
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
        <p className="text-sm font-bold text-ink">{mission.description}</p>
        <div className="flex shrink-0 items-center gap-1 text-xs font-black">
          <span className="text-gold">🪙{mission.reward.coins}</span>
          <span className="text-blue-500">💎{mission.reward.diamonds}</span>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-parchment-dark">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-bold text-ink-soft">
          {mission.progress}/{mission.target}
        </span>
        {mission.done && !mission.claimed && (
          <button
            onClick={() => onClaim(mission.id)}
            className="btn-gold rounded-full px-3 py-1 text-xs font-black"
          >
            領取
          </button>
        )}
        {mission.claimed && <span className="text-xs font-bold text-pandan">✓ 已領取</span>}
      </div>
    </div>
  );
}
