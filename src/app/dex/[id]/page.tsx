"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { SPECIES, SPECIES_MAP } from "@/content/species";
import { ELEMENT_INFO } from "@/content/elements";
import { ITEM_MAP } from "@/content/items";
import { useGameStore, spiritExpToNext, SPIRIT_LEVEL_CAP } from "@/lib/store";
import { sfxTap } from "@/lib/sfx";
import { hasWebGL2 } from "@/lib/webgl";
import BottomNav from "@/components/BottomNav";
import SpiritIcon from "@/components/SpiritIcon";
import SpiritModel from "@/components/three/SpiritModel";
import UIIcon from "@/components/UIIcon";
import { SelfiePhoto } from "@/components/SelfiePhoto";

export default function DexDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const store = useGameStore();
  const [selfieOpen, setSelfieOpen] = useState(false);
  /** 詳情預設 2D full；用戶先開 3D／360（唔一入就載 GLB） */
  const webglOk = hasWebGL2();

  const species = SPECIES_MAP[id];
  const caught = !!store.captureCounts[id];

  // 進化鏈（同系列 3 階段）
  const chain = useMemo(
    () =>
      species
        ? SPECIES.filter((s) => s.seriesId === species.seriesId).sort((a, b) => a.stage - b.stage)
        : [],
    [species]
  );

  if (!species) {
    return (
      <main className="paper-texture flex min-h-dvh items-center justify-center">
        <Link href="/dex" className="btn-gold px-6 py-3 font-bold">
          {t("common.back")}
        </Link>
      </main>
    );
  }

  // 有閃光就優先展示閃光嗰隻
  const ownedInstance =
    store.ownedSpirits.find((sp) => sp.speciesId === id && sp.shiny) ??
    store.ownedSpirits.find((sp) => sp.speciesId === id);
  const isShiny = Boolean(ownedInstance?.shiny);
  const req = species.evolutionRequirement;
  // 進化後 evolveSpirit 會覆蓋 speciesId，令 ownedSpirits 唔再有呢隻：
  // 圖鑑仲顯示（captureCounts 有），但已冇實體可切磋／進化
  const evolvedAway = caught && !ownedInstance;
  const evolvedForm = species.evolvesTo ? SPECIES_MAP[species.evolvesTo] : undefined;

  return (
    <main className="paper-texture flex min-h-dvh shrink-0 flex-col pb-[calc(70px_+_env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between px-4 pt-5">
        <button
          onClick={() => router.push("/dex")}
          className="flex h-10 w-10 items-center justify-center rounded-full card-parchment"
          aria-label={t("common.back")}
        >
          ←
        </button>
        <h1 className="text-lg font-black text-ink">
          {caught ? species.name[locale] : t("dex.unknown")}
        </h1>
        <div className="w-10" />
      </header>

      {/* 主視覺：3D 模型放大置中 */}
      <div className="relative mx-auto h-72 w-full max-w-md">
        {caught ? (
          species.modelUrl && webglOk ? (
            <>
              <Canvas camera={{ fov: 50, position: [0, 0.3, 0.85] }} gl={{ alpha: true }}>
                <ambientLight intensity={1.2} />
                <directionalLight position={[2, 4, 2]} intensity={1.3} />
                <group position={[0, -0.28, 0]}>
                  <SpiritModel speciesId={id} shiny={isShiny} faceCamera={id === "chilli-baby" ? 0 : id === "nasi-lemak-tot" ? Math.PI / 2 : id === "nasi-lemak-scout" ? 0 : true} />
                </group>
                <OrbitControls enablePan={false} enableZoom={true} minDistance={0.5} maxDistance={2.5} />
              </Canvas>
              <span className="pointer-events-none absolute bottom-2 left-3 text-xs text-ink-soft">
                🔄 360°
              </span>
            </>
          ) : (
            <div className="flex h-full items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/spirits/full/${id}.webp`}
                alt={species.name[locale]}
                className="float-bob h-64 w-auto drop-shadow-[0_14px_16px_rgba(74,44,20,0.35)]"
                style={{ filter: "brightness(1.5)" }}
                draggable={false}
                decoding="async"
              />
            </div>
          )
        ) : (
          <div className="flex h-full items-center justify-center">
            <SpiritIcon speciesId={id} size={160} silhouette />
          </div>
        )}
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4">
        {/* 標籤：統一大小 */}
        <div className="flex items-center justify-center gap-2">
          <span className="rounded-full bg-gold px-4 py-1.5 text-xs font-black text-ink min-w-[60px] text-center">
            {t(`rarity.${species.rarity}`)}
          </span>
          <span className="rounded-full px-4 py-1.5 text-xs font-black text-white min-w-[60px] text-center" style={{ backgroundColor: ELEMENT_INFO[species.element].color }}>
            {t(`elements.${species.element}`)}
          </span>
          {isShiny && (
            <span className="shiny-badge rounded-full px-3 py-1 text-xs font-black text-ink">
              ✦ {t("capture.shiny")}
            </span>
          )}
        </div>

        {caught && <p className="text-center text-sm text-ink-soft">{species.description[locale]}</p>}

        {/* 已擁有實體：等級＋經驗（切磋升級） */}
        {caught && ownedInstance && (
          <section className="card-parchment mx-auto w-full max-w-sm p-3">
            <div className="mb-1.5 flex items-center justify-between text-sm font-black text-ink">
              <span>
                {t("dex.level")} Lv.{ownedInstance.level}
                {ownedInstance.level >= SPIRIT_LEVEL_CAP ? ` (${t("dex.levelMax")})` : ""}
              </span>
              <span className="text-xs font-bold text-ink-soft">
                {ownedInstance.level >= SPIRIT_LEVEL_CAP
                  ? "MAX"
                  : `${ownedInstance.exp ?? 0}/${spiritExpToNext(ownedInstance.level)}`}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-parchment-dark">
              <div
                className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light"
                style={{
                  width: `${
                    ownedInstance.level >= SPIRIT_LEVEL_CAP
                      ? 100
                      : Math.min(
                          100,
                          ((ownedInstance.exp ?? 0) / spiritExpToNext(ownedInstance.level)) * 100
                        )
                  }%`,
                }}
              />
            </div>
          </section>
        )}

        {/* 已進化走：冇實體，提示要再捉一隻 */}
        {evolvedAway && evolvedForm && (
          <section className="card-parchment flex flex-col items-center gap-2 p-4 text-center">
            <p className="text-sm font-black text-ink">
              {t("dex.evolvedAwayTitle", { name: evolvedForm.name[locale] })}
            </p>
            <p className="text-xs text-ink-soft">{t("dex.evolvedAwayDesc")}</p>
            <Link
              href={`/dex/${evolvedForm.id}`}
              onClick={() => sfxTap()}
              className="btn-gold mt-1 flex items-center gap-2 px-6 py-2.5 text-sm font-black"
            >
              <UIIcon name="sparkles" size={16} /> {t("dex.viewEvolvedForm", { name: evolvedForm.name[locale] })}
            </Link>
          </section>
        )}

        {/* 自拍：已擁有實體先得（切磋入口已隱藏） */}
        {caught && ownedInstance && (
          <div className="mx-auto flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => {
                sfxTap();
                setSelfieOpen(true);
              }}
              data-testid="dex-selfie-open"
              className="btn-outline flex items-center gap-1.5 px-6 py-3 text-sm font-bold"
            >
              <UIIcon name="camera" size={18} /> {t("capture.photoMode")}
            </button>
          </div>
        )}

        {/* 進化鏈 */}
        <section className="card-parchment p-4">
          <h2 className="mb-2 text-sm font-black text-ink">{t("dex.evolutionChain")}</h2>
          <div className="flex items-center justify-between">
            {chain.map((s, i) => {
              const sCaught = !!store.captureCounts[s.id];
              const isCurrent = s.id === id;
              return (
                <div key={s.id} className="flex items-center">
                  <Link
                    href={`/dex/${s.id}`}
                    className={`flex flex-col items-center gap-1 rounded-xl p-1.5 ${
                      isCurrent ? "bg-gold/25 ring-2 ring-gold" : ""
                    }`}
                  >
                    <SpiritIcon speciesId={s.id} size={52} silhouette={!sCaught} />
                    <span className="text-[10px] font-bold text-ink-soft">
                      {sCaught ? s.name[locale] : t("dex.unknown")}
                    </span>
                  </Link>
                  {i < chain.length - 1 && <span className="px-1 text-gold">➜</span>}
                </div>
              );
            })}
          </div>
        </section>

        {/* 進化條件 */}
        {req && species.evolvesTo && (
          <section className="card-parchment p-4">
            <h2 className="mb-2 text-sm font-black text-ink">{t("dex.evolutionRequirement")}</h2>
            <ul className="space-y-1 text-sm text-ink">
              {Object.entries(req.items).map(([itemId, qty]) => {
                const have = store.items[itemId] ?? 0;
                const ok = have >= qty;
                return (
                  <li key={itemId} className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <UIIcon name={ITEM_MAP[itemId].icon} size={16} />
                      {t("dex.collectItems", { count: qty, item: ITEM_MAP[itemId].name[locale] })}
                    </span>
                    <span className={ok ? "font-bold text-pandan" : "text-ink-soft"}>
                      {have}/{qty} {ok && "✔"}
                    </span>
                  </li>
                );
              })}
              <li className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <UIIcon name="lantern" size={16} /> {t("dex.checkinCentres", { count: req.checkinCentres })}
                </span>
                <span
                  className={
                    store.distinctCentresCheckedIn() >= req.checkinCentres
                      ? "font-bold text-pandan"
                      : "text-ink-soft"
                  }
                >
                  {store.distinctCentresCheckedIn()}/{req.checkinCentres}{" "}
                  {store.distinctCentresCheckedIn() >= req.checkinCentres && "✔"}
                </span>
              </li>
            </ul>
            {/* 進化入口已移到「我」頁的我的精靈卡（升級旁邊）；呢度只顯示條件 */}
          </section>
        )}

        {/* 技能區已隱藏 */}

        {/* 能力值 + 捕獲資訊 */}
        {caught && (
          <section className="card-parchment p-4">
            <h2 className="mb-2 text-sm font-black text-ink">{t("dex.stats")}</h2>
            <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
              {(
                [
                  ["hp", species.baseStats.hp],
                  ["attack", species.baseStats.attack],
                  ["defense", species.baseStats.defense],
                  ["speed", species.baseStats.speed],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-lg bg-parchment-dark/60 py-1.5">
                  <div className="font-black text-ink">{v}</div>
                  <div className="text-[10px] text-ink-soft">{t(`dex.${k}`)}</div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {selfieOpen && (
        <SelfiePhoto speciesId={id} webglOk={webglOk} onClose={() => setSelfieOpen(false)} />
      )}

      <BottomNav />
    </main>
  );
}
