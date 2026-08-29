# Hawker Hunt 🥢

LBS + AR PWA 遊戲 — 將新加坡小販中心變成美食獵場。無需下載，掃碼即玩。

## 技術棧

- **前端**: Next.js (App Router) + TypeScript + Tailwind CSS 4 + Zustand
- **3D/AR**: Three.js + react-three-fiber；AR 四層降級：8th Wall SLAM 真平面（iOS＋Android）→ 陀螺儀偽 AR → 3D 場景 → 2D
- **地圖**: MapLibre GL JS + OSM（羊皮紙復古濾鏡）
- **PWA**: Serwist（離線快取模型 + 地圖圖磚）
- **i18n**: next-intl（繁中 / English）
- **後端**: Supabase（排行榜已接入，schema 喺 `supabase/schema.sql`；Auth / Realtime / Web Push 規劃中）

## 開發

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # 生產構建（會生成 public/sw.js）
```

### 手機真機測試

1. 開 dev server 後用手機連同一 Wi-Fi，訪問 terminal 顯示嘅 Network URL（如 `http://192.168.x.x:3000`）
2. 注意：鏡頭/定位需要 HTTPS 或 localhost。真機測試建議用 `npx ngrok http 3000` 或部署到 Vercel preview
3. 喺「我」頁面開 **Dev Mode** 可以跳過 GPS 圍欄 + 模擬掃碼

## 內容數據（唯一真相來源）

- `src/content/species.ts` — 15 隻精靈（5 系列 × 3 階段）：名稱、五行五味、戰鬥數值、技能、進化條件
- `src/content/centres.ts` — 5 個據點真實 GPS、五大陣營
- `src/content/elements.ts` — 五行相剋（金→木→土→水→火→金，剋 1.5× / 被剋 0.75×）
- `src/content/items.ts` — 進化道具
- `src/i18n/messages/{zh,en}.json` — 全部界面文案

## 3D 模型管線

原始高模 → 遊戲規格（<500KB，glTF 2.0 + Draco，512 WebP 貼圖）：

```powershell
cd model-pipeline
.\convert.ps1 -InputFile raw\my-model.obj -Name laksa-warrior -Ratio 0.008
```

- 已完成：叻沙武士（186MB OBJ → 118KB .glb）
- OBJ 檔名/貼圖必須 ASCII；OBJ 冇骨骼，遊戲用程序化 idle/hit 動畫頂替，rigged .glb 到位即插即用
- 冇模型嘅精靈自動用程序化 Q 版 placeholder

## QR Code

```bash
node scripts/generate-qr.mjs   # 輸出 qr-codes/*.png（5 個據點貼紙）
```

QR 內容格式：`https://hawkerhunt.app/c/{centreId}`。Supabase 階段升級為簽名 URL + Edge Function 驗證（nonce + GPS + 每日限次）。

## 頁面

| 路由 | 功能 |
|---|---|
| `/` | Landing（標語 + 精靈展示 + 語言切換） |
| `/onboarding` | 新手引導 4 步 |
| `/login` | 登入（遊客模式可用，OAuth 留接口） |
| `/map` | 主地圖：定位、5 據點徽章三態、資訊卡、50m 圍欄、導航 |
| `/checkin` | QR 掃碼打卡（每日 3 次 + GPS 驗證 + 成功動畫） |
| `/capture` | AR 捕捉：鏡頭 + 3D 精靈 + 筷子夾擊力度計 |
| `/dex` `/dex/[id]` | 圖鑑（篩選/剪影）+ 詳情（3D 360°、進化鏈、技能） |
| `/evolve/[uid]` | 全屏進化動畫（金色漩渦） |
| `/leaderboard` | 陣營/個人/好友排行（mock，待 Supabase Realtime） |
| `/profile` | 個人資料、統計、道具、徽章、Dev Mode、重設 |

## Roadmap

- [x] Phase 0-2: 內容聖經 + PWA 地基 + 核心遊戲循環（本地 mock 數據）
- [ ] Phase 3: Supabase（Auth 匿名→OAuth、雲端存檔、QR 防作弊 Edge Function、Realtime 排行、Web Push）
- [ ] Phase 4: 五行對戰（PvE 回合制，照概念圖場景）
- [ ] P1+: 好友、AR 合照、陣營戰結算、Android WebXR 貼地模式、Hawker Hub/Heart
