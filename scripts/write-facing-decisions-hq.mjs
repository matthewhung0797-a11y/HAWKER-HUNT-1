/** 寫 HQ remake 目視決策＋其餘未 lock 蓋章現有 yaw → decisions.json */
import { writeFileSync, mkdirSync } from "node:fs";
import { listGlbSpecies } from "./lib/facing-species.mjs";

const visual = {
  "rojak-tot": "-90",
  "rojak-warrior": "0",
  "rojak-king": "0",
  "carrot-cake-warrior": "0",
  "kaya-warrior": "0",
  "kopi-sock-warrior": "0",
  "chilli-crablet": "0",
  "black-white-cake-king": "0",
  "kopi-o-emperor": "-90",
  "satay-warrior": "0",
  "omelette-warrior": "-90",
  "oyster-immortal": "0",
  "kaya-dragon": "0",
};

const mapLabel = (l) => {
  if (l === "0") return "0";
  if (l === "+PI/2") return "+90";
  if (l === "-PI/2") return "-90";
  if (l === "PI" || l === "-PI") return "180";
  throw new Error("bad yawLabel " + l);
};

const unlocked = listGlbSpecies().filter((s) => !s.locked);
const decisions = unlocked.map((s) => ({
  id: s.id,
  yaw: visual[s.id] ?? mapLabel(s.yawLabel),
  source: visual[s.id] ? "visual-hq-remake" : "stamp-current",
}));

mkdirSync("test-shots/facing-cal", { recursive: true });
writeFileSync(
  "test-shots/facing-cal/decisions.json",
  JSON.stringify(decisions, null, 2) + "\n",
);
console.log("decisions", decisions.length);
console.log(
  "visual",
  decisions
    .filter((d) => d.source === "visual-hq-remake")
    .map((d) => `${d.id}:${d.yaw}`)
    .join(", "),
);
