/**
 * 多 project 並行時 port 會撞——診斷腳本用呢度揀 BASE。
 * 優先序：env BASE／DIAG_BASE → 已行緊嘅 Hawker Hunt → 第一個空 port（呼叫方自己起 server）。
 */
import { createConnection } from "node:net";

const CANDIDATES = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008, 3009, 3010];

function probeTcp(port, ms = 250) {
  return new Promise((resolve) => {
    const sock = createConnection({ host: "127.0.0.1", port });
    const t = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, ms);
    sock.once("connect", () => {
      clearTimeout(t);
      sock.end();
      resolve(true);
    });
    sock.once("error", () => {
      clearTimeout(t);
      resolve(false);
    });
  });
}

/** 粗認 Hawker Hunt：/battle 唔係 404，且回應有專屬字樣（首頁偶發 500 唔好當成「唔係本專案」） */
async function looksLikeHawker(port) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const [home, battle] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/`, { signal: ctrl.signal }).catch(() => null),
      fetch(`http://127.0.0.1:${port}/battle`, { signal: ctrl.signal }).catch(() => null),
    ]);
    clearTimeout(timer);
    if (!battle || battle.status === 404) return false;
    const html = await (home?.ok ? home.text() : battle.text());
    return /hawker-hunt|Hawker Hunt|小販獵手|麥士威/i.test(html);
  } catch {
    return false;
  }
}

/**
 * @param {{ startHint?: boolean }} [opts]
 * @returns {Promise<{ base: string, port: number, source: string, freePort: number|null }>}
 */
export async function resolveDiagBase(opts = {}) {
  const env = process.env.BASE || process.env.DIAG_BASE;
  if (env) {
    const m = String(env).match(/:(\d+)/);
    const port = m ? Number(m[1]) : 3000;
    return { base: env.replace(/\/$/, ""), port, source: "env", freePort: null };
  }

  let freePort = null;
  for (const port of CANDIDATES) {
    const busy = await probeTcp(port);
    if (!busy) {
      if (freePort == null) freePort = port;
      continue;
    }
    if (await looksLikeHawker(port)) {
      return {
        base: `http://localhost:${port}`,
        port,
        source: "detected-hawker",
        freePort,
      };
    }
  }

  // 冇偵測到 Hawker：交返第一個空 port 畀呼叫方起 server
  const port = freePort ?? 3002;
  if (opts.startHint) {
    console.warn(
      `[diag-base] 搵唔到運行中嘅 Hawker Hunt；建議：npm run dev -- -p ${port}`
    );
  }
  return {
    base: `http://localhost:${port}`,
    port,
    source: "free-fallback",
    freePort: port,
  };
}

/** 同步印一行，方便睇用緊邊個 port */
export function logDiagBase(info) {
  console.log(`[diag-base] BASE=${info.base} (${info.source})`);
}
