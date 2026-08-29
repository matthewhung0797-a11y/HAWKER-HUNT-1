"use client";

// 全域掛載：client 一 mount 就啟動雲存檔同步（有 session 先做嘢，否則靜靜 no-op）。
// 同 AnalyticsInit 一樣係「唔 render 任何嘢」嘅副作用組件。

import { useEffect } from "react";
import { initCloudSave } from "@/lib/cloud-save";

export default function CloudSaveInit() {
  useEffect(() => {
    void initCloudSave();
  }, []);
  return null;
}
