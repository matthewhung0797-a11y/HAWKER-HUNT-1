// 健康檢查（俾 GitHub Actions uptime cron 用）。
// 用法：node scripts/ops/health-check.mjs
// 需要 env：HEALTH_URL（完整 URL，例如 https://your-app.vercel.app/api/health）
//           或 APP_URL（會自動補 /api/health）。
// 行為：重試數次，全部失敗先當 down（exit 1）；健康 exit 0。輸出摘要俾 workflow 用。

const base = (process.env.HEALTH_URL || (process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, "")}/api/health` : "")).trim();
const RETRIES = Number(process.env.HEALTH_RETRIES || 3);
const TIMEOUT_MS = Number(process.env.HEALTH_TIMEOUT_MS || 8000);
const GAP_MS = Number(process.env.HEALTH_RETRY_GAP_MS || 5000);

if (!base) {
  console.error("[health-check] no HEALTH_URL / APP_URL set");
  process.exit(2); // 設定問題（同「網站真係 down」區分開）
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(attempt) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const started = Date.now();
    const res = await fetch(base, { signal: ctrl.signal, headers: { "cache-control": "no-cache" } });
    const ms = Date.now() - started;
    let bodyStatus = "";
    try {
      const j = await res.json();
      bodyStatus = j?.status ?? "";
    } catch {}
    const ok = res.status === 200;
    console.log(`[health-check] attempt ${attempt}: http ${res.status} status="${bodyStatus}" ${ms}ms`);
    return ok;
  } catch (e) {
    console.log(`[health-check] attempt ${attempt}: error ${e?.name === "AbortError" ? "timeout" : e?.message}`);
    return false;
  } finally {
    clearTimeout(t);
  }
}

let healthy = false;
for (let i = 1; i <= RETRIES; i++) {
  if (await probe(i)) {
    healthy = true;
    break;
  }
  if (i < RETRIES) await sleep(GAP_MS);
}

// 俾 workflow 讀嘅輸出（GITHUB_OUTPUT）
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_OUTPUT, `healthy=${healthy}\nurl=${base}\n`);
}

if (!healthy) {
  console.error(`[health-check] DOWN after ${RETRIES} attempts: ${base}`);
  process.exit(1);
}
console.log(`[health-check] OK: ${base}`);
