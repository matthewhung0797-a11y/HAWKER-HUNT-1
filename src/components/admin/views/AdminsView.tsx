"use client";

// 系統管理：管理員名冊（新增/啟停/重設密碼）+ 操作審計日誌。

import { useEffect, useState, useTransition } from "react";
import {
  listAdmins,
  addAdmin,
  setAdminActive,
  resetAdminPassword,
  listAudit,
} from "@/lib/admin/actions";
import { ROLE_LABELS, type AdminRole, type AdminUserRow, type AuditRow } from "@/lib/admin/types";
import {
  Card,
  Badge,
  Btn,
  Modal,
  Spinner,
  EmptyState,
  ErrorBanner,
  OkBanner,
  Field,
  inputCls,
  Pager,
  tableWrapCls,
  tableCls,
  thCls,
  tdCls,
} from "../ui";

const AUDIT_PAGE_SIZE = 30;

function fmtDate(iso: string): string {
  return iso ? iso.slice(0, 19).replace("T", " ") : "—";
}

export default function AdminsView() {
  // 管理員名冊
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>("analyst");
  const [resetting, setResetting] = useState<AdminUserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  /** 新增／啟停後 bump 重新拉名冊 */
  const [adminsTick, setAdminsTick] = useState(0);

  // 審計日誌（input / submitted 分開，避免逐鍵觸發查詢）
  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(0);
  const [auditEmailInput, setAuditEmailInput] = useState("");
  const [auditActionInput, setAuditActionInput] = useState("");
  const [auditEmail, setAuditEmail] = useState("");
  const [auditAction, setAuditAction] = useState("");

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [pending, startTransition] = useTransition();

  // setState 只可以喺 promise callback 內（react-hooks/set-state-in-effect）
  useEffect(() => {
    let cancelled = false;
    listAdmins().then(
      (r) => {
        if (!cancelled) {
          setRows(r);
          setLoading(false);
        }
      },
      () => {
        if (!cancelled) setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [adminsTick]);

  useEffect(() => {
    let cancelled = false;
    listAudit({ page: auditPage, adminEmail: auditEmail, action: auditAction }).then(
      (res) => {
        if (!cancelled) {
          setAuditRows(res.rows);
          setAuditTotal(res.total);
        }
      },
      () => {
        /* 審計載入失敗唔阻塞名冊 */
      }
    );
    return () => {
      cancelled = true;
    };
  }, [auditPage, auditEmail, auditAction]);

  function doAdd() {
    startTransition(async () => {
      const res = await addAdmin(newEmail, newRole);
      if (res.ok) {
        setAdding(false);
        setNewEmail("");
        setMsg("管理員已新增（對方需用同一 email 開通 Supabase Auth 帳號後登入）");
        setErr("");
        setAdminsTick((t) => t + 1);
      } else {
        setMsg("");
        setErr(res.error ?? "新增失敗");
      }
    });
  }

  function doToggle(row: AdminUserRow) {
    startTransition(async () => {
      const res = await setAdminActive(row.id, row.email, !row.active);
      if (res.ok) {
        setMsg("");
        setErr("");
        setAdminsTick((t) => t + 1);
      } else {
        setMsg("");
        setErr(res.error ?? "操作失敗");
      }
    });
  }

  function doReset() {
    if (!resetting) return;
    startTransition(async () => {
      const res = await resetAdminPassword(resetting.user_id ?? "", newPassword);
      if (res.ok) {
        setResetting(null);
        setNewPassword("");
        setMsg("密碼已重設");
        setErr("");
      } else {
        setMsg("");
        setErr(res.error ?? "重設失敗");
      }
    });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black text-slate-900">系統管理</h1>

      <OkBanner message={msg} />
      <ErrorBanner message={err} />

      <Card
        title="管理員名冊"
        actions={
          <Btn size="sm" onClick={() => setAdding(true)}>
            + 新增管理員
          </Btn>
        }
      >
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState label="沒有管理員（請先在 Supabase 執行 admin-system.sql 並插入 super admin）" />
        ) : (
          <div className={tableWrapCls}>
            <table className={tableCls}>
              <thead>
                <tr>
                  <th className={thCls}>Email</th>
                  <th className={thCls}>角色</th>
                  <th className={thCls}>Auth 配對</th>
                  <th className={thCls}>狀態</th>
                  <th className={thCls}>建立時間</th>
                  <th className={thCls} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className={`${tdCls} font-bold`}>{r.email}</td>
                    <td className={tdCls}>
                      <Badge tone={r.role === "super" ? "purple" : "blue"}>{ROLE_LABELS[r.role] ?? r.role}</Badge>
                    </td>
                    <td className={tdCls}>{r.user_id ? <Badge tone="green">已配對</Badge> : <Badge tone="amber">未登入</Badge>}</td>
                    <td className={tdCls}>{r.active ? <Badge tone="green">啟用</Badge> : <Badge tone="red">停用</Badge>}</td>
                    <td className={`${tdCls} text-xs text-slate-500`}>{fmtDate(r.created_at)}</td>
                    <td className={tdCls}>
                      <div className="flex gap-1">
                        <Btn variant="ghost" size="sm" disabled={!r.user_id} onClick={() => setResetting(r)}>
                          重設密碼
                        </Btn>
                        <Btn variant="ghost" size="sm" onClick={() => doToggle(r)}>
                          {r.active ? "停用" : "啟用"}
                        </Btn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="操作審計日誌">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAuditPage(0);
            setAuditEmail(auditEmailInput);
            setAuditAction(auditActionInput);
          }}
          className="mb-3 flex flex-wrap items-end gap-2"
        >
          <div className="w-48">
            <Field label="管理員 email">
              <input value={auditEmailInput} onChange={(e) => setAuditEmailInput(e.target.value)} className={inputCls} placeholder="模糊比對" />
            </Field>
          </div>
          <div className="w-44">
            <Field label="動作">
              <input value={auditActionInput} onChange={(e) => setAuditActionInput(e.target.value)} className={inputCls} placeholder="admin.login / gift.grant …" />
            </Field>
          </div>
          <Btn type="submit">篩選</Btn>
        </form>

        {auditRows.length === 0 ? (
          <EmptyState label="沒有符合的日誌" />
        ) : (
          <>
            <div className={tableWrapCls}>
              <table className={tableCls}>
                <thead>
                  <tr>
                    <th className={thCls}>時間</th>
                    <th className={thCls}>管理員</th>
                    <th className={thCls}>動作</th>
                    <th className={thCls}>對象</th>
                    <th className={thCls}>詳情</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className={`${tdCls} whitespace-nowrap text-xs text-slate-500`}>{fmtDate(r.ts)}</td>
                      <td className={tdCls}>{r.admin_email}</td>
                      <td className={tdCls}>
                        <Badge tone="blue">{r.action}</Badge>
                      </td>
                      <td className={`${tdCls} max-w-32 truncate text-xs`}>{r.target ?? "—"}</td>
                      <td className={`${tdCls} max-w-52 truncate font-mono text-[11px] text-slate-500`}>
                        {r.detail && Object.keys(r.detail).length > 0 ? JSON.stringify(r.detail) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={auditPage} total={auditTotal} pageSize={AUDIT_PAGE_SIZE} onPage={setAuditPage} />
          </>
        )}
      </Card>

      {/* 新增管理員 */}
      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="新增管理員"
        footer={
          <>
            <Btn variant="subtle" onClick={() => setAdding(false)}>
              取消
            </Btn>
            <Btn disabled={pending || !newEmail.trim()} onClick={doAdd}>
              新增
            </Btn>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Email" hint="對方需用同一個 email 在 Supabase Auth 開帳號（Dashboard → Authentication → Users → Add user），首次登入後台自動配對">
            <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className={inputCls} placeholder="new-admin@example.com" />
          </Field>
          <Field label="角色">
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as AdminRole)} className={inputCls}>
              {(Object.keys(ROLE_LABELS) as AdminRole[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>
          <div className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            <b>super</b>：全部權限｜<b>ops</b>：營運設定＋發禮包｜<b>support</b>：玩家管理＋封禁＋發禮包｜
            <b>content</b>：只讀｜<b>analyst</b>：只讀（全部 mutation 拒絕）
          </div>
        </div>
      </Modal>

      {/* 重設密碼 */}
      <Modal
        open={resetting !== null}
        onClose={() => setResetting(null)}
        title={`重設密碼：${resetting?.email ?? ""}`}
        footer={
          <>
            <Btn variant="subtle" onClick={() => setResetting(null)}>
              取消
            </Btn>
            <Btn variant="danger" disabled={pending || newPassword.length < 6} onClick={doReset}>
              確認重設
            </Btn>
          </>
        }
      >
        <Field label="新密碼（至少 6 個字元）">
          <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={inputCls} placeholder="新密碼" />
        </Field>
      </Modal>
    </div>
  );
}
