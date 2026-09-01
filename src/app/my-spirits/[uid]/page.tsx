"use client";

import { use, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { SPECIES_MAP } from "@/content/species";
import { ELEMENT_INFO } from "@/content/elements";
import {
  useGameStore,
  spiritExpToNext,
  spiritStatMultiplier,
  SPIRIT_LEVEL_CAP,
} from "@/lib/store";
import { hasWebGL2 } from "@/lib/webgl";
import BottomNav from "@/components/BottomNav";
import SpiritIcon from "@/components/SpiritIcon";
import SpiritModel from "@/components/three/SpiritModel";

/** 我的精靈詳情：3D 檢視＋等級/經驗＋能力值（按等級加成）＋稀有度/屬性 */
export default function MySpiritDetailPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = use(params);
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const ownedSpirits = useGameStore((s) => s.ownedSpirits);
  const canEvolve = useGameStore((s) => s.canEvolve);
  const webglOk = hasWebGL2();

  const spirit = ownedSpirits.find((sp) => sp.uid === uid);
  const species = spirit ? SPECIES_MAP[spirit.speciesId] : undefined;
  // 呢隻實體可唔可以進化（有 evolvesTo＋素材／打卡達標）
  const canEvolveThis = spirit ? Boolean(species?.evolvesTo) && canEvolve(spirit.speciesId) : false;

  // 能力值（按等級倍率）
  const stats = useMemo(() => {
    if (!species || !spirit) return null;
    const mul = spiritStatMultiplier(spirit.level);
    return {
      hp: Math.round(species.baseStats.hp * mul),
      attack: Math.round(species.baseStats.attack * mul),
      defense: Math.round(species.baseStats.defense * mul),
      speed: Math.round(species.baseStats.speed * mul),
    };
  }, [species, spirit]);

  const notFound = !spirit || !species;

  return (
    <main className="paper-texture flex min-h-dvh shrink-0 flex-col pb-[calc(70px_+_env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between px-4 pt-5">
        <button
          onClick={() => router.push("/my-spirits")}
          className="flex h-10 w-10 items-center justify-center rounded-full card-parchment"
          aria-label={t("common.back")}
        >
          ←
        </button>
        <h1 className="text-lg font-black text-ink">
          {notFound ? t("dex.unknown") : species!.name[locale]}
        </h1>
        <div className="w-10" />
      </header>

      {notFound ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
          <SpiritIcon speciesId="chilli-baby" size={80} silhouette />
          <p className="text-sm text-ink-soft">{t("dex.evolvedAwayDesc")}</p>
        </div>
      ) : (
        <>
          {/* 3D 檢視（同圖鑑同款相機/燈光；冇 GLB／WebGL 退 2D 立繪） */}
          <div className="relative mx-auto h-72 w-full max-w-md">
            {species!.modelUrl && webglOk ? (
              <>
                <Canvas camera={{ fov: 50, position: [0, 0.3, 0.85] }} gl={{ alpha: true }}>
                  <ambientLight intensity={1.2} />
                  <directionalLight position={[2, 4, 2]} intensity={1.3} />
                  <group position={[0, -0.28, 0]}>
                    <SpiritModel
                      speciesId={species!.id}
                      shiny={spirit!.shiny}
                      faceCamera={
                        species!.id === "chilli-baby"
                          ? 0
                          : species!.id === "nasi-lemak-tot"
                            ? Math.PI / 2
                            : species!.id === "nasi-lemak-scout"
                              ? 0
                              : true
                      }
                    />
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
                  src={`/spirits/full/${species!.id}.webp`}
                  alt={species!.name[locale]}
                  className="float-bob h-64 w-auto drop-shadow-[0_14px_16px_rgba(74,44,20,0.35)]"
                  style={{ filter: "brightness(1.5)" }}
                  draggable={false}
                  decoding="async"
                />
              </div>
            )}
          </div>

          <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-4">
            {/* 升級／進化（並列喺 3D 檢視下面） */}
            <div className="flex items-stretch gap-2">
              <Link
                href={`/upgrade/${spirit!.uid}`}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-pandan/80 bg-pandan py-3 text-sm font-black text-white shadow-[0_2px_8px_rgba(78,154,81,0.45)] transition active:scale-95"
              >
                ⬆ {t("profile.upgrade")}
              </Link>
              {canEvolveThis ? (
                <Link
                  href={`/evolve/${spirit!.uid}`}
                  className="btn-gold flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-black transition active:scale-95"
                >
                  ✨ {t("dex.evolve")}
                </Link>
              ) : (
                <div className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-ink/10 bg-parchment-dark/30 py-3 text-sm font-black text-ink-soft/50">
                  ✨ {t("dex.evolve")}
                </div>
              )}
            </div>

            {/* 稀有度／屬性／閃光 */}
            <div className="flex items-center justify-center gap-2">
              <span className="rounded-full bg-gold px-4 py-1.5 text-xs font-black text-ink min-w-[60px] text-center">
                {t(`rarity.${species!.rarity}`)}
              </span>
              <span
                className="rounded-full px-4 py-1.5 text-xs font-black text-white min-w-[60px] text-center"
                style={{ backgroundColor: ELEMENT_INFO[species!.element].color }}
              >
                {t(`elements.${species!.element}`)}
              </span>
              {spirit!.shiny && (
                <span className="shiny-badge rounded-full px-3 py-1.5 text-xs font-black text-ink">
                  ✦ {t("capture.shiny")}
                </span>
              )}
            </div>

            {/* 等級＋經驗 */}
            <section className="card-parchment mx-auto w-full max-w-sm p-3">
              <div className="mb-1.5 flex items-center justify-between text-sm font-black text-ink">
                <span>
                  {t("dex.level")} Lv.{spirit!.level}
                  {spirit!.level >= SPIRIT_LEVEL_CAP ? ` (${t("dex.levelMax")})` : ""}
                </span>
                <span className="text-xs font-bold text-ink-soft">
                  {spirit!.level >= SPIRIT_LEVEL_CAP
                    ? "MAX"
                    : `${spirit!.exp ?? 0}/${spiritExpToNext(spirit!.level)}`}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-parchment-dark">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light"
                  style={{
                    width: `${
                      spirit!.level >= SPIRIT_LEVEL_CAP
                        ? 100
                        : Math.min(
                            100,
                            ((spirit!.exp ?? 0) / spiritExpToNext(spirit!.level)) * 100
                          )
                    }%`,
                  }}
                            />
                        </div>
                      </section>

                      {/* 能力值（含等級加成） */}
            <section className="card-parchment p-4">
              <h2 className="mb-2 text-sm font-black text-ink">{t("dex.stats")}</h2>
              <div className="grid grid-cols-4 gap-2">
                {stats &&
                  (
                    [
                      ["hp", stats.hp],
                      ["attack", stats.attack],
                      ["defense", stats.defense],
                      ["speed", stats.speed],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-parchment-dark/60 py-1.5">
                      <div className="font-black text-ink">{v}</div>
                      <div className="text-[10px] text-ink-soft">{t(`dex.${k}`)}</div>
                    </div>
                  ))}
              </div>
            </section>
          </div>
        </>
      )}

      <BottomNav />
    </main>
  );
}
