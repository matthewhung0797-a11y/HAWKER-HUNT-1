// 離線審批 fallback —— 唔使公開 webhook 都試到成條流程。
// 用法：
//   node scripts/pipeline/set-decision.mjs <id> approve
//   node scripts/pipeline/set-decision.mjs <id> reject "與 XX 商店簽咗約，要加入佢哋特色成為獨家寵物"
//
// 對應 src/lib/pipeline/draft-store.ts 嘅 applyDecision/attachReason，行為要一致。

import { readDraft, writeDraft } from "./lib/draft.mjs";

const [id, verdict, ...reasonParts] = process.argv.slice(2);
const reason = reasonParts.join(" ").trim();

if (!id || !["approve", "reject"].includes(verdict)) {
  console.error('usage: node scripts/pipeline/set-decision.mjs <id> approve|reject ["原因"]');
  process.exit(1);
}

const draft = readDraft(id);
if (!draft) {
  console.error(`搵唔到 draft: ${id}`);
  process.exit(1);
}

draft.decision = {
  verdict,
  reason: reason || undefined,
  by: "manual",
  at: new Date().toISOString(),
};

if (verdict === "approve") {
  draft.status = "approved";
  draft.telegram = { ...draft.telegram, awaitingReason: false };
  console.log(`✅ [${id}] 已批准。下一步：node scripts/pipeline/publish.mjs ${id}`);
} else {
  draft.status = "rejected";
  draft.telegram = { ...draft.telegram, awaitingReason: !reason };
  if (reason) console.log(`🚫 [${id}] 已否決，原因：${reason}`);
  else console.log(`🚫 [${id}] 已否決（未有原因，等你補：再 run 一次帶原因，或 webhook 回覆文字）`);
}

writeDraft(draft);
