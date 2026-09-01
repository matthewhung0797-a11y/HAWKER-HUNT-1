"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { SPECIES, SPECIES_MAP } from "@/content/species";
import { ELEMENT_INFO, ELEMENT_ORDER } from "@/content/elements";
import type { ElementType } from "@/content/types";
import { useGameStore } from "@/lib/store";
import BottomNav from "@/components/BottomNav";
import DexGridCell from "@/components/DexGridCell";
import SpiritIcon from "@/components/SpiritIcon";
import { sfxTap } from "@/lib/sfx";

/** 主排序（互斥）：屬性／獲得時間／等級／稀有度 */
type SortKey = "element" | "caughtAt" | "level" | "rarity";
type SortDir = "asc" | "desc";

/** 稀有度權重：basic < common < rare < epic < legendary */
const RARITY_RANK: Record<string, number> = { basic: 0, common: 1, rare: 2, epic: 3, legendary: 4 };

/** 屬性固定順序：火>水>木>金>土 */
const ELEMENT_ORDER_RANK: Record<ElementType, number> = {
  fire: 0,
  water: 1,
  wood: 2,
  metal: 3,
  earth: 4,
};

/** 精靈編號（圖鑑順序）：SPECIES 陣列 index */
const SPECIES_INDEX: Record<string, number> = Object.fromEntries(
  SPECIES.map((s, i) => [s.id, i])
);

/** 排序設定（localStorage 記憶） */
interface SortSettings {
  key: SortKey;
  dir: SortDir;
  elementFilter: ElementType | "all";
  rarityFilter: string | "all";
}

const SETTINGS_KEY = "hh-myspirits-sort";
const DEFAULT_SETTINGS: SortSettings = {
  key: "caughtAt",
  dir: "desc",
  elementFilter: "all",
  rarityFilter: "all",
};

function loadSettings(): SortSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const s = JSON.parse(raw);
    return {
      key: (["element", "caughtAt", "level", "rarity"] as const).includes(s.key)
        ? s.key
        : "caughtAt",
      dir: s.dir === "asc" ? "asc" : "desc",
      elementFilter:
        ELEMENT_ORDER.includes(s.elementFilter) || s.elementFilter === "all"
          ? s.elementFilter
          : "all",
      rarityFilter:
        typeof s.rarityFilter === "string" &&
        ["all", "basic", "common", "rare", "epic", "legendary"].includes(s.rarityFilter)
          ? s.rarityFilter
          : "all",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** 我的精靈：玩家擁有的每一隻實體（非按種類去重），卡上帶等級，點入睇詳情 */
export default function MySpiritsPage() {
  const t = useTranslations("mySpirits");
  const navT = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const ownedSpirits = useGameStore((s) => s.ownedSpirits);

  // 記憶功能：mount 後先讀 localStorage（SSR 冇）；microtask 內 setState（set-state-in-effect 規則）
  const [settings, setSettings] = useState<SortSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => {
      setSettings(loadSettings());
      setLoaded(true);
    });
  }, []);

  const update = (patch: Partial<SortSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const { key: sortKey, dir, elementFilter, rarityFilter } = settings;

  // 篩選（屬性＋稀有度，可並用）→ 主排序 → 次級排序（Excel 表：同類歸集→個體差異→最後規則）
  const sorted = useMemo(() => {
    let list = [...ownedSpirits];
    if (elementFilter !== "all") {
      list = list.filter((sp) => SPECIES_MAP[sp.speciesId]?.element === elementFilter);
    }
    if (rarityFilter !== "all") {
      list = list.filter((sp) => SPECIES_MAP[sp.speciesId]?.rarity === rarityFilter);
    }
    // 常用比較器
    const elRank = (s: typeof list[number]) =>
      ELEMENT_ORDER_RANK[SPECIES_MAP[s.speciesId]?.element ?? "earth"] ?? 4;
    const rarRank = (s: typeof list[number]) =>
      RARITY_RANK[SPECIES_MAP[s.speciesId]?.rarity ?? "basic"] ?? 0;
    const dexNo = (s: typeof list[number]) => SPECIES_INDEX[s.speciesId] ?? 9999;
    const lv = (s: typeof list[number]) => s.level;
    const at = (s: typeof list[number]) => s.caughtAt;

    switch (sortKey) {
      case "element":
        // 屬性(固定順序) → 精靈編號 → 等級(高→低) → 獲取時間(新→舊)
        return list.sort(
          (a, b) =>
            elRank(a) - elRank(b) ||
            dexNo(a) - dexNo(b) ||
            lv(b) - lv(a) ||
            at(b) - at(a)
        );
      case "rarity":
        // 稀有度 → 精靈編號 → 等級(高→低) → 獲取時間(新→舊)；升序＝稀有度反轉
        return list.sort(
          (a, b) =>
            (dir === "desc" ? rarRank(b) - rarRank(a) : rarRank(a) - rarRank(b)) ||
            dexNo(a) - dexNo(b) ||
            lv(b) - lv(a) ||
            at(b) - at(a)
        );
      case "level":
        // 等級(高→低/低→高) → 精靈編號 → 稀有度(高→低) → 獲取時間(新→舊)
        return list.sort(
          (a, b) =>
            (dir === "desc" ? lv(b) - lv(a) : lv(a) - lv(b)) ||
            dexNo(a) - dexNo(b) ||
            rarRank(b) - rarRank(a) ||
            at(b) - at(a)
        );
      case "caughtAt":
      default:
        // 獲取時間(新→舊/舊→新) → 精靈編號 → 等級(高→低) → 稀有度(高→低)
        return list.sort(
          (a, b) =>
            (dir === "desc" ? at(b) - at(a) : at(a) - at(b)) ||
            dexNo(a) - dexNo(b) ||
            lv(b) - lv(a) ||
            rarRank(b) - rarRank(a)
        );
    }
  }, [ownedSpirits, sortKey, dir, elementFilter, rarityFilter]);

  const sortOptions: { key: SortKey; label: string; fixed?: boolean }[] = [
    { key: "caughtAt", label: t("sort.caughtAt") },
    { key: "level", label: t("sort.level") },
    { key: "rarity", label: t("sort.rarity") },
    { key: "element", label: t("sort.element"), fixed: true },
  ];

  return (
    <main className="paper-texture flex min-h-dvh shrink-0 flex-col pb-[calc(70px_+_env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 bg-parchment-light/95 px-4 pb-2 pt-5 shadow-sm backdrop-blur">
        <div className="relative flex items-center justify-between">
          <span className="w-8" />
          <h1 className="game-title-sm text-center text-xl font-black text-ink">{t("title")}</h1>
          {/* 排序／篩選按鈕（右手邊） */}
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
            {/* 主排序（互斥）＋升/降序切換 */}
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-black text-ink">{t("sort.title")}</p>
              {/* 升/降序：↑＝升序 ↓＝降序（屬性固定順序時隱藏） */}
              {sortKey !== "element" && (
                <button
                  onClick={() => {
                    sfxTap();
                    update({ dir: dir === "desc" ? "asc" : "desc" });
                  }}
                  className="flex h-6 w-9 items-center justify-center rounded-full border-2 border-ink/25 bg-parchment-dark/60 text-[11px] font-black text-ink transition active:scale-90"
                  aria-label={t("sort.dirToggle")}
                >
                  {dir === "desc" ? "↓" : "↑"}
                </button>
              )}
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {sortOptions.map((o) => (
                <button
                  key={o.key}
                  onClick={() => {
                    sfxTap();
                    update({ key: o.key });
                  }}
                  className={`rounded-full border-2 px-3 py-1 text-xs font-bold transition active:scale-95 ${
                    sortKey === o.key
                      ? "border-ink bg-ink text-parchment-light"
                      : "border-ink-soft/40 bg-parchment-light text-ink-soft"
                  }`}
                  style={
                    sortKey === "element" && o.key === "element"
                      ? { background: "linear-gradient(90deg,#d84a2f,#3d7fc1,#4e9a51,#b8a049,#9a6b3f)", border: "2px solid transparent", color: "#fff" }
                      : undefined
                  }
                >
                  {o.label}
                </button>
              ))}
            </div>

            {/* 篩選：屬性（可與稀有度並用） */}
            <p className="mb-1.5 text-xs font-black text-ink">{t("sort.filterElement")}</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <button
                onClick={() => {
                  sfxTap();
                  update({ elementFilter: "all" });
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
                    update({ elementFilter: elementFilter === el ? "all" : el });
                  }}
                  className={`rounded-full border-2 px-3 py-1 text-xs font-bold transition active:scale-95 ${
                    elementFilter === el ? "border-ink" : "border-ink-soft/40 bg-parchment-light text-ink-soft"
                  }`}
                  style={elementFilter === el ? { backgroundColor: ELEMENT_INFO[el].color, borderColor: ELEMENT_INFO[el].color, color: "#fff" } : undefined}
                >
                  {ELEMENT_INFO[el].name[locale]}
                </button>
              ))}
            </div>

            {/* 篩選：稀有度（可與屬性並用） */}
            <p className="mb-1.5 text-xs font-black text-ink">{t("sort.filterRarity")}</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => {
                  sfxTap();
                  update({ rarityFilter: "all" });
                }}
                className={`rounded-full border-2 px-3 py-1 text-xs font-bold transition active:scale-95 ${
                  rarityFilter === "all"
                    ? "border-ink bg-ink text-parchment-light"
                    : "border-ink-soft/40 bg-parchment-light text-ink-soft"
                }`}
              >
                {navT("dex.all")}
              </button>
              {(["basic", "common", "rare", "epic", "legendary"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    sfxTap();
                    update({ rarityFilter: rarityFilter === r ? "all" : r });
                  }}
                  className={`rounded-full border-2 px-3 py-1 text-xs font-bold transition active:scale-95 ${
                    rarityFilter === r
                      ? "border-ink bg-ink text-parchment-light"
                      : "border-ink-soft/40 bg-parchment-light text-ink-soft"
                  }`}
                >
                  {navT(`rarity.${r}`)}
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
          <div className={`grid grid-cols-3 gap-3 ${loaded ? "" : "invisible"}`}>
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
