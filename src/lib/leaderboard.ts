/**
 * 排行榜後端（Supabase）
 * - .env.local 冇配置 NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 時，全部函數安全退回 null，
 *   排行榜頁自動顯示離線示範數據。
 * - 匿名裝置身分：localStorage 持久化一個 player_key（uuid），上分用 upsert。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: false }, // 匿名榜，唔使 auth session
    });
  }
  return client;
}

/** 裝置持久身分 key（冇註冊系統前用嚟認住「我」嗰行） */
export function getPlayerKey(): string {
  try {
    let key = localStorage.getItem("hh-player-key");
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem("hh-player-key", key);
    }
    return key;
  } catch {
    return "anonymous";
  }
}

export interface LeaderboardRow {
  player_key: string;
  nickname: string;
  faction_id: string | null;
  score: number;
}

/** 上傳／更新自己分數（fire-and-forget，失敗唔阻塞 UI） */
export async function submitScore(
  nickname: string,
  factionId: string | null,
  score: number
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from("leaderboard").upsert(
    {
      player_key: getPlayerKey(),
      nickname: nickname || "Hawker Hunter",
      faction_id: factionId,
      score,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "player_key" }
  );
  if (error) console.warn("[leaderboard] submit failed:", error.message);
  return !error;
}

/** 讀取真實榜：頭 100 名個人＋陣營總分（client 端聚合，MVP 規模足夠） */
export async function fetchLeaderboard(): Promise<{
  players: LeaderboardRow[];
  factionTotals: Record<string, number>;
} | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("leaderboard")
    .select("player_key,nickname,faction_id,score")
    .order("score", { ascending: false })
    .limit(100);
  if (error || !data) {
    if (error) console.warn("[leaderboard] fetch failed:", error.message);
    return null;
  }
  const factionTotals: Record<string, number> = {};
  for (const row of data) {
    if (row.faction_id) factionTotals[row.faction_id] = (factionTotals[row.faction_id] ?? 0) + row.score;
  }
  return { players: data, factionTotals };
}
