// 查 Tripo／Meshy 餘額（唯讀，唔燒 credits）
import { readFileSync, existsSync } from "node:fs";

function loadEnv() {
  const path = ".env.local";
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    env[line.slice(0, i).trim()] = v;
  }
  return env;
}

const env = loadEnv();
const outs = [];

async function getJson(url, key) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { status: r.status, ok: r.ok, body };
}

if (env.TRIPO_API_KEY) {
  for (const url of [
    "https://api.tripo3d.ai/v2/openapi/user/balance",
    "https://api.tripo3d.ai/v3/account/balance",
  ]) {
    const res = await getJson(url, env.TRIPO_API_KEY);
    outs.push({ svc: "tripo", url, ...res });
    if (res.ok) break;
  }
} else {
  outs.push({ svc: "tripo", err: "no TRIPO_API_KEY" });
}

if (env.MESHY_API_KEY) {
  const res = await getJson("https://api.meshy.ai/openapi/v1/balance", env.MESHY_API_KEY);
  outs.push({ svc: "meshy", ...res });
} else {
  outs.push({ svc: "meshy", err: "no MESHY_API_KEY" });
}

console.log(JSON.stringify(outs, null, 2));
