// 埋點 ingestion：遊戲 client（track.ts）批次上報事件。
// - service role 寫入（analytics_events RLS 擋匿名直寫，只有這裡可寫）。
// - 驗證事件名單 + 批次上限，防垃圾請求。
// - 未配置 Supabase 回 503（client 端 track 本來就 no-op，雙保險）。

import { NextResponse } from "next/server";
import { ANALYTICS_EVENTS, type AnalyticsRecord } from "@/lib/analytics/events";
import { insertEvents } from "@/lib/analytics/server";
import { isSupabaseConfigured } from "@/lib/ops/config";

export const dynamic = "force-dynamic";

const MAX_BATCH = 50;
const VALID_EVENTS: ReadonlySet<string> = new Set(ANALYTICS_EVENTS);

/** 基本形狀驗證 + 收斂成安全欄位（不合規直接丟棄，唔 reject 成批） */
function sanitize(raw: unknown): AnalyticsRecord | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.event !== "string" || !VALID_EVENTS.has(r.event)) return null;
  if (typeof r.ts !== "string" || Number.isNaN(Date.parse(r.ts))) return null;
  if (typeof r.player_key !== "string" || r.player_key.length === 0 || r.player_key.length > 64) return null;
  const props =
    r.props && typeof r.props === "object" && !Array.isArray(r.props)
      ? (r.props as Record<string, unknown>)
      : {};
  return {
    event: r.event as AnalyticsRecord["event"],
    props,
    ts: r.ts,
    player_key: r.player_key,
    app_version: typeof r.app_version === "string" ? r.app_version.slice(0, 32) : "unknown",
    platform: typeof r.platform === "string" ? r.platform.slice(0, 16) : "unknown",
  };
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ inserted: 0, skipped: true }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "events-required" }, { status: 400 });
  }

  const records = events.slice(0, MAX_BATCH).map(sanitize).filter((r): r is AnalyticsRecord => r !== null);
  if (records.length === 0) {
    return NextResponse.json({ inserted: 0 });
  }

  const result = await insertEvents(records);
  return NextResponse.json(result);
}
