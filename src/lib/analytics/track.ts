"use client";

// 系統三 client 端埋點 API：track(event, props)
// 設計原則（同 leaderboard.ts 一脈相承）：
// - Fire-and-forget、非阻塞：入 queue 就即刻 return，絕不 await、絕不 throw。
// - 批次送出：儲夠一批或者過咗一段時間先 flush，用 sendBeacon／keepalive fetch。
// - Graceful：未配置 Supabase（冇 NEXT_PUBLIC_SUPABASE_URL）就 no-op，
//   淨係喺 NEXT_PUBLIC_ANALYTICS_DEBUG 開咗時 console.debug 出嚟睇。
// - 隱私：只帶匿名 player_key（同排行榜共用），冇 PII。

import { getPlayerKey } from "@/lib/leaderboard";
import {
  APP_VERSION,
  detectPlatform,
  type AnalyticsEvent,
  type AnalyticsRecord,
  type EventPropsMap,
} from "./events";

const ENDPOINT = "/api/analytics";
const BATCH_MAX = 20; // 儲夠咁多條即刻 flush
const FLUSH_INTERVAL_MS = 4000; // 或者隔咁耐 flush 一次

/** 配置咗 Supabase 先真送；否則 client 端就 no-op（route 都會再守一次） */
const SUPABASE_ON = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
/** 開咗就算離線都會 console.debug 出每個事件，方便本機睇埋點有冇打中 */
const DEBUG = process.env.NEXT_PUBLIC_ANALYTICS_DEBUG === "1";

let queue: AnalyticsRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

/** 送出當前 queue（用 sendBeacon 最穩陣，退回 keepalive fetch）。失敗靜靜丟低，唔阻塞。 */
export async function flush(useBeacon = false): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const body = JSON.stringify({ events: batch });
  try {
    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      return;
    }
    await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    // 網絡爆咗都唔好影響遊戲；直接丟低呢批（分析數據可以缺失，唔值得重試阻塞）
  }
}

/**
 * 記錄一個事件。永遠同步 return，永遠唔會 throw。
 * @example track("capture_success", { speciesId, centreId, arMode, shiny })
 */
export function track<E extends AnalyticsEvent>(event: E, props?: EventPropsMap[E]): void {
  try {
    if (typeof window === "undefined") return; // 只喺 client 行
    const record: AnalyticsRecord = {
      event,
      props: (props ?? {}) as Record<string, unknown>,
      ts: new Date().toISOString(),
      player_key: getPlayerKey(),
      app_version: APP_VERSION,
      platform: detectPlatform(),
    };
    if (DEBUG) console.debug("[analytics]", event, record.props);
    if (!SUPABASE_ON) return; // 離線示範：唔送網絡，淨係（可選）debug log
    queue.push(record);
    if (queue.length >= BATCH_MAX) void flush();
    else scheduleFlush();
  } catch {
    // 埋點自己爆都唔可以拖冧遊戲
  }
}

/**
 * 全局初始化：記 app_open、喺頁面收起／離開時 flush + 記 session_end。
 * 由 <AnalyticsInit /> 喺 layout 掛一次。重複呼叫安全。
 */
export function initAnalytics(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  const sessionStart = Date.now();
  track("app_open", {
    referrer: document.referrer || undefined,
    locale: document.documentElement.lang || undefined,
  });

  const onHide = () => {
    if (document.visibilityState === "hidden") {
      track("session_end", { durationMs: Date.now() - sessionStart });
      void flush(true); // 用 beacon，趕喺頁面凍結前送走
    }
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", () => void flush(true));
}
