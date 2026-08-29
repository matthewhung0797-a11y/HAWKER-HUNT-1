// 自動 rollback：回滾去 Vercel 上一個健康嘅 production 部署（瞓覺保命網，唔靠 AI）。
// 用法：node scripts/ops/rollback.mjs
// 需要 env：VERCEL_TOKEN（＋ CI 內先 `vercel pull` 令 .vercel 有 project 連結，
//           或設 VERCEL_ORG_ID / VERCEL_PROJECT_ID）。
// 未設 token 就 graceful skip（exit 0），方便未接 Vercel 時 workflow 唔會紅。
//
// 用官方 Vercel CLI `vercel rollback`（stable、documented）：無指定目標即回滾到
// 現行 production 之前嗰個部署。成功／失敗都會發 Telegram（notify-telegram.mjs）。

import { spawn } from "node:child_process";

const token = process.env.VERCEL_TOKEN?.trim();
const scope = process.env.VERCEL_ORG_ID?.trim(); // team/org slug or id（可選）

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => ((out += d), process.stdout.write(d)));
    p.stderr.on("data", (d) => ((out += d), process.stderr.write(d)));
    p.on("close", (code) => resolve({ code, out }));
  });
}

async function notify(msg) {
  await run("node", ["scripts/ops/notify-telegram.mjs", JSON.stringify(msg)]).catch(() => {});
}

if (!token) {
  console.log("[rollback] skipped: VERCEL_TOKEN not set");
  process.exit(0);
}

const args = ["--yes", "vercel@latest", "rollback", "--yes", `--token=${token}`];
if (scope) args.push(`--scope=${scope}`);

console.log("[rollback] running: npx vercel rollback ...");
const { code, out } = await run("npx", args);

if (code === 0) {
  await notify("🟢 *自動 rollback 成功*\n已回滾到上一個健康 production 版本。網站應已恢復，起身再查根因。");
  console.log("[rollback] done");
  process.exit(0);
} else {
  await notify("⚠️ *自動 rollback 失敗*\n手動介入需要！CLI 輸出：\n```\n" + out.slice(-600) + "\n```");
  console.error("[rollback] failed, exit", code);
  process.exit(1);
}
