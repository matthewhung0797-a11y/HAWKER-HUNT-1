// 後台操作審計 helper（server-only，非 "use server"——畀 actions.ts 內部用）。
// 只 insert（DB 無 update/delete policy＝不可竄改）；失敗只 warn，唔阻塞主流程。

import { getSupabaseAdmin } from "@/lib/analytics/server";

export async function writeAudit(
  adminEmail: string,
  action: string,
  target?: string | null,
  detail?: Record<string, unknown>
): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { error } = await sb.from("admin_audit_log").insert({
    admin_email: adminEmail,
    action,
    target: target ?? null,
    detail: detail ?? {},
  });
  if (error) console.warn("[admin-audit] insert failed:", error.message);
}
