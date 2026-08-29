"use client";

import { useEffect } from "react";
import { initAnalytics } from "@/lib/analytics/track";

/**
 * 全局埋點初始化：掛喺 layout，掛載一次就記 app_open，
 * 並喺頁面收起／離開時 flush + 記 session_end。冇 Supabase key 時內部自動 no-op。
 */
export default function AnalyticsInit() {
  useEffect(() => {
    initAnalytics();
  }, []);
  return null;
}
