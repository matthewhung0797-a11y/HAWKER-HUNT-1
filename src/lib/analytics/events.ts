// 系統三 埋點事件目錄（唯一真相來源）
// 呢度定義所有可追蹤嘅遊戲事件同佢哋嘅 props 形狀。
// 加新事件：喺 ANALYTICS_EVENTS 加名 + 喺 EventPropsMap 加對應 props（只加唔改）。
// 隱私：淨係記匿名 player_key（見 leaderboard.ts），唔記任何 PII。

/** App 版本標籤（跟 package.json；client 讀唔到 package.json，所以喺度手動同步） */
export const APP_VERSION =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_APP_VERSION) || "0.1.0";

/** 所有受支援嘅事件名（ASCII kebab/snake，同 DB event 欄位一致） */
export const ANALYTICS_EVENTS = [
  "app_open", // 進 app（每個 session 一次）
  "checkin", // 據點打卡成功
  "capture_start", // 開始捕捉一隻精靈
  "capture_success", // 捕捉成功
  "capture_fail", // 捕捉失敗（走甩）
  "battle_start", // 開始一場切磋
  "battle_win", // 切磋勝出
  "battle_lose", // 切磋落敗
  "evolve", // 精靈進化
  "leaderboard_view", // 睇排行榜
  "session_end", // 離開／收起（帶 session 時長）
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/** 每個事件對應嘅 props 形狀（全部只放非敏感嘅遊戲維度） */
export interface EventPropsMap {
  app_open: { referrer?: string; locale?: string };
  checkin: { centreId: string };
  capture_start: { speciesId: string; centreId: string; arMode: string };
  capture_success: {
    speciesId: string;
    centreId: string;
    arMode: string;
    shiny: boolean;
    level?: number;
    stage?: number;
  };
  capture_fail: { speciesId: string; centreId: string; arMode: string };
  battle_start: { enemySpeciesId: string; playerSpeciesId?: string };
  battle_win: { enemySpeciesId: string; playerSpeciesId?: string; hadAdvantage: boolean };
  battle_lose: { enemySpeciesId: string; playerSpeciesId?: string };
  evolve: { fromSpeciesId: string; toSpeciesId: string };
  leaderboard_view: { tab?: string };
  session_end: { durationMs: number };
}

/** 一條落到 DB 嘅事件記錄（client 送出前嘅形狀） */
export interface AnalyticsRecord {
  event: AnalyticsEvent;
  props: Record<string, unknown>;
  ts: string; // ISO timestamp（client 產生，方便離線／批次時保留真實時序）
  player_key: string;
  app_version: string;
  platform: string;
}

/** 粗略平台分類（唔記完整 UA，只做 mobile/desktop 維度） */
export function detectPlatform(): string {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent || "";
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/mobile/i.test(ua)) return "mobile";
  return "desktop";
}
