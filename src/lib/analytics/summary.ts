// 系統三 聚合層（server／client 共用，冇任何 server-only 依賴）
// - AnalyticsSummary：dashboard 用嘅 KPI 形狀。
// - aggregate()：由原始事件 rows 計出 summary（Supabase 通電時用）。
// - demoSummary()：離線示範數據（未配置 Supabase 時，dashboard 即刻睇到設計）。

import type { AnalyticsEvent } from "./events";

/** DB 一行原始事件（同 aggregate() 食嘅形狀；ts 為 ISO string） */
export interface RawEventRow {
  event: string;
  props: Record<string, unknown> | null;
  ts: string;
  player_key: string;
}

export interface DayCount {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface FunnelStage {
  stage: string;
  label: string;
  players: number;
}

export interface AnalyticsSummary {
  source: "live" | "demo";
  generatedAt: string;
  windowDays: number;
  totals: {
    events: number;
    players: number;
    activeToday: number;
    captures: number;
    captureAttempts: number;
    captureSuccessRate: number; // 0..1
    battles: number;
    battleWins: number;
    battleWinRate: number; // 0..1
    checkins: number;
    evolves: number;
    shinyCaught: number;
  };
  dailyActive: DayCount[]; // 每日活躍玩家（distinct player_key）
  capturesByDay: DayCount[];
  topSpecies: { speciesId: string; count: number }[];
  funnel: FunnelStage[]; // open → capture → battle → evolve
  arModeBreakdown: { mode: string; count: number }[];
}

const DAY = 24 * 60 * 60 * 1000;

function dayKey(d: number | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** 產生由 today 倒數 n 日嘅日期序列（升序） */
function lastNDays(n: number, end = Date.now()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(end - i * DAY));
  return out;
}

const asString = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** 由原始事件 rows 計 summary（純函數，方便 server route 直接用） */
export function aggregate(rows: RawEventRow[], windowDays = 14): AnalyticsSummary {
  const days = lastNDays(windowDays);
  const daySet = new Set(days);

  const dailyActiveSets: Record<string, Set<string>> = {};
  const capturesByDayMap: Record<string, number> = {};
  const speciesCount: Record<string, number> = {};
  const arModeCount: Record<string, number> = {};
  const allPlayers = new Set<string>();
  const todayStr = dayKey(Date.now());
  const activeTodaySet = new Set<string>();

  // funnel：每個 stage 有做過嘅 distinct 玩家
  const funnelSets: Record<string, Set<string>> = {
    open: new Set(),
    capture: new Set(),
    battle: new Set(),
    evolve: new Set(),
  };

  let captures = 0;
  let captureFails = 0;
  let battleWins = 0;
  let battleLoses = 0;
  let checkins = 0;
  let evolves = 0;
  let shinyCaught = 0;

  for (const row of rows) {
    const ev = row.event as AnalyticsEvent;
    const p = row.props ?? {};
    const dk = dayKey(row.ts);
    allPlayers.add(row.player_key);
    if (dk === todayStr) activeTodaySet.add(row.player_key);
    if (daySet.has(dk)) {
      (dailyActiveSets[dk] ??= new Set()).add(row.player_key);
    }

    switch (ev) {
      case "app_open":
        funnelSets.open.add(row.player_key);
        break;
      case "checkin":
        checkins++;
        break;
      case "capture_success": {
        captures++;
        funnelSets.capture.add(row.player_key);
        if (daySet.has(dk)) capturesByDayMap[dk] = (capturesByDayMap[dk] ?? 0) + 1;
        const sp = asString(p.speciesId);
        if (sp) speciesCount[sp] = (speciesCount[sp] ?? 0) + 1;
        const mode = asString(p.arMode);
        if (mode) arModeCount[mode] = (arModeCount[mode] ?? 0) + 1;
        if (p.shiny === true) shinyCaught++;
        break;
      }
      case "capture_fail":
        captureFails++;
        break;
      case "battle_start":
        funnelSets.battle.add(row.player_key);
        break;
      case "battle_win":
        battleWins++;
        funnelSets.battle.add(row.player_key);
        break;
      case "battle_lose":
        battleLoses++;
        funnelSets.battle.add(row.player_key);
        break;
      case "evolve":
        evolves++;
        funnelSets.evolve.add(row.player_key);
        break;
      default:
        break;
    }
  }

  const captureAttempts = captures + captureFails;
  const battles = battleWins + battleLoses;

  return {
    source: "live",
    generatedAt: new Date().toISOString(),
    windowDays,
    totals: {
      events: rows.length,
      players: allPlayers.size,
      activeToday: activeTodaySet.size,
      captures,
      captureAttempts,
      captureSuccessRate: captureAttempts > 0 ? captures / captureAttempts : 0,
      battles,
      battleWins,
      battleWinRate: battles > 0 ? battleWins / battles : 0,
      checkins,
      evolves,
      shinyCaught,
    },
    dailyActive: days.map((d) => ({ date: d, count: dailyActiveSets[d]?.size ?? 0 })),
    capturesByDay: days.map((d) => ({ date: d, count: capturesByDayMap[d] ?? 0 })),
    topSpecies: Object.entries(speciesCount)
      .map(([speciesId, count]) => ({ speciesId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    funnel: [
      { stage: "open", label: "開 App", players: funnelSets.open.size },
      { stage: "capture", label: "捕捉", players: funnelSets.capture.size },
      { stage: "battle", label: "切磋", players: funnelSets.battle.size },
      { stage: "evolve", label: "進化", players: funnelSets.evolve.size },
    ],
    arModeBreakdown: Object.entries(arModeCount)
      .map(([mode, count]) => ({ mode, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** 離線示範 summary：一組似模似樣嘅假數據，等 dashboard 未接 Supabase 都睇到設計 */
export function demoSummary(windowDays = 14): AnalyticsSummary {
  const days = lastNDays(windowDays);
  // 用平滑上升 + 週末微升嘅曲線砌活躍／捕捉數，睇落似真嘢
  const dailyActive: DayCount[] = days.map((d, i) => {
    const weekday = new Date(d).getDay();
    const weekendBoost = weekday === 0 || weekday === 6 ? 1.35 : 1;
    return { date: d, count: Math.round((18 + i * 3.4) * weekendBoost) };
  });
  const capturesByDay: DayCount[] = dailyActive.map((d) => ({
    date: d.date,
    count: Math.round(d.count * (2.1 + Math.sin(new Date(d.date).getDate()) * 0.4)),
  }));

  const captures = capturesByDay.reduce((s, d) => s + d.count, 0);
  const captureAttempts = Math.round(captures / 0.62);
  const battles = 214;
  const battleWins = 128;

  return {
    source: "demo",
    generatedAt: new Date().toISOString(),
    windowDays,
    totals: {
      events: captureAttempts * 3 + battles * 2 + 640,
      players: 342,
      activeToday: dailyActive[dailyActive.length - 1]?.count ?? 0,
      captures,
      captureAttempts,
      captureSuccessRate: captures / captureAttempts,
      battles,
      battleWins,
      battleWinRate: battleWins / battles,
      checkins: 486,
      evolves: 73,
      shinyCaught: 14,
    },
    dailyActive,
    capturesByDay,
    topSpecies: [
      { speciesId: "oily-rice-chick", count: 96 },
      { speciesId: "little-laksa", count: 81 },
      { speciesId: "chilli-baby", count: 64 },
      { speciesId: "satay-skewerling", count: 58 },
      { speciesId: "bkt-cub", count: 47 },
      { speciesId: "garlic-guard", count: 39 },
    ],
    funnel: [
      { stage: "open", label: "開 App", players: 342 },
      { stage: "capture", label: "捕捉", players: 268 },
      { stage: "battle", label: "切磋", players: 141 },
      { stage: "evolve", label: "進化", players: 52 },
    ],
    arModeBreakdown: [
      { mode: "gyro", count: 182 },
      { mode: "3d", count: 141 },
      { mode: "static", count: 96 },
      { mode: "slam", count: 61 },
    ],
  };
}
