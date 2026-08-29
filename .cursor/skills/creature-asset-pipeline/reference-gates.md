# Playability & shipping gates（通用清單）

複製去任何 app；把「路徑／指令」換成 adapter 入面嘅專案值。

## A. 內容靜態

- [ ] id：ASCII kebab-case、唔撞現有
- [ ] 顯示名：單一稱號（禁間隔號第二別名）
- [ ] 每階特殊技 ≤ `MAX_SKILLS_PER_STAGE`（治療計入）
- [ ] 技能 id 同 VFX／i18n（若有）對齊
- [ ] Typecheck／schema 驗證通過

## B. 2D

- [ ] 全身透明立繪（戰鬥／捕捉用）
- [ ] Icon／縮圖（若圖鑑／地圖需要）——**唔好只出一種**
- [ ] 去背無蝕邊；背景非漸變紋理
- [ ] Rig-friendly 企姿 + 正面臉抽樣目視

## C. 3D

- [ ] `public`（或 adapter 路徑）有真 GLB
- [ ] 武器／標誌物仍在手（對照立繪）
- [ ] `animated` / lite / static 同根骨一致（Tripo Root → 必須 strip／lite）
- [ ] 無明顯垃圾幾何（地台板／白板）
- [ ] 檔案大小符合專案預算（例：小於 500KB）

## D. Facing

- [ ] 四檔校準截圖已目視（玩家背、敵面）
- [ ] 寫入 lock（註解或 DB verified）
- [ ] 換 GLB 後已重校
- [ ] 無 `enemyYawFlip`／單邊改站位

## E. 營運閉環（若有審批）

- [ ] 審批讀寫同一真相來源（或 publish 前 hydrate）
- [ ] CI 用到嘅 script／lib **已入 git**
- [ ] Approve 後狀態：published／deployed，唔永久卡「已批准」
- [ ] Credits：生成前批准、失敗有 fallback（例：Tripo credit 盡 → Meshy）

## F. 回歸抽樣

- [ ] 戰鬥：玩家背、敵面、出手有動
- [ ] 圖鑑／捕捉：立繪唔爛圖
- [ ] 新系列唔改其他角色嘅 yaw／lock
