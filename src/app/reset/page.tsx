"use client";

import { useEffect } from "react";

/** 開發捷徑：開 /reset 即清晒所有遊戲進度，以全新玩家身份返 Landing */
export default function ResetPage() {
  useEffect(() => {
    localStorage.removeItem("hawker-hunt-save");
    // 用 location.replace 令成個 app 連 zustand 記憶體狀態都重新初始化
    window.location.replace("/");
  }, []);

  return (
    <main className="paper-texture flex min-h-dvh items-center justify-center">
      <p className="text-sm font-bold text-ink-soft">Resetting…</p>
    </main>
  );
}
