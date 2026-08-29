// 層2：高仿真 Chrome——思考延遲、手殘、打穿捕捉／切磋（並行有限，唔係 1000）
import {
  appendEvent,
  appendFeed,
  saveShot,
  writeSessionMeta,
  sessionDir,
} from "../lib/run-io.mjs";
import { launchPlaytestBrowser, newPersonaContext, newFreshContext } from "../lib/browser.mjs";
import { think, hesitate, humanClick, willFumble, randInt } from "../lib/human.mjs";

async function step(runDir, persona, page, stepId, fn, feedText, sentiment = "neutral") {
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
        sentiment,
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
      text: `（真人感）${persona.label}：${stepId} 搞唔掂——${reason}`,
      sentiment: "negative",
      shot,
    });
    return false;
  }
}

async function humanOnboarding(runDir, persona, base) {
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
      "human.onb.open",
      async () => {
        await page.goto(`${base}/onboarding`, { waitUntil: "domcontentloaded", timeout: 20000 });
        await page.getByTestId("onb-hello").waitFor({ timeout: 12000 });
        await think(persona, 1.2);
      },
      "慢慢睇開場…好似遊戲導覽"
    )) && ok;

  ok =
    (await step(
      runDir,
      persona,
      page,
      "human.onb.dialogue",
      async () => {
        for (let i = 0; i < 16; i++) {
          if (await page.getByTestId("onb-ring").count()) break;
          await hesitate(persona);
          await page.getByTestId("onb-hello").click();
          await think(persona, 0.35);
        }
        if (!(await page.getByTestId("onb-ring").count())) throw new Error("對白未完／無縮圈");
      },
      willFumble(persona) ? "對白有啲長，我差啲撳快咗" : "對白跟得上"
    )) && ok;

  ok =
    (await step(
      runDir,
      persona,
      page,
      "human.onb.aim",
      async () => {
        await think(persona);
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
        await page.getByTestId("onb-aim-good").waitFor({ timeout: 6000 });
      },
      "等金圈貼住先撳——要集中"
    )) && ok;

  ok =
    (await step(
      runDir,
      persona,
      page,
      "human.onb.mash",
      async () => {
        await page.getByTestId("onb-mash-tap").waitFor({ timeout: 5000 });
        const taps = persona.slow ? 90 : 55;
        for (let i = 0; i < taps; i++) {
          if (await page.getByTestId("onb-caught").count()) break;
          if (willFumble(persona) && i % 7 === 0) {
            await page.mouse.click(20, 20).catch(() => {});
            await think(persona, 0.3);
          }
          await page.getByTestId("onb-mash-tap").dispatchEvent("click").catch(() => {});
          await new Promise((r) => setTimeout(r, persona.tapDelayMs + randInt(0, 40)));
        }
        await page.getByTestId("onb-caught").waitFor({ timeout: 8000 });
      },
      persona.slow ? "狂撳好攰，險啲搓唔切" : "搓得到！",
      persona.slow ? "negative" : "positive"
    )) && ok;

  ok =
    (await step(
      runDir,
      persona,
      page,
      "human.onb.finish",
      async () => {
        await think(persona, 0.5);
        await humanClick(page, page.getByTestId("onb-caught-next"), persona);
        await page.getByTestId("onb-start").waitFor({ timeout: 5000 });
        await think(persona, 0.6);
        await humanClick(page, page.getByTestId("onb-start"), persona);
        await page.waitForURL(/\/(login|map)/, { timeout: 10000 });
      },
      "導覽完，想去地圖玩"
    )) && ok;

  writeSessionMeta(runDir, persona.id, {
    label: persona.label,
    status: ok ? "done" : "failed",
    durationMs: Date.now() - t0,
    path: "human-onboarding",
    fidelity: "high",
  });
  await context.close();
  await browser.close();
  return ok;
}

async function humanPlayLoop(runDir, persona, base) {
  const browser = await launchPlaytestBrowser();
  const { context, page } = await newPersonaContext(browser, { nickname: persona.label });
  sessionDir(runDir, persona.id);
  const t0 = Date.now();
  let ok = true;
  const species = "little-orh-luak";

  ok =
    (await step(
      runDir,
      persona,
      page,
      "human.map",
      async () => {
        await page.goto(`${base}/map`, { waitUntil: "domcontentloaded", timeout: 20000 });
        await think(persona, 1.1);
      },
      "喺地圖周圍睇吓有咩精靈"
    )) && ok;

  ok =
    (await step(
      runDir,
      persona,
      page,
      "human.capture",
      async () => {
        await page.goto(`${base}/capture?species=${species}`, {
          waitUntil: "domcontentloaded",
          timeout: 20000,
        });
        await think(persona);
        const start = page.getByText(/即時開始|開始玩|開始/);
        if (await start.first().isVisible().catch(() => false)) {
          await humanClick(page, start.first(), persona);
          await think(persona, 0.8);
        }
        // 搏鬥：嘗試狂撳／按住區（有就撳）
        for (let i = 0; i < (persona.slow ? 40 : 25); i++) {
          const mash = page.locator("[data-mash], [data-struggle], main").first();
          await page.mouse.click(195, 420).catch(() => {});
          await new Promise((r) => setTimeout(r, persona.tapDelayMs + randInt(10, 60)));
          void mash;
        }
        await think(persona, 0.5);
      },
      "入捕捉搏鬥——好似真係喺度夾"
    )) && ok;

  if (persona.path === "full-tour" || persona.id === "completionist") {
    ok =
      (await step(
        runDir,
        persona,
        page,
        "human.dex",
        async () => {
          await page.goto(`${base}/dex`, { waitUntil: "domcontentloaded", timeout: 15000 });
          await think(persona, 0.9);
        },
        "圖鑑認下面孔"
      )) && ok;
  }

  ok =
    (await step(
      runDir,
      persona,
      page,
      "human.battle",
      async () => {
        await page.goto(`${base}/battle`, { waitUntil: "domcontentloaded", timeout: 20000 });
        await think(persona, 1.2);
        const tut = page.getByText("開始切磋！");
        if (await tut.isVisible().catch(() => false)) {
          await humanClick(page, tut, persona);
          await think(persona, 0.5);
        }
        const basic = page.locator("[data-basic-attack]");
        for (let i = 0; i < (persona.id === "battler" ? 6 : 3); i++) {
          if (await basic.count()) {
            await hesitate(persona);
            await basic.first().click({ timeout: 2000 }).catch(() => {});
            await think(persona, 0.7);
          }
        }
      },
      "切磋場打咗幾下——對住敵位核對面向",
      "neutral"
    )) && ok;

  writeSessionMeta(runDir, persona.id, {
    label: persona.label,
    status: ok ? "done" : "failed",
    durationMs: Date.now() - t0,
    path: "human-play",
    fidelity: "high",
  });
  await context.close();
  await browser.close();
  return ok;
}

/** 高仿真並行上限（唔好開 1000 Chrome） */
export async function runHumanLoop({ runDir, personas, base, concurrency = 2 }) {
  const queue = [...personas];
  const results = [];

  async function worker() {
    while (queue.length) {
      const persona = queue.shift();
      if (!persona) break;
      console.log(`[playtest:human] ▶ ${persona.label}`);
      let ok = false;
      try {
        if (persona.path === "onboarding") ok = await humanOnboarding(runDir, persona, base);
        else ok = await humanPlayLoop(runDir, persona, base);
      } catch (e) {
        appendFeed(runDir, {
          personaId: persona.id,
          label: persona.label,
          stepId: "human.crash",
          text: `Session 崩潰：${e?.message?.slice(0, 140)}`,
          sentiment: "negative",
        });
        writeSessionMeta(runDir, persona.id, {
          label: persona.label,
          status: "failed",
          fidelity: "high",
        });
      }
      results.push({ personaId: persona.id, ok });
      console.log(`[playtest:human] ${ok ? "✔" : "✗"} ${persona.id}`);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, personas.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
