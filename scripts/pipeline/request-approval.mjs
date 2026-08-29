// 送出新寵物待審提醒；批准／否決只可以喺 admin 後台做。
// 用法：node scripts/pipeline/request-approval.mjs <id>
// 未設 Telegram → graceful skip（log 一句，exit 0）。設咗 → 發預覽 + 純文字提醒。

import { readDraft, writeDraft } from "./lib/draft.mjs";
import { sendTelegram } from "./lib/telegram.mjs";
import { sendStagePreviews } from "./send-preview.mjs";
import { flags } from "./lib/env.mjs";

const id = process.argv[2];
if (!id) {
  console.error("usage: node scripts/pipeline/request-approval.mjs <id>");
  process.exit(1);
}

const draft = readDraft(id);
if (!draft) {
  console.error(`[request-approval] 搵唔到 draft: ${id}`);
  process.exit(1);
}

const c = draft.concept ?? {};
const fam = draft.family;
// 三階名（有 family 就列成條線）
const stageLine = fam?.stages
  ? fam.stages.map((s) => `${s.name.zh}（${s.stage}階）`).join(" → ")
  : c.name?.zh ?? id;
const skillLine = (draft.skills ?? [])
  .map((s) => `• ${s.name?.zh ?? s.id}${s.power ? ` (x${s.power})` : "（輔助）"}`)
  .join("\n");
const ps = draft.poolStatus;
const poolLine = ps?.note
  ? `\n${ps.note}` +
    (ps.fallbackStrategies
      ? `\n後備策略：${ps.fallbackStrategies.map((f) => f.label).join("、")}`
      : "")
  : null;

const artReview = draft.status === "awaiting-art-review";
const text = [
  artReview
    ? "🎨 *立繪待睇*（未做 3D）"
    : draft.exclusive
      ? "🤝 *商店聯乘獨家寵物待審批*"
      : "🍜 *新寵物系列待審批*",
  draft.exclusive && draft.partnerLabel ? `聯乘對象：${draft.partnerLabel}` : null,
  draft.refImages?.length ? `參考圖：${draft.refImages.length} 張（已用於生成）` : null,
  draft.instructions ? `方向：${draft.instructions}` : null,
  `系列：\`${fam?.seriesId ?? c.seriesId ?? "?"}\`　五行：${fam?.element ?? c.element ?? "?"}／${fam?.flavor ?? c.flavor ?? "?"}`,
  `食物原型：${fam?.foodOrigin?.zh ?? c.foodOrigin?.zh ?? "?"}`,
  `三階：${stageLine}`,
  c.theme ? `主題：${c.theme}` : null,
  !artReview && skillLine ? `一階技能：\n${skillLine}` : null,
  poolLine,
  "",
  artReview
    ? "請去 /admin/spirits「待睇立繪」睇圖；滿意撳「繼續 3D」，唔啱就否決（未燒 3D credits）。"
    : "請去 /admin/spirits 最終審批（Telegram 只作通知，唔提供批准／否決按鈕）。",
].filter(Boolean).join("\n");

if (!flags.telegram) {
  console.log(`[request-approval] skipped：未設 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID（draft 已就緒，請去 /admin/spirits 審批）`);
  console.log(`--- 預覽 ---\n${text}\n------------`);
  process.exit(0);
}

// 先送三階立繪相簿，再送純文字後台審批提醒。
const preview = await sendStagePreviews(draft);
if (preview.ok) {
  console.log(`[request-approval] 已送 ${preview.sent} 張立繪預覽${preview.missing?.length ? `（缺：${preview.missing.join(", ")}）` : ""}`);
} else if (!preview.skipped) {
  console.warn(`[request-approval] 立繪預覽送唔到（${preview.error ?? "unknown"}），照發文字審批`);
}

const res = await sendTelegram(text);
if (res.ok) {
  draft.telegram = { ...draft.telegram, messageId: res.messageId };
  writeDraft(draft);
  console.log(`[request-approval] 已送出審批（message ${res.messageId}）`);
} else {
  console.error(`[request-approval] 送出失敗：${res.error ?? "unknown"}`);
  process.exit(1);
}
