import { chromium } from "playwright";

export async function launchPlaytestBrowser() {
  const browser = await chromium.launch({
    args: [
      "--enable-unsafe-swiftshader",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  return browser;
}

export async function newPersonaContext(browser, { nickname = "PT" } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-TW",
    deviceScaleFactor: 2,
    permissions: ["camera"],
    hasTouch: true,
  });
  await context.addInitScript((nick) => {
    // 只喺空檔先寫，避免洗走導覽中途 state
    if (!localStorage.getItem("hawker-hunt-save")) {
      localStorage.setItem(
        "hawker-hunt-save",
        JSON.stringify({
          state: {
            loggedIn: true,
            onboardingDone: true,
            nickname: nick,
            level: 5,
            exp: 0,
            coins: 200,
            gems: 10,
            ownedSpirits: [
              {
                uid: "pt-1",
                speciesId: "little-orh-luak",
                level: 5,
                caughtAt: Date.now(),
                centreId: "maxwell",
              },
            ],
            captureCounts: { "little-orh-luak": 1 },
            items: {},
            checkins: [],
            unlockedSilhouettes: [],
            favouriteCentres: [],
          },
          version: 0,
        })
      );
    }
  }, nickname);
  const page = await context.newPage();
  page.on("pageerror", (e) => {
    page.__playtestLastError = e.message?.slice(0, 200);
  });
  return { context, page };
}

export async function newFreshContext(browser) {
  const context = await browser.newContext({
    viewport: { width: 414, height: 896 },
    locale: "zh-TW",
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();
  return { context, page };
}
