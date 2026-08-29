/** 高仿真行為輔助：隨機思考／猶豫／手殘（外掛，唔入遊戲碼） */

export function rand(min, max) {
  return min + Math.random() * (max - min);
}

export function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

/** persona 思考間隔：慢玩家更長 */
export async function think(persona, mult = 1) {
  const slow = persona?.slow ? 1.6 : 1;
  const base = persona?.tapDelayMs ?? 80;
  const ms = rand(base * 2, base * 12) * slow * mult;
  await new Promise((r) => setTimeout(r, Math.min(2800, ms)));
}

/** 短猶豫（撳掣前） */
export async function hesitate(persona) {
  await new Promise((r) => setTimeout(r, rand(120, persona?.slow ? 900 : 450)));
}

/** 手殘：有機率「撳空／撳錯」 */
export function willFumble(persona) {
  const p = persona?.id === "clumsy" ? 0.35 : persona?.slow ? 0.18 : 0.08;
  return Math.random() < p;
}

export async function humanClick(page, locator, persona) {
  await hesitate(persona);
  if (willFumble(persona)) {
    // 撳錯：點 body 角落再重試
    await page.mouse.click(12, 12).catch(() => {});
    await think(persona, 0.4);
  }
  await locator.click({ timeout: 5000 }).catch(async () => {
    await locator.dispatchEvent("click").catch(() => {});
  });
}
