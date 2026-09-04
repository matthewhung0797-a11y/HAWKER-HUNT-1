"use client";

// 玩家帳號（Supabase Auth）。
// 設計：預設匿名登入（signInAnonymously）——玩家一入場就有穩定 user_id，
// 之後可以「升級」綁 Google / Email，user_id 唔變（用 linkIdentity / updateUser 保留進度）。
// 全部功能未配置 Supabase 就 graceful：回 null / false，唔阻塞遊戲（照跑 localStorage）。

import type { Session, User } from "@supabase/supabase-js";
import { getBrowserSupabase, isAuthConfigured } from "./supabase-browser";

export { isAuthConfigured };

/** 攞現有 session（未登入 / 未配置回 null） */
export async function getSession(): Promise<Session | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ?? null;
}

export async function getUser(): Promise<User | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

/**
 * 確保有 session：冇就開匿名帳號。
 * 回傳 user（未配置 Supabase 回 null，呼叫方要照跑離線流程）。
 */
export async function ensureAnonSession(): Promise<User | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;
  const existing = await getSession();
  if (existing?.user) return existing.user;
  const { data, error } = await sb.auth.signInAnonymously();
  if (error) {
    // 匿名登入未喺 Supabase 開啟（Dashboard → Auth → Providers → Anonymous）時會錯——
    // 唔 throw，退回離線。
    console.warn("[auth] anonymous sign-in failed:", error.message);
    return null;
  }
  return data.user ?? null;
}

/** 而家係咪匿名帳號（未綁 email / oauth） */
export function isAnonUser(user: User | null): boolean {
  if (!user) return false;
  // Supabase 匿名 user 冇 email 且冇 identities（或 is_anonymous 旗標）
  const anonFlag = (user as User & { is_anonymous?: boolean }).is_anonymous;
  if (typeof anonFlag === "boolean") return anonFlag;
  return !user.email && (user.identities?.length ?? 0) === 0;
}

/**
 * 升級到 Google：匿名 user 用 linkIdentity 保留同一個 user_id（進度唔散）；
 * linkIdentity 被禁（Supabase Manual Linking 未開）→ 自動退回直接 OAuth
 * （Supabase 自動連結會保留匿名 user_id）。redirect 返嚟由 detectSessionInUrl 收 session。
 */
/**
 * 升級到 Google：直接 OAuth 登入（唔行 linkIdentity — Supabase Manual Linking
 * 預設關閉會擋「Manual linking is disabled」；匿名 user 經 OAuth 後由 Supabase
 * 自動連結升級成正式 user）。redirect 返嚟由 detectSessionInUrl 收 session。
 */
export async function upgradeWithGoogle(): Promise<{ ok: boolean; error?: string }> {
  const sb = getBrowserSupabase();
  if (!sb) return { ok: false, error: "auth-not-configured" };
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/map` : undefined;
  const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * 升級到 Facebook：直接 OAuth 登入（同 Google 模式）。需喺 Supabase 開 Facebook provider。
 */
export async function upgradeWithFacebook(): Promise<{ ok: boolean; error?: string }> {
  const sb = getBrowserSupabase();
  if (!sb) return { ok: false, error: "auth-not-configured" };
  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/map` : undefined;
  const { error } = await sb.auth.signInWithOAuth({ provider: "facebook", options: { redirectTo } });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * 升級到 Email：匿名 user 用 updateUser 綁 email（保留 user_id），會寄確認信；
 * 未登入就用 magic-link OTP 登入。
 */
export async function upgradeWithEmail(email: string): Promise<{ ok: boolean; error?: string }> {
  const sb = getBrowserSupabase();
  if (!sb) return { ok: false, error: "auth-not-configured" };
  const user = await getUser();
  if (user && isAnonUser(user)) {
    const { error } = await sb.auth.updateUser({ email });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const emailRedirectTo = typeof window !== "undefined" ? `${window.location.origin}/map` : undefined;
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo } });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOut(): Promise<void> {
  const sb = getBrowserSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

/** 訂閱登入狀態變化（OAuth redirect / token refresh 都會觸發）。回 unsubscribe。 */
export function onAuthChange(cb: (user: User | null) => void): () => void {
  const sb = getBrowserSupabase();
  if (!sb) return () => {};
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}
