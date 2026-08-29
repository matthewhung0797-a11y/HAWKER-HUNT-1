import type { Faction, HawkerCentre } from "./types";

/**
 * MVP 5 個小販中心據點（真實 GPS 座標）。
 * 座標來源：新加坡 OneMap（官方地址點），交叉核對 OSM／Wikipedia／Apple Maps。
 * 五行分佈修正為五行齊全：麥士威=土、牛車水=水、舊機場路=火、竹腳=金、老巴剎=木。
 * 代表精靈統一使用圖鑑內各系列的最終形態。
 * spawnPool 只需要列一階（野生二階由 spawn.ts 按 8% 機率自動升級抽選）。
 */
export const HAWKER_CENTRES: HawkerCentre[] = [
  {
    id: "maxwell",
    name: { en: "Maxwell Food Centre", zh: "麥士威熟食中心" },
    district: { en: "Chinatown, Central", zh: "中區牛車水" },
    // 1 Kadayanallur Street — OneMap MAXWELL FOOD CENTRE
    lat: 1.280331,
    lng: 103.844747,
    element: "earth",
    featuredSpeciesId: "pastry-queen",
    dailyCheckinLimit: 3,
    spawnPool: ["tutu-sprite", "oily-rice-chick", "kaya-blob", "radish-cubie", "rojak-tot", "prata-pup", "nasi-lemak-tot", "chwee-hamlet"],
  },
  {
    id: "chinatown-complex",
    name: { en: "Chinatown Complex Food Centre", zh: "牛車水大廈熟食中心" },
    district: { en: "Chinatown, Central", zh: "中區牛車水" },
    // 335 Smith Street — OneMap CHINATOWN COMPLEX
    lat: 1.282275,
    lng: 103.843239,
    element: "water",
    featuredSpeciesId: "hainan-chicken-god",
    dailyCheckinLimit: 3,
    spawnPool: ["oily-rice-chick", "bkt-cub", "tutu-sprite", "chilli-crablet", "kopi-bean", "little-orh-luak", "kachang-snowling"],
  },
  {
    id: "old-airport-road",
    name: { en: "Old Airport Road Food Centre", zh: "舊機場路熟食中心" },
    district: { en: "Kallang, East", zh: "東區加冷" },
    // 51 Old Airport Road — OneMap 51 OLD AIRPORT ROAD FOOD CENTRE AND SHOPPING MALL
    lat: 1.308252,
    lng: 103.885809,
    element: "fire",
    featuredSpeciesId: "laksa-dragon",
    dailyCheckinLimit: 3,
    spawnPool: ["little-laksa", "oily-rice-chick", "bkt-cub", "satay-skewerling", "chilli-crablet", "kway-teow-kid", "little-orh-luak", "otah-tot"],
  },
  {
    id: "tekka-centre",
    name: { en: "Tekka Centre", zh: "竹腳中心" },
    district: { en: "Little India, Central North", zh: "中北部小印度" },
    // 665 Buffalo Road — OneMap TEKKA MARKET（主樓，唔係旁邊 661–664）
    lat: 1.306177,
    lng: 103.850611,
    element: "metal",
    featuredSpeciesId: "bkt-grandmaster",
    dailyCheckinLimit: 3,
    spawnPool: ["bkt-cub", "little-laksa", "kaya-blob", "kopi-bean", "radish-cubie", "curry-puffling", "prata-pup", "wanton-pup"],
  },
  {
    id: "lau-pa-sat",
    name: { en: "Lau Pa Sat", zh: "老巴剎" },
    district: { en: "Raffles Place, Central South", zh: "中南部萊佛士坊" },
    // 18 Raffles Quay — OneMap LAU PA SAT
    lat: 1.280594,
    lng: 103.850408,
    element: "wood",
    featuredSpeciesId: "kaya-dragon",
    dailyCheckinLimit: 3,
    spawnPool: ["kaya-blob", "little-laksa", "tutu-sprite", "rojak-tot", "satay-skewerling", "chendol-jelly"],
  },
  // 開發測試據點：香港錦田波地遊樂場籃球場（元朗錦田波地路）
  {
    id: "hk-test",
    name: { en: "Kam Tin Po Tei Playground (Dev)", zh: "錦田波地遊樂場（測試）" },
    district: { en: "Kam Tin, Yuen Long, HK", zh: "香港元朗錦田" },
    lat: 22.4418,
    lng: 114.0727,
    element: "fire",
    featuredSpeciesId: "laksa-dragon",
    dailyCheckinLimit: 3,
    spawnPool: ["little-laksa", "bkt-cub", "kaya-blob", "garlic-guard"],
  },
];

export const CENTRE_MAP: Record<string, HawkerCentre> = Object.fromEntries(
  HAWKER_CENTRES.map((c) => [c.id, c])
);

/** 地理圍欄半徑（米）——理想 50m；打卡 hard gate 用寬容值（室內 GPS 飄） */
export const GEOFENCE_RADIUS_M = 50;
/** 打卡必須喺呢個距離內；超距／拒定位／逾時一律拒絕（防屋企掃 QR） */
export const GEOFENCE_RADIUS_TOLERANT_M = 200;
/** 同一據點兩次打卡最短間隔——防連續掃三次刷獎勵；去第二個 hawker 唔受影響 */
export const CHECKIN_COOLDOWN_MS = 30 * 60 * 1000;

/** 五大鄰里陣營 */
export const FACTIONS: Faction[] = [
  { id: "central", name: { en: "Central Faction", zh: "中部陣營" }, element: "earth", color: "#9a6b3f" },
  { id: "east", name: { en: "East Faction", zh: "東部陣營" }, element: "fire", color: "#d84a2f" },
  { id: "west", name: { en: "West Faction", zh: "西部陣營" }, element: "metal", color: "#b8a049" },
  { id: "north", name: { en: "North Faction", zh: "北部陣營" }, element: "wood", color: "#4e9a51" },
  { id: "south", name: { en: "South Faction", zh: "南部陣營" }, element: "water", color: "#3d7fc1" },
];

export const FACTION_MAP: Record<string, Faction> = Object.fromEntries(
  FACTIONS.map((f) => [f.id, f])
);
