import type { ElementType } from "./types";

/**
 * 技能特效配置：「原型 × 元素 × 專屬參數」三層。
 * 原型決定粒子行為同時間曲線，元素決定色系同物理，
 * 每技能再以 scale/count/colors 調出獨立視覺身份。
 */

/** 8 個動效原型 */
export type FxArchetype =
  | "projectile" // 投射物：光球由攻擊方飛向對手，命中爆發
  | "splash" // 潑濺波：扇形液體粒子潑向對手
  | "slash" // 斬擊弧：對手身上快速劃出光弧
  | "barrage" // 天降彈幕：對手頭頂落下多粒彈體
  | "breath" // 噴吐錐：由攻擊方向對手噴出粒子錐
  | "smash" // 重擊震地：重物砸落＋地面塵爆
  | "heal" // 治療光環：施術者身上升起光粒
  | "shield"; // 護盾氣場：粒子環繞施術者迴旋

/**
 * 美食粒子形狀：招式主體用「真食物」貼圖（Canvas 程序化繪製），
 * 本地人一眼認得——推廣 hawker 文化嘅核心視覺語言。
 * "glow" = 傳統光點（維持治療／氣場類技能）。
 */
export type FoodParticleKind =
  | "glow"
  | "grain" // 米粒
  | "noodle" // 粗麵條
  | "chilli" // 辣椒
  | "garlic" // 蒜頭
  | "bone" // 排骨
  | "youtiao" // 油條
  | "leaf" // 斑蘭葉
  | "kueh" // 九層糕
  | "droplet" // 醬滴（可 tint）
  | "egg" // 半熟蛋
  | "toast" // 咖椰吐司
  | "claypot" // 砂鍋
  | "coconut" // 椰絲（可 tint）
  | "pepper" // 胡椒粒
  | "mantou" // 炸饅頭
  | "skewer" // 沙嗲串
  | "bean" // 咖啡豆
  | "radish" // 菜頭粿粒
  | "fruit" // 菠蘿角
  | "peanut" // 花生碎
  | "oyster" // 蠔仔
  | "puff" // 酥皮角
  | "prata" // 煎餅圓盤
  | "jelly" // 斑蘭綠蕊條
  | "ice" // 冰晶
  | "redbean"; // 紅豆

export interface SkillFxConfig {
  archetype: FxArchetype;
  /** 整體規模（1 = 標準；大招 1.4–1.8） */
  scale?: number;
  /** 粒子密度倍率 */
  density?: number;
  /** 專屬色（覆蓋元素預設色系） */
  colors?: string[];
  /** 大招第二段：命中加震波環＋光爆 */
  secondary?: boolean;
  /** 美食粒子形狀（招式主體粒子＋投射物用；命中爆發仍用光粒） */
  food?: FoodParticleKind;
}

/** 元素色系（特效用亮色版，非 UI 元素色） */
export const ELEMENT_FX_COLORS: Record<ElementType, string[]> = {
  fire: ["#ff6a2a", "#ffd94d", "#ff3a1a"],
  water: ["#4fc3f7", "#a8e6ff", "#2196d8"],
  metal: ["#ffd700", "#fff2b0", "#d8a12f"],
  earth: ["#e8c860", "#c89a5a", "#ffedb0"],
  wood: ["#66d97a", "#b8f0a0", "#2e9a51"],
};

/** 元素粒子物理：重力（+落/−升）、初速倍率、橫向擺動 */
export const ELEMENT_FX_PHYSICS: Record<
  ElementType,
  { gravity: number; speed: number; sway: number }
> = {
  fire: { gravity: -0.9, speed: 1.0, sway: 0.3 }, // 火星上飄
  water: { gravity: 2.2, speed: 1.1, sway: 0.1 }, // 水珠拋落
  metal: { gravity: 0.4, speed: 1.6, sway: 0.0 }, // 金屑疾走
  earth: { gravity: 2.8, speed: 0.8, sway: 0.05 }, // 重塵下墜
  wood: { gravity: 0.15, speed: 0.9, sway: 0.8 }, // 葉片迴旋
};

/** 全部技能逐一配置（key = skill id）；food = 招式主體用嘅美食粒子 */
export const SKILL_FX: Record<string, SkillFxConfig> = {
  // ── 雞飯聯盟（水）──
  "rice-peck": { archetype: "barrage", scale: 0.8, density: 1.2, colors: ["#fff8e0", "#ffe9a8", "#f2d478"], food: "grain" }, // 米粒連啄
  "oily-heal": { archetype: "heal", colors: ["#ffe9a8", "#b8f0a0"], food: "grain" },
  "poached-blade": { archetype: "slash", scale: 1.1, colors: ["#e8f6ff", "#a8e6ff", "#ffffff"] }, // 白斬利刃（保留光刃）
  "ginger-splash": { archetype: "splash", colors: ["#ffd94d", "#ffe9a8", "#e8c860"], food: "droplet" }, // 薑蓉黃醬滴
  "golden-rice-storm": { archetype: "barrage", scale: 1.6, density: 1.6, secondary: true, colors: ["#ffd700", "#fff2b0", "#ff9e3c"], food: "grain" }, // 黃金米暴
  "chilli-sauce-cannon": { archetype: "projectile", scale: 1.3, colors: ["#ff3a1a", "#ff6a2a", "#c81e0a"], food: "chilli" }, // 辣椒醬炮

  // ── 麵食家族（火）──
  "broth-splash": { archetype: "splash", colors: ["#ff8a3c", "#ffc888", "#ff5a1a"], food: "droplet" }, // 滾湯橙
  "coconut-shield": { archetype: "shield", colors: ["#fff8f0", "#ffe9d0"], food: "coconut" }, // 椰漿白
  "shell-claw": { archetype: "slash", scale: 1.1 },
  "spicy-surge": { archetype: "splash", scale: 1.4, density: 1.4, secondary: true, food: "chilli" }, // 辣浪翻騰
  "spice-inferno": { archetype: "breath", scale: 1.7, density: 1.6, secondary: true, food: "chilli" }, // 香料烈焰
  "dragon-noodle-whip": { archetype: "slash", scale: 1.5, colors: ["#ffe9a8", "#ffd94d", "#ff8a3c"], food: "noodle" }, // 龍鬚麵鞭

  // ── 肉骨茶系（金）──
  "rib-bonk": { archetype: "smash", scale: 0.9, food: "bone" }, // 排骨敲擊
  "herbal-sip": { archetype: "heal", colors: ["#b8f0a0", "#e8c860"], food: "leaf" }, // 藥膳綠金
  "youtiao-strike": { archetype: "smash", scale: 1.15, colors: ["#e8b860", "#ffd894", "#c89040"], food: "youtiao" }, // 油條重擊
  "pepper-guard": { archetype: "shield", colors: ["#e8e0d0", "#b8a049"], food: "pepper" }, // 胡椒鐵壁
  "garlic-meteor": { archetype: "barrage", scale: 1.6, density: 1.5, secondary: true, colors: ["#fff2d8", "#ffe0a0", "#d8a12f"], food: "garlic" }, // 蒜頭流星
  "claypot-slam": { archetype: "smash", scale: 1.5, secondary: true, colors: ["#c87840", "#ff9e58", "#8a5028"], food: "claypot" }, // 砂鍋猛擊

  // ── 糕點系（土）──
  "coconut-puff": { archetype: "breath", scale: 0.9, colors: ["#fffdf5", "#fff2dd", "#ffe9c8"], food: "coconut" }, // 椰絲噴發
  "steam-veil": { archetype: "heal", colors: ["#fff8f0", "#e8e0d0"] }, // 蒸氣白（保留光霧）
  "layer-slice": { archetype: "slash", scale: 1.1, colors: ["#ff9eb8", "#a8e6a0", "#ffd94d"], food: "kueh" }, // 彩虹九層
  "sticky-trap": { archetype: "splash", scale: 1.1, colors: ["#c8e088", "#e8d8a0", "#a8c060"], food: "droplet" }, // 黏糕青黃
  "gula-melaka-burst": { archetype: "smash", scale: 1.6, density: 1.4, secondary: true, colors: ["#c87828", "#ffb058", "#8a4818"], food: "droplet" }, // 熔岩椰糖漿
  "royal-decree": { archetype: "barrage", scale: 1.5, density: 1.5, secondary: true, colors: ["#ff9eb8", "#ffd94d", "#b8f0a0"], food: "kueh" }, // 糕點齊射

  // ── 咖椰系（木）──
  "jam-splat": { archetype: "splash", colors: ["#66d97a", "#a8d858", "#3e8a41"], food: "droplet" }, // 咖椰綠醬
  "pandan-breeze": { archetype: "heal", food: "leaf" }, // 斑蘭清風
  "toast-hammer": { archetype: "smash", scale: 1.15, colors: ["#e8b860", "#ffd894", "#66d97a"], food: "toast" }, // 吐司重錘
  "butter-slick": { archetype: "slash", scale: 1.2, colors: ["#ffe9a8", "#fff8d0", "#e8c860"] }, // 牛油滑光（保留）
  "phantom-flame": { archetype: "breath", scale: 1.7, density: 1.6, secondary: true, colors: ["#3ee8a0", "#a0ffd0", "#0a9a60"] }, // 翡翠幻火（保留光焰）
  "soft-egg-orb": { archetype: "projectile", scale: 1.2, colors: ["#ffc848", "#fff2d8", "#ff9e28"], food: "egg" }, // 半熟蛋彈

  // ── 辣蟹幫（水）──
  "bubble-spit": { archetype: "splash", scale: 0.9, colors: ["#ff6a3c", "#ffb088", "#e83a18"], food: "droplet" }, // 辣醬泡
  "mantou-recovery": { archetype: "heal", colors: ["#ffe9a8", "#ffd280"], food: "mantou" },
  "claw-crush": { archetype: "slash", scale: 1.15, colors: ["#ff7040", "#ffd0b0", "#c83818"] }, // 巨鉗光弧
  "sauce-whirl": { archetype: "splash", scale: 1.4, density: 1.4, secondary: true, colors: ["#e83a18", "#ff8a50", "#a82808"], food: "droplet" }, // 醬濤
  "chilli-tsunami": { archetype: "splash", scale: 1.7, density: 1.7, secondary: true, colors: ["#e83a18", "#ff6a2a", "#ffb088"], food: "chilli" }, // 辣醬海嘯
  "golden-mantou-barrage": { archetype: "barrage", scale: 1.4, density: 1.4, colors: ["#f0c060", "#ffe9b0", "#c89040"], food: "mantou" }, // 金饅頭

  // ── 沙嗲軍團（火）──
  "skewer-jab": { archetype: "projectile", scale: 0.9, colors: ["#d89a40", "#ffcc88", "#a86a20"], food: "skewer" }, // 竹籤刺
  "ketupat-rest": { archetype: "heal", colors: ["#b8f0a0", "#fff3d4"], food: "leaf" }, // 椰葉裹米糕
  "charcoal-grill": { archetype: "breath", scale: 1.2, colors: ["#ff6a2a", "#ffd94d", "#a83808"] }, // 炭火氣浪
  "triple-skewer": { archetype: "barrage", scale: 1.3, density: 1.3, colors: ["#d89a40", "#ff8a3c", "#8a5018"], food: "skewer" }, // 三串齊發
  "hundred-skewer-storm": { archetype: "barrage", scale: 1.7, density: 1.7, secondary: true, colors: ["#ff6a2a", "#d89a40", "#ffd94d"], food: "skewer" }, // 百串燎原
  "peanut-sauce-flood": { archetype: "splash", scale: 1.4, density: 1.3, colors: ["#c88a40", "#e8b878", "#a06028"], food: "peanut" }, // 花生醬洪流

  // ── 咖啡烏會（金）──
  "bean-toss": { archetype: "projectile", scale: 0.9, colors: ["#5a3a20", "#8a5c34", "#3a2410"], food: "bean" }, // 咖啡豆
  "kopi-sip": { archetype: "heal", colors: ["#c89050", "#fff2d8"], food: "droplet" }, // 熱咖啡
  "sock-swing": { archetype: "smash", scale: 1.2, colors: ["#6a4526", "#a87848", "#42280e"] }, // 咖啡袋重甩
  "steam-scald": { archetype: "splash", scale: 1.3, colors: ["#f5ead5", "#d8c0a0", "#fffaf0"], food: "droplet" }, // 滾水白霧
  "black-gold-waterfall": { archetype: "barrage", scale: 1.6, density: 1.6, secondary: true, colors: ["#42280e", "#c89050", "#ffd700"], food: "droplet" }, // 黑金瀑布
  "caffeine-rush": { archetype: "slash", scale: 1.4, colors: ["#ffd700", "#8a5c34", "#fff2b0"], food: "bean" }, // 咖啡因狂熱

  // ── 菜頭粿門（土）──
  "cube-tumble": { archetype: "projectile", scale: 0.9, colors: ["#fdf6e8", "#f0dfb8", "#e0c890"], food: "radish" }, // 粿粒滾撞
  "radish-juice": { archetype: "heal", colors: ["#fdf6e8", "#c8e0a0"], food: "droplet" }, // 清甜蘿蔔汁
  "griddle-press": { archetype: "smash", scale: 1.2, colors: ["#8a8078", "#c0b8a8", "#5a5048"] }, // 鐵板壓落
  "egg-crust-slam": { archetype: "smash", scale: 1.25, colors: ["#ffc848", "#fff2d8", "#e8a020"], food: "egg" }, // 蛋香脆擊
  "black-white-duet": { archetype: "smash", scale: 1.6, density: 1.4, secondary: true, colors: ["#42280e", "#fdf6e8", "#c89050"], food: "radish" }, // 黑白雙煎
  "sweet-sauce-quake": { archetype: "splash", scale: 1.4, density: 1.3, colors: ["#3a2410", "#6a4526", "#8a5c34"], food: "droplet" }, // 黑甜醬

  // ── 囉喏聯盟（木）──
  "pineapple-jab": { archetype: "projectile", scale: 0.9, colors: ["#ffd94d", "#ffe9a8", "#e8a020"], food: "fruit" }, // 菠蘿角
  "peanut-dust": { archetype: "heal", colors: ["#e8b878", "#fff3d4"], food: "peanut" }, // 花生碎
  "haeko-whip": { archetype: "slash", scale: 1.2, colors: ["#42280e", "#6a4526", "#2a1808"] }, // 蝦膏黑鞭
  "jicama-shield-bash": { archetype: "shield", colors: ["#fdf6e8", "#e0d0a8"], food: "radish" }, // 沙葛盾
  "hundred-flavour-vortex": { archetype: "barrage", scale: 1.6, density: 1.6, secondary: true, colors: ["#ffd94d", "#66d97a", "#ff9eb8"], food: "fruit" }, // 百味漩渦
  "black-sauce-deluge": { archetype: "splash", scale: 1.5, density: 1.4, colors: ["#2a1808", "#42280e", "#c88a40"], food: "droplet" }, // 黑醬傾盆

  // ── 蠔煎眾（水）──
  "starch-flick": { archetype: "splash", scale: 0.9, colors: ["#f5e8d0", "#e8d0a8", "#fffaf0"], food: "droplet" }, // 粉漿米白
  "egg-blanket": { archetype: "heal", colors: ["#ffc848", "#fff2d8"], food: "egg" },
  "sizzle-flip": { archetype: "slash", scale: 1.15, colors: ["#ffc848", "#fff2d8", "#e8a020"] }, // 蛋邊金弧
  "oyster-pearl-shot": { archetype: "projectile", scale: 1.1, colors: ["#c8b8a0", "#f0e8d8", "#8a7860"], food: "oyster" }, // 珍珠蠔彈
  "tidal-omelette": { archetype: "splash", scale: 1.6, density: 1.6, secondary: true, colors: ["#ffc848", "#fff2d8", "#ff9e28"], food: "egg" }, // 蛋海狂潮
  "vinegar-mist": { archetype: "breath", scale: 1.4, colors: ["#f8c8d8", "#fff0f5", "#e898b8"] }, // 酸醋粉霧（保留光霧）

  // ── 鑊氣幫（火）──
  "flat-noodle-lash": { archetype: "slash", scale: 0.95, colors: ["#e8d8b0", "#6a4526", "#c8a878"], food: "noodle" }, // 粿條抽擊
  "lard-crisp-boost": { archetype: "heal", colors: ["#ffd894", "#e8b860"], food: "peanut" }, // 豬油渣金粒
  "wok-toss": { archetype: "smash", scale: 1.25, colors: ["#5a5048", "#8a8078", "#ff8a3c"] }, // 拋鑊
  "cockle-bomb": { archetype: "barrage", scale: 1.3, density: 1.2, colors: ["#c85838", "#8a3018", "#ffb088"], food: "oyster" }, // 血蚶
  "wok-hei-blast": { archetype: "breath", scale: 1.7, density: 1.6, secondary: true, colors: ["#ff6a2a", "#ffd94d", "#8a3008"] }, // 鑊氣爆發
  "dark-soy-tide": { archetype: "splash", scale: 1.5, density: 1.4, colors: ["#3a2410", "#6a4526", "#c88a40"], food: "droplet" }, // 黑甜醬浪

  // ── 咖喱卜團（金）──
  "crust-flick": { archetype: "projectile", scale: 0.9, colors: ["#f0c060", "#ffe9b0", "#c89040"], food: "puff" }, // 酥皮碎
  "potato-cushion": { archetype: "heal", colors: ["#ffd94d", "#ffe9a8"], food: "droplet" }, // 咖喱薯蓉
  "spiral-crust-cutter": { archetype: "slash", scale: 1.2, colors: ["#f0c060", "#fff2d8", "#d8a020"], food: "puff" }, // 螺旋酥皮刃
  "curry-burst": { archetype: "splash", scale: 1.3, colors: ["#e8a020", "#ffd94d", "#c87818"], food: "droplet" }, // 咖喱噴發
  "thousand-layer-blades": { archetype: "barrage", scale: 1.6, density: 1.7, secondary: true, colors: ["#f0c060", "#ffd700", "#fff2b0"], food: "puff" }, // 千層酥刃
  "molten-curry-cannon": { archetype: "projectile", scale: 1.4, secondary: true, colors: ["#e8a020", "#ff8a3c", "#ffd700"], food: "droplet" }, // 熔岩咖喱炮

  // ── 煎餅族（土）──
  "dough-slap": { archetype: "smash", scale: 0.95, colors: ["#f5e8d0", "#e8d0a8", "#d8b880"], food: "prata" }, // 麵團拍打
  "ghee-shine": { archetype: "heal", colors: ["#ffd894", "#fff8e0"] }, // 酥油金光（保留光粒）
  "flip-spin-throw": { archetype: "projectile", scale: 1.2, colors: ["#e8c078", "#f5e8d0", "#c89040"], food: "prata" }, // 拋餅迴旋
  "crispy-fold-strike": { archetype: "slash", scale: 1.15, colors: ["#e8c078", "#fff2d8", "#b88030"] }, // 摺疊脆擊
  "sky-prata-cyclone": { archetype: "barrage", scale: 1.6, density: 1.5, secondary: true, colors: ["#e8c078", "#f5e8d0", "#ffd894"], food: "prata" }, // 飛天餅旋風
  "curry-dip-flood": { archetype: "splash", scale: 1.4, density: 1.3, colors: ["#e8a020", "#ffd94d", "#c87818"], food: "droplet" }, // 咖喱蘸海

  // ── 煎蕊派（木）──
  "jelly-wiggle": { archetype: "projectile", scale: 0.9, colors: ["#4eb858", "#a0e890", "#2e8a41"], food: "jelly" }, // 綠蕊蠕彈
  "coconut-milk-bath": { archetype: "heal", colors: ["#fffaf0", "#f0e8d8"], food: "coconut" }, // 椰奶浴
  "shaved-ice-flurry": { archetype: "barrage", scale: 1.3, density: 1.4, colors: ["#d8f0f8", "#ffffff", "#a8d8e8"], food: "ice" }, // 刨冰亂舞
  "jelly-whip": { archetype: "slash", scale: 1.2, colors: ["#4eb858", "#a0e890", "#2e8a41"], food: "jelly" }, // 綠蕊長鞭
  "emerald-blizzard": { archetype: "breath", scale: 1.7, density: 1.7, secondary: true, colors: ["#4eb858", "#d8f0f8", "#a0e890"], food: "ice" }, // 翡翠暴雪
  "red-bean-meteor": { archetype: "barrage", scale: 1.5, density: 1.5, secondary: true, colors: ["#8a3030", "#b85858", "#5e1c1c"], food: "redbean" }, // 紅豆流星雨

  // ── 水粿鼠系（土）──
  "chwee-hamlet-skill-1": { archetype: "smash", scale: 0.9, colors: ["#fdf6e8", "#f0e6d0", "#d8c8a8"], food: "kueh" }, // 砵仔蒸騰躍：糕體重壓
  "chwee-hamlet-skill-2": { archetype: "splash", scale: 0.9, colors: ["#8a5a2a", "#c88a40", "#5a3818"], food: "radish" }, // 鹹香菜脯潑
  "chwee-sentry-skill-1": { archetype: "smash", scale: 1.1, colors: ["#8a5a2a", "#c88a40", "#e0c090"], food: "radish" }, // 菜脯重盾擊
  "chwee-sentry-skill-2": { archetype: "slash", scale: 1.15, colors: ["#e8d8b0", "#c8a878", "#fff2d8"] }, // 竹製糕鏟掃
  "chwee-shogun-skill-1": { archetype: "breath", scale: 1.6, density: 1.6, secondary: true, colors: ["#fff8f0", "#e8e0d0", "#ffffff"] }, // 巨神蒸籠大爆發：灼熱蒸氣
  "chwee-shogun-skill-2": { archetype: "barrage", scale: 1.7, density: 1.6, secondary: true, colors: ["#6a4526", "#c88a40", "#8a5c34"], food: "radish" }, // 焦香菜脯狂風暴

  // ── 原材料層（basic 單技）──
  "fiery-temper": { archetype: "projectile", scale: 1.15, density: 1.3, colors: ["#ff6a2a", "#ff3a1a", "#ffd94d"], food: "chilli" }, // 火爆脾氣：着火衝撞
  "antibacterial-shield": { archetype: "shield", colors: ["#e8e8f0", "#c0c8d8", "#fffaf0"], food: "garlic" }, // 抗菌護盾：銀光蒜盾
  "lemongrass-sword-dance": { archetype: "slash", scale: 1.15, density: 1.25, colors: ["#b8e088", "#8ac860", "#e8f8d0"], food: "leaf" }, // 香茅劍舞
  "sticky-rice-bind": { archetype: "splash", scale: 1.05, colors: ["#fffaf0", "#f0e8d8", "#e8e0c8"], food: "droplet" }, // 糯米黏著：白漿潑黏
  "vermicelli-wrap": { archetype: "slash", scale: 1.1, colors: ["#fffaf5", "#e8f4ff", "#a8d8f0"], food: "noodle" }, // 米粉纏繞
  "yolk-guard": { archetype: "shield", colors: ["#ffc848", "#ffe9a8", "#fff2d8"], food: "egg" }, // 蛋黃守護
  "bubble-shot": { archetype: "breath", scale: 1.05, density: 1.25, colors: ["#4fc3f7", "#a8e6ff", "#d8f4ff"], food: "droplet" }, // 水泡射擊
  "coconut-heal": { archetype: "heal", colors: ["#fffaf0", "#b8f0a0"], food: "coconut" }, // 椰香治癒
  "kachang-snowling-skill-1": {"archetype":"barrage","colors":["#4fc3f7","#a8e6ff","#2196d8"],"food":"ice"},
  "kachang-snowling-skill-2": {"archetype":"smash","colors":["#4fc3f7","#a8e6ff","#2196d8"],"food":"pepper"},
  "kachang-frost-drake-skill-1": {"archetype":"projectile","colors":["#4fc3f7","#a8e6ff","#2196d8"],"food":"droplet"},
  "kachang-frost-drake-skill-2": {"archetype":"slash","colors":["#4fc3f7","#a8e6ff","#2196d8"],"food":"ice"},
  "kachang-deity-sovereign-skill-1": {"archetype":"projectile","colors":["#4fc3f7","#a8e6ff","#2196d8"],"food":"ice"},
  "kachang-deity-sovereign-skill-2": {"archetype":"projectile","scale":1.5,"secondary":true,"colors":["#4fc3f7","#a8e6ff","#2196d8"],"food":"ice"},
  "wanton-pup-skill-1": {"archetype":"projectile","colors":["#ffd700","#fff2b0","#d8a12f"],"food":"pepper"},
  "wanton-pup-skill-2": {"archetype":"slash","colors":["#ffd700","#fff2b0","#d8a12f"],"food":"noodle"},
  "charsiu-blade-skill-1": {"archetype":"slash","colors":["#ffd700","#fff2b0","#d8a12f"],"food":"pepper"},
  "charsiu-blade-skill-2": {"archetype":"projectile","colors":["#ffd700","#fff2b0","#d8a12f"],"food":"pepper"},
  "wanton-mee-shogun-skill-1": {"archetype":"slash","colors":["#ffd700","#fff2b0","#d8a12f"],"food":"noodle"},
  "wanton-mee-shogun-skill-2": {"archetype":"shield","scale":1.5,"secondary":true,"colors":["#ffd700","#fff2b0","#d8a12f"],"food":"glow"},
};

export const DEFAULT_SKILL_FX: SkillFxConfig = { archetype: "projectile" };

// ── 普攻武器演出 ────────────────────────────────
// 普攻冇 skillId，按系列武器定調：同 3D 模型手上嘅武器呼應，
// 45 隻先至唔會個個普攻都係同一粒光球。

/** 武器動作類型：決定普攻時間軸（刺／砍／砸／射） */
export type BasicMotion = "stab" | "slash" | "smash" | "shoot";

export interface BasicFxConfig {
  motion: BasicMotion;
  /** 專屬色（唔設就用元素色系） */
  colors?: string[];
  /** 招式主體美食粒子 */
  food?: FoodParticleKind;
}

/** key = seriesId：每系列一款武器手感 */
export const BASIC_FX: Record<string, BasicFxConfig> = {
  "chicken-rice": { motion: "shoot", colors: ["#fff8e0", "#ffe9a8", "#f2d478"], food: "grain" }, // 米粒彈
  laksa: { motion: "slash", colors: ["#ff8a3c", "#ffe9a8", "#ff5a1a"], food: "noodle" }, // 麵條抽擊
  "bak-kut-teh": { motion: "smash", colors: ["#e8b860", "#ffd894", "#c89040"], food: "youtiao" }, // 油條棍砸
  kueh: { motion: "slash", colors: ["#ff9eb8", "#a8e6a0", "#ffd94d"], food: "kueh" }, // 九層糕切
  kaya: { motion: "smash", colors: ["#e8b860", "#66d97a", "#ffd894"], food: "toast" }, // 吐司錘砸
  "chilli-crab": { motion: "stab", colors: ["#ff6a3c", "#ffb088", "#e83a18"], food: "chilli" }, // 巨鉗快夾
  satay: { motion: "stab", colors: ["#d89a40", "#ffcc88", "#a86a20"], food: "skewer" }, // 竹籤連刺
  kopi: { motion: "smash", colors: ["#6a4526", "#a87848", "#c89050"], food: "bean" }, // 咖啡袋重甩
  "chai-tow-kway": { motion: "slash", colors: ["#fdf6e8", "#f0dfb8", "#8a8078"], food: "radish" }, // 鑊鏟橫掃
  rojak: { motion: "stab", colors: ["#ffd94d", "#66d97a", "#e8a020"], food: "fruit" }, // 囉喏叉戳
  "oyster-omelette": { motion: "smash", colors: ["#ffc848", "#fff2d8", "#e8a020"], food: "egg" }, // 大鑊鏟拍落
  "char-kway-teow": { motion: "slash", colors: ["#e8d8b0", "#ff8a3c", "#6a4526"], food: "noodle" }, // 粿條鞭抽
  "curry-puff": { motion: "slash", colors: ["#f0c060", "#fff2d8", "#d8a020"], food: "puff" }, // 酥皮劍斬
  prata: { motion: "shoot", colors: ["#e8c078", "#f5e8d0", "#c89040"], food: "prata" }, // 飛餅擲出
  chendol: { motion: "slash", colors: ["#4eb858", "#a0e890", "#2e8a41"], food: "jelly" }, // 綠蕊雙鞭
  "chwee-kueh-hamster": { motion: "slash", colors: ["#fdf6e8", "#c88a40", "#8a5a2a"], food: "radish" }, // 糕鏟橫掃／叉戟
  // ── 原材料層（basic：大多冇武器，用身體撞／甩）──
  "chilli-baby": { motion: "smash", colors: ["#ff5a2a", "#e02818", "#ffb060"], food: "chilli" }, // 辣味撞擊
  "garlic-guard": { motion: "smash", colors: ["#e8e8f0", "#c0c8d8", "#fffaf0"], food: "garlic" }, // 蒜頭撞擊
  "lemongrass-swordsman": { motion: "slash", colors: ["#b8e088", "#8ac860", "#e8f8d0"], food: "leaf" }, // 葉片斬擊
  "riceball-baby": { motion: "shoot", colors: ["#fffdf5", "#f0e8d8", "#e0d0b0"], food: "grain" }, // 飯團滾動
  "vermicelli-sprite": { motion: "slash", colors: ["#fffaf5", "#a8d8f0", "#e8f4ff"], food: "noodle" }, // 米粉鞭擊
  "egg-guard": { motion: "smash", colors: ["#fffdf6", "#ffc848", "#e8ddc0"], food: "egg" }, // 蛋殼撞擊
  "shrimp-hopper": { motion: "stab", colors: ["#ffb8c0", "#4fc3f7", "#ffe0e4"], food: "droplet" }, // 蝦尾彈跳
  "coconut-jelly": { motion: "shoot", colors: ["#fffaf0", "#b8f0a0", "#f0e8d8"], food: "coconut" }, // 椰漿潑灑
  "ice-kachang-christmas-dragon": {"motion":"shoot","colors":["#4fc3f7","#a8e6ff","#2196d8"],"food":"bean"},
  "wanton-mee": {"motion":"shoot","colors":["#ffd700","#fff2b0","#d8a12f"],"food":"noodle"},
};

// ── 命中時刻表 ─────────────────────────────────
// 頁面結算（傷害＋受擊動畫）要同特效命中一刻對齊，
// 唔好再寫死 sleep(420)。單位：毫秒。

/** 各原型主體到達對手嘅時刻 */
export const ARCHETYPE_IMPACT_MS: Record<FxArchetype, number> = {
  projectile: 420,
  splash: 420,
  slash: 440,
  barrage: 450,
  breath: 450,
  smash: 420,
  heal: 900,
  shield: 420,
};

/** 普攻各動作嘅命中時刻（突刺 0.55s 正弦包絡，頂點約 0.28s） */
export const BASIC_IMPACT_MS: Record<BasicMotion, number> = {
  stab: 340,
  slash: 340,
  smash: 380,
  shoot: 400,
};
