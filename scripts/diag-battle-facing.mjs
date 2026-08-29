// Render /battle for a spread of species; screenshot idle + mid-attack to inspect facing.
// Player forced via ?uid=<speciesId> against a random same-stage enemy.
// Run: node scripts/diag-battle-facing.mjs
import { chromium } from "playwright";
import { resolveDiagBase, logDiagBase } from "./lib/diag-base.mjs";

const info = await resolveDiagBase({ startHint: true });
logDiagBase(info);
const BASE = info.base;

// FULL audit: every species with a GLB. Idle-only (fast) to eyeball facing (back=correct).
const CASES = process.argv[2] === "--sample"
  ? ["omelette-warrior", "oyster-immortal", "bkt-warrior", "kopi-o-emperor"]
  : [
      "omelette-warrior","oyster-immortal","curry-puffling","oily-rice-chick","silky-chicken-warrior",
      "hainan-chicken-god","little-laksa","laksa-warrior","laksa-dragon","bkt-cub","bkt-warrior",
      "bkt-grandmaster","tutu-sprite","lapis-queen","pastry-queen","kaya-blob","kaya-warrior","kaya-dragon",
      "chilli-crablet","crab-claw-warrior","chilli-crab-king","satay-skewerling","satay-warrior",
      "satay-flame-emperor","kopi-bean","kopi-sock-warrior","kopi-o-emperor","radish-cubie",
      "carrot-cake-warrior","black-white-cake-king","rojak-tot","rojak-warrior","rojak-king","little-orh-luak",
      "kway-teow-kid","kway-teow-warrior","wok-hei-god","curry-puff-warrior","golden-puff-sovereign",
      "prata-pup","prata-warrior","prata-sky-elephant","chendol-jelly","chendol-warrior","chendol-snow-queen",
      "chilli-baby","garlic-guard","lemongrass-swordsman","riceball-baby","vermicelli-sprite","egg-guard",
      "shrimp-hopper","coconut-jelly",
      "nasi-lemak-tot","nasi-lemak-scout","nasi-lemak-general",
      "otah-tot","otah-swashbuckler","otah-pyrolord-chong",
      "chwee-hamlet","chwee-sentry","chwee-shogun",
    ];

const now = Date.now();
const owned = CASES.map((id, i) => ({
  uid: id,
  speciesId: id,
  level: 15,
  exp: 0,
  caughtAt: now - i * 1000,
  centreId: "kreta-ayer",
}));

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({ viewport: { width: 900, height: 520 }, locale: "zh-TW", deviceScaleFactor: 1.5 });
await context.addInitScript(
  (data) => {
    localStorage.setItem(
      "hawker-hunt-save",
      JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T", ownedSpirits: data.owned }, version: 0 })
    );
    localStorage.setItem("hh-battle-tut", "1"); // skip tutorial
  },
  { owned }
);
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

const results = {};
for (const id of CASES) {
  await page.goto(`${BASE}/battle?uid=${id}`, { waitUntil: "domcontentloaded" });
  // wait for player phase (basic-attack button enabled)
  const ok = await page
    .locator("[data-basic-attack]:not([disabled])")
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(600); // settle idle facing
  await page.screenshot({ path: `test-shots/facing/${id}.png` });
  results[id] = { reachedPlayerPhase: ok };
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
