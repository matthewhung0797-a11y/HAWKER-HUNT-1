"use client";

// 任務管理：任務 CRUD（daily 每日重置 / once 一次性）＋ 獎勵（金幣/寶石/道具）＋ 排程。

import { useEffect, useState, useTransition } from "react";
import { listMissions, saveMission, setMissionActive, deleteMission } from "@/lib/admin/actions";
import type { GiftContents, MissionGoal, MissionPeriod, MissionRow } from "@/lib/admin/types";
import { ITEM_MAP } from "@/content/items";
import {
  Card,
  Badge,
  Btn,
  Toggle,
  Modal,
  Spinner,
  EmptyState,
  ErrorBanner,
  OkBanner,
  Field,
  inputCls,
} from "../ui";

const GOAL_LABELS: Record<MissionGoal, string> = {
  capture: "捕捉精靈（次數）",
  capture_unique: "捕捉不同精靈（種類）",
  checkin: "據點打卡（次數）",
  battle_win: "切磋獲勝（次數）",
  evolve: "精靈進化（次數）",
};

interface Form {
  id?: string;
  titleZh: string;
  titleEn: string;
  goal: MissionGoal;
  target: string;
  coins: string;
  gems: string;
  itemsJson: string;
  period: MissionPeriod;
  active: boolean;
  sort: string;
  startsAt: string;
  endsAt: string;
}

const emptyForm: Form = {
  titleZh: "",
  titleEn: "",
  goal: "capture",
  target: "3",
  coins: "100",
  gems: "1",
  itemsJson: "",
  period: "daily",
  active: true,
  sort: "0",
  startsAt: "",
  endsAt: "",
};

function isoToLocal(iso: string | null): string {
  return iso ? iso.slice(0, 16) : "";
}

function localToIso(v: string): string | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function describeReward(r: GiftContents): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`金幣 ${r.coins}`);
  if (r.gems) parts.push(`寶石 ${r.gems}`);
  if (r.items) for (const [id, qty] of Object.entries(r.items)) parts.push(`${ITEM_MAP[id]?.name?.zh ?? id}×${qty}`);
  return parts.join("・") || "（無獎勵）";
}

export default function MissionsView() {
  const [rows, setRows] = useState<MissionRow[] | null>(null);
  const [editing, setEditing] = useState<Form | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  // setState 只可以喺 promise callback 內（react-hooks/set-state-in-effect）
  useEffect(() => {
    let cancelled = false;
    listMissions().then(
      (r) => {
        if (!cancelled) setRows(r);
      },
      (e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "載入失敗");
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function openNew() {
    setErr("");
    setEditing({ ...emptyForm });
  }

  function openEdit(m: MissionRow) {
    setErr("");
    setEditing({
      id: m.id,
      titleZh: m.title.zh,
      titleEn: m.title.en,
      goal: m.goal,
      target: String(m.target),
      coins: m.reward?.coins ? String(m.reward.coins) : "",
      gems: m.reward?.gems ? String(m.reward.gems) : "",
      itemsJson: m.reward?.items && Object.keys(m.reward.items).length > 0 ? JSON.stringify(m.reward.items) : "",
      period: m.period,
      active: m.active,
      sort: String(m.sort),
      startsAt: isoToLocal(m.starts_at),
      endsAt: isoToLocal(m.ends_at),
    });
  }

  function save() {
    if (!editing) return;
    // 驗證道具 JSON
    let items: Record<string, number> | undefined;
    const raw = editing.itemsJson.trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
        items = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v !== "number" || v <= 0) throw new Error("bad value");
          items[k] = Math.floor(v);
        }
      } catch {
        setMsg("");
        setErr('道具格式錯誤：請用 {"道具id": 數量}');
        return;
      }
    }
    const reward: GiftContents = {
      coins: editing.coins ? Math.max(0, Math.floor(Number(editing.coins))) : undefined,
      gems: editing.gems ? Math.max(0, Math.floor(Number(editing.gems))) : undefined,
      items: items && Object.keys(items).length > 0 ? items : undefined,
    };
    startTransition(async () => {
      const res = await saveMission({
        id: editing.id,
        titleZh: editing.titleZh,
        titleEn: editing.titleEn,
        goal: editing.goal,
        target: Number(editing.target),
        reward,
        period: editing.period,
        active: editing.active,
        sort: Number(editing.sort) || 0,
        startsAt: localToIso(editing.startsAt),
        endsAt: localToIso(editing.endsAt),
      });
      if (res.ok) {
        setEditing(null);
        setMsg("任務已儲存（玩家重整遊戲後生效）");
        setErr("");
        const fresh = await listMissions();
        setRows(fresh);
      } else {
        setMsg("");
        setErr(res.error ?? "儲存失敗");
      }
    });
  }

  function toggle(m: MissionRow) {
    startTransition(async () => {
      await setMissionActive(m.id, !m.active);
      setRows((rs) => rs?.map((r) => (r.id === m.id ? { ...r, active: !m.active } : r)) ?? rs);
    });
  }

  function remove(m: MissionRow) {
    if (!window.confirm(`確定刪除任務「${m.title.zh}」？`)) return;
    startTransition(async () => {
      await deleteMission(m.id);
      setRows((rs) => rs?.filter((r) => r.id !== m.id) ?? rs);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-black text-slate-900">任務管理</h1>
        <Btn size="sm" onClick={openNew}>
          + 新增任務
        </Btn>
      </div>

      <OkBanner message={msg} />
      <ErrorBanner message={err} />

      <Card title={`任務列表（${rows?.length ?? 0}）`}>
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState label="未有任務（遊戲端會 fallback 內建每日任務池）" />
        ) : (
          <ul className="space-y-2">
            {rows.map((m) => (
              <li key={m.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-slate-800">{m.title.zh}</span>
                      <Badge tone={m.period === "daily" ? "blue" : "purple"}>
                        {m.period === "daily" ? "每日" : "一次性"}
                      </Badge>
                      {m.active ? <Badge tone="green">啟用</Badge> : <Badge tone="gray">停用</Badge>}
                      {m.starts_at || m.ends_at ? <Badge tone="amber">排程</Badge> : null}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {GOAL_LABELS[m.goal]} ×{m.target} → {describeReward(m.reward)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Btn variant="ghost" size="sm" onClick={() => toggle(m)}>
                      {m.active ? "停用" : "啟用"}
                    </Btn>
                    <Btn variant="ghost" size="sm" onClick={() => openEdit(m)}>
                      編輯
                    </Btn>
                    <Btn variant="ghost" size="sm" onClick={() => remove(m)}>
                      刪除
                    </Btn>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing?.id ? "編輯任務" : "新增任務"}
        wide
        footer={
          <>
            <Btn variant="subtle" onClick={() => setEditing(null)}>
              取消
            </Btn>
            <Btn disabled={pending} onClick={save}>
              儲存
            </Btn>
          </>
        }
      >
        {editing && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="標題（中文）">
                <input value={editing.titleZh} onChange={(e) => setEditing({ ...editing, titleZh: e.target.value })} className={inputCls} placeholder="捕捉 3 隻精靈" />
              </Field>
              <Field label="標題（英文）" hint="留空 = 同中文">
                <input value={editing.titleEn} onChange={(e) => setEditing({ ...editing, titleEn: e.target.value })} className={inputCls} placeholder="Catch 3 spirits" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="目標類型">
                <select value={editing.goal} onChange={(e) => setEditing({ ...editing, goal: e.target.value as MissionGoal })} className={inputCls}>
                  {(Object.keys(GOAL_LABELS) as MissionGoal[]).map((g) => (
                    <option key={g} value={g}>
                      {GOAL_LABELS[g]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="目標次數">
                <input type="number" min={1} max={999} value={editing.target} onChange={(e) => setEditing({ ...editing, target: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="獎勵：金幣">
                <input type="number" min={0} value={editing.coins} onChange={(e) => setEditing({ ...editing, coins: e.target.value })} className={inputCls} placeholder="100" />
              </Field>
              <Field label="獎勵：寶石">
                <input type="number" min={0} value={editing.gems} onChange={(e) => setEditing({ ...editing, gems: e.target.value })} className={inputCls} placeholder="1" />
              </Field>
            </div>
            <Field label='獎勵：道具（JSON，可留空）' hint='例如 {"chopsticks": 5}'>
              <textarea value={editing.itemsJson} onChange={(e) => setEditing({ ...editing, itemsJson: e.target.value })} rows={2} className={`${inputCls} font-mono text-xs`} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="週期">
                <select value={editing.period} onChange={(e) => setEditing({ ...editing, period: e.target.value as MissionPeriod })} className={inputCls}>
                  <option value="daily">每日（進度每天重置）</option>
                  <option value="once">一次性（特別任務）</option>
                </select>
              </Field>
              <Field label="排序（小→大）">
                <input type="number" min={0} max={999} value={editing.sort} onChange={(e) => setEditing({ ...editing, sort: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="開始時間（可留空）">
                <input type="datetime-local" value={editing.startsAt} onChange={(e) => setEditing({ ...editing, startsAt: e.target.value })} className={inputCls} />
              </Field>
              <Field label="結束時間（可留空）">
                <input type="datetime-local" value={editing.endsAt} onChange={(e) => setEditing({ ...editing, endsAt: e.target.value })} className={inputCls} />
              </Field>
            </div>
            <Toggle checked={editing.active} onChange={(b) => setEditing({ ...editing, active: b })} label="啟用" />
          </div>
        )}
      </Modal>
    </div>
  );
}
