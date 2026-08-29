// Render restored rigged models in the dev viewer to check for deformation + facing.
// Captures idle + attack at 4 orbit-yaw angles. Run: node scripts/diag-rig-check.mjs
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3001";
const SPECIES = process.argv.slice(2);
const CASES = SPECIES.length ? SPECIES : ["oyster-immortal", "omelette-warrior"];
const ANIMS = ["idle", "attack"];
const YAWS = [0, 90, 180, 270];

mkdirSync("test-shots/rig", { recursive: true });
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: 480, height: 520 }, deviceScaleFactor: 1.5 });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

for (const id of CASES) {
  for (const anim of ANIMS) {
    for (const yaw of YAWS) {
      await page.goto(`${BASE}/dev/model?species=${id}&anim=${anim}&yaw=${yaw}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(anim === "attack" ? 900 : 700); // let clip advance
      await page.screenshot({ path: `test-shots/rig/${id}-${anim}-${yaw}.png` });
    }
  }
  console.log("done", id);
}
await browser.close();
