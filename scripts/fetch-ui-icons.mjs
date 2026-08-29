/**
 * 下載 Microsoft Fluent Emoji 3D icon（MIT License）並壓成 128px webp → public/ui/
 * https://github.com/microsoft/fluentui-emoji
 */
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const BASE = "https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets";

/** [Fluent 資產資料夾名, 輸出檔名] */
const ICONS = [
  ["World map", "nav-map"],
  ["Open book", "book"],
  ["Camera", "camera"],
  ["Trophy", "trophy"],
  ["Bust in silhouette", "person"],
  ["Coin", "coin"],
  ["Gem stone", "gem"],
  ["Gear", "gear"],
  ["Chopsticks", "chopsticks"],
  ["Red paper lantern", "lantern"],
  ["Star", "star"],
  ["1st place medal", "medal-1"],
  ["2nd place medal", "medal-2"],
  ["3rd place medal", "medal-3"],
  ["Hatching chick", "chick"],
  ["Crown", "crown"],
  ["Backpack", "backpack"],
  ["Sports medal", "medal"],
  ["Sparkles", "sparkles"],
  ["Busts in silhouette", "people"],
  ["Bullseye", "target"],
  ["Round pushpin", "pin"],
  ["Compass", "compass"],
  ["Mobile phone", "phone"],
  ["Globe with meridians", "globe"],
  ["Wastebasket", "trash"],
  ["Hammer and wrench", "wrench"],
  ["Dashing away", "dash"],
  ["Envelope", "envelope"],
  ["Poultry leg", "item-chicken"],
  ["Shrimp", "item-shrimp"],
  ["Rainbow", "item-rainbow"],
  ["Canned food", "item-can"],
  ["Coconut", "item-coconut"],
  ["Garlic", "item-garlic"],
  ["Scroll", "item-scroll"],
  ["Fire", "fire"],
  ["Crossed swords", "elem-metal"],
  ["Herb", "elem-wood"],
  ["Droplet", "elem-water"],
  ["Mountain", "elem-earth"],
];

mkdirSync("public/ui", { recursive: true });

let fail = 0;
for (const [folder, out] of ICONS) {
  const file = `${folder.toLowerCase().replaceAll(" ", "_").replaceAll("-", "_")}_3d.png`;
  const url = `${BASE}/${encodeURIComponent(folder)}/3D/${file}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const webp = await sharp(buf).resize(128, 128, { fit: "inside" }).webp({ quality: 88 }).toBuffer();
    writeFileSync(`public/ui/${out}.webp`, webp);
    console.log(`ok  ${out} (${Math.round(webp.length / 1024)}KB)`);
  } catch (e) {
    fail++;
    console.error(`FAIL ${out}: ${url} — ${e.message}`);
  }
}
console.log(fail ? `${fail} failed` : "all done");
