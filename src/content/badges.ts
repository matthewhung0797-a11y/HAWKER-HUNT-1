import type { LocalizedText } from "./types";
import { SPECIES } from "./species";
import { HAWKER_CENTRES } from "./centres";

/**
 * 徽章牆：成就定義＋進度計算。
 * 主題扣連遊戲核心循環——捕捉（食家）、打卡（老食客）、
 * 切磋（五味相生相剋）、進化、閃光收藏。
 */

/** 計進度所需嘅存檔切片（避免直接依賴成個 store 型別） */
export interface BadgeStateSlice {
  ownedSpirits: { speciesId: string; shiny?: boolean }[];
  captureCounts: Record<string, number>;
  checkins: { centreId: string }[];
  battleWins: number;
  counterWins: number;
  evolveCount: number;
  level: number;
}

export interface BadgeDef {
  id: string;
  icon: string;
  name: LocalizedText;
  /** 解鎖條件描述（做緊乜、點解值得追） */
  description: LocalizedText;
  /** 解鎖門檻 */
  target: number;
  /** 當前進度 */
  progress: (s: BadgeStateSlice) => number;
  /** 隱藏（切磋相關，入口未開放）；定義保留，徽章牆過濾 */
  hidden?: boolean;
}

const totalCaptures = (s: BadgeStateSlice) =>
  Object.values(s.captureCounts).reduce((a, b) => a + b, 0);
const distinctSpecies = (s: BadgeStateSlice) => Object.keys(s.captureCounts).length;
const distinctCentres = (s: BadgeStateSlice) => new Set(s.checkins.map((c) => c.centreId)).size;

export const BADGES: BadgeDef[] = [
  // ── 食家之路（捕捉） ──
  {
    id: "first-bite",
    icon: "chopsticks",
    name: { zh: "初嚐滋味", en: "First Bite" },
    description: { zh: "用筷子夾住你第一隻美食精靈", en: "Clamp your very first food spirit" },
    target: 1,
    progress: totalCaptures,
  },
  {
    id: "big-eater",
    icon: "chick",
    name: { zh: "大胃王", en: "Big Eater" },
    description: { zh: "累積捕獲 30 隻精靈", en: "Capture 30 spirits in total" },
    target: 30,
    progress: totalCaptures,
  },
  {
    id: "gourmet",
    icon: "book",
    name: { zh: "美食評論家", en: "Food Critic" },
    description: { zh: "圖鑑收集 10 種唔同精靈", en: "Collect 10 different species" },
    target: 10,
    progress: distinctSpecies,
  },
  {
    id: "dex-master",
    icon: "crown",
    name: { zh: "美食百科全書", en: "Culinary Encyclopedia" },
    description: {
      zh: `集齊全部 ${SPECIES.length} 種精靈，稱霸全島`,
      en: `Complete the dex with all ${SPECIES.length} species`,
    },
    target: SPECIES.length,
    progress: distinctSpecies,
  },
  // ── 老食客（打卡） ──
  {
    id: "regular",
    icon: "lantern",
    name: { zh: "熟客仔", en: "Regular" },
    description: { zh: "去小販中心打卡 5 次", en: "Check in at hawker centres 5 times" },
    target: 5,
    progress: (s) => s.checkins.length,
  },
  {
    id: "old-timer",
    icon: "medal",
    name: { zh: "老食客", en: "Old-Timer" },
    description: {
      zh: "累積打卡 20 次——連檔主都認得你",
      en: "Check in 20 times — even the stall owners know you",
    },
    target: 20,
    progress: (s) => s.checkins.length,
  },
  {
    id: "island-hopper",
    icon: "nav-map",
    name: { zh: "食勻全島", en: "Island Hopper" },
    description: {
      zh: `五大小販中心全部打過卡（${HAWKER_CENTRES.length} 個據點）`,
      en: `Check in at all ${HAWKER_CENTRES.length} hawker centres`,
    },
    target: HAWKER_CENTRES.length,
    progress: distinctCentres,
  },
  // ── 五味擂台（切磋；已隱藏） ──
  {
    id: "first-spar",
    icon: "fire",
    name: { zh: "擂台新丁", en: "Ring Rookie" },
    description: { zh: "切磋贏 5 場", en: "Win 5 sparring battles" },
    target: 5,
    progress: (s) => s.battleWins,
    hidden: true,
  },
  {
    id: "flavor-sage",
    icon: "elem-fire",
    name: { zh: "五味相剋宗師", en: "Flavor Counter Sage" },
    description: {
      zh: "用屬性克制優勢（金剋木、木剋土、土剋水、水剋火、火剋金）贏 10 場",
      en: "Win 10 battles with elemental advantage (Metal>Wood>Earth>Water>Fire>Metal)",
    },
    target: 10,
    progress: (s) => s.counterWins,
    hidden: true,
  },
  {
    id: "champion",
    icon: "trophy",
    name: { zh: "擂台霸主", en: "Arena Champion" },
    description: { zh: "切磋贏 25 場", en: "Win 25 sparring battles" },
    target: 25,
    progress: (s) => s.battleWins,
    hidden: true,
  },
  // ── 進化同閃光 ──
  {
    id: "evolver",
    icon: "sparkles",
    name: { zh: "進化宗師", en: "Evolution Master" },
    description: { zh: "成功進化 3 次", en: "Evolve spirits 3 times" },
    target: 3,
    progress: (s) => s.evolveCount,
  },
  {
    id: "shiny-hunter",
    icon: "star",
    name: { zh: "閃光獵人", en: "Shiny Hunter" },
    description: {
      zh: "捕獲 1 隻閃光變異精靈（約 1/50 機率）",
      en: "Capture a shiny variant spirit (about 1 in 50)",
    },
    target: 1,
    progress: (s) => s.ownedSpirits.filter((sp) => sp.shiny).length,
  },
];
