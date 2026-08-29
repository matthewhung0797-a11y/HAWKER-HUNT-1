"use client";

import { useMemo } from "react";

const COLORS = ["#e8c860", "#d84a2f", "#4e9a51", "#3d7fc1", "#fff2d8", "#d8a12f"];

/** 全屏彩帶紙碎（捕捉成功／打卡獎勵慶祝用），mount 一次落一輪 */
export default function Confetti({ count = 28 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 0.8,
        dur: 2.4 + Math.random() * 1.6,
        rot: Math.random() * 360,
      })),
    [count]
  );
  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
          }}
        />
      ))}
    </div>
  );
}
