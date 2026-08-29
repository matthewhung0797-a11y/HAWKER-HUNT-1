"use client";

// 雲存檔（local-first）。
// 策略：
//  - localStorage（zustand persist）永遠係即時真相，遊戲照跑，離線 / 未配置 Supabase 都 work。
//  - 登入後：pull 雲端 → 同本地 merge（揀「進度較多」嗰份，減少覆蓋損失）→ 寫返 store。
//  - 之後 store 一有變動就 debounce push 上雲（fire-and-forget，失敗唔阻塞 UI）。
//  - 首次登入而雲端未有存檔：直接將本地 localStorage 進度 migrate 上去。

import { useGameStore } from "./store";
import { getPlayerKey } from "./leaderboard";
import { getBrowserSupabase } from "./supabase-browser";
import { ensureAnonSession, getUser, onAuthChange } from "./auth";

const TABLE = "player_saves";

// 要同步嘅存檔欄位（＝ store 入面可持久化嗰批，同 initialState 對齊）。
const SAVE_KEYS = [
  "nickname", "level", "exp", "coins", "gems", "factionId",
  "onboardingDone", "loggedIn", "devMode",
  "ownedSpirits", "captureCounts", "items", "checkins",
  "unlockedSilhouettes", "favouriteCentres", "lastBattleUid",
  "battleWins", "counterWins", "evolveCount",
] as const;

type SaveSnapshot = Record<string, unknown>;

/** 由 store 抽出可持久化嘅存檔快照 */
export function snapshotFromStore(): SaveSnapshot {
  const s = useGameStore.getState() as unknown as Record<string, unknown>;
  const out: SaveSnapshot = {};
  for (const k of SAVE_KEYS) out[k] = s[k];
  return out;
}

/** 將雲端存檔套返落 store（唔掂 action 函數） */
function applySnapshot(snap: SaveSnapshot): void {
  const patch: SaveSnapshot = {};
  for (const k of SAVE_KEYS) if (k in snap) patch[k] = snap[k];
  useGameStore.setState(patch as never);
}

/** 進度分數：用嚟 merge 時揀「較豐富」嗰份，減少覆蓋損失 */
function progressScore(snap: SaveSnapshot): number {
  const spirits = Array.isArray(snap.ownedSpirits) ? snap.ownedSpirits.length : 0;
  const level = typeof snap.level === "number" ? snap.level : 0;
  const checkins = Array.isArray(snap.checkins) ? snap.checkins.length : 0;
  const coins = typeof snap.coins === "number" ? snap.coins : 0;
  // 精靈數最重要，其次等級 / 打卡 / 金幣
  return spirits * 100000 + level * 1000 + checkins * 100 + coins;
}

interface SaveRow {
  state: SaveSnapshot | null;
}

/** 上傳存檔（debounce 由 initCloudSave 控制；呢個係即時執行） */
async function pushNow(): Promise<void> {
  const sb = getBrowserSupabase();
  if (!sb) return;
  const user = await getUser();
  if (!user) return;
  const snap = snapshotFromStore();
  const row = {
    user_id: user.id,
    player_key: getPlayerKey(),
    nickname: (snap.nickname as string) || "Hawker Hunter",
    faction_id: (snap.factionId as string) ?? null,
    level: (snap.level as number) ?? 1,
    coins: (snap.coins as number) ?? 0,
    spirit_count: Array.isArray(snap.ownedSpirits) ? snap.ownedSpirits.length : 0,
    state: snap,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from(TABLE).upsert(row, { onConflict: "user_id" });
  if (error) console.warn("[cloud-save] push failed:", error.message);
}

/** 拉雲端存檔 → 同本地 merge → 寫返 store + 即時 push 統一兩邊 */
async function pullAndMerge(): Promise<void> {
  const sb = getBrowserSupabase();
  if (!sb) return;
  const user = await getUser();
  if (!user) return;

  const { data, error } = await sb
    .from(TABLE)
    .select("state")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("[cloud-save] pull failed:", error.message);
    return;
  }

  const local = snapshotFromStore();
  const remote = (data as SaveRow | null)?.state ?? null;

  if (!remote) {
    // 雲端未有存檔：migrate 本地上去
    await pushNow();
    return;
  }

  // 兩邊都有：揀進度較豐富嗰份做基底，避免覆蓋損失
  const winner = progressScore(remote) >= progressScore(local) ? remote : local;
  applySnapshot(winner);
  await pushNow(); // 統一雲端 = winner
}

let started = false;
let subscribed = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 4000;

function schedulePush(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void pushNow();
  }, DEBOUNCE_MS);
}

/** 只訂閱 store 一次（initCloudSave / loginAndSync 都可能 call，避免雙重 push） */
function subscribeOnce(): void {
  if (subscribed) return;
  subscribed = true;
  useGameStore.subscribe(() => schedulePush());
}

/**
 * 啟動雲存檔同步（喺 client 掛載後 call 一次）。
 * - 有 session 就 pull+merge，然後訂閱 store 變動 debounce push。
 * - 未配置 Supabase / 匿名登入未開 → 靜靜 no-op，遊戲照跑 localStorage。
 * ⚠️ 唔會自動開匿名帳號；由「登入」動作（login 頁 guest / social）先 ensureAnonSession，
 *    避免每個訪客都被建立 auth user。
 */
export async function initCloudSave(): Promise<void> {
  if (started) return;
  const sb = getBrowserSupabase();
  if (!sb) return;
  started = true;

  // 已經有 session（例如之前登入過 / OAuth redirect 返嚟）就即刻同步
  const user = await getUser();
  if (user) await pullAndMerge();

  // 登入狀態變化：升級 / redirect 返嚟時再同步一次
  onAuthChange((u) => {
    if (u) void pullAndMerge();
  });

  // store 一有變動就排期 push
  subscribeOnce();
}

/** 由「登入」動作觸發：確保有帳號（匿名或已升級）然後同步。回傳係咪成功建立 session。 */
export async function loginAndSync(): Promise<boolean> {
  const sb = getBrowserSupabase();
  if (!sb) return false;
  const user = (await getUser()) ?? (await ensureAnonSession());
  if (!user) return false;
  await pullAndMerge();
  subscribeOnce();
  started = true;
  return true;
}
