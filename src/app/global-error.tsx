"use client";

// 系統一 全域錯誤邊界：root layout 層炒車時嘅保底 UI，同時自動上報去 /api/client-error。
// Next.js 要求 global-error 自行渲染 <html>/<body>，並且係 client component。

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 上報唔阻塞 UI；失敗都唔理（避免 error handler 自己再爆）
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error?.message,
        stack: error?.stack,
        digest: error?.digest,
        url: typeof window !== "undefined" ? window.location.href : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="zh-HK">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#2a1a0c",
          color: "#f4e6c8",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 44 }}>🍜</div>
        <h1 style={{ fontSize: 20, margin: 0 }}>阿嫂個鑊唔小心跌咗一跌</h1>
        <p style={{ opacity: 0.75, margin: 0, fontSize: 14 }}>
          系統遇到問題，已自動通知團隊。<br />
          Something went wrong — the team has been notified.
        </p>
        <button
          onClick={() => reset()}
          style={{
            marginTop: 8,
            padding: "10px 22px",
            borderRadius: 999,
            border: "none",
            background: "#e0a52a",
            color: "#2a1a0c",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
          }}
        >
          再試一次 / Retry
        </button>
      </body>
    </html>
  );
}
