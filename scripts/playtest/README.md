# Playtest（混合：千人湧入 + 高仿真）

外掛系統，唔改遊戲核心／facing／正式 DB。

## 兩層

| 層 | 指令 | 係咩 |
|---|---|---|
| **千人輕量** | `npm run playtest:1k` | 1000 虛擬玩家同時湧入：真 GET 頁面 + POST `/api/analytics`（唔開 Chrome） |
| **高仿真** | `npm run playtest:human` | Playwright：思考延遲、手殘、打穿導覽／捕捉／切磋（並行約 2） |
| **全部** | `npm run playtest:all` | facing + load + human |

```bash
npm run playtest:1k -- --concurrency=150
node scripts/playtest/run.mjs --suite=load --n=1000
npm run playtest:check
```

## 後台 `/admin/playtest`

- **千人蜂群**：1000 點位狀態牆
- **高仿真牆**：Chrome persona 重播
- **反饋流／總結**：規則匯總 + load／facing 指標

## 誠實邊界

- 千人 ≠ 1000 個 Chromium；係最短時間做出「同時在線」壓力
- 高仿真 = 好似真人操作；數量有限
- AR／GPS／真機分享仍要真機附錄
