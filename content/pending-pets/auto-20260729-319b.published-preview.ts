// AUTO-GENERATED 預覽 —— 由 publish.mjs 組裝，未寫入 species.ts。
// 批准人：manual（2026-07-29T07:43:59.518Z）
// 原因/備註：後台 approve
// 出街時將下面 previewSpecies 陣列嘅物件字面量貼入 SPECIES 陣列（對應系列後面）。

import type { Species } from "@/content/types";

export const previewSpecies: Species[] = [
  {
    id: "wanton-pup",
    seriesId: "wanton-mee",
    stage: 1,
    name: { en: "Wanton Pup", zh: "雲吞仔" },
    element: "metal",
    flavor: "salty",
    rarity: "common",
    foodOrigin: { en: "Wanton Mee", zh: "雲吞麵" },
    description: {
      en: "Stage 1 of the Wanton Mee line. (guided)",
      zh: "雲吞麵系列第 1 階。（依指示調整）",
    },
    baseStats: { hp: 45, attack: 13, defense: 10, speed: 14 },
    skills: [
      {
        id: "wanton-pup-skill-1",
        name: { en: "Plump Wanton Bomb", zh: "炸雲吞飛彈" },
        description: { en: "Hurls a piping-hot wanton to deal salty metal-element damage to a single foe.", zh: "投擲熱騰騰的金黃雲吞，對單體敵人造成鹹香的金屬傷害。" },
        power: 1,
        cooldown: 0,
      },
      {
        id: "wanton-pup-skill-2",
        name: { en: "Springy Noodle Whip", zh: "竹升麵彈鞭" },
        description: { en: "Lashes target enemies with flexible, springy egg noodles.", zh: "揮舞爽口彈牙的竹升麵，鞭打前方的敵人。" },
        power: 1.4,
        cooldown: 2,
      },
    ],
    evolvesTo: "charsiu-blade",
    evolutionRequirement: {"items":{"wanton-mee-essence":5},"checkinCentres":2},
    modelUrl: "/models/wanton-pup.glb",
    modelHeightM: 0.3,
    // facing-lock: 2026-07-29 player-back enemy-face
    modelYaw: 0,
  },
  {
    id: "charsiu-blade",
    seriesId: "wanton-mee",
    stage: 2,
    name: { en: "Char Siu Blade", zh: "叉燒刀客" },
    element: "metal",
    flavor: "salty",
    rarity: "rare",
    foodOrigin: { en: "Wanton Mee", zh: "雲吞麵" },
    description: {
      en: "Stage 2 of the Wanton Mee line. (guided)",
      zh: "雲吞麵系列第 2 階。（依指示調整）",
    },
    baseStats: { hp: 72, attack: 22, defense: 18, speed: 20 },
    skills: [
      {
        id: "charsiu-blade-skill-1",
        name: { en: "Honey-Glazed Cleave", zh: "蜜汁叉燒斬" },
        description: { en: "Slashes an enemy with a caramelized blade to rend their armor.", zh: "揮舞焦香蜜汁叉燒刃，斬斷對手的防禦。" },
        power: 1.1,
        cooldown: 0,
      },
      {
        id: "charsiu-blade-skill-2",
        name: { en: "Dark Vinegar Silence", zh: "黑醋封喉刺" },
        description: { en: "Splashes pungent dark vinegar onto the target, dealing damage and suppressing their skills.", zh: "潑灑濃郁酸香的黑醋，造成傷害並封印敵人的技能。" },
        power: 1.7,
        cooldown: 2,
      },
    ],
    evolvesTo: "wanton-mee-shogun",
    evolutionRequirement: {"items":{"wanton-mee-essence":10},"checkinCentres":5},
    modelUrl: "/models/charsiu-blade.glb",
    modelHeightM: 0.5,
    // facing-lock: 2026-07-29 player-back enemy-face
    modelYaw: 0,
  },
  {
    id: "wanton-mee-shogun",
    seriesId: "wanton-mee",
    stage: 3,
    name: { en: "Wanton Mee Shogun", zh: "雲吞麵將軍" },
    element: "metal",
    flavor: "salty",
    rarity: "epic",
    foodOrigin: { en: "Wanton Mee", zh: "雲吞麵" },
    description: {
      en: "Stage 3 of the Wanton Mee line. (guided)",
      zh: "雲吞麵系列第 3 階。（依指示調整）",
    },
    baseStats: { hp: 102, attack: 34, defense: 28, speed: 26 },
    skills: [
      {
        id: "wanton-mee-shogun-skill-1",
        name: { en: "Thousand Strand Slash", zh: "千麵萬縷斬" },
        description: { en: "Unleashes a whirlwind of razor-sharp noodle blades that shreds all foes.", zh: "揮斬出如鋼絲般鋒利的千縷麵條，撕裂全體敵人。" },
        power: 1.2,
        cooldown: 0,
      },
      {
        id: "wanton-mee-shogun-skill-2",
        name: { en: "Caramelized Barricade", zh: "蜜汁叉燒鐵壁" },
        description: { en: "Summons a thick layer of glazed char siu armor that retaliates against striking attackers.", zh: "凝聚厚重的焦香叉燒鎧甲，並向攻擊者反彈傷害。" },
        power: 2,
        cooldown: 3,
      },
      {
        id: "wanton-mee-shogun-heal",
        name: { en: "Salty Broth Aegis", zh: "蜜汁叉燒護體" },
        description: { en: "Envelops the team in a rich savory broth to restore health and reinforce defense.", zh: "以濃郁鹹香的叉燒與高湯精華庇護全隊，恢復生命並提升防禦。" },
        power: 0,
        cooldown: 3,
        healPercent: 0.3,
      },
    ],
    evolvesTo: null,
    evolutionRequirement: null,
    modelUrl: "/models/wanton-mee-shogun.glb",
    modelHeightM: 0.65,
    // facing-lock: 2026-07-29 player-back enemy-face
    modelYaw: 0,
  },
];
