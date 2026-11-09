// Turns a spoken sentence into records: 「午餐牛肉麵150，飲料60」, 「昨天計程車兩百五刷卡」, 「收到兼職三千」.
// Pure functions shared by the app and the voice edge function (copied to supabase/functions/_shared/voice.ts).

export type VoiceItem = { dir: "out" | "in"; amount: number; item: string; category: string; payMethod: string; payDetail: string; daysAgo: number };

const CN: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNIT: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 萬: 10000, 万: 10000 };

/** 一百五十 → 150, 兩百五 → 250, 三千二 → 3200, 一萬二 → 12000, 十五 → 15. */
export function cnNumber(s: string): number {
  let total = 0, section = 0, digit = -1, lastUnit = 1;
  for (const ch of s) {
    if (ch in CN) { digit = CN[ch]; continue; }
    const u = UNIT[ch];
    if (!u) return NaN;
    if (u === 10000) { section += digit >= 0 ? digit : 0; total += (section || 1) * 10000; section = 0; digit = -1; lastUnit = 10000; continue; }
    section += (digit >= 0 ? digit : 1) * u;
    digit = -1; lastUnit = u;
  }
  // A trailing bare digit means "one unit lower": 兩百五 = 250, 三千二 = 3200, 一萬二 = 12000.
  if (digit >= 0) section += lastUnit >= 10 ? digit * (lastUnit / 10) : digit;
  return total + section;
}

const NUM_RE = /(\d[\d,]*(?:\.\d+)?|[零〇一二兩两三四五六七八九十百千萬万]+)\s*(?:元|塊錢|塊|圓|NT|台幣)?/g;

const CAT_WORDS: [RegExp, string][] = [
  [/早餐|午餐|晚餐|宵夜|便當|吃飯|麵|飯|火鍋|餐廳|小吃|滷味|鹹酥雞|水餃|牛排|壽司|拉麵|自助餐|麥當勞|肯德基/, "餐飲"],
  [/咖啡|奶茶|珍奶|珍珠|拿鐵|豆花|飲料|手搖|紅茶|綠茶|果汁|星巴克|50嵐|可不可|得正|甜點|蛋糕|零食|餅乾|冰/, "飲料點心"],
  [/計程車|uber|捷運|公車|高鐵|火車|台鐵|客運|機票|悠遊卡/i, "交通"],
  [/加油|油錢|停車|洗車|保養車|過路費|etag/i, "汽車"],
  [/衛生紙|洗衣|洗髮|沐浴|牙膏|日用|清潔|垃圾袋|家樂福|全聯|好市多/, "日用品"],
  [/衣服|褲子|裙子|鞋|外套|包包|帽子|襪子|內衣/, "服飾"],
  [/電影|遊戲|ktv|唱歌|演唱會|門票|netflix|spotify|訂閱|樂透|539|彩券/i, "娛樂"],
  [/藥|看醫生|掛號|診所|醫院|牙醫|健檢/, "醫療"],
  [/化妝|口紅|唇膏|香水|粉底|保養|面膜|美甲|剪頭髮|燙髮|染髮|美容/, "美容"],
  [/書|課|學費|補習|文具|講座/, "教育"],
  [/飼料|寵物|貓砂|獸醫/, "寵物"],
  [/禮物|紅包給|送禮/, "禮物"],
  [/聚餐|請客|喜酒|婚禮|朋友/, "社交"],
  [/住宿|飯店|旅行|旅遊|民宿/, "旅遊"],
  [/手機|電腦|耳機|充電|3c|數位/i, "數位"],
  [/房租|水電|瓦斯|管理費|網路費/, "居住"],
  [/網購|蝦皮|momo|購物|買/i, "購物"],
];
const INCOME_WORDS: [RegExp, string][] = [
  [/薪水|薪資/, "薪資"], [/兼職|打工|接案|叫貨|賣/, "兼職"], [/獎金|分紅/, "獎金"], [/紅包/, "紅包禮金"], [/股息|利息|配息/, "投資收益"],
];
const IN_HINT = /收入|收到|入帳|賺了?|進帳|領到|拿到|薪水|薪資|獎金|股息|配息|利息/;
const PAY_WORDS: [RegExp, string, string][] = [
  [/line\s*pay/i, "epay", "LINE Pay"], [/街口/, "epay", "街口"], [/apple\s*pay/i, "epay", "Apple Pay"], [/全支付/, "epay", "全支付"],
  [/刷卡|信用卡/, "card", ""], [/轉帳/, "transfer", ""], [/現金/, "cash", ""],
];
const DAY_WORDS: [RegExp, number][] = [[/大前天/, 3], [/前天/, 2], [/昨天|昨晚|昨日/, 1], [/今天|今晚|剛剛|剛才/, 0]];

/** Splits 「午餐150，飲料60還有停車30」 into one record per amount. */
export function parseVoice(text: string, adult = true): VoiceItem[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  // A day word applies to its own piece and the pieces after it (「昨天早餐60，午餐120」); payment words only to their own piece.
  let daysAgo = 0;
  const parts = t.split(/[，,。；;、]|還有|然後|另外|跟|和/).map((s) => s.trim()).filter(Boolean);
  // Join pieces without an amount onto the next one, so 「午餐，牛肉麵150」 stays one record.
  const segs: string[] = [];
  let carry = "";
  for (const p of parts) {
    const s = (carry + " " + p).trim();
    if (hasAmount(p)) { segs.push(s); carry = ""; } else carry = s;
  }
  if (carry && segs.length) segs[segs.length - 1] += " " + carry;
  const out: VoiceItem[] = [];
  for (const s of segs) {
    const amt = amountIn(s);
    if (!(amt > 0)) continue;
    for (const [re, d] of DAY_WORDS) if (re.test(s)) { daysAgo = d; break; }
    let pm = "", pd = "";
    for (const [re, m, d] of PAY_WORDS) if (re.test(s)) { pm = m; pd = d; break; }
    const isIn = IN_HINT.test(s);
    let category = isIn ? "其他" : "其他";
    const words = isIn ? INCOME_WORDS : CAT_WORDS;
    for (const [re, c] of words) if (re.test(s)) { category = c; break; }
    if (!adult && !isIn) category = KID_MAP[category] || category;
    let item = s.replace(/[一二兩两三四五六七八九十\d]+\s*(?:杯|個|份|碗|盒|包|瓶|張|件|雙|次|罐|條|片)/g, " ").replace(NUM_RE, " ")
      .replace(/大前天|前天|昨天|昨晚|昨日|今天|今晚|剛剛|剛才|花了|花|付了|付|買了|買|收到|收入|入帳|賺了|賺|領到|拿到|進帳|用|刷卡|信用卡|現金|轉帳|line\s*pay|apple\s*pay|街口|全支付|元|塊錢|塊|了|的|記一筆|記帳/gi, " ")
      .replace(/\s+/g, " ").trim();
    if (item.length > 20) item = item.slice(0, 20);
    out.push({ dir: isIn ? "in" : "out", amount: Math.round(amt), item: item || category, category, payMethod: isIn ? "" : pm, payDetail: isIn ? "" : pd, daysAgo });
  }
  return out;
}

const KID_MAP: Record<string, string> = { 餐飲: "正餐", 服飾: "衣物", 教育: "文具學習", 汽車: "交通", 日用品: "其他", 購物: "其他", 美容: "其他", 醫療: "其他", 社交: "娛樂", 數位: "娛樂", 寵物: "其他", 旅遊: "娛樂", 居住: "其他" };

function hasAmount(s: string) { return amountIn(s) > 0; }
function amountIn(s: string): number {
  let best = 0;
  for (const m of s.matchAll(NUM_RE)) {
    const raw = m[1];
    // A lone 一/二/兩 next to a word (一杯, 兩個) is a count, not money.
    if (/^[一二兩两]$/.test(raw) && !/元|塊/.test(m[0])) continue;
    const v = /\d/.test(raw) ? parseFloat(raw.replace(/,/g, "")) : cnNumber(raw);
    if (v > best) best = v;
  }
  return best;
}
