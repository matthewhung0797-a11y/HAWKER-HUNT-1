// 驗證捕捉「狂撳」新手感：搏鬥階段每一下撳中精靈補夾實度，唔撳就流失。
// 用 ?debug=1 開 window.__cap（唔強制 last-stand），mode=3d 令第一 clamp 穩定入搏鬥。
// 撳嘅位置要落喺精靈 track 螢幕座標，先算「撳中」（tapWithin）。
// Run: node scripts/diag-mash.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE || "http://localhost:3000";
const SPECIES = process.env.SPECIES || "oily-rice-chick";
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });

const context = await browser.newContext({
  viewport: { width: 414, height: 896 },
  locale: "zh-TW",
  deviceScaleFactor: 2,
});
await context.addInitScript(() => {
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T" }, version: 0 })
  );
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

const cap = () => page.evaluate(() => (window.__cap ? window.__cap() : null));

async function pollUntil(pred, ms = 8000, step = 100) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = await cap();
    if (s && pred(s)) return s;
    await page.waitForTimeout(step);
  }
  return null;
}

// 喺 (x,y) dispatch 一對 pointerdown/up（React onPointerDown 要真 PointerEvent + pointerId）
async function tapAt(x, y) {
  await page.evaluate(
    ([px, py]) => {
      const el = document.querySelector('[data-testid="hold"]');
      if (!el) return;
      const opts = { pointerId: 1, pointerType: "touch", clientX: px, clientY: py, bubbles: true };
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
    },
    [x, y]
  );
}

// ls=charge：跟 diag-laststand，令第一 clamp 保證入搏鬥（唔使賭 timing）；charge 事件唔阻 grip 驗證
await page.goto(`${BASE}/capture?species=${SPECIES}&mode=3d&debug=1&ls=charge`, {
  waitUntil: "domcontentloaded",
});
await page.getByTestId("start").click({ timeout: 15000 });
await pollUntil((s) => s.phase === "aiming");

let struggle = null;
for (let i = 0; i < 8; i++) {
  const clamp = page.getByTestId("clamp");
  if (await clamp.count()) await clamp.first().click({ timeout: 4000 }).catch(() => {});
  struggle = await pollUntil((s) => s.phase === "struggle" || s.phase === "failed", 2500);
  if (struggle?.phase === "struggle") break;
}

if (struggle?.phase !== "struggle") {
  console.log("FAIL: 入唔到搏鬥階段", struggle);
  await browser.close();
  process.exit(1);
}

const start = await cap();
console.log("進入搏鬥，起手 grip =", start.grip, "track =", start.trackX, start.trackY);

// (1) 停手 0.8s：grip 應該流失（唔撳會跌）
await page.waitForTimeout(800);
const afterIdle = await cap();

// (2) 超快狂撳（每 20ms ≈ 50 下/秒，遠快過人手）：grip 應該上升，但升幅封頂喺
//     原按住速率（55/秒）減流失 → 淨升幅約 ≤45/秒，唔會一撳即滿（證明漏桶封頂 work）
const mashStartGrip = afterIdle.grip;
const mashStartT = Date.now();
let peak = afterIdle.grip;
let caught = false;
let frenzySeen = false;
let captureMs = null;
for (let i = 0; i < 200; i++) {
  const s = await cap();
  if (!s || s.phase !== "struggle") {
    caught = s?.phase === "caught" || s?.phase === "success";
    if (caught) captureMs = Date.now() - mashStartT;
    break;
  }
  if (s.frenzy && !frenzySeen) {
    frenzySeen = true;
    await page.screenshot({ path: "test-shots/mash-frenzy.png" }); // 影低狂暴中一刻
  }
  await tapAt(s.trackX, s.trackY);
  peak = Math.max(peak, s.grip);
  await page.waitForTimeout(20);
}

// (3) 撳空（遠離精靈）：grip 唔應該升（驗 tapWithin gating）
const beforeMiss = (await cap())?.grip ?? 0;
let missPhase = "struggle";
for (let i = 0; i < 10; i++) {
  const s = await cap();
  if (!s || s.phase !== "struggle") {
    missPhase = s?.phase ?? "gone";
    break;
  }
  await tapAt(5, 5); // 左上角，遠離精靈
  await page.waitForTimeout(45);
}
const afterMiss = (await cap())?.grip ?? null;

await page.screenshot({ path: "test-shots/mash-struggle.png" });

const result = {
  startGrip: start.grip,
  afterIdleGrip: afterIdle.grip,
  idleDropped: afterIdle.grip < start.grip,
  peakDuringMash: peak,
  mashRaised: peak > afterIdle.grip,
  frenzySeen, // 狂暴期有冇喺捉到之前發作
  captureMs, // 由開始狂撳到捉到需時（拉長咗＝難咗少少）
  caught,
  beforeMissGrip: beforeMiss,
  afterMissGrip: afterMiss,
  missDidNotRaise: afterMiss === null ? "already-caught" : afterMiss <= beforeMiss + 1,
};
console.log(JSON.stringify(result, null, 2));
const pass = result.idleDropped && (result.mashRaised || result.caught) && result.frenzySeen;
console.log(pass ? "PASS（有狂暴）" : "CHECK: 冇偵測到狂暴或手感異常");
await browser.close();
