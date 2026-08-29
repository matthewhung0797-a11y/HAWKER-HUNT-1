// 單獨改 pets.status（GHA merge 成功後標 published；失敗改返 approved）。
// 用法：node scripts/pipeline/set-pet-status.mjs <id> <status>

import { setPetStatus, petsDbConfigured } from "./lib/pets-db.mjs";

const [id, status] = process.argv.slice(2);
if (!id || !status) {
  console.error("usage: node scripts/pipeline/set-pet-status.mjs <id> <status>");
  process.exit(1);
}
if (!petsDbConfigured) {
  console.warn("pets DB 未配置，略過");
  process.exit(0);
}
const ok = await setPetStatus(id, status);
console.log(ok ? `✅ [${id}] status → ${status}` : `❌ [${id}] 更新失敗`);
process.exit(ok ? 0 : 1);
