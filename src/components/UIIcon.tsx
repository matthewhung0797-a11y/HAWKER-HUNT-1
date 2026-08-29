/* eslint-disable @next/next/no-img-element */

/** 自家手繪風 UI icon（public/ui/*.webp，scripts/cutout-icons.mjs 產生） */
export default function UIIcon({
  name,
  size = 20,
  className = "",
  dimmed = false,
}: {
  name: string;
  size?: number;
  className?: string;
  /** 未啟用態：保留顏色、輕微降飽和＋半透明 */
  dimmed?: boolean;
}) {
  return (
    <img
      src={`/ui/${name}.webp`}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={`inline-block select-none [-webkit-touch-callout:none] ${className}`}
      style={dimmed ? { filter: "saturate(0.75) opacity(0.7)" } : undefined}
    />
  );
}
