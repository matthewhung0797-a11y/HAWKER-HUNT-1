/** 五行 Five Elements */
export type ElementType = "metal" | "wood" | "water" | "fire" | "earth";

/** 五味 Five Flavors */
export type FlavorType = "bitter" | "sour" | "salty" | "spicy" | "sweet";

/** 稀有度；basic = 原材料層（單階、最弱、隨處可見、出現率壓倒性） */
export type Rarity = "basic" | "common" | "rare" | "epic" | "legendary";

/** 進化階段 1=初級 2=中級 3=最終 */
export type Stage = 1 | 2 | 3;

export interface LocalizedText {
  en: string;
  zh: string;
}

export interface Skill {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  /** 傷害倍率（相對攻擊力），0 表示非攻擊技 */
  power: number;
  /** 回合冷卻 */
  cooldown: number;
  /** 治療隊伍百分比（0–1），可選 */
  healPercent?: number;
}

export interface EvolutionRequirement {
  /** 需要道具 id → 數量 */
  items: Record<string, number>;
  /** 需累積打卡的小販中心數量 */
  checkinCentres: number;
}

export interface Species {
  id: string;
  /** 所屬系列 id */
  seriesId: string;
  stage: Stage;
  name: LocalizedText;
  element: ElementType;
  flavor: FlavorType;
  rarity: Rarity;
  /** 食物原型 */
  foodOrigin: LocalizedText;
  description: LocalizedText;
  baseStats: { hp: number; attack: number; defense: number; speed: number };
  skills: Skill[];
  /** 進化到下一階段的條件；最終形態為 null */
  evolvesTo: string | null;
  evolutionRequirement: EvolutionRequirement | null;
  /** 3D 模型路徑（public/ 下），null = 使用程序化 placeholder */
  modelUrl: string | null;
  /** 模型目標高度（米），AR 場景用 */
  modelHeightM: number;
  /** GLB 內含骨骼動畫 clips（idle/walk/attack/skill/hit/down/victory） */
  animated?: boolean;
  /** 弱 rig（Tripo 簡骨架，clip 幅度細）：程序化動畫照跑，疊喺 clip 上補生命感 */
  rigLite?: boolean;
  /** 分動畫 GLB 路徑：key = anim name (idle/walk/attack/hit 等)，有則優先於 modelUrl */
  animUrls?: Record<string, string>;
  /** 模型正面朝向修正（弧度）：glTF 標準正面係 +Z，Tripo 出嘅模型朝 +X 要較 -90° */
  modelYaw?: number;
}

export interface SpeciesSeries {
  id: string;
  name: LocalizedText;
  element: ElementType;
  flavor: FlavorType;
  foodOrigin: LocalizedText;
}

export interface HawkerCentre {
  id: string;
  name: LocalizedText;
  district: LocalizedText;
  lat: number;
  lng: number;
  element: ElementType;
  /** 代表精靈（species id，必屬圖鑑名單） */
  featuredSpeciesId: string;
  /** 每日打卡上限 */
  dailyCheckinLimit: number;
  /** 據點今日可捕捉的精靈池（species ids） */
  spawnPool: string[];
}

export interface GameItem {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  /** 圖示 emoji（正式圖示到位前用） */
  icon: string;
}

export interface Faction {
  id: string;
  name: LocalizedText;
  element: ElementType;
  color: string;
}
