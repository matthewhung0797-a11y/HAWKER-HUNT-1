// 系統三 server-only 分析後端。
// ⚠️ 只可以喺 route handler / server component 用（會攞 service role key）；唔好 import 落 client。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { opsConfig, isSupabaseConfigured } from "@/lib/ops/config";
import { aggregate, demoSummary, type AnalyticsSummary, type RawEventRow } from "./summary";
import type { AnalyticsRecord } from "./events";

let admin: SupabaseClient | null = null;

/** Service role client（server 專用，繞過 RLS 做插入／聚合讀）。未配置就 null。 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const { url, serviceKey } = opsConfig.supabase;
  if (!url || !serviceKey) return null;
  if (!admin) {
    admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

const TABLE = "analytics_events";

/** 批次插入事件；未配置 Supabase 就 graceful skip（唔 throw） */
export async function insertEvents(
  records: AnalyticsRecord[]
): Promise<{ inserted: number; skipped: boolean }> {
  const sb = getSupabaseAdmin();
  if (!sb) return { inserted: 0, skipped: true };
  const rows = records.map((r) => ({
    ts: r.ts,
    player_key: r.player_key,
    event: r.event,
    props: r.props,
    app_version: r.app_version,
    platform: r.platform,
  }));
  const { error } = await sb.from(TABLE).insert(rows);
  if (error) {
    console.warn("[analytics] insert failed:", error.message);
    return { inserted: 0, skipped: false };
  }
  return { inserted: rows.length, skipped: false };
}

/**
 * 攞 dashboard summary：
 * - 配置咗 Supabase → 讀近 windowDays 內嘅事件，JS 端聚合（MVP 規模足夠）。
 * - 未配置或讀失敗 → 退回 demoSummary()，dashboard 照樣睇到設計。
 */
export async function fetchSummary(windowDays = 14): Promise<AnalyticsSummary> {
  if (!isSupabaseConfigured()) return demoSummary(windowDays);
  const sb = getSupabaseAdmin();
  if (!sb) return demoSummary(windowDays);

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from(TABLE)
    .select("event,props,ts,player_key")
    .gte("ts", since)
    .order("ts", { ascending: false })
    .limit(50000);

  if (error || !data) {
    if (error) console.warn("[analytics] summary fetch failed:", error.message);
    return demoSummary(windowDays);
  }
  if (data.length === 0) {
    // 通咗電但未有數據：照返 live（0 值），俾 founder 知係接通咗但未有流量
    return aggregate([], windowDays);
  }
  return aggregate(data as RawEventRow[], windowDays);
}

export interface LeaderboardSnapshotRow {
  nickname: string;
  faction_id: string | null;
  score: number;
}

/** Dashboard 用嘅排行榜快照（top N）；未配置或失敗就退回 demo。 */
export async function fetchLeaderboardSnapshot(
  limit = 5
): Promise<{ source: "live" | "demo"; rows: LeaderboardSnapshotRow[] }> {
  const demo: LeaderboardSnapshotRow[] = [
    { nickname: "MakanKing", faction_id: "east", score: 4820 },
    { nickname: "LaksaLover88", faction_id: "central", score: 4515 },
    { nickname: "ChickenRiceGod", faction_id: "south", score: 4210 },
    { nickname: "PandanQueen", faction_id: "north", score: 3980 },
    { nickname: "SatayMaster", faction_id: "west", score: 3660 },
  ];
  const sb = getSupabaseAdmin();
  if (!sb) return { source: "demo", rows: demo.slice(0, limit) };
  const { data, error } = await sb
    .from("leaderboard")
    .select("nickname,faction_id,score")
    .order("score", { ascending: false })
    .limit(limit);
  if (error || !data || data.length === 0) {
    return { source: "demo", rows: demo.slice(0, limit) };
  }
  return { source: "live", rows: data as LeaderboardSnapshotRow[] };
}
