// 全圖鑑 3D 品質審計（唔燒 credits）：抽 species metadata + idle/attack 截圖 + montage
// 用法：node scripts/audit-model-quality.mjs [--shots-only] [--meta-only] [id1,id2,...]
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.DIAG_BASE ?? "http://localhost:3000";
const OUT = "test-shots/model-audit";
const W = 360, H = 360;
const args = process.argv.slice(2);
const shotsOnly = args.includes("--shots-only");
const metaOnly = args.includes("--meta-only");
const idArg = args.find((a) => !a.startsWith("--"));

mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, "shots"), { recursive: true });

function parseSpecies() {
  const src = readFileSync("src/content/species.ts", "utf8").replace(/\r\n/g, "\n");
  const start = src.indexOf("export const SPECIES:");
  const end = src.indexOf("export const SPECIES_MAP");
  const body = src.slice(start, end > 0 ? end : undefined);
  // 頂層 species 物件：以 "\n  {\n    id:" 分段（技能 id 縮排更深）
  const chunks = body.split(/\n  \{\n    id: "/).slice(1);
  const glbSet = new Set(
    existsSync("public/models")
      ? readdirSync("public/models").filter((f) => f.endsWith(".glb")).map((f) => f.replace(/\.glb$/, ""))
      : [],
  );
  const rows = [];
  for (const chunk of chunks) {
    const id = chunk.match(/^([^"]+)"/)?.[1];
    if (!id) continue;
    const seriesId = chunk.match(/seriesId: "([^"]+)"/)?.[1] ?? "";
    const stage = Number(chunk.match(/stage: (\d+)/)?.[1] ?? 0);
    const zh = chunk.match(/name: \{ en: "[^"]*", zh: "([^"]+)" \}/)?.[1] ?? id;
    const modelUrl = chunk.match(/modelUrl: "([^"]+)"/)?.[1] ?? null;
    const animated = /animated:\s*true/.test(chunk);
    const rigLite = /rigLite:\s*true/.test(chunk);
    const facingLock = /\/\/ facing-lock:/.test(chunk);
    const yawM = chunk.match(/modelYaw:\s*([^,\n]+)/)?.[1]?.trim() ?? null;
    const glbId = modelUrl?.replace(/^\/models\//, "").replace(/\.glb$/, "") ?? null;
    const glbExists = glbId ? glbSet.has(glbId) : false;
    let rigMode = "none";
    if (modelUrl) {
      if (!animated) rigMode = "static";
      else if (rigLite) rigMode = "rigLite";
      else rigMode = "fullRig";
    }
    // skill 已知先天難 rig 形態（預標，目視可改）
    const blobish =
      /blob|jelly|cubie|bean|baby|tot$|sprite$|pup$|chick$|skewerling|crablet|snowling|hamlet|riceball/i.test(
        id,
      ) || stage === 1;
    rows.push({
      id,
      zh,
      seriesId,
      stage,
      modelUrl,
      glbExists,
      animated,
      rigLite,
      rigMode,
      facingLock,
      modelYaw: yawM,
      blobishHint: blobish && stage === 1,
    });
  }
  return rows;
}

function label(text, w = 180, h = 20) {
  const esc = String(text).replace(/[<>&]/g, "");
  const svg = `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#111"/><text x="4" y="14" font-family="monospace" font-size="11" fill="#fff">${esc}</text></svg>`;
  return Buffer.from(svg);
}

async function montage(items, name) {
  const cols = 6;
  const cellW = 180, cellH = 180, labH = 20;
  const perSheet = 24; // 6×4
  let sheet = 0;
  for (let start = 0; start < items.length; start += perSheet) {
    const chunk = items.slice(start, start + perSheet);
    const r = Math.ceil(chunk.length / cols);
    const canvasW = cols * cellW;
    const canvasH = r * (cellH + labH);
    const composites = [];
    for (let i = 0; i < chunk.length; i++) {
      const cx = (i % cols) * cellW;
      const cy = Math.floor(i / cols) * (cellH + labH);
      const img = await sharp(chunk[i].path)
        .resize({ width: cellW, height: cellH, fit: "contain", background: "#2a1a0c" })
        .png()
        .toBuffer();
      composites.push({ input: label(chunk[i].id, cellW, labH), left: cx, top: cy });
      composites.push({ input: img, left: cx, top: cy + labH });
    }
    const outName = join(OUT, `montage-${name}-${sheet}.png`);
    await sharp({ create: { width: canvasW, height: canvasH, channels: 3, background: "#222" } })
      .composite(composites)
      .png()
      .toFile(outName);
    console.log(`montage → ${outName}`);
    sheet++;
  }
}

const all = parseSpecies();
const withModel = all.filter((r) => r.modelUrl);
const ids = idArg ? idArg.split(",") : withModel.map((r) => r.id);

const metaPath = join(OUT, "roster-meta.json");
if (!shotsOnly) {
  writeFileSync(metaPath, JSON.stringify({ generatedAt: new Date().toISOString(), total: all.length, withModel: withModel.length, rows: all }, null, 2));
  console.log(`meta → ${metaPath} (${withModel.length} with model / ${all.length} species)`);
}
if (metaOnly) process.exit(0);

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("pageerror", (e) => console.log(`[pageerror] ${e.message.slice(0, 120)}`));

const idleItems = [];
const attackItems = [];
for (const id of ids) {
  for (const anim of ["idle", "attack"]) {
    const path = join(OUT, "shots", `${id}-${anim}.png`);
    try {
      await page.goto(`${BASE}/dev/model?species=${id}&anim=${anim}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.addStyleTag({ content: ".absolute{display:none !important}" });
      await page.waitForTimeout(anim === "attack" ? 800 : 2000);
      await page.screenshot({ path });
      (anim === "idle" ? idleItems : attackItems).push({ id, path });
      console.log(`ok ${id} ${anim}`);
    } catch (e) {
      console.log(`FAIL ${id} ${anim}: ${String(e.message).slice(0, 120)}`);
    }
  }
}
await browser.close();

await montage(idleItems, "idle");
await montage(attackItems, "attack");
console.log("DONE shots+montage");
