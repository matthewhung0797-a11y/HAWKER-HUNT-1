// 後台 session 層（server-only）。
// 設計：登入成功後簽發自簽 HMAC-SHA256 httpOnly cookie（hh_admin），
// payload = { email, role, userId, exp }，效期 12 小時。每次 request 驗簽名 + 效期，
// 角色內嵌 cookie（免每筆查 DB）；敏感 mutation 一律再經 requireCap() 二次檢查。
// 密鑰：ADMIN_SESSION_SECRET；未設定時 fallback = HMAC(service role key, "hh-admin")，
// 不設新 env 也能運作（換 service key 會令舊 session 失效，可接受）。

import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { opsConfig } from "@/lib/ops/config";
import type { AdminRole, Cap } from "./types";
import { capsOf } from "./types";

export const ADMIN_COOKIE = "hh_admin";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export interface AdminSession {
  email: string;
  role: AdminRole;
  userId: string;
  exp: number; // epoch ms
}

function sessionSecret(): string {
  const explicit = process.env.ADMIN_SESSION_SECRET;
  if (explicit && explicit.length > 0) return explicit;
  // Fallback：由 service role key 衍生（無需額外 env；service key 只在 server 端）
  return createHmac("sha256", "hh-admin").update(opsConfig.supabase.serviceKey).digest("hex");
}

/** 簽發 token：base64url(payload).base64url(HMAC) */
export function signSession(input: Omit<AdminSession, "exp"> & { exp?: number }): string {
  const payload: AdminSession = {
    email: input.email,
    role: input.role,
    userId: input.userId,
    exp: input.exp ?? Date.now() + SESSION_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** 驗簽 + 解 payload；無效 / 過期回 null */
export function verifySessionToken(token: string): AdminSession | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let expected: string;
  try {
    expected = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<AdminSession>;
    if (
      typeof payload.email !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.userId !== "string" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return payload as AdminSession;
  } catch {
    return null;
  }
}

/** 讀 cookie → 驗 session（server component / action 用） */
export async function readAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function sessionHasCap(session: AdminSession | null, cap: Cap): boolean {
  if (!session) return false;
  return capsOf(session.role).includes(cap);
}

/**
 * 權限守衛：無 session throw unauthorized；有 session 但無權 throw forbidden。
 * 所有需要保護的 server action 第一行 call。
 */
export async function requireCap(cap: Cap): Promise<AdminSession> {
  const session = await readAdminSession();
  if (!session) {
    throw new Error("unauthorized：請先登入");
  }
  if (!sessionHasCap(session, cap)) {
    throw new Error("forbidden：你的角色沒有這項權限");
  }
  return session;
}
