// 捕捉矩陣：多物種開頁＋開始掣（唔改難度數值；觀察入口穩定性）
import {
  appendEvent,
  appendFeed,
  saveShot,
  writeSessionMeta,
  sessionDir,
} from "../lib/run-io.mjs";
import { launchPlaytestBrowser, newPersonaContext } from "../lib/browser.mjs";

const MATRIX = [
  { id: "cap-s1-orhluak", species: "little-orh-luak", label: "1階蠔煎仔" },
  { id: "cap-s1-laksa", species: "little-laksa", label: "1階叻沙仔" },
  { id: "cap-s2-warrior", species: "omelette-warrior", label: "2階蠔煎武者" },
];

export async function runCaptureMatrix({ runDir, base }) {
  const browser = await launchPlaytestBrowser();
  const results = [];

  for (const row of MATRIX) {
    const persona = { id: row.id, label: row.label, tapDelayMs: 80, slow: false };
    sessionDir(runDir, persona.id);
    const { context, page } = await newPersonaContext(browser, { nickname: row.label });
    const t0 = Date.now();
    let ok = true;

    async function one(stepId, fn, feed) {
      const t = Date.now();
      try {
        await fn();
        const shot = await saveShot(page, runDir, persona.id, stepId);
        appendEvent(runDir, persona.id, {
          type: "step",
          stepId,
          ok: true,
          ms: Date.now() - t,
          shot,
          url: page.url(),
          meta: { species: row.species },
        });
        if (feed) {
          appendFeed(runDir, {
            personaId: persona.id,
            label: persona.label,
            stepId,
            text: feed,
            sentiment: "neutral",
            shot,
          });
        }
      } catch (e) {
        ok = false;
        const shot = await saveShot(page, runDir, persona.id, `${stepId}-fail`).catch(() => null);
        appendEvent(runDir, persona.id, {
          type: "step",
          stepId,
          ok: false,
          ms: Date.now() - t,
          reason: e?.message?.slice(0, 180),
          shot,
          url: page.url(),
        });
        appendFeed(runDir, {
          personaId: persona.id,
          label: persona.label,
          stepId,
          text: `捕捉矩陣失敗：${stepId} — ${e?.message?.slice(0, 100)}`,
          sentiment: "negative",
          shot,
        });
      }
    }

    console.log(`[playtest:capture] ▶ ${row.label}`);
    await one(
      "capture.goto",
      async () => {
        await page.goto(`${base}/capture?species=${row.species}`, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        await page.waitForTimeout(1800);
      },
      `打開捕捉 ${row.species}`
    );

    await one(
      "capture.start",
      async () => {
        const start = page.getByText(/即時開始|開始玩|開始/);
        if (await start.first().isVisible({ timeout: 3000 }).catch(() => false)) {
          await start.first().click();
          await page.waitForTimeout(1600);
        }
      },
      "撳開始入瞄准／搏鬥"
    );

    await one(
      "capture.frame",
      async () => {
        // 有 canvas 或主畫面就算入口活着
        const alive = await page.evaluate(() => {
          const c = document.querySelectorAll("canvas").length;
          const main = !!document.querySelector("main");
          return c > 0 || main;
        });
        if (!alive) throw new Error("捕捉頁無 canvas／main");
      },
      "畫面仲喺度"
    );

    writeSessionMeta(runDir, persona.id, {
      label: persona.label,
      status: ok ? "done" : "failed",
      durationMs: Date.now() - t0,
      path: "capture-matrix",
      species: row.species,
    });
    results.push({ id: row.id, ok });
    await context.close();
  }

  await browser.close();
  return results;
}
