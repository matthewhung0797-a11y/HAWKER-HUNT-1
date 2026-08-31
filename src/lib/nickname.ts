// 玩家暱稱過濾（client-safe 純函數）。
// 策略：黑名單（髒話／粗口／敏感詞，繁簡體＋常見變體）＋格式規則（不可全數字／符號、長度）。
// 違規回具體錯誤碼，UI 層做 i18n 對應。

/** 基本黑名單（小寫比對；涵蓋中英粗口／歧視／敏感字眼常見變體） */
const BLOCKED_WORDS: string[] = [
  // 中英粗口（粵語／國語變體）
  "fuck", "fuk", "fck", "shit", "bitch", "asshole", "dick", "pussy", "cunt", "whore", "slut",
  "wtf", "stfu", "nigga", "nigger", "faggot", "retard",
  "cock", "penis", "vagina", "semen", "porn", "pornhub", "onlyfans",
  "陰道", "陰莖", "龜頭", "包皮", "睪丸", "陰毛", "精子",
  "他媽的", "她媽的", "你媽", "你娘", "媽的", "他媽", "幹你", "幹麼", "操你", "操妳", "我操",
  "混帳", "混蛋", "王八蛋", "狗娘", "賤人", "賤貨", "婊子", "臭婊",
  "雞姦", "輪姦", "強姦", "姦淫",
  "去死", "死全家", "全家死", "撚", "屌你", "屌妳", "閪", "尻", "𨳒", "𨳊", "on9",
  "戇鳩", "戇居", "傻鳩", "笨鳩", "臭鳩", "含家", "含撚", "收皮", "收爹", "仆街", "浦街",
  "廢柴", "廢物", "人渣", "渣滓", "低能", "白痴", "腦殘", "弱智", "智障", "唐氏",
  // 政治／敏感謾罵詞
  "共匪", "支那", "支那人", "蝗蟲", "蝗人",
  // 廣告／交易／不當內容
  "代儲", "儲值", "課金", "充值", "外掛", "輔助", "代練", "買號", "賣號", "收費",
  "加line", "加賴", "加微信", "加wx", "加qq",
  "裸聊", "援交", "賣淫", "嫖娼",
  // 管理仿冒（禁止冒充官方／管理員）
  "admin", "管理員", "系統", "官方", "客服", "版主", "moderator", "小編",
];

// 中文無空格、英文有：統一小寫＋去空白後子字串比對（涵蓋 "F u c k"、"ｆｕｃｋ" 等繞過手法）
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC") // 全形 ｆｕｃｋ → fuck（同時收斂裝飾體）
    .replace(/[\s\u3000\u200b\u200c\u200d\ufeff]+/g, ""); // 所有空白＋零寬字符
}

/** 暱稱規則檢查；通過回 null，違規回錯誤碼 */
export function validateNickname(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "empty";
  if (trimmed.length > 12) return "too-long";

  // 只允許：中文／英文／數字／常見符號（擋 emoji＋零寬字符等隱形攻擊）
  if (!/^[\u4e00-\u9fff\u3400-\u4dbf a-zA-Z0-9._-]+$/.test(trimmed)) return "bad-chars";

  // 不可全數字／全符號（避免純廣告帳號）
  if (/^[0-9._-]+$/.test(trimmed)) return "bad-format";

  const norm = normalize(trimmed);
  for (const w of BLOCKED_WORDS) {
    if (norm.includes(w)) return "blocked";
  }
  return null; // OK
}

/** 違規提示文字（zh/en；client 直接用，唔經 i18n 檔保持輕量） */
export function nicknameErrorText(code: string, locale: "zh" | "en"): string {
  const zh: Record<string, string> = {
    empty: "請輸入名稱",
    "too-long": "名稱不可超過 12 字",
    "bad-chars": "名稱只可使用中英文、數字與 . _ - 符號",
    "bad-format": "名稱不可為純數字或符號",
    blocked: "名稱含有不當字眼，請重新輸入",
  };
  const en: Record<string, string> = {
    empty: "Please enter a name",
    "too-long": "Name must be 12 characters or fewer",
    "bad-chars": "Only letters, numbers, Chinese and . _ - are allowed",
    "bad-format": "Name cannot be only numbers or symbols",
    blocked: "This name contains inappropriate words",
  };
  return (locale === "zh" ? zh : en)[code] ?? (locale === "zh" ? "名稱無效" : "Invalid name");
}
