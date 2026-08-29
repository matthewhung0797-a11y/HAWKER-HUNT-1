"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FACTIONS } from "@/content/centres";
import { useGameStore } from "@/lib/store";
import {
  fetchLeaderboard,
  submitScore,
  getPlayerKey,
  getSupabase,
  type LeaderboardRow,
} from "@/lib/leaderboard";
import BottomNav from "@/components/BottomNav";
import UIIcon from "@/components/UIIcon";
import { track } from "@/lib/analytics/track";

type Tab = "factions" | "personal" | "friends";

/** 離線示範數據（未配置 Supabase 或請求失敗時退回） */
const MOCK_FACTION_SCORES: Record<string, number> = {
  east: 125430,
  south: 118750,
  central: 110980,
  north: 99500,
  west: 85200,
};

const MOCK_PLAYERS = [
  { name: "MakanKing", score: 4820 },
  { name: "LaksaLover88", score: 4515 },
  { name: "ChickenRiceGod", score: 4210 },
  { name: "PandanQueen", score: 3980 },
  { name: "SatayMaster", score: 3660 },
  { name: "KayaToastKid", score: 3120 },
  { name: "BKTHunter", score: 2890 },
  { name: "TehTarikPro", score: 2450 },
  { name: "HawkerHero", score: 2100 },
];

/** 頭三名徽章色 */
const RANK_COLORS = ["#c9a227", "#9aa0a6", "#b0722e"];
const RANK_BG = [
  "linear-gradient(160deg,#f6e2a2,#d8b448)",
  "linear-gradient(160deg,#e8eaed,#bdc1c6)",
  "linear-gradient(160deg,#e2b285,#c08552)",
];

export default function LeaderboardPage() {
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const store = useGameStore();
  const [tab, setTab] = useState<Tab>("factions");

  // 埋點：進入排行榜（每次掛載記一次）
  useEffect(() => {
    track("leaderboard_view", { tab: "factions" });
  }, []);

  const playerScore = store.level * 100 + store.exp + Object.keys(store.captureCounts).length * 50;

  // ── 真實榜（Supabase）：上傳自己分數 → 讀榜；失敗即退回 mock ──
  const [live, setLive] = useState<{
    players: LeaderboardRow[];
    factionTotals: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(() => getSupabase() !== null);
  useEffect(() => {
    if (!getSupabase()) return;
    let cancelled = false;
    (async () => {
      // 先上分再讀榜，保證自己嗰行係最新
      await submitScore(store.nickname, store.factionId, playerScore);
      const data = await fetchLeaderboard();
      if (!cancelled) {
        setLive(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 分數變動先重新上傳（進頁面時一次為主）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerScore]);

  const isLive = live !== null;

  // ── 陣營榜：真實聚合分 fallback mock ──
  const factionScores = isLive ? live.factionTotals : MOCK_FACTION_SCORES;
  const sortedFactions = [...FACTIONS].sort(
    (a, b) => (factionScores[b.id] ?? 0) - (factionScores[a.id] ?? 0)
  );

  // ── 個人榜：真實 rows（用 player_key 認自己）fallback mock＋本地分 ──
  const personalList = useMemo(() => {
    if (isLive) {
      const myKey = getPlayerKey();
      const rows = live.players.map((p) => ({
        name: p.nickname,
        score: p.score,
        me: p.player_key === myKey,
      }));
      // 自己未上到榜（新裝置頭一次載入）就本地補一行
      if (!rows.some((r) => r.me)) {
        rows.push({ name: store.nickname || t("profile.guest"), score: playerScore, me: true });
        rows.sort((a, b) => b.score - a.score);
      }
      return rows;
    }
    return [
      ...MOCK_PLAYERS.map((p) => ({ ...p, me: false })),
      { name: store.nickname || t("profile.guest"), score: playerScore, me: true },
    ].sort((a, b) => b.score - a.score);
  }, [isLive, live, playerScore, store.nickname, t]);

  return (
    <main className="paper-texture flex min-h-dvh shrink-0 flex-col pb-[calc(70px_+_env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 bg-parchment-light/95 px-4 pt-5 shadow-sm backdrop-blur">
        <h1 className="game-title-sm text-center text-xl font-black text-ink">{t("leaderboard.title")}</h1>
        <div className="mx-auto mt-3 flex max-w-md">
          {(["factions", "personal", "friends"] as Tab[]).map((tb) => (
            <button
              key={tb}
              onClick={() => setTab(tb)}
              className={`flex-1 border-b-4 pb-2 text-sm font-black transition-colors ${
                tab === tb ? "border-gold text-ink" : "border-transparent text-ink-soft"
              }`}
            >
              {t(`leaderboard.${tb}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pt-4">
        {/* 數據來源標示：離線示範 vs 實時 */}
        {tab !== "friends" && (
          <p className="text-center text-[11px] font-bold text-ink-soft/70">
            {loading
              ? t("leaderboard.loading")
              : isLive
                ? t("leaderboard.liveData")
                : t("leaderboard.offlineDemo")}
          </p>
        )}

        {tab === "factions" &&
          sortedFactions.map((f, i) => {
            const score = factionScores[f.id] ?? 0;
            const maxScore = Math.max(1, factionScores[sortedFactions[0].id] ?? 1);
            const mine = f.id === store.factionId;
            return (
              <div
                key={f.id}
                className={`card-parchment flex items-center gap-3 p-4 ${
                  mine ? "ring-4 ring-gold shadow-[0_0_16px_rgba(201,162,39,0.5)]" : ""
                }`}
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-base font-black"
                  style={{
                    borderColor: RANK_COLORS[i] ?? "#a89a7c",
                    background: RANK_BG[i] ?? "transparent",
                    color: i < 3 ? "#4a2c14" : "#7a5a38",
                  }}
                >
                  {i < 3 ? <UIIcon name={`medal-${i + 1}`} size={30} /> : `#${i + 1}`}
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-ink">
                      {f.name[locale]} {mine && `· ${t("leaderboard.you")}`}
                    </span>
                    <span className="text-sm font-bold text-ink-soft">
                      {score.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-parchment-dark">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(score / maxScore) * 100}%`, backgroundColor: f.color }}
                    />
                  </div>
                </div>
              </div>
            );
          })}

        {tab === "personal" &&
          personalList.map((p, i) => (
            <div
              key={`${p.name}-${i}`}
              className={`card-parchment flex items-center gap-3 px-4 py-3 ${
                p.me ? "ring-4 ring-gold" : ""
              }`}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-black"
                style={{
                  borderColor: RANK_COLORS[i] ?? "#a89a7c",
                  background: RANK_BG[i] ?? "transparent",
                  color: "#4a2c14",
                }}
              >
                {i < 3 ? <UIIcon name={`medal-${i + 1}`} size={24} /> : `#${i + 1}`}
              </span>
              <span className="flex-1 font-bold text-ink">
                {p.name} {p.me && `· ${t("leaderboard.you")}`}
              </span>
              <span className="text-sm font-black text-ink-soft">
                {p.score.toLocaleString()} {t("leaderboard.points")}
              </span>
            </div>
          ))}

        {tab === "friends" && (
          <div className="card-parchment flex flex-col items-center gap-2 p-10 text-center">
            <UIIcon name="people" size={48} />
            <p className="text-sm font-bold text-ink-soft">{t("leaderboard.comingSoon")}</p>
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
