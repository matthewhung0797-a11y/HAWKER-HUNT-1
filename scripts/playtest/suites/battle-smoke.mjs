// 切磋煙測：開場＋教學＋影一張（面向抽樣；唔打完場以免 flaky）
import {
  appendEvent,
  appendFeed,
  saveShot,
  writeSessionMeta,
  sessionDir,
} from "../lib/run-io.mjs";
import { launchPlaytestBrowser, newPersonaContext } from "../lib/browser.mjs";

export async function runBattleSmoke({ runDir, base }) {
  const persona = { id: "battle-smoke", label: "切磋煙測", tapDelayMs: 60 };
  sessionDir(runDir, persona.id);
  const browser = await launchPlaytestBrowser();
  const { context, page } = await newPersonaContext(browser, { nickname: "BattleSmoke" });
  const t0 = Date.now();
  let ok = true;

  async function one(stepId, fn, feed, sentiment = "neutral") {
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
      });
      if (feed) {
        appendFeed(runDir, {
          personaId: persona.id,
          label: persona.label,
          stepId,
          text: feed,
          sentiment,
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
      });
      appendFeed(runDir, {
        personaId: persona.id,
        label: persona.label,
        stepId,
        text: `切磋煙測失敗：${e?.message?.slice(0, 120)}`,
        sentiment: "negative",
        shot,
      });
    }
  }

  await one(
    "battle.goto",
    async () => {
      await page.goto(`${base}/battle`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(2400);
    },
    "入場切磋"
  );

  await one(
    "battle.tutorial",
    async () => {
      const tut = page.getByText("開始切磋！");
      if (await tut.isVisible().catch(() => false)) {
        await tut.click();
        await page.waitForTimeout(500);
      }
    },
    "過咗教學／或已睇過"
  );

  await one(
    "battle.facing_sample",
    async () => {
      await page.waitForTimeout(600);
      const hasMain = await page.locator("main").count();
      if (!hasMain) throw new Error("無 main");
    },
    "已截切磋畫面做面向抽樣（正式驗收仍靠 facing golden）",
    "neutral"
  );

  writeSessionMeta(runDir, persona.id, {
    label: persona.label,
    status: ok ? "done" : "failed",
    durationMs: Date.now() - t0,
    path: "battle-smoke",
  });

  await context.close();
  await browser.close();
  return { ok };
}
