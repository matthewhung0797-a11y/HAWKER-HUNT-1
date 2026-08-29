// 主循環 suite：導覽／地圖／捕捉入口／切磋開場——外掛觀察，唔改遊戲碼。
import {
  appendEvent,
  appendFeed,
  saveShot,
  writeSessionMeta,
  sessionDir,
} from "../lib/run-io.mjs";
import { launchPlaytestBrowser, newPersonaContext, newFreshContext } from "../lib/browser.mjs";

async function step(runDir, persona, page, stepId, fn, feedText) {
  const t0 = Date.now();
  try {
    await fn();
    const shot = await saveShot(page, runDir, persona.id, stepId);
    appendEvent(runDir, persona.id, {
      type: "step",
      stepId,
      ok: true,
      ms: Date.now() - t0,
      shot,
      url: page.url(),
    });
    if (feedText) {
      appendFeed(runDir, {
        personaId: persona.id,
        label: persona.label,
        stepId,
        text: feedText,
        sentiment: "neutral",
        shot,
      });
    }
    return true;
  } catch (e) {
    const shot = await saveShot(page, runDir, persona.id, `${stepId}-fail`).catch(() => null);
    const reason = e?.message?.slice(0, 180) || "error";
    appendEvent(runDir, persona.id, {
      type: "step",
      stepId,
      ok: false,
      ms: Date.now() - t0,
      reason,
      shot,
      url: page.url(),
    });
    appendFeed(runDir, {
      personaId: persona.id,
      label: persona.label,
      stepId,
      text: `卡住咗：${stepId}（${reason}）`,
      sentiment: "negative",
      shot,
    });
    return false;
  }
}

async function runOnboarding(runDir, persona, base) {
  const browser = await launchPlaytestBrowser();
  const { context, page } = await newFreshContext(browser);
  sessionDir(runDir, persona.id);
  const t0 = Date.now();
  let ok = true;

  ok =
    (await step(
      runDir,
      persona,
      page,
      "onb.open",
      async () => {
        await page.goto(`${base}/onboarding`, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.getByTestId("onb-hello").waitFor({ timeout: 12000 });
        await page.waitForTimeout(persona.slow ? 800 : 400);
      },
      "開場對白…睇吓師傅講咩"
    )) && ok;

  ok =
    (await step(
      runDir,
      persona,
      page,
      "onb.dialogue",
      async () => {
        for (let i = 0; i < 14; i++) {
          if (await page.getByTestId("onb-ring").count()) break;
          await page.getByTestId("onb-hello").click();
          await page.waitForTimeout(persona.slow ? 280 : 180);
        }
        if (!(await page.getByTestId("onb-ring").count())) throw new Error("到唔到縮圈課");
      },
      "對白有啲長，不過跟得上"
    )) && ok;

  ok =
    (await step(
      runDir,
      persona,
      page,
      "onb.aim",
      async () => {
        await page.evaluate(
          () =>
            new Promise((res) => {
              const check = () => {
                const el = document.querySelector('[data-testid="onb-ring"]');
                const s = parseFloat((el && el.dataset.s) || "9");
                if (Math.abs(s - 1) < 0.08) {
                  document.querySelector('[data-testid="onb-aim-tap"]')?.click();
                  res(null);
                } else requestAnimationFrame(check);
              };
              check();
            })
        );
        await page.getByTestId("onb-aim-good").waitFor({ timeout: 5000 });
      },
      "金圈貼住先撳——呢步要集中"
    )) && ok;

  ok =
    (await step(
      runDir,
      persona,
      page,
      "onb.mash",
      async () => {
        await page.getByTestId("onb-mash-tap").waitFor({ timeout: 5000 });
        for (let i = 0; i < 80; i++) {
          if (await page.getByTestId("onb-caught").count()) break;
          await page
            .getByTestId("onb-mash-tap")
            .dispatchEvent("click")
            .catch(() => {});
          await page.waitForTimeout(persona.tapDelayMs);
        }
        await page.getByTestId("onb-caught").waitFor({ timeout: 6000 });
      },
      persona.slow ? "狂撳好攰，險啲搓唔切" : "狂撳課過咗"
    )) && ok;

  ok =
    (await step(
      runDir,
      persona,
      page,
      "onb.finish",
      async () => {
        await page.getByTestId("onb-caught-next").click();
        await page.getByTestId("onb-start").waitFor({ timeout: 5000 });
        await page.waitForTimeout(500);
        await page.getByTestId("onb-start").click();
        await page.waitForURL(/\/(login|map)/, { timeout: 10000 });
      },
      "導覽完可以出發！"
    )) && ok;

  writeSessionMeta(runDir, persona.id, {
    label: persona.label,
    status: ok ? "done" : "failed",
    durationMs: Date.now() - t0,
    path: persona.path,
  });
  await context.close();
  await browser.close();
  return ok;
}

async function runCaptureAndBattle(runDir, persona, base) {
  const browser = await launchPlaytestBrowser();
  const { context, page } = await newPersonaContext(browser, { nickname: persona.label });
  sessionDir(runDir, persona.id);
  const t0 = Date.now();
  let ok = true;

  ok =
    (await step(
      runDir,
      persona,
      page,
      "map.open",
      async () => {
        await page.goto(`${base}/map`, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.waitForTimeout(persona.slow ? 2000 : 1200);
      },
      "地圖開咗，睇吓邊度有精靈"
    )) && ok;

  ok =
    (await step(
      runDir,
      persona,
      page,
      "capture.open",
      async () => {
        await page.goto(`${base}/capture?species=little-orh-luak`, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        await page.waitForTimeout(2000);
        const start = page.getByText(/即時開始|開始/);
        if (await start.first().isVisible().catch(() => false)) {
          await start.first().click().catch(() => {});
          await page.waitForTimeout(1500);
        }
      },
      "入咗捕捉——希望唔會走甩"
    )) && ok;

  if (persona.path === "full-tour" || persona.path === "capture-first") {
    ok =
      (await step(
        runDir,
        persona,
        page,
        "dex.open",
        async () => {
          await page.goto(`${base}/dex`, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForTimeout(1200);
          if (!/\/dex/.test(page.url())) throw new Error("未留喺 /dex");
        },
        "圖鑑翻一翻，認下面孔"
      )) && ok;
  }

  if (persona.path !== "capture-first" || persona.id === "battler" || persona.path === "battle-first" || persona.path === "full-tour") {
    ok =
      (await step(
        runDir,
        persona,
        page,
        "battle.open",
        async () => {
          await page.goto(`${base}/battle`, { waitUntil: "domcontentloaded", timeout: 20000 });
          await page.waitForTimeout(2200);
          const tut = page.getByText("開始切磋！");
          if (await tut.isVisible().catch(() => false)) {
            await tut.click();
            await page.waitForTimeout(400);
          }
          // 影一張對戰畫面當面向／站位抽樣（人手／golden 另驗）
          await page.waitForTimeout(800);
        },
        "切磋場——對住敵位睇吓站位正唔正"
      )) && ok;
  }

  if (persona.path === "battle-first") {
    // already did battle; skip extra
  }

  writeSessionMeta(runDir, persona.id, {
    label: persona.label,
    status: ok ? "done" : "failed",
    durationMs: Date.now() - t0,
    path: persona.path,
    notes: ["facing 僅截圖抽樣；硬閘請跑 npm run facing:static / facing:golden"],
  });
  await context.close();
  await browser.close();
  return ok;
}

export async function runCoreLoop({ runDir, personas, base }) {
  const results = [];
  for (const persona of personas) {
    console.log(`[playtest] ▶ ${persona.label} (${persona.id})`);
    let ok = false;
    try {
      if (persona.path === "onboarding") ok = await runOnboarding(runDir, persona, base);
      else ok = await runCaptureAndBattle(runDir, persona, base);
    } catch (e) {
      appendFeed(runDir, {
        personaId: persona.id,
        label: persona.label,
        stepId: "session.crash",
        text: `Session 崩潰：${e?.message?.slice(0, 160)}`,
        sentiment: "negative",
      });
      writeSessionMeta(runDir, persona.id, {
        label: persona.label,
        status: "failed",
        durationMs: 0,
        path: persona.path,
      });
      ok = false;
    }
    results.push({ personaId: persona.id, ok });
    console.log(`[playtest] ${ok ? "✔" : "✗"} ${persona.id}`);
  }
  return results;
}
