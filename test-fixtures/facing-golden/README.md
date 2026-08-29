# Facing golden baselines（Gate C）

呢度係切磋面向視覺回歸嘅鎖定截圖。

## 更新

要 `:3000` 行緊：

```bash
npm run facing:golden:write          # 抽樣（CI 用）
npm run facing:golden:write:all      # 全量
```

驗證：

```bash
npm run facing:golden
```

## 規則

- 改 `modelYaw`／GLB／`rigLite`／battle 站位或鏡頭之後**必須**重產受影響 id 嘅 golden
- 改 battle 幾何要同步 `scripts/lib/facing-battle-lock.json`（`FACING_ALLOW_BATTLE_UNLOCK=1`）
- 緊急跳過：`FACING_SKIP=1`（唔好當常態）
