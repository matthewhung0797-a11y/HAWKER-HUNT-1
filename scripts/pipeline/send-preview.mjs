// 把一個 draft 三階立繪，用相簿（sendMediaGroup）送去 Telegram 做預覽。
// Telegram 相片只收 JPEG/PNG，所以每張 webp 先用 sharp 轉 png（保留透明）。
// 用法：node scripts/pipeline/send-preview.mjs <id>
//   俾 request-approval.mjs import sendStagePreviews(draft) 共用。

import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { readDraft, stagesOf } from "./lib/draft.mjs";
import { sendMediaGroup } from "./lib/telegram.mjs";
import { flags } from "./lib/env.mjs";

/** 由 stageId 搵去背立繪；art stage 直接寫落 public/spirits/full/<id>.webp */
function artPath(stageId) {
  const p = `public/spirits/full/${stageId}.webp`;
  return existsSync(p) ? p : null;
}

/** 每階 caption：中／英名 + 幾階 */
function captionFor(draft, stageId, stageNo) {
  const s = draft.family?.stages?.find((x) => x.id === stageId);
  const zh = s?.name?.zh ?? draft.concept?.name?.zh ?? stageId;
  const en = s?.name?.en ?? draft.concept?.name?.en ?? "";
  return `${zh}${en ? ` / ${en}` : ""}（${stageNo}階）`;
}

/**
 * 把 draft 三階立繪送做相簿。回傳 { ok, sent, missing, error }。
 * 只讀檔（唔寫 draft），可安全喺生成途中 resend。
 */
export async function sendStagePreviews(draft, opts = {}) {
  if (!flags.telegram) return { ok: false, skipped: true };
  const stages = stagesOf(draft);
  const items = [];
  const missing = [];
  for (const st of stages) {
    const p = artPath(st.id);
    if (!p) {
      missing.push(st.id);
      continue;
    }
    // webp → png buffer（Telegram 唔收 webp 做相；保留透明底）
    const buffer = await sharp(p).png().toBuffer();
    items.push({ buffer, filename: `${st.id}.png`, caption: captionFor(draft, st.id, st.stage) });
  }
  if (items.length === 0) return { ok: false, error: "冇任何立繪可送", missing };

  // 第一張加系列 header
  const fam = draft.family;
  const header = opts.header ?? `🍜 ${fam?.foodOrigin?.zh ?? draft.concept?.foodOrigin?.zh ?? draft.id} 系列預覽`;
  items[0].caption = `${header}\n${items[0].caption}`;

  const res = await sendMediaGroup(items);
  return { ...res, sent: items.length, missing };
}

// ── CLI ──（pathToFileURL 處理 Windows 路徑／空格編碼／file:/// 前綴）
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: node scripts/pipeline/send-preview.mjs <id>");
    process.exit(1);
  }
  const draft = readDraft(id);
  if (!draft) {
    console.error(`[send-preview] 搵唔到 draft: ${id}`);
    process.exit(1);
  }
  if (!flags.telegram) {
    console.log("[send-preview] skipped：未設 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID");
    process.exit(0);
  }
  const r = await sendStagePreviews(draft);
  if (r.ok) {
    console.log(`[send-preview] 已送出 ${r.sent} 張立繪${r.missing?.length ? `（缺：${r.missing.join(", ")}）` : ""}`);
  } else {
    console.error(`[send-preview] 送出失敗：${r.error ?? r.skipped ? "skipped" : "unknown"}`);
    process.exit(r.skipped ? 0 : 1);
  }
}
