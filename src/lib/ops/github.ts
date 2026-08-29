// 系統二 自動出街：由 webhook 觸發 GitHub repository_dispatch 事件，
// 令 .github/workflows/pet-publish.yml 喺雲端（GitHub Actions）完成 publish + 合併 PR，
// 全程唔使你部電腦開機。
//
// ⚠️ server-only：用到 GITHUB_DISPATCH_TOKEN（fine-grained PAT），唔好 import 落 client。
// 未配置（冇 token / repo）就 graceful skip，唔 throw——呼叫方會退回「本機 publish」提示。

import { opsConfig } from "./config";

export type DispatchResult = { ok: boolean; skipped?: boolean; error?: string };

/**
 * 觸發 repository_dispatch。GitHub 會用 event_type 對應 workflow 嘅
 * `on: repository_dispatch: types:` 嚟啟動對應 job。
 * @param eventType 例如 "pet-approved" / "pet-rejected"
 * @param payload   會原封不動放入 workflow 嘅 github.event.client_payload
 */
export async function dispatchRepositoryEvent(
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<DispatchResult> {
  const { dispatchToken, repo } = opsConfig.github;
  if (!dispatchToken || !repo) return { ok: false, skipped: true };
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${dispatchToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "content-type": "application/json",
      },
      body: JSON.stringify({ event_type: eventType, client_payload: payload }),
    });
    // GitHub dispatch 成功回 204 No Content
    if (res.status === 204) return { ok: true };
    const t = await res.text().catch(() => "");
    return { ok: false, error: `${res.status} ${t.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
