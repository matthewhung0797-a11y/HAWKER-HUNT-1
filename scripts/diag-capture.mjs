import { chromium } from "playwright";

const browser = await chromium.launch({
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ["camera"],
  locale: "zh-TW",
});
await context.addInitScript(() => {
  localStorage.setItem(
    "hawker-hunt-save",
    JSON.stringify({ state: { loggedIn: true, onboardingDone: true, nickname: "T" }, version: 0 })
  );
});
const page = await context.newPage();
page.on("console", (m) => console.log(`[${m.type()}]`, m.text().slice(0, 200)));
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));
page.on("response", (r) => {
  if (r.url().includes("/spirits/")) console.log("[net]", r.status(), r.url().slice(-50));
});
page.on("requestfailed", (r) => console.log("[reqfail]", r.url().slice(-60), r.failure()?.errorText));

await page.goto("http://localhost:3000/capture?species=little-laksa", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const info = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll("canvas")].map((c) => ({
    w: c.width,
    h: c.height,
    cw: c.clientWidth,
    ch: c.clientHeight,
    parent: c.parentElement?.className?.slice(0, 60),
    visible: !!c.offsetParent || getComputedStyle(c).position === "fixed",
    zIndex: getComputedStyle(c.parentElement ?? c).zIndex,
  }));
  return { canvases, videos: document.querySelectorAll("video").length };
});
console.log(JSON.stringify(info, null, 2));

// 撳開始掣入 aiming
await page.click("text=即時開始玩").catch((e) => console.log("click fail", e.message));
await page.waitForTimeout(2500);

const info2 = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll("canvas")].map((c) => {
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    return {
      w: c.width,
      h: c.height,
      lost: gl ? gl.isContextLost() : "no-gl-handle",
    };
  });
  const imgs = [...document.querySelectorAll("img")].map((i) => ({
    src: i.src.slice(-40),
    ok: i.naturalWidth > 0,
    rect: `${Math.round(i.getBoundingClientRect().x)},${Math.round(i.getBoundingClientRect().y)} ${Math.round(i.getBoundingClientRect().width)}x${Math.round(i.getBoundingClientRect().height)}`,
  }));
  const video = document.querySelector("video");
  return {
    canvases,
    imgs,
    videoState: video ? { readyState: video.readyState, paused: video.paused, w: video.videoWidth } : null,
  };
});
console.log("after aiming:", JSON.stringify(info2, null, 2));

await page.screenshot({ path: "test-shots/diag-capture.png" });
await browser.close();
