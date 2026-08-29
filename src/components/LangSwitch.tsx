"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export default function LangSwitch({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("common");

  function toggle() {
    const next = locale === "zh" ? "en" : "zh";
    document.cookie = `locale=${next};path=/;max-age=${365 * 24 * 3600}`;
    router.refresh();
  }

  return (
    <button
      onClick={toggle}
      className={`btn-outline px-3 py-1.5 text-sm font-bold ${className}`}
    >
      {t("language")}
    </button>
  );
}
