"use client";

// 個人頁「禮包」區：兌換碼輸入 + 待領信箱。
// 領取／兌換成功 → store.applyGift 入帳（自動觸發雲存檔 debounce push）。

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useGameStore } from "@/lib/store";
import { myGifts, redeemWithCurrentUser, claimWithCurrentUser, giftContentsParts } from "@/lib/gifts";
import { ITEM_MAP } from "@/content/items";
import { sfxTap } from "@/lib/sfx";
import type { GiftContents, MyGift } from "@/lib/admin/types";
import UIIcon from "./UIIcon";

export default function GiftBox() {
  const t = useTranslations();
  const locale = useLocale() as "zh" | "en";
  const applyGift = useGameStore((s) => s.applyGift);

  const [code, setCode] = useState("");
  const [gifts, setGifts] = useState<MyGift[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void myGifts().then(setGifts);
  }, []);

  /** 內容物 → 雙語顯示字串 */
  function describe(c: GiftContents): string {
    const { coins, gems, items } = giftContentsParts(c);
    const parts: string[] = [];
    if (coins) parts.push(`${locale === "zh" ? "金幣" : "Coins"} ×${coins}`);
    if (gems) parts.push(`${locale === "zh" ? "寶石" : "Gems"} ×${gems}`);
    for (const [id, qty] of items) {
      parts.push(`${ITEM_MAP[id]?.name?.[locale] ?? id} ×${qty}`);
    }
    return parts.join(" · ");
  }

  function errorText(code: string | undefined): string {
    switch (code) {
      case "need-login":
        return t("gifts.needLogin");
      case "invalid":
        return t("gifts.invalid");
      case "not-open":
        return t("gifts.notOpen");
      case "expired":
        return t("gifts.expired");
      case "already":
      case "gone":
        return t("gifts.already");
      default:
        return t("gifts.failed");
    }
  }

  function redeem() {
    if (!code.trim() || pending) return;
    startTransition(async () => {
      sfxTap();
      const res = await redeemWithCurrentUser(code);
      if (res.ok && res.contents) {
        applyGift(res.contents);
        setErr("");
        setMsg(`${t("gifts.redeemed", { title: res.title ?? "" })} — ${describe(res.contents)}`);
        setCode("");
      } else {
        setMsg("");
        setErr(errorText(res.error));
      }
    });
  }

  function claim(g: MyGift) {
    if (pending) return;
    startTransition(async () => {
      sfxTap();
      const res = await claimWithCurrentUser(g.id);
      if (res.ok && res.contents) {
        applyGift(res.contents);
        setGifts((gs) => gs.filter((x) => x.id !== g.id));
        setErr("");
        setMsg(`${t("gifts.claimed", { title: res.title ?? "" })} — ${describe(res.contents)}`);
      } else {
        setMsg("");
        setErr(errorText(res.error));
        void myGifts().then(setGifts); // 可能已被領走，重拉一次
      }
    });
  }

  return (
    <section className="mx-4 mt-4">
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-black text-ink">
        <UIIcon name="sparkles" size={18} /> {t("gifts.title")}
        {gifts.length > 0 && (
          <span className="ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-chilli px-1 text-[10px] font-black text-white">
            {gifts.length}
          </span>
        )}
      </h2>

      <div className="card-parchment flex flex-col gap-3 p-4">
        {msg && <p className="text-xs font-bold text-pandan">{msg}</p>}
        {err && <p className="text-xs font-bold text-chilli">{err}</p>}

        {/* 兌換碼 */}
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t("gifts.placeholder")}
            maxLength={32}
            className="min-w-0 flex-1 rounded-xl border-2 border-ink/15 bg-parchment-dark/40 px-3 py-2 text-sm font-bold tracking-wider text-ink outline-none placeholder:text-ink-soft/50 focus:border-gold"
          />
          <button
            onClick={redeem}
            disabled={!code.trim() || pending}
            className="btn-gold shrink-0 px-4 py-2 text-sm font-black disabled:opacity-50"
          >
            {t("gifts.redeemBtn")}
          </button>
        </div>

        {/* 待領信箱 */}
        <div>
          <div className="mb-1.5 text-[11px] font-bold text-ink-soft">{t("gifts.inbox")}</div>
          {gifts.length === 0 ? (
            <p className="text-xs text-ink-soft/70">—</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {gifts.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 rounded-xl bg-parchment-dark/40 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">🎁 {g.title}</span>
                  <button
                    onClick={() => claim(g)}
                    disabled={pending}
                    className="shrink-0 rounded-full bg-gold px-3 py-1 text-xs font-black text-ink disabled:opacity-50"
                  >
                    {t("gifts.claim")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
