"use client";

import { useTranslations } from "next-intl";
import { ELEMENT_INFO } from "@/content/elements";
import type { ElementType } from "@/content/types";
import UIIcon from "@/components/UIIcon";

export default function ElementBadge({
  element,
  showFlavor = false,
  size = "md",
}: {
  element: ElementType;
  showFlavor?: boolean;
  size?: "sm" | "md";
}) {
  const t = useTranslations();
  const info = ELEMENT_INFO[element];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold text-white ${
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs"
      }`}
      style={{ backgroundColor: info.color }}
    >
      <UIIcon name={info.icon} size={size === "sm" ? 13 : 16} />
      <span>
        {t(`elements.${element}`)}
        {showFlavor && ` / ${t(`flavors.${info.flavor}`)}`}
      </span>
    </span>
  );
}
