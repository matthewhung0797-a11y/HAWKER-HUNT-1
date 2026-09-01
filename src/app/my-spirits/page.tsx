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
  /** 屬性排列：false＝主排序行先（時間/等級/稀有度>屬性）；true＝屬性行先（屬性>主排序） */
  const [elementFirst, setElementFirst] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  // 屬性篩選（單一屬性）→ 排序；「屬性」掣有顏色＝屬性分組行先，冇顏色＝主排序行先
  const sorted = useMemo(() => {
    let list = [...ownedSpirits];
    if (elementFilter !== "all") {
      list = list.filter((sp) => SPECIES_MAP[sp.speciesId]?.element === elementFilter);
    }
    // 屬性組順序：火>水>木>金>土（揀咗單一屬性時全場同屬性＝無效）
    const ELEMENT_ORDER_RANK: Record<ElementType, number> = {
      fire: 0,
      water: 1,
      wood: 2,
      metal: 3,
      earth: 4,
    };
    const elRank = (speciesId: string) =>
      ELEMENT_ORDER_RANK[SPECIES_MAP[speciesId]?.element ?? "earth"] ?? 4;
    const useEl = elementFirst && elementFilter === "all";
    const elFirst = useEl
      ? (a: typeof ownedSpirits[number], b: typeof ownedSpirits[number]) =>
          elRank(a.speciesId) - elRank(b.speciesId)
      : null;
    const elLast = useEl
      ? (a: typeof ownedSpirits[number], b: typeof ownedSpirits[number]) =>
          elRank(a.speciesId) - elRank(b.speciesId)
      : () => 0;
    switch (sortKey) {
      case "level":
        // 有色：屬性→等級→同精靈→時間；冇色：等級→同精靈→屬性→時間
        return list.sort(
          (a, b) =>
            (elFirst ? elFirst(a, b) : 0) ||
            b.level - a.level ||
            a.speciesId.localeCompare(b.speciesId) ||
            (elFirst ? 0 : elLast(a, b)) ||
            b.caughtAt - a.caughtAt
        );
      case "rarity":
        // 有色：屬性→稀有度→同精靈→時間；冇色：稀有度→同精靈→屬性→時間
        return list.sort(
          (a, b) =>
            (elFirst ? elFirst(a, b) : 0) ||
            (RARITY_RANK[SPECIES_MAP[b.speciesId]?.rarity ?? "basic"] ?? 0) -
              (RARITY_RANK[SPECIES_MAP[a.speciesId]?.rarity ?? "basic"] ?? 0) ||
            a.speciesId.localeCompare(b.speciesId) ||
            (elFirst ? 0 : elLast(a, b)) ||
            b.caughtAt - a.caughtAt
        );
      case "caughtAt":
      default:
        // 有色：屬性→時間；冇色：時間→同精靈→屬性
        return list.sort(
          (a, b) =>
            (elFirst ? elFirst(a, b) : 0) ||
            (elFirst
              ? 0
              : a.speciesId.localeCompare(b.speciesId) || elLast(a, b)) ||
            b.caughtAt - a.caughtAt
        );
    }
  }, [ownedSpirits, sortKey, elementFilter, elementFirst]);

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
            {/* 排序方式（互斥三選一）＋屬性排列（有色＝屬＝屬性行先，冇色＝主排序行先） */}
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
              {/* 屬性：有色（漸層）＝按屬性順序行先；冇色＝不按屬性排列 */}
              <button
                onClick={() => {
                  sfxTap();
                  setElementFirst((v) => !v);
                }}
                className={`rounded-full border-2 px-3 py-1 text-xs font-bold transition active:scale-95 ${
                  elementFirst
                    ? "border-transparent text-white"
                    : "border-ink-soft/40 bg-parchment-light text-ink-soft"
                }`}
                style={
                  elementFirst
                    ? { background: "linear-gradient(90deg,#d84a2f,#3d7fc1,#4e9a51,#b8a049,#9a6b3f)" }
                    : undefined
                }
              >
                {t("sort.element")}
              </button>
            </div>
            {/* 屬性分類（可與排序並用） */}
            <p className="mb-1.5 text-xs font-black text-ink">{t("sort.element")}</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
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
