"use client";

// 9:16 遊戲框架（條件式）：
// - 遊戲頁面：包 .game-frame（手機填滿、寬螢幕置中 9:16 帶黑邊，框架內滾動）。
// - /admin、/founder：後台／儀表板要全寬多欄，不套框架（用自己的 min-h-dvh 佈局）。
// 用 usePathname 判斷（root layout 係 server component 攞唔到 route）。

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function GameFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isWidePage = pathname.startsWith("/admin") || pathname.startsWith("/founder");
  if (isWidePage) return <>{children}</>;
  return <div className="game-frame">{children}</div>;
}
