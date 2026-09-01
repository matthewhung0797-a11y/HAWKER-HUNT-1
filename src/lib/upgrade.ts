// 升級素材 → 經驗值映射（佔位版：素材數值資料之後再補充）。
// 唔 import store（避免循環依賴）：純函數，store.feedSpirit 同升級頁共用。

/** 每種素材提供的精靈經驗（素材資料補充前：預設值） */
export const DEFAULT_MATERIAL_EXP = 20;

/** 特定素材覆寫（日後補充：在此加 itemId → exp） */
export const MATERIAL_EXP: Record<string, number> = {};

/** 筷子類唔係升級素材 */
export function isUpgradeMaterial(itemId: string): boolean {
  return !itemId.includes("chopstick");
}

/** 查素材經驗值 */
export function materialExp(itemId: string): number {
  return MATERIAL_EXP[itemId] ?? DEFAULT_MATERIAL_EXP;
}

/** 一批素材嘅總經驗 */
export function totalExp(items: Record<string, number>): number {
  return Object.entries(items).reduce((sum, [id, qty]) => sum + materialExp(id) * qty, 0);
}
