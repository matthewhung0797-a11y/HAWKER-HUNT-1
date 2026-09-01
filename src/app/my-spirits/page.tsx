"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { SPECIES_MAP } from "@/content/species";
import { useGameStore } from "@/lib/store";
import BottomNav from "@/components/BottomNav";
import DexGridCell from "@/components/DexGridCell";
import SpiritIcon from "@/components/SpiritIcon";

/** 我的精靈：玩家擁有的每一隻實體（非按種類去重），卡上帶等級，點入睇詳情 */
export default function MySpiritsPage() {
  const t = useTranslations("mySpirits");
  const navT = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const ownedSpirits = useGameStore((s) => s.ownedSpirits);

  // 新捉排先
  const sorted = useMemo(
    () => [...ownedSpirits].sort((a, b) => b.caughtAt - a.caughtAt),
    [ownedSpirits]
  );

  return (
    <main className="paper-texture flex min-h-dvh shrink-0 flex-col pb-[calc(70px_+_env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 bg-parchment-light/95 px-4 pb-2 pt-5 shadow-sm backdrop-blur">
        <h1 className="game-title-sm text-center text-xl font-black text-ink">{t("title")}</h1>
        <p className="mt-0.5 text-center text-xs font-bold text-ink-soft">
          {t("count", { count: sorted.length })}
        </p>
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
                      {spirit.shiny && (
                        <span className="shiny-badge absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-ink">
                          ✦
                        </span>
                      )}
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
