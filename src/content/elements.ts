import type { ElementType, FlavorType, LocalizedText } from "./types";

export const ELEMENT_INFO: Record<
  ElementType,
  { name: LocalizedText; flavor: FlavorType; flavorName: LocalizedText; color: string; icon: string }
> = {
  metal: {
    name: { en: "Metal", zh: "金" },
    flavor: "bitter",
    flavorName: { en: "Bitter", zh: "苦" },
    color: "#b8a049",
    icon: "elem-metal",
  },
  wood: {
    name: { en: "Wood", zh: "木" },
    flavor: "sour",
    flavorName: { en: "Sour", zh: "酸" },
    color: "#4e9a51",
    icon: "elem-wood",
  },
  water: {
    name: { en: "Water", zh: "水" },
    flavor: "salty",
    flavorName: { en: "Salty", zh: "鹹" },
    color: "#3d7fc1",
    icon: "elem-water",
  },
  fire: {
    name: { en: "Fire", zh: "火" },
    flavor: "spicy",
    flavorName: { en: "Spicy", zh: "辣" },
    color: "#d84a2f",
    icon: "elem-fire",
  },
  earth: {
    name: { en: "Earth", zh: "土" },
    flavor: "sweet",
    flavorName: { en: "Sweet", zh: "甜" },
    color: "#9a6b3f",
    icon: "elem-earth",
  },
};

/** 相剋：key 剋 value（金剋木、木剋土、土剋水、水剋火、火剋金） */
export const ELEMENT_COUNTERS: Record<ElementType, ElementType> = {
  metal: "wood",
  wood: "earth",
  earth: "water",
  water: "fire",
  fire: "metal",
};

/** 相生：key 生 value（金生水、水生木、木生火、火生土、土生金） */
export const ELEMENT_GENERATES: Record<ElementType, ElementType> = {
  metal: "water",
  water: "wood",
  wood: "fire",
  fire: "earth",
  earth: "metal",
};

export const COUNTER_MULTIPLIER = 1.5;
export const COUNTERED_MULTIPLIER = 0.75;

/** 攻擊方 → 防守方傷害倍率 */
export function getElementMultiplier(attacker: ElementType, defender: ElementType): number {
  if (ELEMENT_COUNTERS[attacker] === defender) return COUNTER_MULTIPLIER;
  if (ELEMENT_COUNTERS[defender] === attacker) return COUNTERED_MULTIPLIER;
  return 1.0;
}

export const ELEMENT_ORDER: ElementType[] = ["metal", "wood", "water", "fire", "earth"];
