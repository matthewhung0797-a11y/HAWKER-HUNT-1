"use client";

import { useEffect } from "react";
import { useGameStore } from "@/lib/store";

type Eruda = typeof import("eruda").default;
let erudaMod: Eruda | null = null;
let erudaOn = false;

/**
 * 真機除錯 console（eruda）：
 * - devMode 開 → 加載；devMode 閂 → 即場 destroy（以前要 refresh 先甩，個齒輪陰魂不散）
 * - URL 帶 ?debug=1 → 唔理 devMode 都強開（俾測試者一條 link 就睇到 error）
 */
export default function DevConsole() {
  const devMode = useGameStore((s) => s.devMode);

  useEffect(() => {
    const urlDebug = new URLSearchParams(window.location.search).get("debug") === "1";
    const want = devMode || urlDebug;

    if (want && !erudaOn) {
      erudaOn = true;
      import("eruda").then((m) => {
        erudaMod = m.default;
        // async 載入期間可能已經俾人閂咗
        if (erudaOn) erudaMod.init();
      });
    } else if (!want && erudaOn) {
      erudaOn = false;
      erudaMod?.destroy();
    }
  }, [devMode]);

  return null;
}
