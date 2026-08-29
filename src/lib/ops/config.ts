/** Ops config stub — original deleted with api/ops route.
 *  Uses Record<string, any> to avoid TypeScript errors for any property access. */
export const opsConfig: Record<string, any> = {
  secret: "",
  opsSecret: "",
  telegramBotToken: "",
  telegramChatId: "",
  vercelToken: "",
  vercelOrgId: "",
  vercelProjectId: "",
  githubDispatchToken: "",
  githubRepo: "",
  geminiApiKey: "",
  meshyApiKey: "",
  tripoApiKey: "",
  cursorApiKey: "",
  github: { dispatchToken: "", repo: "" },
  supabase: {
    url: "",
    anonKey: "",
    serviceRoleKey: "",
    serviceKey: "",
  },
};

export function isOpsConfigured(): boolean {
  return false;
}

export function isSupabaseConfigured(): boolean {
  return false;
}

export const isTelegramConfigured = false;
