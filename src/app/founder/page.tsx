// 系統三 創辦人數據台：/founder
// - Server component：直接 server 端聚合（配置咗 Supabase 就實時，否則離線示範數據）。
// - 輕量閘門：設咗 OPS_SECRET 就要 ?key=<OPS_SECRET>；未設就開放（本機開發）。呢個係臨時保護，
//   正式版要接真 auth（見 SETUP-CHECKLIST §7）。
// - 零新依賴：所有圖表用 inline SVG / CSS bar 畫，唔拉重型 chart library。

import { fetchSummary, fetchLeaderboardSnapshot } from "@/lib/analytics/server";
import { opsConfig } from "@/lib/ops/config";
import { SPECIES, SPECIES_MAP } from "@/content/species";
import { FACTION_MAP } from "@/content/centres";
import { listPets, type PetRow } from "@/lib/pipeline/pets-repo";
import type { AnalyticsSummary, DayCount } from "@/lib/analytics/summary";

export const dynamic = "force-dynamic";

const GOLD = "#c9a227";
const CHILLI = "#b03a2e";
const PANDAN = "#4c8c4a";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function speciesName(id: string): string {
  return SPECIES_MAP[id]?.name?.zh ?? id;
}

/** 折線／柱狀走勢圖（inline SVG，無依賴） */
function TrendChart({ data, color, label }: { data: DayCount[]; color: string; label: string }) {
  const w = 320;
  const h = 90;
  const pad = 6;
  const max = Math.max(1, ...data.map((d) => d.count));
  const n = data.length;
  const barW = (w - pad * 2) / n;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={label}>
      {data.map((d, i) => {
        const bh = ((h - pad * 2) * d.count) / max;
        return (
          <rect
            key={d.date}
            x={pad + i * barW + barW * 0.15}
            y={h - pad - bh}
            width={barW * 0.7}
            height={bh}
            rx={2}
            fill={color}
            opacity={0.35 + 0.65 * (i / Math.max(1, n - 1))}
          />
        );
      })}
    </svg>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card-parchment flex flex-col gap-1 p-4">
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-soft/80">{label}</span>
      <span className="text-2xl font-black text-ink">{value}</span>
      {sub && <span className="text-[11px] font-bold text-ink-soft">{sub}</span>}
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  color,
  suffix,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-sm font-bold text-ink">{label}</span>
      <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-parchment-dark">
        <div
          className="h-full rounded-full"
          style={{ width: `${(value / Math.max(1, max)) * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-sm font-black text-ink-soft">
        {value.toLocaleString()}
        {suffix}
      </span>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card-parchment flex flex-col gap-3 p-4">
      <h2 className="text-sm font-black text-chilli">{title}</h2>
      {children}
    </section>
  );
}

function Gate() {
  return (
    <main className="paper-texture flex min-h-dvh flex-col overflow-hidden pb-[calc(70px_+_env(safe-area-inset-bottom))] items-center justify-center gap-3 p-8 text-center">
      <div className="card-parchment flex max-w-sm flex-col gap-3 p-8">
        <h1 className="text-xl font-black text-chilli">創辦人數據台</h1>
        <p className="text-sm font-bold text-ink-soft">
          呢頁受保護。喺網址加 <code className="rounded bg-parchment-dark px-1">?key=你的OPS_SECRET</code> 先入到。
        </p>
      </div>
    </main>
  );
}

export default async function FounderDashboard({
  searchParams,
}: {
  searchParams: Promise<{ key?: string; days?: string }>;
}) {
  const params = await searchParams;
  const secret = opsConfig.opsSecret;
  // 輕量閘：設咗 OPS_SECRET 就要對數；未設＝本機開發，開放（正式版要接真 auth）
  if (secret && params.key !== secret) return <Gate />;

  const windowDays = Math.min(90, Math.max(1, Number(params.days) || 14));
  const summary: AnalyticsSummary = await fetchSummary(windowDays);
  const lb = await fetchLeaderboardSnapshot(5);
  const pets = await listPets();
  const t = summary.totals;
  const isLive = summary.source === "live";

  // 寵物名冊 / 出寵物進度：已上線＝species.ts 入面嘅（真相），pipeline 狀態＝pets 表
  const liveSpeciesCount = SPECIES.length;
  const petStatusCounts: Record<string, number> = {};
  for (const p of pets ?? []) petStatusCounts[p.status] = (petStatusCounts[p.status] ?? 0) + 1;
  const awaiting = (pets ?? []).filter((p) => p.status === "awaiting-approval");

  const maxFunnel = Math.max(1, ...summary.funnel.map((f) => f.players));
  const maxSpecies = Math.max(1, ...summary.topSpecies.map((s) => s.count));
  const maxAr = Math.max(1, ...summary.arModeBreakdown.map((a) => a.count));
  const maxLb = Math.max(1, ...lb.rows.map((r) => r.score));

  return (
    <main className="paper-texture flex min-h-dvh flex-col overflow-hidden pb-[calc(70px_+_env(safe-area-inset-bottom))] gap-4 px-4 py-6">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between">
        <div>
          <h1 className="game-title-sm text-2xl font-black text-ink">創辦人數據台</h1>
          <p className="text-xs font-bold text-ink-soft">
            小販獵人 · 過去 {summary.windowDays} 日
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-[11px] font-black"
          style={{
            background: isLive ? PANDAN : "#a89a7c",
            color: "#fff",
          }}
        >
          {isLive ? "● 實時數據" : "○ 離線示範數據"}
        </span>
      </header>

      <div className="mx-auto grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="今日活躍" value={t.activeToday.toLocaleString()} sub="active today" />
        <Kpi label="累計玩家" value={t.players.toLocaleString()} sub="distinct players" />
        <Kpi label="捕捉總數" value={t.captures.toLocaleString()} sub={`成功率 ${pct(t.captureSuccessRate)}`} />
        <Kpi label="切磋場數" value={t.battles.toLocaleString()} sub={`勝率 ${pct(t.battleWinRate)}`} />
        <Kpi label="打卡次數" value={t.checkins.toLocaleString()} sub="check-ins" />
        <Kpi label="進化次數" value={t.evolves.toLocaleString()} sub="evolves" />
        <Kpi label="閃光捕獲" value={t.shinyCaught.toLocaleString()} sub="shiny" />
        <Kpi label="事件總數" value={t.events.toLocaleString()} sub="events" />
      </div>

      <div className="mx-auto grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        <SectionCard title="每日活躍玩家（DAU）">
          <TrendChart data={summary.dailyActive} color={GOLD} label="每日活躍玩家" />
        </SectionCard>
        <SectionCard title="每日捕捉數">
          <TrendChart data={summary.capturesByDay} color={CHILLI} label="每日捕捉數" />
        </SectionCard>

        <SectionCard title="轉化漏斗（開 App → 捕捉 → 切磋 → 進化）">
          <div className="flex flex-col gap-2">
            {summary.funnel.map((f) => (
              <BarRow key={f.stage} label={f.label} value={f.players} max={maxFunnel} color={PANDAN} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="最多人捕捉嘅精靈">
          <div className="flex flex-col gap-2">
            {summary.topSpecies.length === 0 ? (
              <p className="text-sm font-bold text-ink-soft">未有數據</p>
            ) : (
              summary.topSpecies.map((s) => (
                <BarRow
                  key={s.speciesId}
                  label={speciesName(s.speciesId)}
                  value={s.count}
                  max={maxSpecies}
                  color={GOLD}
                />
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="AR 模式分佈">
          <div className="flex flex-col gap-2">
            {summary.arModeBreakdown.length === 0 ? (
              <p className="text-sm font-bold text-ink-soft">未有數據</p>
            ) : (
              summary.arModeBreakdown.map((a) => (
                <BarRow key={a.mode} label={a.mode} value={a.count} max={maxAr} color={CHILLI} />
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title={`排行榜快照 ${lb.source === "live" ? "" : "（示範）"}`}>
          <div className="flex flex-col gap-2">
            {lb.rows.map((r, i) => (
              <BarRow
                key={`${r.nickname}-${i}`}
                label={`#${i + 1} ${r.nickname}`}
                value={r.score}
                max={maxLb}
                color={r.faction_id ? FACTION_MAP[r.faction_id]?.color ?? GOLD : GOLD}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="寵物名冊 / 出寵物進度">
          <div className="grid grid-cols-2 gap-3">
            <Kpi label="已上線精靈" value={liveSpeciesCount.toLocaleString()} sub="in species.ts" />
            <Kpi
              label="待你審批"
              value={(petStatusCounts["awaiting-approval"] ?? 0).toLocaleString()}
              sub="awaiting approval"
            />
            <Kpi label="生成中" value={(petStatusCounts["generating"] ?? 0).toLocaleString()} sub="generating" />
            <Kpi
              label="已批准/已出街"
              value={((petStatusCounts["approved"] ?? 0) + (petStatusCounts["published"] ?? 0)).toLocaleString()}
              sub="approved + published"
            />
          </div>
          {pets === null ? (
            <p className="text-[11px] font-bold text-ink-soft/70">
              出寵物管線數據未通電（未跑 pets schema 或未配置 service role）。已上線精靈數直接嚟自 species.ts，準確。
            </p>
          ) : awaiting.length > 0 ? (
            <div className="flex flex-col gap-1.5 border-t border-parchment-dark pt-2">
              <span className="text-[11px] font-black text-chilli">等緊審批：</span>
              {awaiting.slice(0, 6).map((p: PetRow) => (
                <div key={p.id} className="flex items-center justify-between text-xs font-bold text-ink">
                  <span className="truncate">{p.name?.zh ?? p.id}</span>
                  <span className="text-ink-soft">{p.series_id ?? "?"} · S{p.stage ?? "?"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] font-bold text-ink-soft/70">冇待審批寵物。</p>
          )}
        </SectionCard>
      </div>

      <p className="mx-auto w-full max-w-3xl text-center text-[11px] font-bold text-ink-soft/70">
        {isLive
          ? "數據來自 Supabase analytics_events。"
          : "未配置 Supabase — 顯示離線示範數據。填好三條 Supabase key 就會自動通電（見 SETUP-CHECKLIST §7）。"}
      </p>
    </main>
  );
}
