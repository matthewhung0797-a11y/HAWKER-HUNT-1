// 獨立 Telegram 通知（俾 GitHub Actions / CI 用，唔經 Next）。
// 用法：node scripts/ops/notify-telegram.mjs "訊息內容"
// 需要 env：TELEGRAM_BOT_TOKEN、TELEGRAM_CHAT_ID（未設定就 graceful skip，exit 0）。

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
const text = process.argv.slice(2).join(" ") || "(empty message)";

if (!token || !chatId) {
  console.log("[notify-telegram] skipped: TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set");
  process.exit(0);
}

try {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error("[notify-telegram] failed:", data.description);
    process.exit(1);
  }
  console.log("[notify-telegram] sent");
} catch (e) {
  console.error("[notify-telegram] error:", e?.message ?? e);
  process.exit(1);
}
