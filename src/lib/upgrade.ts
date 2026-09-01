// 升級素材 → 經驗值映射。
// 唔 import store（避免循環依賴）：純函數，store.feedSpirit 同升級頁共用。

/** 升級素材體系（三級）：
 *  美味精華（初級 100 EXP）／盛宴心髓（中級 300 EXP）／美食之魂（高級 500 EXP） */
export const UPGRADE_MATERIALS = ["delicious-essence", "feast-nectar", "soul-of-culinary"] as const;
export type UpgradeMaterialId = (typeof UPGRADE_MATERIALS)[number];

/** 素材經驗值（品質定檔） */
export const MATERIAL_EXP: Record<string, number> = {
  "delicious-essence": 100, // 初級：美味精華
  "feast-nectar": 300, // 中級：盛宴心髓
  "soul-of-culinary": 500, // 高級／頂級：美食之魂
};

/** 品質排序（升級頁顯示順序：低 → 高） */
export const MATERIAL_SORT: Record<string, number> = {
  "delicious-essence": 1,
  "feast-nectar": 2,
  "soul-of-culinary": 3,
};

/** 是否升級素材（筷子／進化材料都唔係） */
export function isUpgradeMaterial(itemId: string): boolean {
  return (UPGRADE_MATERIALS as readonly string[]).includes(itemId);
}

/** 查素材經驗值（非素材回 0） */
export function materialExp(itemId: string): number {
  return MATERIAL_EXP[itemId] ?? 0;
}

/** 一批素材嘅總經驗 */
export function totalExp(items: Record<string, number>): number {
  return Object.entries(items).reduce((sum, [id, qty]) => sum + materialExp(id) * qty, 0);
}
