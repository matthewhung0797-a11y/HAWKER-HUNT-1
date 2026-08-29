import type { ElementType } from "./types";
import { HAWKER_CENTRES } from "./centres";
import { SPECIES_MAP } from "./species";

/**
 * 戰鬥場景氛圍配置：每個小販中心一套。
 * 調色以 public/battle-bg/<id>.webp 概念圖為準——
 * 3D 擂台地板、打光、光暈、特效 tint 同氛圍粒子全部由呢度注入，令精靈融入場景。
 */

/** 氛圍粒子原語 */
export type AmbiencePrimitive =
  | "steam" // 大片低透明度霧團緩緩升騰
  | "embers" // 細亮火星上飄＋橫向擺動
  | "bubbles" // 水泡慢升微擺
  | "sparkle" // 定點漂浮明滅閃粉
  | "rain" // 拉長雨絲高速落下
  | "ripple"; // 地面漣漪環間歇擴散

export interface AmbienceLayer {
  primitive: AmbiencePrimitive;
  count: number;
  colors: string[];
  /** 速度倍率（1 = 原語預設） */
  speed?: number;
  /** 尺寸倍率 */
  size?: number;
  /** 透明度上限（0–1） */
  opacity?: number;
  /** 下墜（預設向上嘅原語轉向，例如金塵灑落） */
  falling?: boolean;
  /** 出生範圍 x/z 乘數（全景大空間用，切磋擂台唔設） */
  spread?: number;
}

/** 全景場景「背景小劇場」：遠景 NPC 精靈遊走＋檔口食材拋鑊 */
export interface PanoLifeConfig {
  /** 遠景遊走 NPC（speciesId，用 /spirits/full 立繪） */
  npcs?: string[];
  /** 食材拋鑊點：items 係 /ui/<item>.webp 名，pos 係世界座標（y=地面）；
   *  z 控制喺 -4 至 -4.5（相片地面乾淨嗰段），唔好撞入相片檔口嘅視覺深度 */
  toss?: { items: string[]; pos: [number, number, number] }[];
}

export interface BattleBgConfig {
  id: string;
  element: ElementType;
  /** 背景圖（public/ 下） */
  image: string;
  /** 360° 全景天幕（equirect，寬幅）：3D 保底捕捉場景用嚟做 inside-sphere skybox；冇就退回平面天幕 */
  panorama?: string;
  /** 擂台地板色 */
  floorColor: string;
  /** 擂台圈線色/透明度（背景本身有擂台結構嘅場景調低啲） */
  ringColor: string;
  ringOpacity: number;
  /** 環境光色/強度 */
  ambientColor: string;
  ambientIntensity: number;
  /** 主平行光色/強度 */
  directionalColor: string;
  directionalIntensity: number;
  /** 點光（氛圍補光）色/強度 */
  pointColor: string;
  pointIntensity: number;
  /** 頂部光暈 CSS（燈籠層） */
  glowCss: string;
  /** 背景圖上暗化遮罩透明度（保 UI 對比度） */
  overlayOpacity: number;
  /** 特效色溫 tint（同元素色混合，令特效唔同場景都和諧） */
  fxTint: string;
  /** 場景氛圍粒子層（全程循環） */
  ambience: AmbienceLayer[];
  /** 全景點光閃爍幅度 0–1（火＝爐火猛烈跳動；水＝慢速脈動） */
  panoFlicker?: number;
  /** 全景天窗光柱（自然光場景先設） */
  panoShafts?: { color: string; count: number };
  /** 全景背景小劇場（NPC 遊走＋食材拋鑊） */
  panoLife?: PanoLifeConfig;
}

export const BATTLE_BGS: Record<string, BattleBgConfig> = {
  maxwell: {
    id: "maxwell",
    element: "earth",
    image: "/battle-bg/maxwell.webp",
    panorama: "/battle-bg/pano/maxwell.webp",
    floorColor: "#8a6a3f",
    ringColor: "#e8c860",
    ringOpacity: 0.7,
    ambientColor: "#ffe9c4",
    ambientIntensity: 1.0,
    directionalColor: "#ffdda0",
    directionalIntensity: 1.5,
    pointColor: "#e8963c",
    pointIntensity: 10,
    glowCss:
      "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255,214,140,.30), transparent), radial-gradient(ellipse 50% 30% at 15% 15%, rgba(232,150,60,.20), transparent)",
    overlayOpacity: 0.22,
    fxTint: "#ffd894",
    ambience: [
      // 蒸籠白煙由兩側升騰
      { primitive: "steam", count: 7, colors: ["#fff4e0", "#ffe9c8"], speed: 0.9, size: 1.1, opacity: 0.16 },
      // 晨光金塵漂浮
      { primitive: "sparkle", count: 18, colors: ["#ffd894", "#ffedb0", "#e8c860"], size: 0.8, opacity: 0.55 },
    ],
    panoFlicker: 0.12,
    panoShafts: { color: "#ffe9b8", count: 3 },
    panoLife: {
      npcs: ["garlic-guard", "riceball-baby"],
      toss: [
        { items: ["item-chicken", "item-garlic"], pos: [-2, 0, -4.2] },
        { items: ["item-garlic"], pos: [2.3, 0, -4.5] },
      ],
    },
  },
  "chinatown-complex": {
    id: "chinatown-complex",
    element: "water",
    image: "/battle-bg/chinatown-complex.webp",
    panorama: "/battle-bg/pano/chinatown-complex.webp",
    floorColor: "#2e4e5e",
    ringColor: "#7fd4e8",
    ringOpacity: 0.55,
    ambientColor: "#bfe3f2",
    ambientIntensity: 0.95,
    directionalColor: "#cfeaf6",
    directionalIntensity: 1.35,
    pointColor: "#4fb6d8",
    pointIntensity: 11,
    glowCss:
      "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(140,220,255,.26), transparent), radial-gradient(ellipse 50% 30% at 85% 12%, rgba(80,170,220,.18), transparent)",
    overlayOpacity: 0.26,
    fxTint: "#a8dcf0",
    ambience: [
      // 水泡由地面升起
      { primitive: "bubbles", count: 16, colors: ["#a8e6ff", "#cfeaf6", "#7fd4e8"], speed: 1, size: 1, opacity: 0.6 },
      // 藍霧漂移
      { primitive: "steam", count: 4, colors: ["#bfe3f2", "#8cc8e0"], speed: 0.6, size: 1.2, opacity: 0.1 },
      // 地面漣漪
      { primitive: "ripple", count: 2, colors: ["#7fd4e8"], speed: 0.8, opacity: 0.3 },
    ],
    panoFlicker: 0.2,
    panoLife: {
      npcs: ["chilli-crablet", "shrimp-hopper"],
      toss: [
        { items: ["item-shrimp", "item-can"], pos: [-2.2, 0, -4.5] },
        { items: ["item-shrimp"], pos: [2, 0, -4.2] },
      ],
    },
  },
  "old-airport-road": {
    id: "old-airport-road",
    element: "fire",
    image: "/battle-bg/old-airport-road.webp",
    panorama: "/battle-bg/pano/old-airport-road.webp",
    floorColor: "#6e3018",
    ringColor: "#ffb347",
    ringOpacity: 0.6,
    ambientColor: "#ffd2a8",
    ambientIntensity: 1.05,
    directionalColor: "#ff9e58",
    directionalIntensity: 1.55,
    pointColor: "#ff6a2a",
    pointIntensity: 13,
    glowCss:
      "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(255,150,60,.34), transparent), radial-gradient(ellipse 50% 30% at 20% 10%, rgba(216,74,47,.26), transparent)",
    overlayOpacity: 0.2,
    fxTint: "#ffb070",
    ambience: [
      // 火圈邊緣火星上飄
      { primitive: "embers", count: 22, colors: ["#ff9e3c", "#ffd94d", "#ff5a1a"], speed: 1.1, size: 1, opacity: 0.85 },
      // 鑊氣煙絲
      { primitive: "steam", count: 4, colors: ["#d8b8a0", "#c0a088"], speed: 1.1, size: 0.9, opacity: 0.1 },
    ],
    panoFlicker: 0.55,
    panoLife: {
      npcs: ["chilli-baby", "little-orh-luak"],
      toss: [
        { items: ["item-shrimp", "item-garlic"], pos: [-2, 0, -4] },
        { items: ["item-chicken"], pos: [2.2, 0, -4.5] },
      ],
    },
  },
  "tekka-centre": {
    id: "tekka-centre",
    element: "metal",
    image: "/battle-bg/tekka-centre.webp",
    panorama: "/battle-bg/pano/tekka-centre.webp",
    floorColor: "#7a5c28",
    ringColor: "#f2d478",
    ringOpacity: 0.7,
    ambientColor: "#ffe8b8",
    ambientIntensity: 1.0,
    directionalColor: "#ffd985",
    directionalIntensity: 1.45,
    pointColor: "#d8a12f",
    pointIntensity: 11,
    glowCss:
      "radial-gradient(ellipse 60% 45% at 50% 0%, rgba(255,220,130,.32), transparent), radial-gradient(ellipse 45% 30% at 82% 14%, rgba(200,150,60,.20), transparent)",
    overlayOpacity: 0.22,
    fxTint: "#ffe19c",
    ambience: [
      // 金粉閃爍（明滅）
      { primitive: "sparkle", count: 24, colors: ["#ffd700", "#fff2b0", "#f2d478"], size: 0.9, opacity: 0.8 },
      // 金塵由頂部光柱灑落
      { primitive: "embers", count: 12, colors: ["#ffe8a8", "#ffd985"], speed: 0.5, size: 0.7, opacity: 0.5, falling: true },
    ],
    panoFlicker: 0.18,
    panoShafts: { color: "#ffe9a0", count: 3 },
    panoLife: {
      npcs: ["kopi-bean", "curry-puffling"],
      toss: [
        { items: ["item-coconut", "item-garlic"], pos: [-2.2, 0, -4.4] },
        { items: ["item-coconut"], pos: [2, 0, -4] },
      ],
    },
  },
  "lau-pa-sat": {
    id: "lau-pa-sat",
    element: "wood",
    image: "/battle-bg/lau-pa-sat.webp",
    panorama: "/battle-bg/pano/lau-pa-sat.webp",
    floorColor: "#3c4450",
    ringColor: "#9fd8c8",
    ringOpacity: 0.35,
    ambientColor: "#c2d4e4",
    ambientIntensity: 0.9,
    directionalColor: "#bcd0e8",
    directionalIntensity: 1.25,
    pointColor: "#ff7a3c",
    pointIntensity: 13,
    glowCss:
      "radial-gradient(ellipse 70% 40% at 50% 0%, rgba(120,180,255,.20), transparent), radial-gradient(ellipse 45% 28% at 18% 14%, rgba(255,120,60,.24), transparent), radial-gradient(ellipse 45% 28% at 84% 14%, rgba(80,200,255,.18), transparent)",
    overlayOpacity: 0.24,
    fxTint: "#bde8d8",
    ambience: [
      // 雨絲
      { primitive: "rain", count: 26, colors: ["#bcd0e8", "#9fb8d0"], speed: 1, size: 1, opacity: 0.4 },
      // 沙嗲炭火火星
      { primitive: "embers", count: 12, colors: ["#ff9e58", "#ffb347", "#ff6a2a"], speed: 0.9, size: 0.85, opacity: 0.75 },
      // 炭爐煙霧漂移
      { primitive: "steam", count: 3, colors: ["#a8b0c0", "#8890a0"], speed: 0.8, size: 1.3, opacity: 0.12 },
    ],
    panoFlicker: 0.3,
    panoLife: {
      npcs: ["satay-skewerling", "vermicelli-sprite"],
      toss: [
        { items: ["item-chicken", "item-shrimp"], pos: [-2.1, 0, -4.3] },
        { items: ["item-coconut"], pos: [2.2, 0, -4.5] },
      ],
    },
  },
};

export const DEFAULT_BATTLE_BG = BATTLE_BGS["old-airport-road"];

/**
 * 精靈系列 → 地頭中心：每個中心嘅代表精靈（最終形態）所屬系列，
 * 成個系列（一至三階）都算嗰個中心嘅地頭。
 */
const SERIES_HOME_CENTRE: Record<string, string> = Object.fromEntries(
  HAWKER_CENTRES.map((c) => [SPECIES_MAP[c.featuredSpeciesId].seriesId, c.id])
);

/** 精靈嘅地頭中心 id（冇對應就 undefined） */
export function homeCentreOf(speciesId: string): string | undefined {
  const sp = SPECIES_MAP[speciesId];
  return sp ? SERIES_HOME_CENTRE[sp.seriesId] : undefined;
}

/** 揀背景：query centre 優先 → 敵方精靈地頭（你去人哋主場挑戰） → 隨機 */
export function pickBattleBg(centreParam: string | null, enemySpeciesId?: string): BattleBgConfig {
  if (centreParam && BATTLE_BGS[centreParam]) return BATTLE_BGS[centreParam];
  const home = enemySpeciesId ? homeCentreOf(enemySpeciesId) : undefined;
  if (home && BATTLE_BGS[home]) return BATTLE_BGS[home];
  const all = Object.values(BATTLE_BGS);
  return all[Math.floor(Math.random() * all.length)];
}
