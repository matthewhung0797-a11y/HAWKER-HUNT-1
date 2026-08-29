import type { GameItem } from "./types";

export const ITEMS: GameItem[] = [
  {
    id: "chopsticks",
    name: { en: "Chopsticks", zh: "筷子" },
    description: {
      en: "Needed to clamp a spirit. Check in at a hawker for more.",
      zh: "夾精靈要用。去小販中心打卡可以補充。",
    },
    icon: "chopsticks",
  },
  {
    id: "chicken-oil-essence",
    name: { en: "Chicken Oil Essence", zh: "雞油精華" },
    description: { en: "Fragrant essence from poached chicken.", zh: "白斬雞提煉嘅香濃精華。" },
    icon: "item-chicken",
  },
  {
    id: "shrimp-shell-shard",
    name: { en: "Shrimp Shell Shard", zh: "蝦殼碎片" },
    description: { en: "Crunchy shard packed with umami.", zh: "充滿鮮味嘅蝦殼碎片。" },
    icon: "item-shrimp",
  },
  {
    id: "colour-layer",
    name: { en: "Colour Layer", zh: "顏色層" },
    description: { en: "A single rainbow layer of kueh lapis.", zh: "九層糕嘅一層彩虹。" },
    icon: "item-rainbow",
  },
  {
    id: "condensed-milk-can",
    name: { en: "Condensed Milk Can", zh: "煉奶罐" },
    description: { en: "Sweetness in a tin.", zh: "罐裝嘅甜蜜。" },
    icon: "item-can",
  },
  {
    id: "kaya-drop",
    name: { en: "Kaya Drop", zh: "咖椰醬滴" },
    description: { en: "A drop of silky coconut jam.", zh: "一滴幼滑椰香咖椰醬。" },
    icon: "item-coconut",
  },
  {
    id: "spice-essence",
    name: { en: "Spice Essence", zh: "香料精華" },
    description: { en: "Concentrated herbal spice blend.", zh: "濃縮藥膳香料。" },
    icon: "item-garlic",
  },
  {
    id: "hainan-secret-recipe",
    name: { en: "Hainan Secret Recipe", zh: "海南祖傳秘方" },
    description: { en: "The legendary family recipe.", zh: "傳說中嘅祖傳秘方。" },
    icon: "item-scroll",
  },
  {
    id: "laksa-soul",
    name: { en: "Laksa Soul", zh: "叻沙之魂" },
    description: { en: "The fiery spirit of laksa broth.", zh: "叻沙湯底嘅辛辣靈魂。" },
    icon: "fire",
  },

  // ── 第一波擴充材料（icon 暫借現有 ui webp，正式圖示後補）──
  {
    id: "crab-claw-shard",
    name: { en: "Crab Claw Shard", zh: "蟹鉗碎片" },
    description: { en: "A chunk of armour-grade crab claw.", zh: "堅硬如甲嘅蟹鉗碎塊。" },
    icon: "item-shrimp",
  },
  {
    id: "chilli-gravy-jar",
    name: { en: "Chilli Gravy Jar", zh: "秘製辣醬罐" },
    description: { en: "A jar of the legendary sweet-spicy gravy.", zh: "一罐傳說級甜辣蟹醬。" },
    icon: "item-can",
  },
  {
    id: "bamboo-skewer",
    name: { en: "Bamboo Skewer", zh: "竹籤" },
    description: { en: "Sharpened bamboo, smoky from the grill.", zh: "帶住炭香嘅尖竹籤。" },
    icon: "chopsticks",
  },
  {
    id: "charcoal-ember",
    name: { en: "Charcoal Ember", zh: "炭火餘燼" },
    description: { en: "An ember that never quite dies.", zh: "永遠唔會熄透嘅炭火餘燼。" },
    icon: "fire",
  },
  {
    id: "roasted-bean",
    name: { en: "Roasted Kopi Bean", zh: "深焙咖啡豆" },
    description: { en: "Butter-roasted till nearly black.", zh: "牛油焙到接近全黑嘅咖啡豆。" },
    icon: "gem",
  },
  {
    id: "heirloom-kopi-sock",
    name: { en: "Heirloom Kopi Sock", zh: "祖傳咖啡袋" },
    description: { en: "Three generations of pulls in one cloth.", zh: "沖過三代人嘅老咖啡布袋。" },
    icon: "item-scroll",
  },
  {
    id: "white-radish",
    name: { en: "White Radish", zh: "白蘿蔔" },
    description: { en: "Sweet, juicy, ready for the steamer.", zh: "清甜多汁，等緊落蒸籠。" },
    icon: "item-garlic",
  },
  {
    id: "dark-sweet-sauce",
    name: { en: "Dark Sweet Sauce", zh: "黑甜醬" },
    description: { en: "The soul of 'black' carrot cake.", zh: "黑色菜頭粿嘅靈魂醬汁。" },
    icon: "item-can",
  },
  {
    id: "haeko-paste",
    name: { en: "Haeko Paste", zh: "黑蝦膏" },
    description: { en: "Thick black prawn paste that binds all flavours.", zh: "撈得起百味嘅濃黑蝦膏。" },
    icon: "item-can",
  },
  {
    id: "crushed-peanut",
    name: { en: "Crushed Peanut", zh: "花生碎" },
    description: { en: "A golden sprinkle for the final toss.", zh: "最後一撈必備嘅金黃花生碎。" },
    icon: "coin",
  },
  {
    id: "plump-oyster",
    name: { en: "Plump Oyster", zh: "肥美鮮蠔" },
    description: { en: "Juicy and briny, straight from the wok.", zh: "啱啱落鑊、飽滿多汁嘅蠔仔。" },
    icon: "item-shrimp",
  },
  {
    id: "lard-crisp",
    name: { en: "Lard Crisp", zh: "豬油渣" },
    description: { en: "Crunchy gold that makes everything better.", zh: "乜嘢加咗都好食嘅香脆金粒。" },
    icon: "coin",
  },
  {
    id: "wok-hei-spark",
    name: { en: "Wok Hei Spark", zh: "鑊氣火花" },
    description: { en: "A captured spark of the wok's breath.", zh: "封存喺罐入面嘅一縷鑊氣。" },
    icon: "fire",
  },
  {
    id: "golden-crust-flake",
    name: { en: "Golden Crust Flake", zh: "金酥皮碎" },
    description: { en: "A shard of perfectly baked spiral crust.", zh: "焗到完美嘅螺旋酥皮碎片。" },
    icon: "star",
  },
  {
    id: "stretchy-dough",
    name: { en: "Stretchy Dough", zh: "拉麵團" },
    description: { en: "Stretches thinner the more you flip it.", zh: "越拋越薄嘅彈性麵團。" },
    icon: "item-coconut",
  },
  {
    id: "ghee-jar",
    name: { en: "Ghee Jar", zh: "酥油罐" },
    description: { en: "Fragrant clarified butter, liquid gold.", zh: "香氣四溢嘅液體黃金酥油。" },
    icon: "item-can",
  },
  {
    id: "pandan-jelly",
    name: { en: "Pandan Jelly", zh: "斑蘭綠蕊" },
    description: { en: "Springy green worms of pandan starch.", zh: "彈牙嘅斑蘭綠色粉條。" },
    icon: "elem-wood",
  },
  {
    id: "shaved-ice-crystal",
    name: { en: "Shaved Ice Crystal", zh: "刨冰結晶" },
    description: { en: "A crystal that never melts in the heat.", zh: "大熱天時都唔會溶嘅冰晶。" },
    icon: "gem",
  },
  {
    id: "nasi-lemak-squad-essence",
    name: { en: "Nasi Lemak Essence", zh: "椰漿飯精華" },
    description: { en: "Concentrated essence of Nasi Lemak, fuel for evolution.", zh: "濃縮嘅椰漿飯精華，進化嘅燃料。" },
    icon: "star",
  },
  {
    id: "otak-otak-clan-essence",
    name: { en: "Otak-Otak Essence", zh: "烏達精華" },
    description: { en: "Concentrated essence of Otak-Otak, fuel for evolution.", zh: "濃縮嘅烏達精華，進化嘅燃料。" },
    icon: "star",
  },
  {
    id: "chwee-kueh-hamster-essence",
    name: { en: "Chwee Kueh Essence", zh: "水粿精華" },
    description: { en: "Concentrated essence of Chwee Kueh, fuel for evolution.", zh: "濃縮嘅水粿精華，進化嘅燃料。" },
    icon: "star",
  },
  {
    id: "ice-kachang-christmas-dragon-essence",
    name: { en: "Ice Kachang Essence", zh: "紅豆冰精華" },
    description: { en: "Concentrated essence of Ice Kachang, fuel for evolution.", zh: "濃縮嘅紅豆冰精華，進化嘅燃料。" },
    icon: "star",
  },
  {
    id: "wanton-mee-essence",
    name: { en: "Wanton Mee Essence", zh: "雲吞麵精華" },
    description: { en: "Concentrated essence of Wanton Mee, fuel for evolution.", zh: "濃縮嘅雲吞麵精華，進化嘅燃料。" },
    icon: "star",
  },
];

export const ITEM_MAP: Record<string, GameItem> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
