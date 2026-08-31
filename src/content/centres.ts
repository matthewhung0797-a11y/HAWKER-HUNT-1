import type { Faction, HawkerCentre } from "./types";

/**
 * MVP 5 個小販中心據點（真實 GPS 座標）。
 * spawnPool 只列保留的 18 隻精靈中的一階。
 */
export const HAWKER_CENTRES: HawkerCentre[] = [
  {
    id: "maxwell",
    name: { en: "Maxwell Food Centre", zh: "麥士威熟食中心" },
    district: { en: "Chinatown, Central", zh: "中區牛車水" },
    lat: 1.280331,
    lng: 103.844747,
    element: "earth",
    featuredSpeciesId: "nasi-lemak-general",
    dailyCheckinLimit: 3,
    spawnPool: ["nasi-lemak-tot", "garlic-guard", "egg-guard"],
  },
  {
    id: "chinatown-complex",
    name: { en: "Chinatown Complex Food Centre", zh: "牛車水大廈熟食中心" },
    district: { en: "Chinatown, Central", zh: "中區牛車水" },
    lat: 1.282275,
    lng: 103.843239,
    element: "water",
    featuredSpeciesId: "bkt-grandmaster",
    dailyCheckinLimit: 3,
    spawnPool: ["bkt-cub", "nasi-lemak-tot", "chilli-baby"],
  },
  {
    id: "old-airport-road",
    name: { en: "Old Airport Road Food Centre", zh: "舊機場路熟食中心" },
    district: { en: "Kallang, East", zh: "東區加冷" },
    lat: 1.308252,
    lng: 103.885809,
    element: "fire",
    featuredSpeciesId: "laksa-dragon",
    dailyCheckinLimit: 3,
    spawnPool: ["little-laksa", "bkt-cub", "satay-skewerling", "chilli-baby"],
  },
  {
    id: "tekka-centre",
    name: { en: "Tekka Centre", zh: "竹腳中心" },
    district: { en: "Little India, Central North", zh: "中北部小印度" },
    lat: 1.306177,
    lng: 103.850611,
    element: "metal",
    featuredSpeciesId: "bkt-grandmaster",
    dailyCheckinLimit: 3,
    spawnPool: ["bkt-cub", "little-laksa", "lemongrass-swordsman", "garlic-guard"],
  },
  {
    id: "lau-pa-sat",
    name: { en: "Lau Pa Sat", zh: "老巴剎" },
    district: { en: "Raffles Place, Central South", zh: "中南部萊佛士坊" },
    lat: 1.280594,
    lng: 103.850408,
    element: "wood",
    featuredSpeciesId: "satay-flame-emperor",
    dailyCheckinLimit: 3,
    spawnPool: ["satay-skewerling", "little-laksa", "shrimp-hopper", "vermicelli-sprite"],
  },
  // 開發測試據點
  {
    id: "hk-test",
    name: { en: "Kam Tin Po Tei Playground (Dev)", zh: "錦田波地遊樂場（測試）" },
    district: { en: "Kam Tin, Yuen Long, HK", zh: "香港元朗錦田" },
    lat: 22.4418,
    lng: 114.0727,
    element: "fire",
    featuredSpeciesId: "laksa-dragon",
    dailyCheckinLimit: 3,
    spawnPool: ["little-laksa", "bkt-cub", "garlic-guard", "chilli-baby", "egg-guard", "lemongrass-swordsman", "shrimp-hopper", "vermicelli-sprite"],
  },
  // 香港元崗村據點
  {
    id: "hk-yuen-kong",
    name: { en: "Yuen Kong Village", zh: "元崗村" },
    district: { en: "Pat Heung, Yuen Long, HK", zh: "香港元朗八鄉" },
    lat: 22.425331,
    lng: 114.0769522,
    element: "earth",
    featuredSpeciesId: "bkt-grandmaster",
    dailyCheckinLimit: 3,
    spawnPool: ["little-laksa", "bkt-cub", "satay-skewerling", "nasi-lemak-tot", "garlic-guard", "egg-guard", "lemongrass-swordsman", "shrimp-hopper"],
  },
];

export const CENTRE_MAP: Record<string, HawkerCentre> = Object.fromEntries(
  HAWKER_CENTRES.map((c) => [c.id, c])
);

export const GEOFENCE_RADIUS_M = 50;
export const GEOFENCE_RADIUS_TOLERANT_M = 200;
export const CHECKIN_COOLDOWN_MS = 30 * 60 * 1000;

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
