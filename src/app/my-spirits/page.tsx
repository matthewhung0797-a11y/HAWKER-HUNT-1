"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { SPECIES_MAP } from "@/content/species";
import { ELEMENT_INFO, ELEMENT_ORDER } from "@/content/elements";
import type { ElementType } from "@/content/types";
import { useGameStore } from "@/lib/store";
import BottomNav from "@/components/BottomNav";
import DexGridCell from "@/components/DexGridCell";
import SpiritIcon from "@/components/SpiritIcon";
import { sfxTap } from "@/lib/sfx";

/** 排序方式（三選一，互斥）；屬性係分類過濾，可同任何排序並用 */
type SortKey = "level" | "caughtAt" | "rarity";

/** 稀有度排序權重：basic < common < rare < epic < legendary */
const RARITY_RANK: Record<string, number> = { basic: 0, common: 1, rare: 2, epic: 3, legendary: 4 };

/** 我的精靈：玩家擁有的每一隻實體（非按種類去重），卡上帶等級，點入睇詳情 */
export default function MySpiritsPage() {
  const t = useTranslations("mySpirits");
  const navT = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const ownedSpirits = useGameStore((s) => s.ownedSpirits);

  const [sortKey, setSortKey] = useState<SortKey>("caughtAt");
  const [elementFilter, setElementFilter] = useState<ElementType | "all">("all");
  const [sortOpen, setSortOpen] = useState(false);

  // 屬性分類（可與任何排序並用）→ 排序（等級/獲得時間/稀有度，互斥）
  const sorted = useMemo(() => {
    let list = [...ownedSpirits];
    if (elementFilter !== "all") {
      list = list.filter((sp) => SPECIES_MAP[sp.speciesId]?.element === elementFilter);
    }
    switch (sortKey) {
      case "level":
        return list.sort((a, b) => b.level - a.level || b.caughtAt - a.caughtAt);
      case "rarity":
        return list.sort(
          (a, b) =>
            (RARITY_RANK[SPECIES_MAP[b.speciesId]?.rarity ?? "basic"] ?? 0) -
              (RARITY_RANK[SPECIES_MAP[a.speciesId]?.rarity ?? "basic"] ?? 0) ||
            b.caughtAt - a.caughtAt
        );
      case "caughtAt":
      default:
        return list.sort((a, b) => b.caughtAt - a.caughtAt);
    }
  }, [ownedSpirits, sortKey, elementFilter]);

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "caughtAt", label: t("sort.caughtAt") },
    { key: "level", label: t("sort.level") },
    { key: "rarity", label: t("sort.rarity") },
  ];

  return (
    <main className="paper-texture flex min-h-dvh shrink-0 flex-col pb-[calc(70px_+_env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 bg-parchment-light/95 px-4 pb-2 pt-5 shadow-sm backdrop-blur">
        <div className="relative flex items-center justify-between">
          <span className="w-8" />
          <h1 className="game-title-sm text-center text-xl font-black text-ink">{t("title")}</h1>
          {/* 排序／屬性篩選按鈕（右手邊） */}
          <button
            onClick={() => {
              sfxTap();
              setSortOpen((v) => !v);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink/25 bg-parchment-dark/60 text-sm text-ink transition active:scale-90"
            aria-label={t("sort.title")}
          >
            ⇅
          </button>
        </div>
        <p className="mt-0.5 text-center text-xs font-bold text-ink-soft">
          {t("count", { count: sorted.length })}
        </p>

        {/* 排序面板 */}
        {sortOpen && (
          <div className="card-parchment mt-2 rounded-2xl p-3">
            {/* 排序方式（互斥三選一） */}
            <p className="mb-1.5 text-xs font-black text-ink">{t("sort.title")}</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {sortOptions.map((o) => (
                <button
                  key={o.key}
                  onClick={() => {
                    sfxTap();
                    setSortKey(o.key);
                  }}
                  className={`rounded-full border-2 px-3 py-1 text-xs font-bold transition active:scale-95 ${
                    sortKey === o.key
                      ? "border-ink bg-ink text-parchment-light"
                      : "border-ink-soft/40 bg-parchment-light text-ink-soft"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {/* 屬性分類（可與排序並用） */}
            <p className="mb-1.5 text-xs font-black text-ink">{t("sort.element")}</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => {
                  sfxTap();
                  setElementFilter("all");
                }}
                className={`rounded-full border-2 px-3 py-1 text-xs font-bold transition active:scale-95 ${
                  elementFilter === "all"
                    ? "border-ink bg-ink text-parchment-light"
                    : "border-ink-soft/40 bg-parchment-light text-ink-soft"
                }`}
              >
                {navT("dex.all")}
              </button>
              {ELEMENT_ORDER.map((el) => (
                <button
                  key={el}
                  onClick={() => {
                    sfxTap();
                    setElementFilter(el);
                  }}
                  className={`flex items-center gap-1 rounded-full border-2 px-3 py-1 text-xs font-bold transition active:scale-95 ${
                    elementFilter === el
                      ? "border-ink bg-ink text-parchment-light"
                      : "border-ink-soft/40 bg-parchment-light text-ink-soft"
                  }`}
                  style={elementFilter === el ? { backgroundColor: ELEMENT_INFO[el].color, borderColor: ELEMENT_INFO[el].color } : undefined}
                >
                  {ELEMENT_INFO[el].name[locale]}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="mx-auto w-full max-w-md px-4 py-3">
        {sorted.length === 0 ? (
          <div className="card-parchment flex flex-col items-center gap-2 p-8 text-center">
            <SpiritIcon speciesId={Object.keys(SPECIES_MAP)[0]} size={64} silhouette />
            <p className="text-sm text-ink-soft">{t("empty")}</p>
            <Link href="/map" className="btn-gold px-6 py-2.5 text-sm font-black">
              {navT("nav.map")}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {sorted.map((spirit) => {
              const species = SPECIES_MAP[spirit.speciesId];
              if (!species) return null;
              return (
                <DexGridCell key={spirit.uid}>
                  <Link
                    href={`/my-spirits/${spirit.uid}`}
                    className="card-parchment relative flex h-[120px] w-full flex-col items-center overflow-hidden p-3"
                  >
                    <span className="absolute left-1/2 top-4 -translate-x-1/2">
                      <SpiritIcon speciesId={spirit.speciesId} size={64} />
                      {/* 閃光 ✦ 徽章已移除 */}
                      <span
                        className="absolute -bottom-1 -right-1 rounded-full border-2 border-parchment bg-chilli px-1.5 text-[10px] font-black leading-4 text-white"
                        aria-label={`${navT("dex.level")} ${spirit.level}`}
                      >
                        Lv.{spirit.level}
                      </span>
                    </span>
                    <span className="absolute bottom-2 left-0 right-0 text-center text-xs font-bold text-ink">
                      {species.name[locale]}
                    </span>
                  </Link>
                </DexGridCell>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
