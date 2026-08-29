// AUTO-GENERATED 預覽 —— 由 publish.mjs 組裝，未寫入 species.ts。
// 批准人：manual（2026-07-28T18:36:47.125Z）
// 原因/備註：後台 approve
// 出街時將下面 previewSpecies 陣列嘅物件字面量貼入 SPECIES 陣列（對應系列後面）。

import type { Species } from "@/content/types";

export const previewSpecies: Species[] = [
  {
    id: "kachang-snowling",
    seriesId: "ice-kachang-christmas-dragon",
    stage: 1,
    name: { en: "Kachang Snowling", zh: "冰豆龍仔" },
    element: "water",
    flavor: "sweet",
    rarity: "common",
    foodOrigin: { en: "Ice Kachang", zh: "紅豆冰" },
    description: {
      en: "A chubby baby dragon made of fluffy shaved ice draped in vibrant red rose syrup and green jelly glaze. It sports a cute holly-berry scarf and holds a festive striped peppermint ice spoon.",
      zh: "隻身圓滾滾的幼龍，全身由綿密刨冰砌成，淋上鮮紅玫瑰糖漿與翠綠仙草醬。戴著冬青漿果圍巾，手握一支聖誕糖果棒造型的甜品匙。",
    },
    baseStats: { hp: 45, attack: 13, defense: 10, speed: 14 },
    skills: [
      {
        id: "kachang-snowling-skill-1",
        name: { en: "Sugar Snow Flurry", zh: "甜糖細雪風暴" },
        description: { en: "Summons a chilling shower of finely shaved ice drenched in sweet syrup to pelt enemies.", zh: "召喚淋滿甜糖漿的細碎刨雪，猛烈轟炸敵方陣營。" },
        power: 1,
        cooldown: 0,
      },
      {
        id: "kachang-snowling-skill-2",
        name: { en: "Minty Scoop Slam", zh: "薄荷冰球重擊" },
        description: { en: "Slams a giant frozen scoop of mint-infused ice down onto a target, chilling them to the bone.", zh: "投擲巨大的冰涼薄荷雪糕球砸向目標，造成極致冰霜衝擊。" },
        power: 1.4,
        cooldown: 2,
      },
    ],
    evolvesTo: "kachang-frost-drake",
    evolutionRequirement: {"items":{"ice-kachang-christmas-dragon-essence":5},"checkinCentres":2},
    modelUrl: null,
    modelHeightM: 0.3,
  },
  {
    id: "kachang-frost-drake",
    seriesId: "ice-kachang-christmas-dragon",
    stage: 2,
    name: { en: "Kachang Frost Drake", zh: "紅豆雪山龍" },
    element: "water",
    flavor: "sweet",
    rarity: "rare",
    foodOrigin: { en: "Ice Kachang", zh: "紅豆冰" },
    description: {
      en: "A proud reptilian warrior whose dragon scale armor glistens like sweet corn kernels and caramelized gula melaka. It wields an ice-scraper halberd dripping with chilled rose syrup and wears a wreath of glowing Christmas pine needles.",
      zh: "英姿颯爽的龍族武士，胸甲如玉米粒般金黃耀眼，搭配焦糖色椰糖龍鱗。手持滴著玫瑰冷漿的雙刃刨冰戟，頸間環繞著發光的聖誕松針環。",
    },
    baseStats: { hp: 72, attack: 22, defense: 18, speed: 20 },
    skills: [
      {
        id: "kachang-frost-drake-skill-1",
        name: { en: "Rose Syrup Torrent", zh: "玫瑰糖漿怒濤" },
        description: { en: "Unleashes a surging wave of sweet rose syrup that washes over the battlefield and freezes enemies.", zh: "噴湧出濃郁冰涼的玫瑰糖漿巨浪，吞噬並凍結敵方。" },
        power: 1.1,
        cooldown: 0,
      },
      {
        id: "kachang-frost-drake-skill-2",
        name: { en: "Razor Scraper Strike", zh: "刨冰飛刃斬" },
        description: { en: "Slashes with razor-sharp ice shavings to strike all foes in its path.", zh: "如刨冰機般甩出銳利冰刃，切碎沿途所有敵人。" },
        power: 1.7,
        cooldown: 2,
      },
    ],
    evolvesTo: "kachang-deity-sovereign",
    evolutionRequirement: {"items":{"ice-kachang-christmas-dragon-essence":10},"checkinCentres":5},
    modelUrl: null,
    modelHeightM: 0.5,
  },
  {
    id: "kachang-deity-sovereign",
    seriesId: "ice-kachang-christmas-dragon",
    stage: 3,
    name: { en: "Kachang Feast Guardian", zh: "彩冰聖誕神" },
    element: "water",
    flavor: "sweet",
    rarity: "epic",
    foodOrigin: { en: "Ice Kachang", zh: "紅豆冰" },
    description: {
      en: "A magnificent six-armed guardian deity reborn in full Christmas grandeur. A glowing golden-star mandala aura shines behind its head while its six arms grip sacred food-forged implements to spread festive cheer.",
      zh: "幻化為六臂聖誕護法神祗，頭後懸浮著璀璨的八角星聖誕冰晶光輪。六隻手臂各持由美食化成的法器，散發濃郁甜蜜的聖誕節慶神光。",
    },
    baseStats: { hp: 102, attack: 34, defense: 28, speed: 26 },
    skills: [
      {
        id: "kachang-deity-sovereign-skill-1",
        name: { en: "Sweet Ice Mandala", zh: "七寶冰雪曼陀羅" },
        description: { en: "Radiates a majestic aura of iced syrups and attap seeds that crushes opponents with frozen power.", zh: "降下凝聚七彩糖漿與亞答籽靈氣的冰雪聖光，強勢壓制敵方。" },
        power: 1.2,
        cooldown: 0,
      },
      {
        id: "kachang-deity-sovereign-skill-2",
        name: { en: "Six-Armed Mountain Avalanche", zh: "六臂冰山雪崩衝" },
        description: { en: "Strikes relentlessly with six ice-clad arms, hurling a colossal avalanche of shaved ice and toppings onto the enemy team.", zh: "揮動六臂召喚傾盆冰山與巨量配料雪崩，以無比威勢碾壓全場對手。" },
        power: 2,
        cooldown: 3,
      },
    ],
    evolvesTo: null,
    evolutionRequirement: null,
    modelUrl: null,
    modelHeightM: 0.65,
  },
];
