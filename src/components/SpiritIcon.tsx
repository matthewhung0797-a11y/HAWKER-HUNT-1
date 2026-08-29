"use client";

/* eslint-disable @next/next/no-img-element */
import { ELEMENT_INFO } from "@/content/elements";
import { SPECIES_MAP } from "@/content/species";

/** 每隻精靈嘅透明底全身立繪（640² webp）——圓框內一律 contain 顯示，唔會裁走頭頂／腳 */
export function spiritFullArtUrl(speciesId: string): string {
  return `/spirits/full/${speciesId}.webp`;
}

export default function SpiritIcon({
  speciesId,
  size = 64,
  silhouette = false,
  ring = true,
}: {
  speciesId: string;
  size?: number;
  silhouette?: boolean;
  ring?: boolean;
}) {
  const species = SPECIES_MAP[speciesId];
  const color = species ? ELEMENT_INFO[species.element].color : "#999";
  return (
    <div
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        width: size,
        height: size,
        border: ring ? `${Math.max(2, size * 0.04)}px solid ${silhouette ? "#a89a7c" : color}` : "none",
        backgroundColor: silhouette ? "#d4c8ab" : "#F2E7CF",
        boxShadow: silhouette ? "none" : `0 ${size * 0.04}px ${size * 0.12}px rgba(74,44,20,.25)`,
      }}
    >
      {/* 圖鑑精靈圖片：置中 + contain 顯示整隻 + 調亮 5 倍 */}
      <img
        src={spiritFullArtUrl(speciesId)}
        alt={silhouette ? "???" : species?.name.zh ?? speciesId}
        className="h-full w-full object-contain [-webkit-touch-callout:none]"
        style={{
          filter: silhouette
            ? "brightness(0) opacity(0.45)"
            : "none",
        }}
        draggable={false}
        loading="lazy"
        decoding="async"
      />
    </div>
  );
}
