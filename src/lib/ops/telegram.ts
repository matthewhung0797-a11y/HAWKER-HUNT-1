// Telegram 通知模組（server-only）。未設定 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
// 就自動 skip（唔會 throw），設定咗即刻通電。系統一（警報）同系統二（出寵物確認）共用。

import { opsConfig, isTelegramConfigured } from "./config";

const API = "https://api.telegram.org";

export type TelegramButton = { text: string; callback_data: string };

export type TelegramResult = {
  ok: boolean;
  /** true = 因為未設定而略過（並非錯誤） */
  skipped?: boolean;
  messageId?: number;
  error?: string;
};

async function callTelegram(method: string, body: Record<string, unknown>): Promise<TelegramResult> {
  if (!isTelegramConfigured) return { ok: false, skipped: true };
  try {
    const res = await fetch(`${API}/bot${opsConfig.telegram.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { ok: boolean; result?: { message_id?: number }; description?: string };
    if (!data.ok) return { ok: false, error: data.description ?? `telegram ${method} failed` };
    return { ok: true, messageId: data.result?.message_id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 發一段文字通知（預設 Markdown）。inline buttons 可選（每個 sub-array 係一行）。 */
export async function sendTelegram(
  text: string,
  opts?: { buttons?: TelegramButton[][]; parseMode?: "Markdown" | "MarkdownV2" | "HTML" }
): Promise<TelegramResult> {
  return callTelegram("sendMessage", {
    chat_id: opsConfig.telegram.chatId,
    text,
    parse_mode: opts?.parseMode ?? "Markdown",
    disable_web_page_preview: true,
    ...(opts?.buttons ? { reply_markup: { inline_keyboard: opts.buttons } } : {}),
  });
}

/** 回應一個 callback query（撳完掣俾即時反饋，例如 toast） */
export async function answerCallback(callbackQueryId: string, text?: string): Promise<TelegramResult> {
  return callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

export type TelegramFileResult = {
  ok: boolean;
  skipped?: boolean;
  buffer?: Buffer;
  /** 由 file_path 推斷嘅副檔名（jpg/png/webp…） */
  ext?: string;
  error?: string;
};

/** 由 file_id 下載檔案（先 getFile 攞 file_path 再由 file API 拎 bytes）。收相／文件用。 */
export async function getTelegramFile(fileId: string): Promise<TelegramFileResult> {
  if (!isTelegramConfigured) return { ok: false, skipped: true };
  const token = opsConfig.telegram.botToken;
  try {
    const infoRes = await fetch(`${API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const info = (await infoRes.json()) as { ok: boolean; result?: { file_path?: string }; description?: string };
    if (!info.ok || !info.result?.file_path) return { ok: false, error: info.description ?? "getFile failed" };
    const filePath = info.result.file_path;
    const dlRes = await fetch(`${API}/file/bot${token}/${filePath}`);
    if (!dlRes.ok) return { ok: false, error: `download ${dlRes.status}` };
    const buffer = Buffer.from(await dlRes.arrayBuffer());
    const ext = (filePath.split(".").pop() ?? "jpg").toLowerCase();
    return { ok: true, buffer, ext };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 改寫已發訊息（例如按完 Yes/No 之後鎖定按鈕、更新狀態文字） */
export async function editTelegramMessage(
  messageId: number,
  text: string,
  opts?: { buttons?: TelegramButton[][]; parseMode?: "Markdown" | "MarkdownV2" | "HTML" }
): Promise<TelegramResult> {
  return callTelegram("editMessageText", {
    chat_id: opsConfig.telegram.chatId,
    message_id: messageId,
    text,
    parse_mode: opts?.parseMode ?? "Markdown",
    disable_web_page_preview: true,
    ...(opts?.buttons ? { reply_markup: { inline_keyboard: opts.buttons } } : {}),
  });
}
