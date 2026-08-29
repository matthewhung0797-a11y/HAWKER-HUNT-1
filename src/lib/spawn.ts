import { SPECIES, SPECIES_MAP } from "@/content/species";
import { CENTRE_MAP } from "@/content/centres";

/**
 * 野生精靈加權生成：實現 PoGo 式稀有度分層。
 * - basic 原材料層 = 遇上機率最大：唔使入 spawnPool，全部據點自動可見
 * - common 一階 = 「隨處可見」層（權重高）
 * - 地頭加成：據點代表精靈同系列 ×2（去雞飯聖地多啲雞飯仔）
 * - 8% 機率野生出二階（S 級驚喜）；三階永遠唔會野生出現（進化／據點挑戰限定）
 * 圖鑑擴充後新精靈會自動被吸收（只讀 rarity／stage／seriesId，冇寫死名單）。
 */

/** 稀有度 → 出現權重 */
export const RARITY_WEIGHT: Record<string, number> = {
  basic: 180,
  common: 100,
  rare: 25,
  epic: 6,
  legendary: 2,
};

/** 地頭系列權重倍率 */
export const HOME_SERIES_MULT = 2;

/** 野生二階出現率 */
export const WILD_STAGE2_RATE = 0.08;

/** 野生等級：一階 1–5、二階 8–15（三階唔野生） */
export function rollWildLevel(
  sp: { stage: number },
  rng: () => number = Math.random
): number {
  if (sp.stage >= 2) return 8 + Math.floor(rng() * 8); // 8–15
  return 1 + Math.floor(rng() * 5); // 1–5
}

/** 加權抽選（weights 同 list 等長） */
function weightedPick<T>(list: T[], weights: number[], rng: () => number): T {
  let total = 0;
  for (const w of weights) total += w;
  let roll = rng() * total;
  for (let i = 0; i < list.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return list[i];
  }
  return list[list.length - 1];
}

/**
 * 揀一隻野生精靈 species id。
 * @param centreId 據點 id（null = 冇指定，用全圖鑑一階池）
 * @param rng 注入隨機源（測試用；預設 Math.random）
 */
export function pickWildSpecies(centreId: string | null, rng: () => number = Math.random): string {
  const centre = centreId ? CENTRE_MAP[centreId] : null;

  // 基礎一階池：據點 spawnPool（過濾非法 id），冇據點就全圖鑑一階
  const poolIds = (centre?.spawnPool ?? []).filter((id) => SPECIES_MAP[id]);
  const centrePool = poolIds.length
    ? poolIds.map((id) => SPECIES_MAP[id]).filter((sp) => sp.stage === 1)
    : SPECIES.filter((sp) => sp.stage === 1);
  // basic 原材料層隨處可見：無論邊個據點都自動併入池（去重）
  const inPool = new Set(centrePool.map((sp) => sp.id));
  const basicPool = SPECIES.filter(
    (sp) => sp.rarity === "basic" && sp.stage === 1 && !inPool.has(sp.id)
  );
  const stage1Pool = [...centrePool, ...basicPool];

  // 地頭系列（據點代表精靈所屬系列）
  const homeSeries = centre ? SPECIES_MAP[centre.featuredSpeciesId]?.seriesId : undefined;

  // 8% 野生二階：由基礎池嘅系列升一級抽（保持據點主題），冇對應二階就退返一階
  if (rng() < WILD_STAGE2_RATE) {
    const seriesSet = new Set(stage1Pool.map((sp) => sp.seriesId));
    const stage2Pool = SPECIES.filter((sp) => sp.stage === 2 && seriesSet.has(sp.seriesId));
    if (stage2Pool.length) {
      const weights = stage2Pool.map(
        (sp) => (RARITY_WEIGHT[sp.rarity] ?? 10) * (sp.seriesId === homeSeries ? HOME_SERIES_MULT : 1)
      );
      return weightedPick(stage2Pool, weights, rng).id;
    }
  }

  const weights = stage1Pool.map(
    (sp) => (RARITY_WEIGHT[sp.rarity] ?? 10) * (sp.seriesId === homeSeries ? HOME_SERIES_MULT : 1)
  );
  return weightedPick(stage1Pool, weights, rng).id;
}

// 開發環境掛上 window，俾 Playwright 分佈統計診斷直接抽樣（production 唔會有）
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  const w = window as unknown as Record<string, unknown>;
  w.__pickWildSpecies = pickWildSpecies;
  w.__rollWildLevel = rollWildLevel;
  w.__SPECIES_MAP = SPECIES_MAP;
}
