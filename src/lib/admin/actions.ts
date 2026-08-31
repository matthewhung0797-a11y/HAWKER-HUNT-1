"use server";

// 後台所有 server actions。
// ⚠️ "use server" 檔案只可 export async 函數——型別一律放 ./types.ts，
//    共用 helper（非 export）寫喺呢個檔案底部。
// 全部受保護 action 第一行 requireCap()；全部 mutation 寫 admin_audit_log。
// 不使用 Telegram（用戶指示）——審計只入 DB、顯示只喺後台 UI。

import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseAdmin,
  fetchSummary,
  fetchLeaderboardSnapshot,
} from "@/lib/analytics/server";
import type { AnalyticsSummary } from "@/lib/analytics/summary";
import { opsConfig, isSupabaseConfigured } from "@/lib/ops/config";
import { ADMIN_COOKIE, requireCap, readAdminSession, signSession } from "./session";
import { writeAudit } from "./audit";
import type {
  AdminRole,
  AdminUserRow,
  AnnouncementRow,
  AuditRow,
  BootstrapConfig,
  CentreConfigRow,
  EventRow,
  GameConfig,
  GameMission,
  GiftContents,
  GiftPackRow,
  MaintenanceConfig,
  MissionGoal,
  MissionPeriod,
  MissionRow,
  MyGift,
  MyNotification,
  NotificationRow,
  PlayerDetail,
  PlayerRow,
  RetentionReport,
  SaveRow,
  SpiritConfigRow,
  VersionConfig,
} from "./types";

// ════════════════════════════════════════════════════════════════════
// 認證
// ════════════════════════════════════════════════════════════════════

export async function login(
  email: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !password) return { ok: false, error: "請填寫 email 與密碼" };

  const admin = getSupabaseAdmin();
  if (!admin || !isSupabaseConfigured()) {
    return { ok: false, error: "後台未通電：Supabase 環境變數缺失（SUPABASE_SERVICE_ROLE_KEY）" };
  }

  // 1) 用 anon key 喺 server 端驗密碼（唔依賴 client session）
  const { url, anonKey } = opsConfig.supabase;
  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await auth.auth.signInWithPassword({
    email: normalized,
    password,
  });
  if (authError || !authData.user) return { ok: false, error: "帳號或密碼不正確" };

  // 2) 查 admin_users 名冊（email 對號 + active）
  const { data: row } = await admin
    .from("admin_users")
    .select("id,email,role,active,user_id")
    .ilike("email", normalized)
    .maybeSingle();
  if (!row || !row.active) return { ok: false, error: "此帳號未登記為管理員" };

  // 3) 首次登入自動回填 user_id（admin-schema.sql 原設計）
  if (!row.user_id || row.user_id !== authData.user.id) {
    try {
      await admin.from("admin_users").update({ user_id: authData.user.id }).eq("id", row.id);
    } catch {
      // unique 衝突（同 user 綁咗另一行）——照落 session，以 email 為準
    }
  }

  // 4) 簽 httpOnly session cookie
  const store = await cookies();
  store.set(ADMIN_COOKIE, signSession({ email: row.email, role: row.role, userId: authData.user.id }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });

  await writeAudit(row.email, "admin.login", authData.user.id);
  return { ok: true };
}

export async function logout(): Promise<void> {
  const session = await readAdminSession();
  if (session) await writeAudit(session.email, "admin.logout", session.userId);
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

/** 前端定期檢查 session 仲喺唔喺（過期自動踢返登入頁） */
export async function checkSession(): Promise<{ ok: boolean }> {
  const session = await readAdminSession();
  return { ok: session !== null };
}

// ════════════════════════════════════════════════════════════════════
// 玩家管理
// ════════════════════════════════════════════════════════════════════

const PLAYERS_PAGE_SIZE = 20;

export async function searchPlayers(
  q: string,
  by: "nickname" | "player_key" | "user_id",
  page: number
): Promise<{ rows: PlayerRow[]; total: number }> {
  await requireCap("players:read");
  const sb = getSupabaseAdmin();
  if (!sb) return { rows: [], total: 0 };

  let query = sb
    .from("player_saves")
    .select("user_id,player_key,nickname,faction_id,level,coins,spirit_count,updated_at", {
      count: "exact",
    });
  const term = q.trim();
  if (term) {
    if (by === "nickname") query = query.ilike("nickname", `%${term}%`);
    else query = query.eq(by, term);
  }
  const p = Math.max(0, page);
  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(p * PLAYERS_PAGE_SIZE, p * PLAYERS_PAGE_SIZE + PLAYERS_PAGE_SIZE - 1);

  if (error || !data) {
    if (error) console.warn("[admin] searchPlayers failed:", error.message);
    return { rows: [], total: 0 };
  }

  const rows = data as PlayerRow[];
  // 併封禁旗標（另一張表，避開 join 歧義）
  if (rows.length > 0) {
    const { data: flags } = await sb
      .from("player_flags")
      .select("user_id,banned")
      .in("user_id", rows.map((r) => r.user_id));
    const bannedMap = new Map((flags ?? []).map((f) => [f.user_id as string, f.banned as boolean]));
    for (const r of rows) r.banned = bannedMap.get(r.user_id) ?? false;
  }
  return { rows, total: count ?? rows.length };
}

export async function getPlayerDetail(userId: string): Promise<PlayerDetail | null> {
  await requireCap("players:read");
  const sb = getSupabaseAdmin();
  if (!sb || !userId) return null;

  const { data: save } = await sb.from("player_saves").select("*").eq("user_id", userId).maybeSingle();
  if (!save) return null;

  // state jsonb 只抽摘要，唔成份運去 client
  const state = (save.state ?? {}) as Record<string, unknown>;
  const owned = Array.isArray(state.ownedSpirits) ? (state.ownedSpirits as unknown[]) : [];
  const shinyCount = owned.filter((o) => (o as { shiny?: boolean })?.shiny === true).length;
  const captureCounts = (state.captureCounts ?? {}) as Record<string, number>;
  const items = (state.items ?? {}) as Record<string, number>;
  const checkins = Array.isArray(state.checkins) ? (state.checkins as unknown[]) : [];

  // email（service role auth admin API；失敗 graceful null）
  let email: string | null = null;
  try {
    const { data: u } = await sb.auth.admin.getUserById(userId);
    email = u?.user?.email ?? null;
  } catch {
    /* ignore */
  }

  // 近期事件（靠 player_key 認裝置）
  let events: PlayerDetail["events"] = [];
  if (save.player_key) {
    const { data: evs } = await sb
      .from("analytics_events")
      .select("event,ts,props")
      .eq("player_key", save.player_key)
      .order("ts", { ascending: false })
      .limit(20);
    events = (evs ?? []) as PlayerDetail["events"];
  }

  const { data: flags } = await sb
    .from("player_flags")
    .select("banned,reason,banned_until")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    save: {
      user_id: save.user_id,
      player_key: save.player_key ?? null,
      nickname: save.nickname ?? "Hawker Hunter",
      faction_id: save.faction_id ?? null,
      level: save.level ?? 1,
      coins: save.coins ?? 0,
      spirit_count: save.spirit_count ?? 0,
      created_at: save.created_at ?? "",
      updated_at: save.updated_at ?? "",
    },
    summary: {
      gems: typeof state.gems === "number" ? state.gems : 0,
      shinyCount,
      totalCaptures: Object.values(captureCounts).reduce((a, b) => a + b, 0),
      checkinCount: checkins.length,
      battleWins: typeof state.battleWins === "number" ? state.battleWins : 0,
      evolveCount: typeof state.evolveCount === "number" ? state.evolveCount : 0,
      itemKinds: Object.keys(items).length,
      chopsticks: items["chopsticks"] ?? 0,
    },
    email,
    events,
    flags: flags ?? null,
  };
}

export async function setPlayerBan(
  userId: string,
  banned: boolean,
  reason: string,
  days?: number
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("players:write");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  if (!userId) return { ok: false, error: "缺少 user_id" };

  const banned_until = banned && days && days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null;
  const { error } = await sb.from("player_flags").upsert({
    user_id: userId,
    banned,
    reason: banned ? reason || "" : null,
    banned_until,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };

  await writeAudit(session.email, banned ? "player.ban" : "player.unban", userId, { reason, days });
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════
// 營運設定（維護 / 版本 / 公告 / 禮包）
// ════════════════════════════════════════════════════════════════════

export async function getAppConfig(): Promise<{
  maintenance: MaintenanceConfig;
  version: VersionConfig;
}> {
  await requireCap("ops:manage");
  const sb = getSupabaseAdmin();
  const fallback = {
    maintenance: { enabled: false, message: "" },
    version: { minVersion: "0.1.0", androidUrl: "", iosUrl: "", forceUpdate: false },
  };
  if (!sb) return fallback;
  const { data } = await sb.from("app_config").select("key,value").in("key", ["maintenance", "version"]);
  const map = new Map((data ?? []).map((r) => [r.key as string, r.value as Record<string, unknown>]));
  const m = map.get("maintenance");
  const v = map.get("version");
  return {
    maintenance: {
      enabled: m?.enabled === true,
      message: typeof m?.message === "string" ? m.message : "",
    },
    version: {
      minVersion: typeof v?.minVersion === "string" ? v.minVersion : "0.1.0",
      androidUrl: typeof v?.androidUrl === "string" ? v.androidUrl : "",
      iosUrl: typeof v?.iosUrl === "string" ? v.iosUrl : "",
      forceUpdate: v?.forceUpdate === true,
    },
  };
}

export async function updateMaintenance(
  enabled: boolean,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("ops:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  const { error } = await sb
    .from("app_config")
    .update({ value: { enabled, message }, updated_by: session.email, updated_at: new Date().toISOString() })
    .eq("key", "maintenance");
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, "config.maintenance", "maintenance", { enabled, message });
  return { ok: true };
}

export async function updateVersion(input: VersionConfig): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("ops:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  const { error } = await sb
    .from("app_config")
    .update({ value: input, updated_by: session.email, updated_at: new Date().toISOString() })
    .eq("key", "version");
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, "config.version", "version", { ...input });
  return { ok: true };
}

export async function listAnnouncements(): Promise<AnnouncementRow[]> {
  await requireCap("ops:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data } = await sb
    .from("announcements")
    .select("id,title,body,kind,active,starts_at,ends_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as AnnouncementRow[];
}

export async function saveAnnouncement(input: {
  id?: string;
  title: string;
  body: string;
  kind: "popup" | "banner";
  active: boolean;
  starts_at?: string;
  ends_at?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("ops:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  if (!input.title.trim() || !input.body.trim()) return { ok: false, error: "標題與內容不可空白" };

  const row = {
    title: input.title.trim(),
    body: input.body.trim(),
    kind: input.kind,
    active: input.active,
    starts_at: input.starts_at ? new Date(input.starts_at).toISOString() : null,
    ends_at: input.ends_at ? new Date(input.ends_at).toISOString() : null,
    created_by: session.email,
  };
  const { error } = input.id
    ? await sb.from("announcements").update(row).eq("id", input.id)
    : await sb.from("announcements").insert(row);
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, "announcement.save", input.id ?? row.title, { kind: row.kind, active: row.active });
  return { ok: true };
}

export async function setAnnouncementActive(
  id: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("ops:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  const { error } = await sb.from("announcements").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, active ? "announcement.publish" : "announcement.unpublish", id);
  return { ok: true };
}

export async function deleteAnnouncement(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("ops:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  const { error } = await sb.from("announcements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, "announcement.delete", id);
  return { ok: true };
}

export async function listGiftPacks(): Promise<GiftPackRow[]> {
  await requireCap("ops:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data } = await sb
    .from("gift_packs")
    .select("id,code,title,contents,active,starts_at,ends_at,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const packs = (data ?? []) as GiftPackRow[];
  // 已發放/已兌換次數（顯示用）
  if (packs.length > 0) {
    const { data: counts } = await sb
      .from("gift_grants")
      .select("pack_id")
      .in("pack_id", packs.map((p) => p.id));
    const c = new Map<string, number>();
    for (const row of counts ?? []) {
      const k = row.pack_id as string;
      c.set(k, (c.get(k) ?? 0) + 1);
    }
    for (const p of packs) p.grantedCount = c.get(p.id) ?? 0;
  }
  return packs;
}

export async function saveGiftPack(input: {
  id?: string;
  code: string;
  title: string;
  contents: GiftContents;
  active: boolean;
  starts_at?: string;
  ends_at?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("ops:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  if (!input.title.trim()) return { ok: false, error: "禮包名稱不可空白" };
  if (!input.contents || (typeof input.contents !== "object")) return { ok: false, error: "內容格式錯誤" };

  const code = input.code.trim().toUpperCase() || null;
  const row = {
    code,
    title: input.title.trim(),
    contents: input.contents,
    active: input.active,
    starts_at: input.starts_at ? new Date(input.starts_at).toISOString() : null,
    ends_at: input.ends_at ? new Date(input.ends_at).toISOString() : null,
    created_by: session.email,
  };
  const { error } = input.id
    ? await sb.from("gift_packs").update(row).eq("id", input.id)
    : await sb.from("gift_packs").insert(row);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "兌換碼已被使用" };
    return { ok: false, error: error.message };
  }
  await writeAudit(session.email, "gift.pack-save", input.id ?? row.title, { code, contents: input.contents });
  return { ok: true };
}

export async function setGiftPackActive(
  id: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("ops:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  const { error } = await sb.from("gift_packs").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, active ? "gift.pack-enable" : "gift.pack-disable", id);
  return { ok: true };
}

/** 輕量禮包清單（發放用；players:gift 即可，不需 ops:manage） */
export async function listGrantablePacks(): Promise<{ id: string; title: string }[]> {
  await requireCap("players:gift");
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data } = await sb
    .from("gift_packs")
    .select("id,title")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((r) => ({ id: r.id as string, title: r.title as string }));
}

export async function grantGift(
  packId: string,
  target: { userId?: string; all?: boolean }
): Promise<{ ok: boolean; granted: number; error?: string }> {
  const session = await requireCap("players:gift");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, granted: 0, error: "Supabase 未設定" };

  if (target.userId) {
    const { data, error } = await sb
      .from("gift_grants")
      .insert({ pack_id: packId, user_id: target.userId, claimed_at: null, created_by: session.email })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { ok: false, granted: 0, error: "該玩家已領過這個禮包" };
      return { ok: false, granted: 0, error: error.message };
    }
    await writeAudit(session.email, "gift.grant", target.userId, { packId, all: false });
    return { ok: true, granted: data ? 1 : 0 };
  }

  if (target.all) {
    // 全服發放：分頁掃 player_saves，批次 upsert（撞 unique 靜默跳過）
    let granted = 0;
    let offset = 0;
    for (;;) {
      const { data: users } = await sb
        .from("player_saves")
        .select("user_id")
        .range(offset, offset + 499);
      if (!users || users.length === 0) break;
      const rows = users.map((u) => ({
        pack_id: packId,
        user_id: u.user_id as string,
        claimed_at: null,
        created_by: session.email,
      }));
      const { data: inserted, error } = await sb
        .from("gift_grants")
        .upsert(rows, { onConflict: "pack_id,user_id", ignoreDuplicates: true })
        .select("id");
      if (error) {
        return { ok: false, granted, error: error.message };
      }
      granted += inserted?.length ?? 0;
      if (users.length < 500) break;
      offset += 500;
    }
    await writeAudit(session.email, "gift.grant", "all-players", { packId, all: true, granted });
    return { ok: true, granted };
  }

  return { ok: false, granted: 0, error: "缺少發放對象" };
}

// ════════════════════════════════════════════════════════════════════
// 數據報表
// ════════════════════════════════════════════════════════════════════

export async function fetchAdminSummary(windowDays = 14): Promise<AnalyticsSummary> {
  await requireCap("reports:read");
  return fetchSummary(windowDays);
}

export async function fetchLeaderboardForAdmin(
  limit = 10
): Promise<{ source: "live" | "demo"; rows: { nickname: string; faction_id: string | null; score: number }[] }> {
  await requireCap("reports:read");
  return fetchLeaderboardSnapshot(limit);
}

export async function fetchRetention(windowDays = 30): Promise<RetentionReport | null> {
  await requireCap("reports:read");
  const sb = getSupabaseAdmin();
  if (!sb) return null;

  const since = new Date(Date.now() - windowDays * 86400000).toISOString();
  const { data, error } = await sb
    .from("analytics_events")
    .select("ts,player_key,event")
    .gte("ts", since)
    .order("ts", { ascending: false })
    .limit(100000);
  if (error) {
    console.warn("[admin] fetchRetention failed:", error.message);
    return null;
  }
  const rows = data ?? [];
  if (rows.length === 0) {
    return { windowDays, dau: 0, wau: 0, mau: 0, cohorts: [], eventTotals: [] };
  }

  // 每個玩家嘅活躍日集合
  const activeDays = new Map<string, Set<string>>();
  const eventTotals = new Map<string, number>();
  for (const r of rows) {
    const pk = r.player_key as string;
    if (!pk) continue;
    const day = (r.ts as string).slice(0, 10);
    (activeDays.get(pk) ?? activeDays.set(pk, new Set()).get(pk)!).add(day);
    const ev = r.event as string;
    eventTotals.set(ev, (eventTotals.get(ev) ?? 0) + 1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const addDays = (day: string, n: number): string =>
    new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

  // DAU / WAU / MAU
  let dau = 0;
  let wau = 0;
  let mau = 0;
  const wauSince = addDays(today, -6);
  const mauSince = addDays(today, -29);
  for (const days of activeDays.values()) {
    if (days.has(today)) dau++;
    for (const d of days) {
      if (d >= wauSince) {
        wau++;
        break;
      }
    }
    for (const d of days) {
      if (d >= mauSince) {
        mau++;
        break;
      }
    }
  }

  // 留存 cohort：以「視窗內首次活躍日」為基準（MVP 近似；無全量歷史）
  const cohortPlayers = new Map<string, string[]>();
  for (const [pk, days] of activeDays) {
    let first: string | null = null;
    for (const d of days) if (!first || d < first) first = d;
    if (first) {
      const arr = cohortPlayers.get(first);
      if (arr) arr.push(pk);
      else cohortPlayers.set(first, [pk]);
    }
  }

  const cohorts = [...cohortPlayers.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 15)
    .map(([firstDay, players]) => {
      const size = players.length;
      const rate = (n: number): number | null => {
        const target = addDays(firstDay, n);
        if (target > today) return null; // 尚未到期
        let hit = 0;
        for (const pk of players) if (activeDays.get(pk)!.has(target)) hit++;
        return size > 0 ? hit / size : 0;
      };
      return { firstDay, size, d1: rate(1), d3: rate(3), d7: rate(7), d14: rate(14) };
    });

  return {
    windowDays,
    dau,
    wau,
    mau,
    cohorts,
    eventTotals: [...eventTotals.entries()]
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ════════════════════════════════════════════════════════════════════
// 系統管理（管理員 + 審計）
// ════════════════════════════════════════════════════════════════════

export async function listAdmins(): Promise<AdminUserRow[]> {
  await requireCap("admins:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data } = await sb
    .from("admin_users")
    .select("id,user_id,email,role,active,created_at")
    .order("created_at", { ascending: true })
    .limit(100);
  return (data ?? []) as AdminUserRow[];
}

export async function addAdmin(email: string, role: AdminRole): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("admins:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return { ok: false, error: "email 格式不正確" };
  const { error } = await sb.from("admin_users").insert({ email: normalized, role, active: true });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "此 email 已是管理員" };
    return { ok: false, error: error.message };
  }
  await writeAudit(session.email, "admin.add", normalized, { role });
  return { ok: true };
}

export async function setAdminActive(
  id: string,
  email: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("admins:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  if (email === session.email) return { ok: false, error: "不可停用自己" };
  const { error } = await sb.from("admin_users").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, active ? "admin.enable" : "admin.disable", email);
  return { ok: true };
}

export async function resetAdminPassword(
  userId: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("admins:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  if (!userId) return { ok: false, error: "此管理員未配對 auth 帳號（需先登入一次）" };
  if (newPassword.length < 6) return { ok: false, error: "密碼至少 6 個字元" };
  const { error } = await sb.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, "admin.reset-password", userId);
  return { ok: true };
}

export async function listAudit(input: {
  page: number;
  adminEmail?: string;
  action?: string;
}): Promise<{ rows: AuditRow[]; total: number }> {
  await requireCap("admins:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { rows: [], total: 0 };
  const PAGE = 30;
  let query = sb
    .from("admin_audit_log")
    .select("id,ts,admin_email,action,target,detail", { count: "exact" });
  if (input.adminEmail?.trim()) query = query.ilike("admin_email", `%${input.adminEmail.trim()}%`);
  if (input.action?.trim()) query = query.eq("action", input.action.trim());
  const { data, count, error } = await query
    .order("ts", { ascending: false })
    .range(input.page * PAGE, input.page * PAGE + PAGE - 1);
  if (error) {
    console.warn("[admin] listAudit failed:", error.message);
    return { rows: [], total: 0 };
  }
  return { rows: (data ?? []) as AuditRow[], total: count ?? 0 };
}

// ════════════════════════════════════════════════════════════════════
// 遊戲端公開 actions（不需 admin session；配合 local-first 信任 client 架構）
// ════════════════════════════════════════════════════════════════════

export async function getBootstrapConfig(): Promise<BootstrapConfig> {
  const sb = getSupabaseAdmin();
  const fallback: BootstrapConfig = {
    maintenance: { enabled: false, message: "" },
    version: { minVersion: "0.0.0", androidUrl: "", iosUrl: "", forceUpdate: false },
    announcements: [],
  };
  if (!sb) return fallback;

  const now = new Date().toISOString();
  const [cfgRes, annRes] = await Promise.all([
    sb.from("app_config").select("key,value").in("key", ["maintenance", "version"]),
    sb
      .from("announcements")
      .select("id,title,body,kind")
      .eq("active", true)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const map = new Map((cfgRes.data ?? []).map((r) => [r.key as string, r.value as Record<string, unknown>]));
  const m = map.get("maintenance");
  const v = map.get("version");
  return {
    maintenance: {
      enabled: m?.enabled === true,
      message: typeof m?.message === "string" ? m.message : "",
    },
    version: {
      minVersion: typeof v?.minVersion === "string" ? v.minVersion : "0.0.0",
      androidUrl: typeof v?.androidUrl === "string" ? v.androidUrl : "",
      iosUrl: typeof v?.iosUrl === "string" ? v.iosUrl : "",
      forceUpdate: v?.forceUpdate === true,
    },
    announcements: (annRes.data ?? []).map((a) => ({
      id: a.id as string,
      title: a.title as string,
      body: a.body as string,
      kind: a.kind as "popup" | "banner",
    })),
  };
}

export async function redeemGiftCode(
  code: string,
  userId: string
): Promise<{ ok: boolean; title?: string; contents?: GiftContents; error?: string }> {
  // 錯誤回代碼（client 端做 i18n）：invalid / not-open / expired / already / failed
  const sb = getSupabaseAdmin();
  if (!sb || !userId) return { ok: false, error: "failed" };
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, error: "invalid" };

  const { data: pack } = await sb.from("gift_packs").select("*").eq("code", normalized).maybeSingle();
  if (!pack || !pack.active) return { ok: false, error: "invalid" };
  const now = new Date().toISOString();
  if (pack.starts_at && pack.starts_at > now) return { ok: false, error: "not-open" };
  if (pack.ends_at && pack.ends_at < now) return { ok: false, error: "expired" };

  // unique(pack_id, user_id) 撞即係領過
  const { data: grant, error } = await sb
    .from("gift_grants")
    .insert({ pack_id: pack.id, user_id: userId, claimed_at: now, created_by: null })
    .select("id")
    .single();
  if (error || !grant) {
    if (error?.code === "23505") return { ok: false, error: "already" };
    console.warn("[gift] redeem failed:", error?.message);
    return { ok: false, error: "failed" };
  }
  return { ok: true, title: pack.title as string, contents: pack.contents as GiftContents };
}

export async function fetchMyGifts(userId: string): Promise<MyGift[]> {
  const sb = getSupabaseAdmin();
  if (!sb || !userId) return [];
  const { data } = await sb
    .from("gift_grants")
    .select("id,created_at,gift_packs(title)")
    .eq("user_id", userId)
    .is("claimed_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((r) => {
    // PostgREST embed：多對一可能回 object 或 array（型別不定，統一處理）
    const pack = r.gift_packs as unknown as { title?: string } | { title?: string }[] | null;
    const title = Array.isArray(pack) ? (pack[0]?.title ?? "禮包") : (pack?.title ?? "禮包");
    return {
      id: r.id as number,
      title,
      createdAt: r.created_at as string,
    };
  });
}

export async function claimGift(
  grantId: number,
  userId: string
): Promise<{ ok: boolean; title?: string; contents?: GiftContents; error?: string }> {
  // 錯誤回代碼：gone（已領／失效）/ failed
  const sb = getSupabaseAdmin();
  if (!sb || !userId || !grantId) return { ok: false, error: "failed" };
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("gift_grants")
    .update({ claimed_at: now })
    .eq("id", grantId)
    .eq("user_id", userId)
    .is("claimed_at", null)
    .select("id,gift_packs(title,contents)")
    .maybeSingle();
  if (error) {
    console.warn("[gift] claim failed:", error.message);
    return { ok: false, error: "failed" };
  }
  if (!data) return { ok: false, error: "gone" };
  const raw = data.gift_packs as unknown as
    | { title?: string; contents?: GiftContents }
    | { title?: string; contents?: GiftContents }[]
    | null;
  const pack = Array.isArray(raw) ? raw[0] : raw;
  return { ok: true, title: pack?.title ?? "禮包", contents: pack?.contents ?? {} };
}

// ════════════════════════════════════════════════════════════════════
// 精靈管理（覆蓋層：無 row = 預設啟用、權重 1）
// ════════════════════════════════════════════════════════════════════

export async function getSpiritConfigs(): Promise<SpiritConfigRow[]> {
  await requireCap("spirits:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data } = await sb
    .from("spirit_config")
    .select("spirit_id,active,spawn_weight,note")
    .order("spirit_id")
    .limit(100);
  return (data ?? []) as SpiritConfigRow[];
}

/** 批次儲存（一次 upsert 全部變更列；含 updated_by） */
export async function saveSpiritConfigs(
  rows: { spirit_id: string; active: boolean; spawn_weight: number; note: string | null }[]
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("spirits:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "沒有變更" };
  const clean = rows.map((r) => ({
    spirit_id: String(r.spirit_id).slice(0, 64),
    active: r.active === true,
    spawn_weight: Math.max(0, Math.min(10, Math.floor(Number(r.spawn_weight) || 1))),
    note: r.note ? String(r.note).slice(0, 200) : null,
    updated_by: session.email,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await sb.from("spirit_config").upsert(clean, { onConflict: "spirit_id" });
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, "spirits.save", "batch", { count: clean.length });
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════
// 據點管理（覆蓋層：spawn_pool null = 用 centres.ts 預設）
// ════════════════════════════════════════════════════════════════════

export async function getCentreConfigs(): Promise<CentreConfigRow[]> {
  await requireCap("centres:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data } = await sb
    .from("centre_config")
    .select("centre_id,active,spawn_pool,note")
    .order("centre_id")
    .limit(50);
  return (data ?? []) as CentreConfigRow[];
}

export async function saveCentreConfigs(
  rows: { centre_id: string; active: boolean; spawn_pool: string[] | null; note: string | null }[]
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("centres:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "沒有變更" };
  const clean = rows.map((r) => ({
    centre_id: String(r.centre_id).slice(0, 64),
    active: r.active === true,
    spawn_pool: Array.isArray(r.spawn_pool) ? r.spawn_pool.map((s) => String(s).slice(0, 64)) : null,
    note: r.note ? String(r.note).slice(0, 200) : null,
    updated_by: session.email,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await sb.from("centre_config").upsert(clean, { onConflict: "centre_id" });
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, "centres.save", "batch", { count: clean.length });
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════
// 任務管理
// ════════════════════════════════════════════════════════════════════

const MISSION_GOALS: readonly MissionGoal[] = ["capture", "capture_unique", "checkin", "battle_win", "evolve"];

export async function listMissions(): Promise<MissionRow[]> {
  await requireCap("missions:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data } = await sb
    .from("missions")
    .select("id,title,goal,target,reward,period,active,sort,starts_at,ends_at")
    .order("sort", { ascending: true })
    .limit(100);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: (r.title ?? { zh: "", en: "" }) as MissionRow["title"],
    goal: r.goal as MissionGoal,
    target: r.target as number,
    reward: (r.reward ?? {}) as GiftContents,
    period: r.period as MissionPeriod,
    active: r.active === true,
    sort: r.sort as number,
    starts_at: (r.starts_at ?? null) as string | null,
    ends_at: (r.ends_at ?? null) as string | null,
  }));
}

export async function saveMission(input: {
  id?: string;
  titleZh: string;
  titleEn: string;
  goal: MissionGoal;
  target: number;
  reward: GiftContents;
  period: MissionPeriod;
  active: boolean;
  sort: number;
  startsAt?: string;
  endsAt?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("missions:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  if (!input.titleZh.trim()) return { ok: false, error: "任務標題（中文）不可空白" };
  if (!MISSION_GOALS.includes(input.goal)) return { ok: false, error: "無效的任務目標類型" };
  if (!Number.isFinite(input.target) || input.target < 1 || input.target > 999)
    return { ok: false, error: "目標次數需 1–999" };
  if (input.reward && (Array.isArray(input.reward) || typeof input.reward !== "object"))
    return { ok: false, error: "獎勵格式錯誤" };

  const row = {
    title: { zh: input.titleZh.trim(), en: (input.titleEn || input.titleZh).trim() },
    goal: input.goal,
    target: Math.floor(input.target),
    reward: input.reward ?? {},
    period: input.period,
    active: input.active,
    sort: Math.max(0, Math.min(999, Math.floor(input.sort) || 0)),
    starts_at: input.startsAt ? new Date(input.startsAt).toISOString() : null,
    ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
    created_by: session.email,
  };
  const { error } = input.id
    ? await sb.from("missions").update(row).eq("id", input.id)
    : await sb.from("missions").insert(row);
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, "mission.save", input.id ?? row.title.zh, { goal: row.goal, target: row.target });
  return { ok: true };
}

export async function setMissionActive(
  id: string,
  active: boolean
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("missions:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  const { error } = await sb.from("missions").update({ active }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, active ? "mission.enable" : "mission.disable", id);
  return { ok: true };
}

export async function deleteMission(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("missions:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  const { error } = await sb.from("missions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, "mission.delete", id);
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════
// 推送通知（站內）
// ════════════════════════════════════════════════════════════════════

export async function listNotifications(): Promise<NotificationRow[]> {
  await requireCap("notify:send");
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const { data } = await sb
    .from("notifications")
    .select("id,title,body,icon,link,user_id,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as NotificationRow[];
}

export async function sendNotification(input: {
  title: string;
  body: string;
  icon?: string;
  link?: string;
  userId?: string; // 空 = 全服
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("notify:send");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  if (!input.title.trim() || !input.body.trim()) return { ok: false, error: "標題與內容不可空白" };
  if (input.link && !input.link.startsWith("/")) return { ok: false, error: "連結需為站內路由（以 / 開頭）" };

  const { error } = await sb.from("notifications").insert({
    title: input.title.trim().slice(0, 120),
    body: input.body.trim().slice(0, 1000),
    icon: input.icon ? input.icon.trim().slice(0, 16) : null,
    link: input.link ? input.link.trim().slice(0, 200) : null,
    user_id: input.userId?.trim() || null,
    created_by: session.email,
  });
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, "notification.send", input.userId?.trim() || "all", {
    title: input.title,
  });
  return { ok: true };
}

export async function deleteNotification(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await requireCap("notify:send");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, error: "Supabase 未設定" };
  const { error } = await sb.from("notifications").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  await writeAudit(session.email, "notification.delete", id);
  return { ok: true };
}

/** 遊戲端：我嘅通知（全服廣播 + 指定我），近 30 日最新 30 條。
 *  userId 可空：訪客（未登入）都睇到全服廣播。 */
export async function getMyNotifications(userId?: string): Promise<MyNotification[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  let query = sb
    .from("notifications")
    .select("id,title,body,icon,link,created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);
  if (userId) {
    query = query.or(`user_id.is.null,user_id.eq.${userId}`);
  } else {
    query = query.is("user_id", null);
  }
  const { data } = await query;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    body: r.body as string,
    icon: (r.icon ?? null) as string | null,
    link: (r.link ?? null) as string | null,
    createdAt: r.created_at as string,
  }));
}

// ════════════════════════════════════════════════════════════════════
// 數據管理（事件瀏覽 / 匯出 / 清理 / 存檔總覽）
// ════════════════════════════════════════════════════════════════════

const EVENTS_PAGE = 30;

export async function browseEvents(input: {
  page: number;
  event?: string;
  playerKey?: string;
  from?: string; // YYYY-MM-DD
  to?: string;
}): Promise<{ rows: EventRow[]; total: number }> {
  await requireCap("data:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { rows: [], total: 0 };
  let query = sb
    .from("analytics_events")
    .select("id,ts,player_key,event,props,app_version,platform", { count: "exact" });
  if (input.event?.trim()) query = query.eq("event", input.event.trim());
  if (input.playerKey?.trim()) query = query.eq("player_key", input.playerKey.trim());
  if (input.from) query = query.gte("ts", `${input.from}T00:00:00.000Z`);
  if (input.to) query = query.lte("ts", `${input.to}T23:59:59.999Z`);
  const { data, count, error } = await query
    .order("ts", { ascending: false })
    .range(input.page * EVENTS_PAGE, input.page * EVENTS_PAGE + EVENTS_PAGE - 1);
  if (error) {
    console.warn("[admin] browseEvents failed:", error.message);
    return { rows: [], total: 0 };
  }
  return { rows: (data ?? []) as EventRow[], total: count ?? 0 };
}

/** 匯出 CSV 用：同一篩選最多 5000 筆 */
export async function exportEvents(input: {
  event?: string;
  playerKey?: string;
  from?: string;
  to?: string;
}): Promise<EventRow[]> {
  await requireCap("data:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  let query = sb.from("analytics_events").select("id,ts,player_key,event,props,app_version,platform");
  if (input.event?.trim()) query = query.eq("event", input.event.trim());
  if (input.playerKey?.trim()) query = query.eq("player_key", input.playerKey.trim());
  if (input.from) query = query.gte("ts", `${input.from}T00:00:00.000Z`);
  if (input.to) query = query.lte("ts", `${input.to}T23:59:59.999Z`);
  const { data } = await query.order("ts", { ascending: false }).limit(5000);
  return (data ?? []) as EventRow[];
}

export async function browseSaves(page: number): Promise<{ rows: SaveRow[]; total: number }> {
  await requireCap("data:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { rows: [], total: 0 };
  const { data, count } = await sb
    .from("player_saves")
    .select("user_id,nickname,level,coins,spirit_count,updated_at", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(page * 20, page * 20 + 19);
  return { rows: (data ?? []) as SaveRow[], total: count ?? 0 };
}

export async function purgeEvents(days: number): Promise<{ ok: boolean; deleted: number; error?: string }> {
  const session = await requireCap("data:manage");
  const sb = getSupabaseAdmin();
  if (!sb) return { ok: false, deleted: 0, error: "Supabase 未設定" };
  if (!Number.isFinite(days) || days < 1 || days > 365)
    return { ok: false, deleted: 0, error: "天數需 1–365" };
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await sb.from("analytics_events").delete().lt("ts", cutoff).select("id");
  if (error) return { ok: false, deleted: 0, error: error.message };
  const deleted = data?.length ?? 0;
  await writeAudit(session.email, "data.purge-events", `>${days}d`, { deleted });
  return { ok: true, deleted };
}

// ════════════════════════════════════════════════════════════════════
// 遊戲端 game config（公開：精靈/據點覆蓋層 + 任務）
// ════════════════════════════════════════════════════════════════════

export async function getGameConfig(): Promise<GameConfig> {
  const sb = getSupabaseAdmin();
  if (!sb) return { spirits: {}, centres: {} };
  const [spiritsRes, centresRes] = await Promise.all([
    sb.from("spirit_config").select("spirit_id,active,spawn_weight").limit(200),
    sb.from("centre_config").select("centre_id,active,spawn_pool").limit(50),
  ]);
  const spirits: GameConfig["spirits"] = {};
  for (const r of spiritsRes.data ?? []) {
    spirits[r.spirit_id as string] = {
      active: r.active !== false,
      weight: typeof r.spawn_weight === "number" ? r.spawn_weight : 1,
    };
  }
  const centres: GameConfig["centres"] = {};
  for (const r of centresRes.data ?? []) {
    centres[r.centre_id as string] = {
      active: r.active !== false,
      spawnPool: (r.spawn_pool ?? null) as string[] | null,
    };
  }
  return { spirits, centres };
}

/** 遊戲端：active + 時間窗內任務（無 row → 空陣列，client fallback 硬編碼池） */
export async function getActiveMissions(): Promise<GameMission[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  const now = new Date().toISOString();
  const { data } = await sb
    .from("missions")
    .select("id,title,goal,target,reward,period,sort,starts_at,ends_at")
    .eq("active", true)
    .order("sort", { ascending: true })
    .limit(50);
  const rows = data ?? [];
  const active = rows.filter((r) => {
    if (r.starts_at && r.starts_at > now) return false;
    if (r.ends_at && r.ends_at < now) return false;
    return true;
  });
  return active.map((r) => ({
    id: r.id as string,
    title: (r.title ?? { zh: "", en: "" }) as GameMission["title"],
    goal: r.goal as MissionGoal,
    target: r.target as number,
    reward: (r.reward ?? {}) as GiftContents,
    period: r.period as MissionPeriod,
  }));
}
