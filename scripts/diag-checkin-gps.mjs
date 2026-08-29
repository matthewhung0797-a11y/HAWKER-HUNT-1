// GPS hard gate：屋企遠距拒打卡；據點附近先成功；拒定位當失敗
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolveDiagBase, logDiagBase } from "./lib/diag-base.mjs";

const info = await resolveDiagBase({ startHint: true });
logDiagBase(info);
const BASE = info.base;
mkdirSync("test-shots", { recursive: true });

/** Maxwell Food Centre */
const NEAR = { lat: 1.28027, lng: 103.84449 };
/** Jurong-ish — several km from Maxwell */
const FAR = { lat: 1.3329, lng: 103.7436 };

async function withGeo(mode) {
  const browser = await chromium.launch({
    args: [
      "--enable-unsafe-swiftshader",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "zh-TW",
    deviceScaleFactor: 2,
    permissions: ["camera"],
  });

  await context.addInitScript(
    ({ mode, near, far }) => {
      localStorage.setItem(
        "hawker-hunt-save",
        JSON.stringify({
          state: {
            loggedIn: true,
            onboardingDone: true,
            nickname: "GpsProbe",
            // 唔開 devMode：Simulate 會 skip GPS；呢度要測真閘
            devMode: false,
          },
          version: 0,
        })
      );

      const pos = (lat, lng) => ({
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy: 8,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      });

      navigator.geolocation.getCurrentPosition = (success, error) => {
        if (mode === "deny") {
          error?.({ code: 1, message: "denied", PERMISSION_DENIED: 1 });
          return;
        }
        if (mode === "far") {
          success?.(pos(far.lat, far.lng));
          return;
        }
        success?.(pos(near.lat, near.lng));
      };
    },
    { mode, near: NEAR, far: FAR }
  );

  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message.slice(0, 160)));

  await page.goto(`${BASE}/checkin?centre=maxwell`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  for (let i = 0; i < 25; i++) {
    const ok = await page.evaluate(() => typeof window.__checkinScan === "function");
    if (ok) break;
    await page.waitForTimeout(150);
  }

  await page.evaluate(() => window.__checkinScan("maxwell"));
  await page.waitForTimeout(900);

  const text = await page.locator("main").innerText();
  await page.screenshot({ path: `test-shots/checkin-gps-${mode}.png` });
  await browser.close();
  return text;
}

const farText = await withGeo("far");
const nearText = await withGeo("near");
const denyText = await withGeo("deny");

const farOk = /距離據點|約 \d+m|within \d+m|200/.test(farText) && !/打卡成功|Checked in/i.test(farText);
const nearOk = /打卡成功|Checked in/i.test(nearText);
const denyOk = /定位|Location|設定|Settings/.test(denyText) && !/打卡成功|Checked in/i.test(denyText);

console.log(
  JSON.stringify(
    {
      farOk,
      nearOk,
      denyOk,
      farSnippet: farText.replace(/\s+/g, " ").slice(0, 120),
      nearSnippet: nearText.replace(/\s+/g, " ").slice(0, 120),
      denySnippet: denyText.replace(/\s+/g, " ").slice(0, 120),
      pass: farOk && nearOk && denyOk,
    },
    null,
    2
  )
);

process.exit(farOk && nearOk && denyOk ? 0 : 1);
