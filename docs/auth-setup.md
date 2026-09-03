# 登入功能設定指南（Google / Facebook / Email）

> 遊戲已在線上：https://hawker-hunt-app.vercel.app
> Supabase Project URL：https://mbaimyaqgppkxjcwzfza.supabase.co
> 三個按鈕的程式碼已全部接好 — 以下係「平台設定」步驟，做晒先會真正生效。

## ① Supabase：Auth URL Configuration（必做，5 分鐘）

Supabase Dashboard → **Authentication → URL Configuration**

| 欄位 | 填入 |
|---|---|
| Site URL | `https://hawker-hunt-app.vercel.app` |
| Redirect URLs | `https://hawker-hunt-app.vercel.app/**` |
| Redirect URLs（可加，舊網址保留） | `https://hawker-hunt-seven.vercel.app/**` |
| Redirect URLs（可加） | `https://mbaimyaqgppkxjcwzfza.supabase.co/auth/v1/callback` |

冇呢步，Google/Facebook 登入後會彈「redirect not allowed」。

## ② Email 登入（最快生效）

Supabase → **Authentication → Providers → Email** → 確認 Enabled（預設已開）。

- 流程：玩家輸入 email → 收 magic-link 信 → 點連結 → 自動登入返 /map。
- 免費版用 Supabase 內建 SMTP（每小時 2-4 封限制）。正式營運想放寬：
  Settings → Auth 加自訂 SMTP（Gmail App Password / Resend / Brevo）。

## ③ Google 登入（約 10 分鐘）

**A. Google Cloud Console**（console.cloud.google.com）：
1. 建立專案（或用現有）→ APIs & Services → **OAuth consent screen**：
   - User Type 揀 External → 填 App name「Hawker Hunt」+ 支援 email → 儲存
2. **Credentials → Create Credentials → OAuth client ID**：
   - Application type：Web application
   - **Authorized redirect URIs**（一字不差）：
     `https://mbaimyaqgppkxjcwzfza.supabase.co/auth/v1/callback`
   - 建立後複製 **Client ID** 同 **Client Secret**

**B. Supabase** → Authentication → Providers → **Google**：
1. Enabled 打勾
2. 貼上 Client ID + Client Secret → Save

## ④ Facebook 登入（約 15 分鐘）

**A. Meta for Developers**（developers.facebook.com）：
1. My Apps → **Create App** → 類型揀 Consumer → 填 App name「Hawker Hunt」
2. 加產品：**Facebook Login** → Settings：
   - **Valid OAuth Redirect URIs**（一字不差）：
     `https://mbaimyaqgppkxjcwzfza.supabase.co/auth/v1/callback`
3. Settings → Basic：複製 **App ID** + **App Secret**
   - App Domain 可填 `hawker-hunt-seven.vercel.app`
4. App Mode 保持 Development 都可以用（自己＋測試員）；正式公開先轉 Live
   （Live 需要 Privacy Policy URL，可以之後先搞）

**B. Supabase** → Authentication → Providers → **Facebook**：
1. Enabled 打勾
2. 貼上 Facebook App ID + App Secret → Save

## ⑤ 匿名登入（訪客模式用）

Supabase → Authentication → Providers → **Anonymous** → Enabled 打勾。
（訪客模式 = 匿名帳號，之後撳 Google/Facebook 會用 linkIdentity 保留進度升級。）

## ⑥ 驗收清單

1. 手機開 https://hawker-hunt-app.vercel.app/login
2. 「使用 Google 登入」→ Google 選帳號頁 → 返 /map → 個人頁帳號區顯示你 email＋已綁定
3. 「使用 Facebook 登入」→ Facebook 授權頁 → 返 /map
4. 「使用電郵註冊/登入」→ 輸入 email → 收信點連結 → 已綁定
5. 「訪客模式」→ 可以玩；之後喺「我」頁帳號區可以升級綁定（進度保留）
6. 換機／清 cache 後登入同一帳號 → 進度由雲存檔拉返

## 技術實作摘要（程式端，已完成）

- `src/lib/auth.ts`：`upgradeWithGoogle` / `upgradeWithFacebook` / `upgradeWithEmail`
  （匿名 user → linkIdentity 保留 user_id；新 user → signInWithOAuth / signInWithOtp）
- `src/app/login/page.tsx`：三個按鈕各自接對應函數；redirect 返 `/map` 後
  `detectSessionInUrl` 自動收 session，`CloudSaveInit` 自動 merge 雲存檔
- ⚠️ Facebook 按鈕之前錯接 guestLogin — 已修正為真正的 Facebook OAuth
