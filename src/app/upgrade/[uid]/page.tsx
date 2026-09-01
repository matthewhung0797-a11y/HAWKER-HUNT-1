"use client";

// 精靈升級頁：選素材 → 換經驗 → 升級。
// 素材經驗值資料後補（lib/upgrade.ts 佔位：每件預設 20 EXP）。

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense } from "react";
import { SPECIES_MAP } from "@/content/species";
import { ITEMS, ITEM_MAP } from "@/content/items";
import { useGameStore, spiritExpToNext, spiritStatMultiplier, SPIRIT_LEVEL_CAP } from "@/lib/store";
import { isUpgradeMaterial, materialExp, totalExp, MATERIAL_SORT } from "@/lib/upgrade";
import { hasWebGL2 } from "@/lib/webgl";
import SpiritModel from "@/components/three/SpiritModel";
import ElementBadge from "@/components/ElementBadge";
import UIIcon from "@/components/UIIcon";
import { sfxTap, sfxReward } from "@/lib/sfx";

/** 預覽：加 exp 後會去到邊個等級／剩幾多經驗（純計算唔動 store） */
function previewLevel(level: number, exp: number, gain: number): { level: number; exp: number } {
  let lv = level;
  let e = exp + gain;
  while (lv < SPIRIT_LEVEL_CAP && e >= spiritExpToNext(lv)) {
    e -= spiritExpToNext(lv);
    lv += 1;
  }
  if (lv >= SPIRIT_LEVEL_CAP) e = 0;
  return { level: lv, exp: e };
}

export default function UpgradePage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = use(params);
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const router = useRouter();
  const store = useGameStore();
  const webglOk = hasWebGL2();

  // 已選素材（itemId → 數量）
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [justLeveled, setJustLeveled] = useState<number | null>(null);

  const spirit = store.ownedSpirits.find((s) => s.uid === uid);
  const species = spirit ? SPECIES_MAP[spirit.speciesId] : undefined;

  const materials = useMemo(
    () =>
      ITEMS.filter((it) => isUpgradeMaterial(it.id))
        .sort((a, b) => (MATERIAL_SORT[a.id] ?? 9) - (MATERIAL_SORT[b.id] ?? 9))
        .map((it) => ({
          ...it,
          have: store.items[it.id] ?? 0,
        })),
    [store.items]
  );

  const gain = totalExp(selected);
  const atCap = spirit ? spirit.level >= SPIRIT_LEVEL_CAP : false;
  const next =
    spirit && !atCap
      ? previewLevel(spirit.level, spirit.exp ?? 0, gain)
      : { level: spirit?.level ?? 1, exp: spirit?.exp ?? 0 };

  if (!spirit || !species) {
    return (
      <main className="paper-texture flex min-h-dvh items-center justify-center">
        <button onClick={() => router.push("/profile")} className="btn-gold px-6 py-3 font-bold">
          {t("common.back")}
        </button>
      </main>
    );
  }

  const curExp = spirit.exp ?? 0;
  const need = spiritExpToNext(spirit.level);
  const nextNeed = spirit.level < SPIRIT_LEVEL_CAP ? spiritExpToNext(next.level) : 1;

  function add(itemId: string, d: number) {
    sfxTap();
    setSelected((sel) => {
      const cur = sel[itemId] ?? 0;
      const have = store.items[itemId] ?? 0;
      const nv = Math.max(0, Math.min(have, cur + d));
      const out = { ...sel };
      if (nv <= 0) delete out[itemId];
      else out[itemId] = nv;
      return out;
    });
  }

  function doUpgrade() {
    if (atCap || gain <= 0) return;
    const res = store.feedSpirit(uid, selected);
    if (res) {
      sfxReward();
      setJustLeveled(res.newLevel);
      setTimeout(() => setJustLeveled(null), 2200);
    }
    setSelected({});
  }

  return (
    <main className="paper-texture flex min-h-dvh shrink-0 flex-col pb-[calc(70px_+_env(safe-area-inset-bottom))]">
      <header className="flex items-center justify-between px-4 pt-5">
        <button
          onClick={() => router.push("/profile")}
          className="flex h-10 w-10 items-center justify-center rounded-full card-parchment"
          aria-label={t("common.back")}
        >
          ←
        </button>
        <h1 className="text-lg font-black text-ink">
          {species.name[locale]}{" "}
          <span className="text-sm font-bold text-ink-soft">Lv.{spirit.level}</span>
        </h1>
        <div className="w-10" />
      </header>

      {/* 主視覺：3D（同圖鑑角度）＋升級光效 */}
      <div className="relative mx-auto h-64 w-full max-w-md">
        {webglOk && species.modelUrl ? (
          <Canvas camera={{ fov: 50, position: [0, 0.3, 0.85] }} gl={{ alpha: true }}>
            <ambientLight intensity={1.2} />
            <directionalLight position={[2, 4, 2]} intensity={1.3} />
            <group position={[0, -0.28, 0]}>
              <SpiritModel
                speciesId={species.id}
                shiny={spirit.shiny}
                faceCamera={species.id === "chilli-baby" || species.id === "nasi-lemak-scout" ? 0 : species.id === "nasi-lemak-tot" ? Math.PI / 2 : true}
              />
            </group>
            <OrbitControls enablePan={false} enableZoom={true} minDistance={0.5} maxDistance={2.5} />
          </Canvas>
        ) : (
          <div className="flex h-full items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/spirits/full/${species.id}.webp`}
              alt=""
              className="h-44 w-auto object-contain"
              draggable={false}
            />
          </div>
        )}
        {justLeveled !== null && (
          <div className="pointer-events-none absolute inset-x-0 top-2 text-center">
            <span
              className="inline-block rounded-full bg-gold px-4 py-1.5 text-sm font-black text-ink shadow-lg"
              style={{ animation: "ev-reveal-pop 0.7s cubic-bezier(0.34,1.56,0.64,1) both" }}
            >
              ⬆ {t("upgrade.leveledTo", { level: justLeveled })}
            </span>
          </div>
        )}
      </div>

      {/* 經驗／等級 */}
      <section className="card-parchment mx-4 mt-2 p-4">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-black text-ink">
            Lv.{spirit.level}
            <span className="text-ink-soft"> → </span>
            <span className={next.level > spirit.level ? "text-pandan font-black" : "text-ink-soft"}>
              Lv.{next.level}
            </span>
          </span>
          <ElementBadge element={species.element} size="sm" />
        </div>
        <div className="relative h-3.5 overflow-hidden rounded-full border border-ink/20 bg-parchment-dark">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold to-gold-light transition-all"
            style={{
              width: `${atCap ? 100 : Math.min(100, (curExp / need) * 100)}%`,
            }}
          />
          {gain > 0 && !atCap && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-pandan/40 transition-all"
              style={{ width: `${Math.min(100, ((curExp + Math.min(gain, need - curExp)) / need) * 100)}%` }}
            />
          )}
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] font-bold text-ink-soft">
          <span>
            {atCap ? t("dex.levelMax") : `${curExp}/${need} EXP`}
          </span>
          {gain > 0 && !atCap && (
            <span className="text-pandan">
              +{gain} EXP → {next.exp}/{nextNeed}
            </span>
          )}
        </div>
      </section>

      {/* 素材選擇 */}
      <section className="card-parchment mx-4 mt-3 flex-1 p-4">
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink">
          <UIIcon name="backpack" size={16} /> {t("upgrade.selectMaterials")}
        </h2>
        {atCap ? (
          <p className="py-6 text-center text-sm font-bold text-ink-soft">{t("dex.levelMax")}</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {materials.map((m) => {
              const sel = selected[m.id] ?? 0;
              const tier = MATERIAL_SORT[m.id] ?? 9;
              // 品質邊框：初級＝青銅、中級＝銀藍、高級＝金紫
              const tierBorder =
                tier === 1 ? "border-[#b87333]" : tier === 2 ? "border-[#5b8db8]" : "border-[#c9a227]";
              const tierGlow =
                tier === 3
                  ? "shadow-[0_0_10px_rgba(201,162,39,0.5)]"
                  : tier === 2
                    ? "shadow-[0_0_8px_rgba(91,141,184,0.35)]"
                    : "";
              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 rounded-xl border-2 ${tierBorder} ${tierGlow} bg-parchment-dark/40 p-3 transition ${
                    sel > 0 ? "ring-2 ring-gold bg-gold/10" : ""
                  } ${m.have === 0 ? "opacity-50" : ""}`}
                >
                  <span className="relative shrink-0">
                    <UIIcon name={m.icon} size={44} />
                    {sel > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-chilli px-1 text-[10px] font-black text-white">
                        {sel}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-black text-ink">{m.name[locale]}</span>
                      <span
                        className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-black text-white"
                        style={{
                          backgroundColor:
                            tier === 1 ? "#b87333" : tier === 2 ? "#5b8db8" : "#c9a227",
                        }}
                      >
                        {tier === 1 ? "LV1" : tier === 2 ? "LV2" : "LV3"}
                      </span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-ink-soft">
                      {m.description[locale]}
                    </div>
                    <div className="mt-0.5 text-[10px] font-bold text-gold">
                      {t("upgrade.materialExp", { exp: materialExp(m.id) })} · 🎒 ×{m.have}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => add(m.id, -1)}
                      disabled={sel <= 0}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-parchment-dark text-sm font-black text-ink disabled:opacity-30"
                      aria-label="minus"
                    >
                      −
                    </button>
                    <span className="w-5 text-center text-sm font-black text-ink">{sel}</span>
                    <button
                      onClick={() => add(m.id, 1)}
                      disabled={sel >= m.have}
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-gold text-sm font-black text-ink disabled:opacity-30"
                      aria-label="plus"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 底部：升級確認 */}
      {!atCap && (
        <div className="sticky bottom-0 mx-4 mb-2 mt-3">
          <button
            onClick={doUpgrade}
            disabled={gain <= 0}
            className={`w-full rounded-xl py-3.5 text-lg font-black ${gain > 0 ? "bg-pandan text-white shadow-[0_0_18px_rgba(78,154,81,0.6)] active:scale-[0.98]" : "btn-outline opacity-50"}`}
          >
            {gain > 0 ? t("upgrade.feed", { exp: gain }) : t("upgrade.selectFirst")}
          </button>
        </div>
      )}
    </main>
  );
}
