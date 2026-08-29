// 系統二 CI/腳本用嘅 Telegram sender（支援 inline buttons），graceful skip。
// 對應 src/lib/ops/telegram.ts，但 .mjs 唔 import 得 TS，所以照 notify-telegram.mjs
// 嘅慣例喺度自帶一份 fetch 實作。未設 token/chat 就 skip（唔算錯）。

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { keys, flags } from "./env.mjs";

const API = "https://api.telegram.org";

async function call(method, body) {
  if (!flags.telegram) return { ok: false, skipped: true };
  try {
    const res = await fetch(`${API}/bot${keys.telegramToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true, messageId: data.result?.message_id };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// multipart 版（傳相要用 form-data，唔可以 JSON）
async function callForm(method, form) {
  if (!flags.telegram) return { ok: false, skipped: true };
  try {
    const res = await fetch(`${API}/bot${keys.telegramToken}/${method}`, { method: "POST", body: form });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.description };
    return { ok: true, result: data.result };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/** 攞張相嘅 buffer——收 Buffer 就直接用，收路徑就讀檔 */
function toBuffer(img) {
  return Buffer.isBuffer(img) ? img : readFileSync(img);
}

/**
 * 發單張相（可帶 caption + inline buttons）。
 * photo：Buffer 或檔案路徑。Telegram 收 JPEG/PNG——webp 要 caller 先轉。
 */
export async function sendPhoto(photo, opts = {}) {
  if (!flags.telegram) return { ok: false, skipped: true };
  const form = new FormData();
  form.append("chat_id", keys.telegramChat);
  const name = opts.filename ?? (typeof photo === "string" ? basename(photo) : "photo.png");
  form.append("photo", new Blob([toBuffer(photo)]), name);
  if (opts.caption) {
    form.append("caption", opts.caption);
    if (opts.parseMode) form.append("parse_mode", opts.parseMode);
  }
  if (opts.buttons) form.append("reply_markup", JSON.stringify({ inline_keyboard: opts.buttons }));
  const r = await callForm("sendPhoto", form);
  return r.ok ? { ok: true, messageId: r.result?.message_id } : r;
}

/**
 * 發相簿（2–10 張一次過）。media group 唔支援 inline buttons，
 * 所以呢個淨係送圖——審批掣要另外用 sendTelegram 發。
 * items：[{ buffer|path, caption?, filename? }]
 */
export async function sendMediaGroup(items, opts = {}) {
  if (!flags.telegram) return { ok: false, skipped: true };
  if (!items?.length) return { ok: false, error: "no media" };
  const form = new FormData();
  form.append("chat_id", keys.telegramChat);
  const media = items.map((it, i) => {
    const field = `photo${i}`;
    const name = it.filename ?? (it.path ? basename(it.path) : `${field}.png`);
    form.append(field, new Blob([toBuffer(it.buffer ?? it.path)]), name);
    const m = { type: "photo", media: `attach://${field}` };
    if (it.caption) {
      m.caption = it.caption;
      if (opts.parseMode) m.parse_mode = opts.parseMode;
    }
    return m;
  });
  form.append("media", JSON.stringify(media));
  const r = await callForm("sendMediaGroup", form);
  return r.ok ? { ok: true, result: r.result } : r;
}

/** 發訊息（可帶 inline_keyboard）。buttons 係二維陣列，每個 sub-array 一行。 */
export async function sendTelegram(text, opts = {}) {
  return call("sendMessage", {
    chat_id: keys.telegramChat,
    text,
    parse_mode: opts.parseMode ?? "Markdown",
    disable_web_page_preview: true,
    ...(opts.buttons ? { reply_markup: { inline_keyboard: opts.buttons } } : {}),
  });
}
