"use client";

// Client 端 Supabase 單例（帶 auth session 持久化）。
// 同 leaderboard.ts 嗰個 client 分開：呢個負責玩家帳號 + 雲存檔（要 session），
// leaderboard 嗰個係純匿名讀寫（persistSession:false），互不干涉。
// 未配置 NEXT_PUBLIC_SUPABASE_* 就回 null，全部帳號 / 雲存檔功能 graceful no-op。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (typeof window === "undefined") return null; // 只喺 client 用
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // OAuth redirect 返嚟自動收 session
        storageKey: "hh-auth", // 同 leaderboard client 分開，避免撞 storage
      },
    });
  }
  return client;
}

/** Supabase 帳號功能係咪通咗電（純前端判斷，唔會 throw） */
export const isAuthConfigured = Boolean(url && anonKey);
