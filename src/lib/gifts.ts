"use client";

// 遊戲端禮包 helper：包住 server actions（自動帶目前登入 user），全部 try-catch 唔阻塞。
// 錯誤一律回代碼（invalid / not-open / expired / already / gone / need-login / failed），
// 由 UI 層做 i18n 對應。

import { getUser } from "./auth";
import { redeemGiftCode, fetchMyGifts, claimGift } from "@/lib/admin/actions";
import type { GiftContents, MyGift } from "@/lib/admin/types";

export interface GiftResult {
  ok: boolean;
  title?: string;
  contents?: GiftContents;
  error?: string;
}

/** 用目前登入 user 兌換碼 */
export async function redeemWithCurrentUser(code: string): Promise<GiftResult> {
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "need-login" };
    return await redeemGiftCode(code, user.id);
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** 我嘅待領禮包信箱（未登入回空陣列） */
export async function myGifts(): Promise<MyGift[]> {
  try {
    const user = await getUser();
    if (!user) return [];
    return await fetchMyGifts(user.id);
  } catch {
    return [];
  }
}

/** 領取信箱入面一份禮包 */
export async function claimWithCurrentUser(grantId: number): Promise<GiftResult> {
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: "need-login" };
    return await claimGift(grantId, user.id);
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** 禮包內容 → 顯示用零件（金幣/寶石/道具清單） */
export function giftContentsParts(
  contents: GiftContents
): { coins?: number; gems?: number; items: [string, number][] } {
  return {
    coins: contents.coins,
    gems: contents.gems,
    items: contents.items ? Object.entries(contents.items) : [],
  };
}
