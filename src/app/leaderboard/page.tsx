"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useGameStore } from "@/lib/store";
import { getRanking } from "@/lib/admin/actions";
import { getPlayerKey } from "@/lib/leaderboard";
import type { RankRow } from "@/lib/admin/types";
import BottomNav from "@/components/BottomNav";
import UIIcon from "@/components/UIIcon";
import { track } from "@/lib/analytics/track";

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
  const [rows, setRows] = useState<RankRow[] | null>(null);

  // 埋點：進入排行榜（每次掛載記一次）
  useEffect(() => {
    track("leaderboard_view", { tab: "personal" });
  }, []);

  // 拉後台玩家資料排名（player_saves：等級 → 精靈數 → 更新時間）
  useEffect(() => {
    let cancelled = false;
    getRanking().then(
      (r) => {
        if (!cancelled) setRows(r);
      },
      () => {
        if (!cancelled) setRows([]);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const myKey = getPlayerKey();

  return (
    <main className="paper-texture flex min-h-dvh shrink-0 flex-col pb-[calc(70px_+_env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 bg-parchment-light/95 px-4 pt-5 pb-2 shadow-sm backdrop-blur">
        <h1 className="game-title-sm text-center text-xl font-black text-ink">{t("leaderboard.title")}</h1>
        <p className="mt-1 text-center text-[11px] font-bold text-ink-soft/70">
          {t("leaderboard.liveData")}
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4 pt-4">
        {rows === null ? (
          <div className="card-parchment p-8 text-center text-sm font-bold text-ink-soft">
            {t("leaderboard.loading")}
          </div>
        ) : rows.length === 0 ? (
          <div className="card-parchment p-8 text-center text-sm font-bold text-ink-soft">
            {t("leaderboard.empty")}
          </div>
        ) : (
          rows.map((r, i) => {
            const me = Boolean(r.player_key) && r.player_key === myKey;
            return (
              <div
                key={r.user_id}
                className={`card-parchment flex items-center gap-3 px-4 py-3 ${
                  me ? "ring-4 ring-gold" : ""
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
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-ink">
                    {r.nickname} {me && `· ${t("leaderboard.you")}`}
                  </span>
                  <span className="block text-[11px] font-bold text-ink-soft">
                    {t("leaderboard.level")} Lv.{r.level} · {t("leaderboard.spirits")} {r.spirit_count}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>

      <BottomNav />
    </main>
  );
}
