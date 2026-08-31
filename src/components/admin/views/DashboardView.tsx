"use client";

// 後台總覽：KPI + DAU 走勢 + 每日捕捉 + 漏斗 + 熱門精靈；60 秒自動刷新。

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { fetchAdminSummary, fetchRetention } from "@/lib/admin/actions";
import type { AnalyticsSummary } from "@/lib/analytics/summary";
import type { RetentionReport } from "@/lib/admin/types";
import { SPECIES_MAP } from "@/content/species";
import { Card, Kpi, Badge, Spinner, ErrorBanner } from "../ui";

const REFRESH_MS = 60_000;

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function shortDate(d: string): string {
  return d.slice(5); // MM-DD
}

/** 加權平均留存率（只計已到期 cohort） */
function weightedRetention(
  cohorts: RetentionReport["cohorts"],
  key: "d1" | "d7"
): number | null {
  let sum = 0;
  let size = 0;
  for (const c of cohorts) {
    const v = c[key];
    if (v === null) continue;
    sum += v * c.size;
    size += c.size;
  }
  return size > 0 ? sum / size : null;
}

export default function DashboardView() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [retention, setRetention] = useState<RetentionReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // setState 只可以喺 promise callback 內（react-hooks/set-state-in-effect）
    let cancelled = false;
    const tick = () =>
      Promise.all([fetchAdminSummary(14), fetchRetention(30)]).then(
        ([s, r]) => {
          if (cancelled) return;
          setSummary(s);
          setRetention(r);
          setError("");
        },
        (e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "載入失敗");
        }
      );
    tick();
    const t = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!summary) {
    return (
      <>
        <ErrorBanner message={error} />
        <Spinner />
      </>
    );
  }

  const d1 = retention ? weightedRetention(retention.cohorts, "d1") : null;
  const d7 = retention ? weightedRetention(retention.cohorts, "d7") : null;
  const maxFunnel = Math.max(1, ...summary.funnel.map((f) => f.players));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-black text-slate-900">總覽</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={summary.source === "live" ? "green" : "amber"}>
            {summary.source === "live" ? "即時數據" : "示範數據（Supabase 未通電）"}
          </Badge>
          <span className="hidden text-[11px] text-slate-400 sm:inline">每 60 秒自動刷新</span>
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="今日活躍" value={summary.totals.activeToday} sub="DAU" />
        <Kpi label="玩家總數" value={summary.totals.players} sub="近 14 日" />
        <Kpi label="捕捉成功" value={summary.totals.captures} sub={`${pct(summary.totals.captureSuccessRate)} 成功率`} />
        <Kpi label="切磋場次" value={summary.totals.battles} sub={`${pct(summary.totals.battleWinRate)} 勝率`} />
        <Kpi label="D1 留存" value={d1 === null ? "—" : pct(d1)} sub="加權（近30日）" tone={d1 !== null && d1 < 0.2 ? "bad" : "default"} />
        <Kpi label="D7 留存" value={d7 === null ? "—" : pct(d7)} sub="加權（近30日）" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="每日活躍玩家（DAU）">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={summary.dailyActive} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelFormatter={(l) => String(l)}
                />
                <Line type="monotone" dataKey="count" name="活躍玩家" stroke="#0f172a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="每日捕捉成功數">
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.capturesByDay} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" name="捕捉" fill="#b03a2e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="玩家漏斗（近 14 日不重複玩家）">
          <div className="space-y-3">
            {summary.funnel.map((f) => (
              <div key={f.stage}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-bold text-slate-700">{f.label}</span>
                  <span className="text-slate-500">{f.players} 人</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-800"
                    style={{ width: `${(f.players / maxFunnel) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="熱門精靈 TOP 6">
          {summary.topSpecies.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">未有捕捉記錄</div>
          ) : (
            <ul className="space-y-2">
              {summary.topSpecies.map((s, i) => (
                <li key={s.speciesId} className="flex items-center gap-2 text-sm">
                  <span className="w-4 text-right text-xs font-black text-slate-400">{i + 1}</span>
                  <span className="flex-1 truncate text-slate-700">
                    {SPECIES_MAP[s.speciesId]?.name?.zh ?? s.speciesId}
                  </span>
                  <Badge tone="red">{s.count}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
