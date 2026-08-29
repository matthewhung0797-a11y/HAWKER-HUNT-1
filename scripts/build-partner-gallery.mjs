/**
 * 產出合伙人可手機直開嘅精靈素材 gallery：
 * public/partner-gallery/index.html（相對路徑；dev server 或靜態 host 開）
 * public/partner-gallery/species.csv
 *
 * 用法：node scripts/build-partner-gallery.mjs
 *
 * 注意：file:// 直開可能因瀏覽器禁跨路徑讀 ../models；手機建議用
 * http://localhost:3000/partner-gallery/ 或 ngrok／丟去任何靜態 host。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "partner-gallery");
const modelsDir = path.join(root, "public", "models");
const fullDir = path.join(root, "public", "spirits", "full");

const speciesSrc = fs.readFileSync(path.join(root, "src", "content", "species.ts"), "utf8");
// 淨係 SPECIES 物件：id → seriesId → stage → name（技能 id 冇 seriesId）
const re =
  /\{\s*id:\s*"([a-z0-9-]+)",\s*seriesId:\s*"([^"]+)",\s*stage:\s*(\d+),\s*name:\s*\{\s*en:\s*"([^"]*)",\s*zh:\s*"([^"]*)"/g;
const rows = [];
const seen = new Set();
let m;
while ((m = re.exec(speciesSrc))) {
  const id = m[1];
  if (seen.has(id)) continue;
  seen.add(id);
  const seriesId = m[2];
  const stage = Number(m[3]);
  const en = m[4];
  const zh = m[5];
  const glb = `${id}.glb`;
  const webp = `${id}.webp`;
  const modelOk = fs.existsSync(path.join(modelsDir, glb));
  const artOk = fs.existsSync(path.join(fullDir, webp));
  rows.push({ id, seriesId, zh, en, stage, modelOk, artOk, glb, webp });
}
rows.sort((a, b) => a.seriesId.localeCompare(b.seriesId) || a.stage - b.stage || a.id.localeCompare(b.id));

fs.mkdirSync(outDir, { recursive: true });

const csv = [
  "id,seriesId,name_zh,name_en,stage,model_file,model_ok,art_file,art_ok",
  ...rows.map(
    (r) =>
      `${r.id},${r.seriesId},"${r.zh.replace(/"/g, '""')}","${r.en.replace(/"/g, '""')}",${r.stage},${r.glb},${r.modelOk},${r.webp},${r.artOk}`
  ),
].join("\n");
fs.writeFileSync(path.join(outDir, "species.csv"), csv, "utf8");

const cards = rows
  .map((r) => {
    const artSrc = r.artOk ? `../spirits/full/${r.webp}` : "";
    const modelHref = r.modelOk ? `../models/${r.glb}` : "";
    return `<article class="card" data-id="${r.id}" data-text="${(r.zh + " " + r.en + " " + r.id).toLowerCase()}">
  <div class="art">${
    artSrc
      ? `<img src="${artSrc}" alt="${r.zh || r.en}" loading="lazy" />`
      : `<div class="missing">No art</div>`
  }</div>
  <div class="meta">
    <h2>${r.zh || r.en || r.id}</h2>
    <p class="en">${r.en}</p>
    <p class="id"><code>${r.id}</code> · stage ${r.stage}</p>
    <p class="flags">${r.modelOk ? "GLB ✓" : "GLB ✗"} · ${r.artOk ? "Art ✓" : "Art ✗"}</p>
    ${modelHref ? `<a class="dl" href="${modelHref}" download>Download GLB</a>` : ""}
  </div>
</article>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Hawker Hunt — Spirit Gallery</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif;
      background: #f3ebe0;
      color: #2a1a0c;
      padding: 12px;
      padding-bottom: calc(24px + env(safe-area-inset-bottom));
    }
    header { position: sticky; top: 0; z-index: 2; background: #f3ebe0ee; backdrop-filter: blur(8px); padding: 10px 4px 12px; }
    h1 { font-size: 1.25rem; margin: 0 0 6px; }
    .sub { font-size: 0.8rem; color: #6a5644; margin: 0 0 10px; line-height: 1.4; }
    input {
      width: 100%;
      font-size: 16px;
      padding: 10px 12px;
      border: 2px solid #d8a12f;
      border-radius: 12px;
      background: #fffdf8;
    }
    .grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
    @media (min-width: 640px) { .grid { grid-template-columns: 1fr 1fr; } }
    @media (min-width: 960px) { .grid { grid-template-columns: 1fr 1fr 1fr; } }
    .card {
      background: #fffaf0;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid #e6d3b0;
      box-shadow: 0 4px 14px rgba(74,44,20,0.08);
    }
    .art {
      aspect-ratio: 1;
      background: linear-gradient(160deg, #fff6e0, #f0e0c8);
      display: flex; align-items: center; justify-content: center;
    }
    .art img { width: 100%; height: 100%; object-fit: contain; }
    .missing { color: #a08060; font-weight: 700; }
    .meta { padding: 10px 12px 14px; }
    .meta h2 { margin: 0; font-size: 1.05rem; }
    .en { margin: 2px 0 0; font-size: 0.85rem; color: #6a5644; }
    .id, .flags { margin: 4px 0 0; font-size: 0.75rem; color: #8a7058; }
    .dl {
      display: inline-block; margin-top: 8px;
      padding: 8px 12px; border-radius: 999px;
      background: #e8c860; color: #2a1a0c; font-weight: 800; text-decoration: none; font-size: 0.85rem;
    }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <header>
    <h1>Hawker Hunt 精靈素材</h1>
    <p class="sub">共 ${rows.length} 隻 · 立繪可 pinch 放大睇 · GLB 可下載 · <a href="./species.csv">species.csv</a><br/>手機請用遊戲同域開：<code>/partner-gallery/</code>（唔好用 file://）</p>
    <input id="q" type="search" placeholder="搜 id / 中文 / English…" enterkeyhint="search" />
  </header>
  <div class="grid" id="grid">
${cards}
  </div>
  <script>
    const q = document.getElementById("q");
    const cards = [...document.querySelectorAll(".card")];
    q.addEventListener("input", () => {
      const s = q.value.trim().toLowerCase();
      for (const c of cards) {
        const hit = !s || (c.dataset.text || "").includes(s) || c.dataset.id.includes(s);
        c.classList.toggle("hidden", !hit);
      }
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, "index.html"), html, "utf8");
console.log(`Wrote ${rows.length} spirits → ${path.relative(root, outDir)}`);
console.log(`Serve: http://localhost:3000/partner-gallery/`);
