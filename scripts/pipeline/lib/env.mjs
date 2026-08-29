// 系統二 node 腳本共用嘅 env 讀取（graceful）。
// 先讀 .env.local（本機），再用 process.env 補（CI / GitHub Actions secrets）。
// 缺 key 唔會 throw——由各 stage 自己決定 mock。

import { readFileSync, existsSync } from "node:fs";

function loadDotEnvLocal() {
  const out = {};
  if (!existsSync(".env.local")) return out;
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {
    // 讀唔到就算，當冇 .env.local
  }
  return out;
}

const fileEnv = loadDotEnvLocal();

/** 攞一個 env（process.env 優先，跟住 .env.local）；空字串當冇 */
export function getEnv(name) {
  const v = process.env[name] ?? fileEnv[name];
  return v && String(v).trim() ? String(v).trim() : undefined;
}

export const keys = {
  gemini: getEnv("GEMINI_API_KEY"),
  meshy: getEnv("MESHY_API_KEY"),
  tripo: getEnv("TRIPO_API_KEY"),
  cursor: getEnv("CURSOR_API_KEY"),
  telegramToken: getEnv("TELEGRAM_BOT_TOKEN"),
  telegramChat: getEnv("TELEGRAM_CHAT_ID"),
};

export const flags = {
  gemini: Boolean(keys.gemini),
  // Meshy key 慣例 msy_ 開頭、Tripo API key 慣例 tsk_ 開頭（見 gen-3d.mjs）
  meshy: Boolean(keys.meshy?.startsWith("msy_")),
  tripo: Boolean(keys.tripo?.startsWith("tsk_")),
  telegram: Boolean(keys.telegramToken && keys.telegramChat),
};
flags.model3d = flags.meshy || flags.tripo;
