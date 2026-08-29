"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CENTRE_MAP } from "@/content/centres";
import { useGameStore } from "@/lib/store";

/**
 * 實體 QR 貼紙嘅落地頁：https://<domain>/c/<centreId>
 * 途人用相機掃貼紙會嚟到呢度——
 * - 已登入玩家：直入打卡掃描器（帶埋據點 ID，掃返同一張貼紙即完成打卡）
 * - 新玩家：行返正常入場流程（landing → onboarding／login）
 * - 無效據點 ID（例如測試據點已落架）：返首頁
 */
export default function CentreQrLanding({ params }: { params: Promise<{ centreId: string }> }) {
  const { centreId } = use(params);
  const router = useRouter();
  const { loggedIn } = useGameStore();

  useEffect(() => {
    if (!CENTRE_MAP[centreId]) {
      router.replace("/");
      return;
    }
    router.replace(loggedIn ? `/checkin?centre=${centreId}` : "/");
  }, [centreId, loggedIn, router]);

  return (
    <main className="paper-texture flex min-h-dvh items-center justify-center">
      <div className="text-lg font-bold text-ink/60">…</div>
    </main>
  );
}
