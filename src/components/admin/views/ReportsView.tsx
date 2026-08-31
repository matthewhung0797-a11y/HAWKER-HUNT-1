"use client";

// 數據報表：留存 cohort、DAU/WAU/MAU、事件分佈、熱門精靈、排行榜快照。

import { useEffect, useState } from "react";
import { fetchAdminSummary, fetchRetention, fetchLeaderboardForAdmin } from "@/lib/admin/actions";
import type { AnalyticsSummary } from "@/lib/analytics/summary";
import type { RetentionReport } from "@/lib/admin/types";
import { SPECIES_MAP } from "@/content/species";
import { Card, Kpi, Badge, Spinner, ErrorBanner, EmptyState, tableWrapCls, tableCls, thCls, tdCls } from "../ui";

const RANGES = [7, 14, 30] as const;

function pct(n: number | null): string {
  return n === null ? "—" : `${Math.round(n * 100)}%`;
}

export default function ReportsView() {
  const [range, setRange] = useState<number>(14);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [retention, setRetention] = useState<RetentionReport | null>(null);
  const [board, setBoard] = useState<{ nickname: string; faction_id: string | null; score: number }[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // setState 只可以喺 promise callback 內（react-hooks/set-state-in-effect）
    let cancelled = false;
    Promise.all([fetchAdminSummary(range), fetchRetention(30), fetchLeaderboardForAdmin(10)]).then(
      ([s, r, b]) => {
        if (cancelled) return;
        setSummary(s);
        setRetention(r);
        setBoard(b.rows);
        setError("");
        setLoading(false);
      },
      (e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "載入失敗");
          setLoading(false);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [range]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-black text-slate-900">數據報表</h1>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => {
                setLoading(true);
                setRange(r);
              }}
              className={`rounded-md px-3 py-1 text-xs font-bold ${
                range === r ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {r} 日
            </button>
          ))}
        </div>
      </div>

      <ErrorBanner message={error} />
      {loading && !summary ? <Spinner /> : null}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="DAU" value={retention?.dau ?? summary.totals.activeToday} sub="今日活躍" />
            <Kpi label="WAU" value={retention?.wau ?? "—"} sub="近 7 日活躍" />
            <Kpi label="MAU" value={retention?.mau ?? "—"} sub="近 30 日活躍" />
            <Kpi label="打卡次數" value={summary.totals.checkins} sub={`近 ${range} 日`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title="留存率（Cohort）"
              actions={<Badge tone="amber">以視窗內首次活躍為基準</Badge>}
            >
              {!retention || retention.cohorts.length === 0 ? (
                <EmptyState label="未有足夠數據計算留存" />
              ) : (
                <div className={tableWrapCls}>
                  <table className={tableCls}>
                    <thead>
                      <tr>
                        <th className={thCls}>首訪日</th>
                        <th className={thCls}>人數</th>
                        <th className={thCls}>D1</th>
                        <th className={thCls}>D3</th>
                        <th className={thCls}>D7</th>
                        <th className={thCls}>D14</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retention.cohorts.map((c) => (
                        <tr key={c.firstDay}>
                          <td className={tdCls}>{c.firstDay}</td>
                          <td className={tdCls}>{c.size}</td>
                          <td className={tdCls}>{pct(c.d1)}</td>
                          <td className={tdCls}>{pct(c.d3)}</td>
                          <td className={tdCls}>{pct(c.d7)}</td>
                          <td className={tdCls}>{pct(c.d14)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title={`事件分佈（近 ${range} 日）`}>
              {!retention || retention.eventTotals.length === 0 ? (
                <EmptyState label="未有事件" />
              ) : (
                <ul className="space-y-2">
                  {retention.eventTotals.map((e) => {
                    const max = retention.eventTotals[0].count || 1;
                    return (
                      <li key={e.event}>
                        <div className="mb-0.5 flex justify-between text-xs">
                          <span className="font-bold text-slate-700">{e.event}</span>
                          <span className="text-slate-500">{e.count.toLocaleString()}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-sky-600"
                            style={{ width: `${(e.count / max) * 100}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={`熱門精靈（近 ${range} 日）`}>
              {summary.topSpecies.length === 0 ? (
                <EmptyState label="未有捕捉記錄" />
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

            <Card
              title="排行榜快照 TOP 10"
              actions={<Badge tone={board.length > 0 ? "green" : "gray"}>{board.length > 0 ? "live" : "demo"}</Badge>}
            >
              {board.length === 0 ? (
                <EmptyState label="未有排行榜資料" />
              ) : (
                <div className={tableWrapCls}>
                  <table className={tableCls}>
                    <thead>
                      <tr>
                        <th className={thCls}>#</th>
                        <th className={thCls}>玩家</th>
                        <th className={thCls}>陣營</th>
                        <th className={thCls}>分數</th>
                      </tr>
                    </thead>
                    <tbody>
                      {board.map((r, i) => (
                        <tr key={i}>
                          <td className={tdCls}>{i + 1}</td>
                          <td className={tdCls}>{r.nickname}</td>
                          <td className={tdCls}>{r.faction_id ?? "—"}</td>
                          <td className={tdCls}>{r.score.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <Card title="AR 模式分佈">
            {summary.arModeBreakdown.length === 0 ? (
              <EmptyState label="未有數據" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {summary.arModeBreakdown.map((m) => (
                  <Badge key={m.mode} tone="blue">
                    {m.mode}：{m.count}
                  </Badge>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
