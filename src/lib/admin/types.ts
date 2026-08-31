// 後台共用型別 + 角色→權限對照表（client-safe：無任何 server import）。
// "use server" 檔（actions.ts）只可 export async 函數，所以所有型別集中在呢度。

export type AdminRole = "super" | "content" | "ops" | "support" | "analyst";

export type Cap =
  | "dashboard"
  | "players:read"
  | "players:write"
  | "players:gift"
  | "ops:manage"
  | "reports:read"
  | "admins:manage"
  | "spirits:manage"
  | "centres:manage"
  | "missions:manage"
  | "data:manage"
  | "notify:send";

export const ALL_CAPS: readonly Cap[] = [
  "dashboard",
  "players:read",
  "players:write",
  "players:gift",
  "ops:manage",
  "reports:read",
  "admins:manage",
  "spirits:manage",
  "centres:manage",
  "missions:manage",
  "data:manage",
  "notify:send",
];

export const ROLE_CAPS: Record<AdminRole, readonly Cap[]> = {
  super: ALL_CAPS,
  ops: [
    "dashboard",
    "players:read",
    "players:gift",
    "ops:manage",
    "reports:read",
    "spirits:manage",
    "centres:manage",
    "missions:manage",
    "data:manage",
    "notify:send",
  ],
  support: ["dashboard", "players:read", "players:write", "players:gift", "reports:read", "notify:send"],
  content: ["dashboard", "reports:read", "spirits:manage", "centres:manage", "missions:manage"],
  analyst: ["dashboard", "players:read", "reports:read"],
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  super: "超級管理員",
  ops: "營運",
  support: "客服",
  content: "內容",
  analyst: "分析（唯讀）",
};

/** 查角色有哪些權限（server / client 共用） */
export function capsOf(role: AdminRole): readonly Cap[] {
  return ROLE_CAPS[role] ?? [];
}

export function hasCapOf(role: AdminRole | null | undefined, cap: Cap): boolean {
  if (!role) return false;
  return capsOf(role).includes(cap);
}

// ── 玩家 ─────────────────────────────────────────────

export interface PlayerRow {
  user_id: string;
  player_key: string | null;
  nickname: string;
  faction_id: string | null;
  level: number;
  coins: number;
  spirit_count: number;
  updated_at: string;
  banned: boolean;
}

export interface PlayerDetail {
  save: {
    user_id: string;
    player_key: string | null;
    nickname: string;
    faction_id: string | null;
    level: number;
    coins: number;
    spirit_count: number;
    created_at: string;
    updated_at: string;
  };
  summary: {
    gems: number;
    shinyCount: number;
    totalCaptures: number;
    checkinCount: number;
    battleWins: number;
    evolveCount: number;
    itemKinds: number;
    chopsticks: number;
  };
  email: string | null;
  events: { event: string; ts: string; props: Record<string, unknown> | null }[];
  flags: { banned: boolean; reason: string | null; banned_until: string | null } | null;
}

// ── 營運 ─────────────────────────────────────────────

export interface MaintenanceConfig {
  enabled: boolean;
  message: string;
}

export interface VersionConfig {
  minVersion: string;
  androidUrl: string;
  iosUrl: string;
  forceUpdate: boolean;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  kind: "popup" | "banner";
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export type GiftContents = {
  coins?: number;
  gems?: number;
  items?: Record<string, number>;
};

export interface GiftPackRow {
  id: string;
  code: string | null;
  title: string;
  contents: GiftContents;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  grantedCount?: number;
}

// ── 數據 ─────────────────────────────────────────────

export interface RetentionCohort {
  firstDay: string; // YYYY-MM-DD
  size: number;
  d1: number | null; // 0..1；null = 尚未到期
  d3: number | null;
  d7: number | null;
  d14: number | null;
}

export interface RetentionReport {
  windowDays: number;
  dau: number;
  wau: number;
  mau: number;
  cohorts: RetentionCohort[];
  eventTotals: { event: string; count: number }[];
}

// ── 系統管理 ─────────────────────────────────────────

export interface AdminUserRow {
  id: string;
  user_id: string | null;
  email: string;
  role: AdminRole;
  active: boolean;
  created_at: string;
}

export interface AuditRow {
  id: number;
  ts: string;
  admin_email: string;
  action: string;
  target: string | null;
  detail: Record<string, unknown> | null;
}

// ── 遊戲端 bootstrap ─────────────────────────────────

export interface BootstrapAnnouncement {
  id: string;
  title: string;
  body: string;
  kind: "popup" | "banner";
}

export interface BootstrapConfig {
  maintenance: MaintenanceConfig;
  version: VersionConfig;
  announcements: BootstrapAnnouncement[];
}

export interface MyGift {
  id: number;
  title: string;
  createdAt: string;
}

// ── 精靈管理 ─────────────────────────────────────────

export interface SpiritConfigRow {
  spirit_id: string;
  active: boolean;
  spawn_weight: number;
  note: string | null;
}

// ── 據點管理 ─────────────────────────────────────────

export interface CentreConfigRow {
  centre_id: string;
  active: boolean;
  spawn_pool: string[] | null; // null = 用 centres.ts 預設
  note: string | null;
}

// ── 任務管理 ─────────────────────────────────────────

export type MissionGoal = "capture" | "capture_unique" | "checkin" | "battle_win" | "evolve";
export type MissionPeriod = "daily" | "once";

export interface MissionRow {
  id: string;
  title: { zh: string; en: string };
  goal: MissionGoal;
  target: number;
  reward: GiftContents;
  period: MissionPeriod;
  active: boolean;
  sort: number;
  starts_at: string | null;
  ends_at: string | null;
}

// ── 推送通知 ─────────────────────────────────────────

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  icon: string | null;
  link: string | null;
  user_id: string | null; // null = 全服
  created_at: string;
}

export interface MyNotification {
  id: string;
  title: string;
  body: string;
  icon: string | null;
  link: string | null;
  createdAt: string;
}

// ── 數據管理 ─────────────────────────────────────────

export interface EventRow {
  id: number;
  ts: string;
  player_key: string;
  event: string;
  props: Record<string, unknown> | null;
  app_version: string | null;
  platform: string | null;
}

export interface SaveRow {
  user_id: string;
  nickname: string;
  level: number;
  coins: number;
  spirit_count: number;
  updated_at: string;
}

// ── 遊戲端 game config（合併 DB 覆蓋層）─────────────

export interface GameConfig {
  spirits: Record<string, { active: boolean; weight: number }>;
  centres: Record<string, { active: boolean; spawnPool: string[] | null }>;
}

/** 遊戲端任務（getActiveMissions 回傳形狀） */
export interface GameMission {
  id: string;
  title: { zh: string; en: string };
  goal: MissionGoal;
  target: number;
  reward: GiftContents;
  period: MissionPeriod;
}
