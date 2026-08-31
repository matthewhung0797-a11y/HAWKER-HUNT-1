"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { DEX_CATEGORIES, SPECIES } from "@/content/species";
import { ELEMENT_INFO, ELEMENT_ORDER } from "@/content/elements";
import type { ElementType } from "@/content/types";
import { useGameStore } from "@/lib/store";
import BottomNav from "@/components/BottomNav";
import DexGridCell from "@/components/DexGridCell";
import SpiritIcon from "@/components/SpiritIcon";
import UIIcon from "@/components/UIIcon";

type Filter = "all" | "caught" | "uncaught" | ElementType;

export default function DexPage() {
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const captureCounts = useGameStore((s) => s.captureCounts);
  const ownedSpirits = useGameStore((s) => s.ownedSpirits);
  const shinySpecies = useMemo(
    () => new Set(ownedSpirits.filter((sp) => sp.shiny).map((sp) => sp.speciesId)),
    [ownedSpirits]
  );
  const [filter, setFilter] = useState<Filter>("all");

  const caughtCount = Object.keys(captureCounts).length;
  const progress = Math.round((caughtCount / SPECIES.length) * 100);

  // 篩選後按門類分區（正常系列／基礎原料……順序跟 DEX_CATEGORIES）；空區隱藏
  const sections = useMemo(() => {
    const list = SPECIES.filter((sp) => {
      const caught = !!captureCounts[sp.id];
      if (filter === "caught") return caught;
      if (filter === "uncaught") return !caught;
      if (filter !== "all") return sp.element === filter;
      return true;
    });
    return DEX_CATEGORIES.map((cat) => ({
      id: cat.id,
      list: list.filter((sp) => cat.rarities.includes(sp.rarity)),
    })).filter((sec) => sec.list.length > 0);
  }, [filter, captureCounts]);

  const filters: { key: Filter; label: string; icon?: string; color?: string }[] = [
    { key: "all", label: t("dex.all") },
    { key: "caught", label: t("dex.caught") },
    { key: "uncaught", label: t("dex.uncaught") },
    ...ELEMENT_ORDER.map((el) => ({
      key: el as Filter,
      label: t(`elements.${el}`),
      icon: ELEMENT_INFO[el].icon,
      color: ELEMENT_INFO[el].color,
    })),
  ];

  return (
    <main className="paper-texture flex min-h-dvh shrink-0 flex-col pb-[calc(70px_+_env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 bg-parchment-light/95 px-4 pb-2 pt-5 shadow-sm backdrop-blur">
        <h1 className="game-title-sm text-center text-xl font-black text-ink">{t("dex.title")}</h1>
        {/* 收集進度條 */}
        <div className="mx-auto mt-2 max-w-md">
          <div className="relative h-6 overflow-hidden rounded-full border-2 border-gold bg-parchment-dark">
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light transition-all"
              style={{ width: `${progress}%` }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-ink">
              {t("dex.collected", { current: caughtCount, total: SPECIES.length })} ({progress}%)
            </span>
          </div>
        </div>
        {/* 篩選 */}
        <div className="no-scrollbar mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex shrink-0 items-center gap-1 rounded-full border-2 px-3 py-1 text-xs font-bold transition-colors ${
                filter === f.key
                  ? "border-ink bg-ink text-parchment-light"
                  : "border-ink-soft/40 bg-parchment-light text-ink-soft"
              }`}
              style={
                filter === f.key && f.color ? { backgroundColor: f.color, borderColor: f.color } : undefined
              }
            >
              {f.icon && <UIIcon name={f.icon} size={14} />}
              {f.label}
            </button>
          ))}
        </div>
      </header>

      {/* 分區網格：每個門類一個 header ＋ grid */}
      {sections.map((sec) => (
        <section key={sec.id} className="mx-auto w-full max-w-md px-4 pt-4">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-px flex-1 bg-ink-soft/30" />
            <h2 className="text-sm font-black tracking-wide text-ink-soft">
              {t(`dex.category.${sec.id}`)}
            </h2>
            <span className="h-px flex-1 bg-ink-soft/30" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            {sec.list.map((sp) => {
              const count = captureCounts[sp.id] ?? 0;
              const caught = count > 0;
              return (
                <DexGridCell key={sp.id}>
                  <Link
                    href={`/dex/${sp.id}`}
                    className={`card-parchment relative flex h-[120px] w-full flex-col items-center overflow-hidden p-3 ${
                      caught ? "" : "opacity-80"
                    }`}
                  >
                    <span className="absolute left-1/2 top-4 -translate-x-1/2">
                      {/* 繼續用 640 full；離屏格由 DexGridCell 延遲掛載減首屏解碼 */}
                      <SpiritIcon speciesId={sp.id} size={64} silhouette={!caught} />
                      {shinySpecies.has(sp.id) && (
                        <span className="shiny-badge absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-ink">
                          ✦
                        </span>
                      )}
                      {count > 1 && (
                        <span
                          aria-label={t("dex.captureCount", { count })}
                          className="absolute -bottom-1 -right-1 rounded-full border-2 border-parchment bg-ink px-1.5 text-[10px] font-black leading-4 text-parchment-light"
                        >
                          ×{count}
                        </span>
                      )}
                    </span>
                    <span className={`absolute bottom-2 left-0 right-0 text-center text-xs font-bold ${caught ? "text-ink" : "text-ink-soft"}`}>
                      {caught ? sp.name[locale] : t("dex.unknown")}
                    </span>
                  </Link>
                </DexGridCell>
              );
            })}
          </div>
        </section>
      ))}

      <BottomNav />
    </main>
  );
}
