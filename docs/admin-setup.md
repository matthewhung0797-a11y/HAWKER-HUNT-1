# 後台管理系統（/admin）部署指南

> 後台功能：玩家資料查詢／封禁、營運設定（維護模式＝上下架、版本強制更新、全服公告、禮包發放＋兌換碼）、數據報表（DAU／留存／事件）、管理員權限（5 角色）＋操作審計。
> 不使用 Telegram（用戶指示）——審計只入 `admin_audit_log`、顯示只喺後台 UI。

## 架構速覽

- **單一 catch-all 路由**：`src/app/admin/[[...section]]/page.tsx`（總覽 `/admin`、`/admin/players`、`/admin/ops`、`/admin/reports`、`/admin/admins`）——只佔 1 個 serverless function（Vercel Hobby 上限 12）。
- **所有讀寫走 Server Actions**：`src/lib/admin/actions.ts`（不佔額外 function）。
- **認證**：Supabase Auth email＋密碼驗證 → 自簽 HMAC-SHA256 httpOnly cookie（`hh_admin`，12 小時）。角色內嵌 cookie，每次 action 經 `requireCap()` 二次驗證。
- **遊戲端**：`BootstrapGate`（維護畫面／強制更新／公告）＋ 個人頁 `GiftBox`（兌換兌換碼＋禮包信箱）。
- **埋點修復**：`/api/analytics` route 恢復（之前被刪，事件全滅失）；`ops/config.ts` 由 stub 恢復真實讀 env。

## 部署步驟（一次過）

### 1. Supabase：跑 migration

Dashboard → **SQL Editor** → 貼上 `supabase/admin-system.sql` 整個檔案 → **Run**。
（idempotent，可重複跑；新增 7 張表：admin_users、admin_audit_log、player_flags、announcements、gift_packs、gift_grants、app_config）

### 2. Supabase：開第一個管理員帳號

1. **Authentication → Users → Add user**：填自己的 email＋密碼（Auto-confirm 打勾）。
2. **SQL Editor** 再跑一句：

```sql
insert into public.admin_users (email, role, active)
values ('你的email@example.com', 'super', true);
```

### 3. Vercel：確認環境變數

Project → Settings → Environment Variables 需已有（遊戲本來就在用）：

| 變數 | 用途 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 遊戲端 client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 遊戲端 client |
| `SUPABASE_SERVICE_ROLE_KEY` | **後台關鍵**（server 端繞 RLS 讀寫） |
| `ADMIN_SESSION_SECRET`（可選） | 後台 cookie 簽名密鑰；未設自動由 service key 衍生 |

### 4. 部署

```powershell
npx vercel whoami    # 過期就 npx vercel login（開瀏覽器確認）
npx vercel --prod --yes
```

本機 build 若因 Google Fonts 抓取失敗（已知網絡問題），直接雲端部署即可。

### 5. 部署後驗收清單

1. 開 `https://hawker-hunt-seven.vercel.app/admin` → 登入（email＋步驟 2 的密碼）→ 進總覽。
2. 總覽應顯示「即時數據」徽章（若顯示「示範數據」＝ `SUPABASE_SERVICE_ROLE_KEY` 未設）。
3. **系統管理 → 操作審計**：應有 `admin.login` 記錄。
4. **營運設定**：
   - 開維護模式 → 手機開遊戲 → 應見維護畫面 → 關閉後恢復。
   - 新增公告（popup）→ 遊戲端彈窗一次（localStorage 記已讀）。
   - 新增禮包（記得填兌換碼，如 `WELCOME2026`）→ 遊戲個人頁輸入 → 獲得內容物；重複兌換應被拒。
   - 「發放 → 全服」→ 所有有雲存檔的玩家個人頁信箱出現禮包。
5. **玩家管理**：搜尋暱稱 → 詳情 → 封禁 → 列表顯示「已封禁」。
6. **數據報表**：切 7/14/30 日，留存 cohort 表正常（需要玩家實際遊玩數天才有意義）。

## 角色權限對照

| 角色 | 總覽 | 玩家 | 營運 | 報表 | 系統管理 |
|---|---|---|---|---|---|
| super 超級管理員 | ✅ | 讀＋封禁＋發禮包 | ✅ | ✅ | ✅ |
| ops 營運 | ✅ | 讀＋發禮包 | ✅ | ✅ | ❌ |
| support 客服 | ✅ | 讀＋封禁＋發禮包 | ❌ | ✅ | ❌ |
| content 內容 | ✅ | ❌ | ❌ | ✅ | ❌ |
| analyst 分析 | ✅ | 只讀 | ❌ | ✅ | ❌ |

新增管理員：**系統管理 → 新增管理員**（只填 email＋角色）→ 對方用同一 email 在 Supabase Auth 開帳（Authentication → Users → Add user）→ 首次登入 `/admin` 自動配對 user_id。

## 已知限制（MVP）

- 封禁目前**只記錄＋顯示**，未強制攔截玩家登入（下一步可改現有表 RLS）。
- 禮包入帳走 local-first 信任 client（與現行雲存檔架構一致）；伺服器權威化屬未來階段。
- 留存以 `player_key`（裝置）計算；cohort 以「視窗內首次活躍」為基準（近似值）。
- 儲值／訂單／營收報表略過（遊戲未有金流）；日後加 `orders` 表＋IAP webhook 即可擴充。
