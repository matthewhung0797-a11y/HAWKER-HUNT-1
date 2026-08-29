"use client";

import { useEffect } from "react";
import { sfxTap } from "@/lib/sfx";

/**
 * 全局按鈕遊戲感回饋（配合 globals.css 嘅按壓縮放）：
 * - pointerdown：圓潤 pop 聲＋微震＋撳落點爆出金色粒子圈（press burst）
 * - pointerup：彈簧回彈動畫（過衝返彈，唔係死板彈返原位）
 * - 元素（或祖先）有 data-no-press-sfx 就完全退出（自己管回饋嘅掣，例如狂撳掣）
 */

const BURST_COLORS = ["#e8c860", "#fff0b8", "#d8a12f", "#f5a623", "#fff6d0"];
const MAX_BURSTS = 8;
let activeBursts = 0;

/** 撳落點金色粒子爆花：擴散圈＋6 粒飛散光點 */
function spawnBurst(x: number, y: number) {
  if (activeBursts >= MAX_BURSTS) return;
  activeBursts++;
  const host = document.createElement("div");
  host.className = "press-burst";
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;

  const ring = document.createElement("span");
  ring.className = "press-burst-ring";
  host.appendChild(ring);

  for (let i = 0; i < 6; i++) {
    const p = document.createElement("span");
    p.className = "press-burst-dot";
    const ang = (i / 6) * Math.PI * 2 + Math.random() * 0.9;
    const dist = 24 + Math.random() * 20;
    p.style.setProperty("--dx", `${Math.cos(ang) * dist}px`);
    p.style.setProperty("--dy", `${Math.sin(ang) * dist}px`);
    const size = 4 + Math.random() * 5;
    p.style.width = p.style.height = `${size}px`;
    p.style.background = BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)];
    host.appendChild(p);
  }

  document.body.appendChild(host);
  setTimeout(() => {
    host.remove();
    activeBursts--;
  }, 560);
}

function findPressable(target: Element | null): HTMLElement | null {
  const el = target?.closest?.('button, a, [role="button"]') as HTMLElement | null;
  if (!el) return null;
  if (el.closest("[data-no-press-sfx]")) return null;
  if ((el as HTMLButtonElement).disabled) return null;
  return el;
}

export default function GlobalPressFx() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = findPressable(e.target as Element | null);
      if (!el) return;
      // 撳落一刻取消上一次嘅回彈動畫，等 :active 縮細即時生效
      el.classList.remove("btn-bounce");
      sfxTap();
      spawnBurst(e.clientX, e.clientY);
    };
    const onUp = (e: PointerEvent) => {
      const el = findPressable(e.target as Element | null);
      if (!el) return;
      // 彈簧回彈：由縮細狀態過衝彈返
      void el.offsetWidth; // 重觸發動畫
      el.classList.add("btn-bounce");
      setTimeout(() => el.classList.remove("btn-bounce"), 420);
    };
    // 長按按鈕/連結會彈系統選單（iOS 連結預覽、Android context menu）——遊戲要按實
    // 好易誤觸，一律封。/admin 係桌面後台，保留右鍵選單方便用。
    const onContextMenu = (e: MouseEvent) => {
      if (location.pathname.startsWith("/admin")) return;
      const el = (e.target as Element | null)?.closest?.('a, button, [role="button"]');
      if (el) e.preventDefault();
    };
    window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    window.addEventListener("pointerup", onUp, { capture: true, passive: true });
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);
  return null;
}
