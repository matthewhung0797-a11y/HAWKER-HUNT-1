// Ops config — server-only 環境變數讀取。
// 原本隨 api/ops 路由被刪時變成 stub，現恢復為真實讀取 process.env。
// 保持既有導出 shape（opsConfig 物件 + isOpsConfigured() + isSupabaseConfigured() + isTelegramConfigured 常數），
// 令 analytics/server.ts、founder/page.tsx、ops/telegram.ts、ops/github.ts 四個 import 端零改動。
// ⚠️ 只可在 server 端 import（含 SUPABASE_SERVICE_ROLE_KEY）。

const env = (typeof process !== "undefined" && process.env) || ({} as Record<string, string | undefined>);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const opsSecret = env.OPS_SECRET ?? "";
const telegramBotToken = env.TELEGRAM_BOT_TOKEN ?? "";
const telegramChatId = env.TELEGRAM_CHAT_ID ?? "";

export const opsConfig = {
  secret: opsSecret,
  opsSecret,
  telegramBotToken,
  telegramChatId,
  vercelToken: env.VERCEL_TOKEN ?? "",
  vercelOrgId: env.VERCEL_ORG_ID ?? "",
  vercelProjectId: env.VERCEL_PROJECT_ID ?? "",
  githubDispatchToken: env.GITHUB_DISPATCH_TOKEN ?? "",
  githubRepo: env.GITHUB_REPO ?? "",
  geminiApiKey: env.GEMINI_API_KEY ?? "",
  meshyApiKey: env.MESHY_API_KEY ?? "",
  tripoApiKey: env.TRIPO_API_KEY ?? "",
  cursorApiKey: env.CURSOR_API_KEY ?? "",
  github: { dispatchToken: env.GITHUB_DISPATCH_TOKEN ?? "", repo: env.GITHUB_REPO ?? "" },
  telegram: { botToken: telegramBotToken, chatId: telegramChatId },
  supabase: {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceKey,
    serviceKey: supabaseServiceKey,
  },
} as const;

/** OPS_SECRET 是否已設定（/founder 的 ?key= 閘門用） */
export function isOpsConfigured(): boolean {
  return opsSecret.length > 0;
}

/** Supabase server 端是否通電（service role key 存在） */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseServiceKey);
}

/** Telegram 警報是否通電（保持 const boolean：telegram.ts 以值使用） */
export const isTelegramConfigured = Boolean(telegramBotToken && telegramChatId);
