"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SPECIES_MAP } from "@/content/species";
import { CENTRE_MAP, CHECKIN_COOLDOWN_MS } from "@/content/centres";
import { ITEMS } from "@/content/items";
import { todayStr } from "./geo";

export interface OwnedSpirit {
  /** 唯一實例 id */
  uid: string;
  speciesId: string;
  level: number;
  /** 當前等級內累積經驗（切磋贏取） */
  exp?: number;
  caughtAt: number; // timestamp
  centreId: string;
  /** 閃光變異色（約 1/50 機率） */
  shiny?: boolean;
}

/** 精靈升級所需經驗（隨等級遞增）；上限 Lv.30 */
export const SPIRIT_LEVEL_CAP = 30;
export const spiritExpToNext = (level: number) => 60 + level * 40;

/** 等級 → 屬性倍率：每級 +5%，Lv.30 約 2.45 倍（同進化階級拉開差距但唔取代進化） */
export const spiritStatMultiplier = (level: number) => 1 + 0.05 * (Math.max(1, level) - 1);

export interface CheckinRecord {
  centreId: string;
  date: string; // YYYY-MM-DD (SGT)
  timestamp: number;
}

interface GameState {
  // 玩家
  nickname: string;
  level: number;
  exp: number;
  coins: number;
  gems: number;
  factionId: string;
  onboardingDone: boolean;
  loggedIn: boolean;
  /** 測試模式：跳過 GPS 圍欄 + QR 驗證（真機實地測試前用） */
  devMode: boolean;

  ownedSpirits: OwnedSpirit[];
  /** 捕獲次數統計 speciesId → count */
  captureCounts: Record<string, number>;
  items: Record<string, number>;
  checkins: CheckinRecord[];
  /** 打卡解鎖嘅精靈剪影 */
  unlockedSilhouettes: string[];
  favouriteCentres: string[];
  /** 上次出戰精靈 uid（出戰選擇器預設用） */
  lastBattleUid: string | null;
  /** 切磋勝場 */
  battleWins: number;
  /** 帶五行克制優勢嘅勝場（相剋徽章用） */
  counterWins: number;
  /** 進化次數 */
  evolveCount: number;

  // actions
  setNickname: (n: string) => void;
  completeOnboarding: () => void;
  login: () => void;
  toggleDevMode: () => void;
  toggleFavourite: (centreId: string) => void;
  /** 今日某據點已打卡次數 */
  todayCheckinCount: (centreId: string) => number;
  /** 同一據點冷卻剩餘毫秒；0 = 可以再打（跨據點互唔影響） */
  checkinCooldownRemainingMs: (centreId: string) => number;
  /** 打卡：回傳獲得道具（1 件相關材料 ＋ 20 筷子） */
  checkin: (centreId: string) => { itemId: string; qty: number }[];
  /** 累積打卡過幾多個唔同據點 */
  distinctCentresCheckedIn: () => number;
  /** 現有筷子數量 */
  chopsticksCount: (tier?: string) => number;
  /** 開始搏鬥扣 1 筷；唔夠就 false（失敗唔退） */
  spendChopstick: (tier?: string) => boolean;
  /** 捕捉成功（level = 野生等級；唔傳就 Lv.1） */
  captureSpirit: (
    speciesId: string,
    centreId: string,
    shiny?: boolean,
    level?: number
  ) => OwnedSpirit;
  /** 進化：消耗道具，替換精靈 */
  evolveSpirit: (uid: string) => OwnedSpirit | null;
  canEvolve: (speciesId: string) => boolean;
  /** 切磋贏咗：記低戰績（hadAdvantage = 我方屬性剋敵方） */
  recordBattleWin: (hadAdvantage: boolean) => void;
  setLastBattleUid: (uid: string) => void;
  /** 精靈贏切磋獲得經驗；回傳升級後等級（冇升 = null） */
  gainSpiritExp: (uid: string, amount: number) => { levelsGained: number; newLevel: number } | null;
  /** 切磋勝利掉落：敵方系列對應嘅進化材料（打邊系爆邊系嘅料） */
  battleLoot: (enemySpeciesId: string, hadAdvantage: boolean) => { itemId: string; qty: number }[];
  /** Dev 測試：一鍵解鎖全部精靈（各階段）＋進化道具 */
  devUnlockAll: () => void;
  addExp: (amount: number) => void;
  resetAll: () => void;
}

const EXP_PER_LEVEL = 100;

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const initialState = {
  nickname: "",
  level: 1,
  exp: 0,
  coins: 500,
  gems: 20,
  factionId: "central",
  onboardingDone: false,
  loggedIn: false,
  devMode: false,
  ownedSpirits: [] as OwnedSpirit[],
  captureCounts: {} as Record<string, number>,
  items: {} as Record<string, number>,
  checkins: [] as CheckinRecord[],
  unlockedSilhouettes: [] as string[],
  favouriteCentres: [] as string[],
  lastBattleUid: null as string | null,
  battleWins: 0,
  counterWins: 0,
  evolveCount: 0,
};

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setNickname: (n) => set({ nickname: n }),
      completeOnboarding: () => set({ onboardingDone: true }),
      login: () => set({ loggedIn: true }),
      toggleDevMode: () => set((s) => ({ devMode: !s.devMode })),
      toggleFavourite: (centreId) =>
        set((s) => ({
          favouriteCentres: s.favouriteCentres.includes(centreId)
            ? s.favouriteCentres.filter((c) => c !== centreId)
            : [...s.favouriteCentres, centreId],
        })),

      todayCheckinCount: (centreId) => {
        const today = todayStr();
        return get().checkins.filter((c) => c.centreId === centreId && c.date === today).length;
      },

      checkinCooldownRemainingMs: (centreId) => {
        const today = todayStr();
        const todays = get().checkins.filter((c) => c.centreId === centreId && c.date === today);
        if (todays.length === 0) return 0;
        const last = todays.reduce((a, b) => (a.timestamp > b.timestamp ? a : b));
        return Math.max(0, last.timestamp + CHECKIN_COOLDOWN_MS - Date.now());
      },

      checkin: (centreId) => {
        const centre = CENTRE_MAP[centreId];
        // 1 件同據點 spawn 精靈相關嘅進化材料 ＋ 20 筷子（捉寵資源，分開顯示）
        const poolItems = new Set<string>();
        for (const spId of centre.spawnPool) {
          const sp = SPECIES_MAP[spId];
          if (sp?.evolutionRequirement) {
            Object.keys(sp.evolutionRequirement.items).forEach((i) => poolItems.add(i));
          }
        }
        const matCandidates = [...poolItems].filter((id) => id !== "chopsticks");
        const fallbackMats = ITEMS.map((i) => i.id).filter((id) => id !== "chopsticks");
        const pickFrom = matCandidates.length > 0 ? matCandidates : fallbackMats;
        const materialId = pickFrom[Math.floor(Math.random() * pickFrom.length)];
        const rewards: { itemId: string; qty: number }[] = [
          { itemId: materialId, qty: 1 },
          { itemId: "chopsticks", qty: 20 },
        ];

        set((s) => {
          const items = { ...s.items };
          for (const r of rewards) items[r.itemId] = (items[r.itemId] ?? 0) + r.qty;
          const silhouette = centre.spawnPool[0];
          return {
            checkins: [...s.checkins, { centreId, date: todayStr(), timestamp: Date.now() }],
            items,
            unlockedSilhouettes: s.unlockedSilhouettes.includes(silhouette)
              ? s.unlockedSilhouettes
              : [...s.unlockedSilhouettes, silhouette],
            coins: s.coins + 50,
          };
        });
        get().addExp(20);
        return rewards;
      },

      distinctCentresCheckedIn: () => new Set(get().checkins.map((c) => c.centreId)).size,

      chopsticksCount: (tier?: string) => {
        if (tier && tier !== "wooden") {
          return get().items[`chopsticks_${tier}`] ?? 0;
        }
        return get().items["chopsticks"] ?? 0;
      },

      spendChopstick: (tier?: string) => {
        const key = (tier && tier !== "wooden") ? `chopsticks_${tier}` : "chopsticks";
        const n = get().items[key] ?? 0;
        if (n < 1) {
          // 唔夠高級筷就退回木筷
          const wn = get().items["chopsticks"] ?? 0;
          if (wn < 1) return false;
          set((s) => ({ items: { ...s.items, chopsticks: Math.max(0, wn - 1) } }));
          return true;
        }
        set((s) => ({ items: { ...s.items, [key]: Math.max(0, n - 1) } }));
        return true;
      },

      captureSpirit: (speciesId, centreId, shiny, level) => {
        const spirit: OwnedSpirit = {
          uid: uid(),
          speciesId,
          level: Math.min(
            SPIRIT_LEVEL_CAP,
            Math.max(1, Math.floor(level ?? 1))
          ),
          caughtAt: Date.now(),
          centreId,
          ...(shiny ? { shiny: true } : {}),
        };
        set((s) => ({
          ownedSpirits: [...s.ownedSpirits, spirit],
          captureCounts: {
            ...s.captureCounts,
            [speciesId]: (s.captureCounts[speciesId] ?? 0) + 1,
          },
          coins: s.coins + 30,
        }));
        get().addExp(30);
        return spirit;
      },

      canEvolve: (speciesId) => {
        const sp = SPECIES_MAP[speciesId];
        if (!sp?.evolutionRequirement || !sp.evolvesTo) return false;
        const s = get();
        const req = sp.evolutionRequirement;
        for (const [itemId, qty] of Object.entries(req.items)) {
          if ((s.items[itemId] ?? 0) < qty) return false;
        }
        return s.distinctCentresCheckedIn() >= req.checkinCentres ||
          // devMode 放寬打卡據點要求，方便測試
          (s.devMode && true);
      },

      evolveSpirit: (spiritUid) => {
        const s = get();
        const spirit = s.ownedSpirits.find((sp) => sp.uid === spiritUid);
        if (!spirit) return null;
        const species = SPECIES_MAP[spirit.speciesId];
        if (!species?.evolvesTo || !species.evolutionRequirement) return null;
        if (!s.canEvolve(spirit.speciesId)) return null;

        const items = { ...s.items };
        for (const [itemId, qty] of Object.entries(species.evolutionRequirement.items)) {
          items[itemId] = Math.max(0, (items[itemId] ?? 0) - qty);
        }
        const evolved: OwnedSpirit = { ...spirit, speciesId: species.evolvesTo };
        set({
          items,
          ownedSpirits: s.ownedSpirits.map((sp) => (sp.uid === spiritUid ? evolved : sp)),
          captureCounts: {
            ...s.captureCounts,
            [species.evolvesTo]: (s.captureCounts[species.evolvesTo] ?? 0) + 1,
          },
          evolveCount: s.evolveCount + 1,
        });
        get().addExp(80);
        return evolved;
      },

      recordBattleWin: (hadAdvantage) =>
        set((s) => ({
          battleWins: s.battleWins + 1,
          counterWins: s.counterWins + (hadAdvantage ? 1 : 0),
        })),

      setLastBattleUid: (spiritUid) => set({ lastBattleUid: spiritUid }),

      battleLoot: (enemySpeciesId, hadAdvantage) => {
        const enemy = SPECIES_MAP[enemySpeciesId];
        if (!enemy) return [];
        // 同系列各階段嘅進化需求：一階材料 = 常見掉落；只喺二階需求出現嘅 = 稀有掉落
        const sameSeries = Object.values(SPECIES_MAP).filter((sp) => sp.seriesId === enemy.seriesId);
        const commonPool = new Set<string>();
        const rarePool = new Set<string>();
        for (const sp of sameSeries) {
          if (!sp.evolutionRequirement) continue;
          for (const itemId of Object.keys(sp.evolutionRequirement.items)) {
            if (sp.stage === 1) commonPool.add(itemId);
            else rarePool.add(itemId);
          }
        }
        for (const c of commonPool) rarePool.delete(c);
        const commons = [...commonPool];
        const rares = [...rarePool];
        const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

        const drops: { itemId: string; qty: number }[] = [];
        if (commons.length) {
          // 保底 1 件常見材料；五行克制優勢加多 1 件（鼓勵揀啱屬性出戰）
          drops.push({ itemId: pick(commons), qty: hadAdvantage ? 2 : 1 });
        }
        // 打贏二階以上有 30% 爆稀有材料（祖傳秘方／叻沙之魂……）
        if (enemy.stage >= 2 && rares.length && Math.random() < 0.3) {
          drops.push({ itemId: pick(rares), qty: 1 });
        }
        if (drops.length) {
          set((s) => {
            const items = { ...s.items };
            for (const d of drops) items[d.itemId] = (items[d.itemId] ?? 0) + d.qty;
            return { items };
          });
        }
        return drops;
      },

      gainSpiritExp: (spiritUid, amount) => {
        const s = get();
        const spirit = s.ownedSpirits.find((sp) => sp.uid === spiritUid);
        if (!spirit || spirit.level >= SPIRIT_LEVEL_CAP) return null;
        let level = spirit.level;
        let exp = (spirit.exp ?? 0) + amount;
        let gained = 0;
        while (level < SPIRIT_LEVEL_CAP && exp >= spiritExpToNext(level)) {
          exp -= spiritExpToNext(level);
          level += 1;
          gained += 1;
        }
        if (level >= SPIRIT_LEVEL_CAP) exp = 0;
        set({
          ownedSpirits: s.ownedSpirits.map((sp) =>
            sp.uid === spiritUid ? { ...sp, level, exp } : sp
          ),
        });
        return gained > 0 ? { levelsGained: gained, newLevel: level } : null;
      },

      devUnlockAll: () =>
        set((s) => {
          const owned = [...s.ownedSpirits];
          const counts = { ...s.captureCounts };
          for (const sp of Object.values(SPECIES_MAP)) {
            counts[sp.id] = Math.max(counts[sp.id] ?? 0, 1);
            if (!owned.some((o) => o.speciesId === sp.id)) {
              owned.push({
                uid: uid(),
                speciesId: sp.id,
                level: sp.stage * 3, // 高階高等，測戰鬥數值分佈
                caughtAt: Date.now(),
                centreId: "maxwell",
                // 其中一隻最終形態俾埋閃光，測變異色喺高模上嘅效果
                ...(sp.id === "laksa-dragon" ? { shiny: true } : {}),
              });
            }
          }
          const items = { ...s.items };
          for (const it of ITEMS) items[it.id] = Math.max(items[it.id] ?? 0, 10);
          items.chopsticks_copper = Math.max(items.chopsticks_copper ?? 0, 10);
          items.chopsticks_silver = Math.max(items.chopsticks_silver ?? 0, 10);
          items.chopsticks_golden = Math.max(items.chopsticks_golden ?? 0, 10);
          return { ownedSpirits: owned, captureCounts: counts, items };
        }),

      addExp: (amount) =>
        set((s) => {
          let exp = s.exp + amount;
          let level = s.level;
          while (exp >= EXP_PER_LEVEL * level) {
            exp -= EXP_PER_LEVEL * level;
            level += 1;
          }
          return { exp, level };
        }),

      resetAll: () => set({ ...initialState }),
    }),
    { name: "hawker-hunt-save" }
  )
);

/** 已捕獲嘅唔同 species 數量（圖鑑進度） */
export function useDexProgress() {
  const captureCounts = useGameStore((s) => s.captureCounts);
  return Object.keys(captureCounts).length;
}
