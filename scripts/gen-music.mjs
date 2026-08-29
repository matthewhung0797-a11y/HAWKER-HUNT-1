// ElevenLabs Music API 生成遊戲配樂：6 條 90 秒 instrumental loop
//   1 條地圖主題 + 5 條戰鬥場景主題（跟五行小販中心氛圍）
// 輸出直接落 public/music/<id>.mp3（44.1kHz 128kbps，唔使再壓）
//
// 用法：node scripts/gen-music.mjs [trackId...]（唔帶參數 = 生成所有未存在嘅）
//       node scripts/gen-music.mjs --force map   （重新生成指定一條）

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].trim();
}
const KEY = env.ELEVENLABS_API_KEY;
if (!KEY) {
  console.error("搵唔到 ELEVENLABS_API_KEY（.env.local）");
  process.exit(1);
}

const OUT_DIR = "public/music";
mkdirSync(OUT_DIR, { recursive: true });

const LENGTH_MS = 90_000;

/** 6 條 track：id → prompt（英文效果最好；唔提任何歌手/樂隊名，授權乾淨） */
const TRACKS = {
  // 地圖主界面：輕鬆南洋早晨
  map: "Warm cheerful Southeast Asian street market morning, playful marimba and plucked guzheng melody, light hand percussion and shakers, gentle upright bass, relaxed adventure game overworld theme, kopitiam morning atmosphere, bright and friendly, instrumental video game background music, seamless loop",

  // 麥士威（土系武道場）：沉穩蒸氣晨光
  maxwell:
    "Calm focused oriental dojo battle theme, steady taiko drum heartbeat, warm guzheng phrases, low bamboo flute, meditative but battle-ready tension, earthy and grounded, mid tempo, instrumental video game battle music, seamless loop",

  // 牛車水（水系凍結世界）：流動神秘
  "chinatown-complex":
    "Mysterious flowing underwater arena battle theme, hang drum and soft mallets, ethereal shimmering pads, water droplet textures, cool and serene yet tense, fluid rhythm, moderate tempo, instrumental video game battle music, seamless loop",

  // 舊機場路（火系鑊氣）：高能量烈焰
  "old-airport-road":
    "High energy fiery kitchen battle theme, driving taiko and frame drums, fast rhythmic percussion, sizzling shaker textures, bold brass stabs, aggressive wok-fire cooking energy, fast tempo, exciting, instrumental video game battle music, seamless loop",

  // 竹腳（金系香料殿）：印度打擊華麗
  "tekka-centre":
    "Exotic spice market battle theme, energetic tabla and dhol percussion groove, sitar riffs, shimmering metallic bells and finger cymbals, golden luxurious atmosphere, hypnotic rhythm, mid-fast tempo, instrumental video game battle music, seamless loop",

  // 老巴剎（雨夜終極擂台）：史詩壓迫
  "lau-pa-sat":
    "Epic night market final showdown battle theme, moody hybrid orchestral electronic, erhu lead melody, deep percussion hits, rain-soaked neon tension, charcoal fire crackle energy, dramatic and intense, building intensity, instrumental video game boss battle music, seamless loop",
};

const args = process.argv.slice(2).filter((a) => a !== "--force");
const force = process.argv.includes("--force");
const ids = args.length ? args : Object.keys(TRACKS);

for (const id of ids) {
  const prompt = TRACKS[id];
  if (!prompt) {
    console.warn(`${id}: 唔喺 track 清單，跳過`);
    continue;
  }
  const out = join(OUT_DIR, `${id}.mp3`);
  if (existsSync(out) && !force) {
    console.log(`${id}: 已存在，跳過（--force 可重生）`);
    continue;
  }
  process.stdout.write(`${id}: 生成中…`);
  const t0 = Date.now();
  const res = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      music_length_ms: LENGTH_MS,
      model_id: "music_v1",
      force_instrumental: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`\n${id}: HTTP ${res.status} — ${err.slice(0, 300)}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(out, buf);
  const kb = Math.round(statSync(out).size / 1024);
  console.log(` 完成 ${kb}KB（${Math.round((Date.now() - t0) / 1000)} 秒）`);
}
console.log("全部完成");
