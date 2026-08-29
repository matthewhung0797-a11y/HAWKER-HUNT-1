"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 圖鑑格：保留 640 full 視覺，但離屏唔掛 img／重 DOM——
 * 精靈愈多愈重要；rootMargin 預載上下一屏。
 */
export default function DexGridCell({
  children,
  className,
  /** 占位高度約等於一格 card（icon 64 + padding + 兩行字） */
  minHeight = 148,
}: {
  children: ReactNode;
  className?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 已支援 content-visibility 嘅瀏覽器仍用 IO：控制「點先 mount 重圖」
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setActive(true);
          io.disconnect();
        }
      },
      { root: null, rootMargin: "240px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        minHeight,
        contentVisibility: "auto",
        containIntrinsicSize: `auto ${minHeight}px`,
      }}
    >
      {active ? (
        children
      ) : (
        <div
          className="card-parchment flex flex-col items-center gap-1.5 p-3"
          aria-hidden
          style={{ minHeight }}
        >
          <div className="h-16 w-16 animate-pulse rounded-full bg-parchment-dark/70" />
          <div className="mt-1 h-3 w-14 rounded bg-parchment-dark/50" />
        </div>
      )}
    </div>
  );
}
