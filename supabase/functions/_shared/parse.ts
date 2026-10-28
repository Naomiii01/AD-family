// Reads a payment notification (LINE Pay, 街口, bank card alerts, Apple Pay) into an expense.
// Pure function so it can be tested outside Deno.

export type Parsed =
  | { kind: "expense"; amount: number; item: string; payMethod: string; payDetail: string }
  | { kind: "skip"; reason: string };

const BANKS = [
  "國泰世華", "中國信託", "中信", "台新", "玉山", "台北富邦", "富邦", "永豐", "兆豐", "聯邦", "第一銀行", "一銀", "華南", "彰化銀行", "彰銀",
  "合作金庫", "合庫", "星展", "滙豐", "匯豐", "渣打", "遠東", "遠銀", "元大", "凱基", "上海商銀", "新光", "王道", "將來銀行", "LINE Bank",
  "樂天", "土地銀行", "土銀", "臺灣銀行", "台灣銀行", "臺銀", "陽信", "安泰", "日盛", "台中銀",
];
const BANK_NAME: Record<string, string> = { 中信: "中國信託", 一銀: "第一銀行", 彰銀: "彰化銀行", 合庫: "合作金庫", 匯豐: "滙豐", 遠銀: "遠東", 土銀: "土地銀行", 臺灣銀行: "台灣銀行", 臺銀: "台灣銀行" };
const EPAYS: [RegExp, string][] = [
  [/line\s*pay|LINE Pay/i, "LINE Pay"], [/街口|jko\s*pay/i, "街口"], [/全支付|px\s*pay/i, "全支付"], [/悠遊付|easy\s*wallet/i, "悠遊付"],
  [/icash\s*pay/i, "icash Pay"], [/全盈/i, "全盈+PAY"], [/pi\s*拍|拍錢包/i, "Pi 拍錢包"], [/一卡通\s*money|ipass\s*money/i, "一卡通"],
  [/台灣\s*pay|taiwan\s*pay/i, "台灣Pay"], [/google\s*pay/i, "Google Pay"],
];

// Notifications that mention money but are not spending: refunds, top-ups, incoming money, bills, codes, promos.
const NOT_SPEND = /轉出|轉帳|扣繳|退款|退貨|退刷|取消交易|交易取消|已取消|轉入|入帳|收款|已收到|收到.*轉帳|儲值|加值|自動加值|回饋|現折|紅利|點數|繳款|帳單|應繳|最低應繳|已繳|驗證碼|OTP|密碼|優惠|活動|抽獎|登入/;

function toInt(s: string) {
  return Math.round(Number(s.replace(/[,，\s]/g, "")));
}

export function parseNotification(app: string, title: string, body: string): Parsed {
  const text = [title, body].filter(Boolean).join("\n").replace(/ /g, " ");
  const all = `${app}\n${text}`;
  if (!text.trim()) return { kind: "skip", reason: "通知沒有內容" };
  if (NOT_SPEND.test(text)) return { kind: "skip", reason: "這則通知看起來不是消費（例如退款、儲值、帳單或優惠）" };

  // Amount: currency-marked numbers first, then "金額：", then "...元".
  const pats = [
    /(?:NT\s*\$|NTD|TWD|新[台臺]幣|台幣|NT)\s*([0-9][0-9,]*(?:\.\d+)?)/i,
    /(?:消費|交易|付款|支付|刷卡)?金額\s*[:：為]?\s*\$?\s*([0-9][0-9,]*(?:\.\d+)?)/,
    /\$\s*([0-9][0-9,]*(?:\.\d+)?)/,
    /([0-9][0-9,]*(?:\.\d+)?)\s*元/,
  ];
  let amount = 0;
  for (const p of pats) {
    const m = text.match(p);
    if (m) { amount = toInt(m[1]); if (amount > 0) break; }
  }
  if (!(amount > 0)) return { kind: "skip", reason: "看不懂這則通知的金額" };

  // Merchant.
  const mpats = [
    /(?:商店|特店|店家|商家|消費地點|交易地點|收款方|付款對象)(?:名稱)?\s*[:：]\s*([^\n，,。；;]{2,24})/,
    /(?:已於|於|在)\s*([^\n，,。；;]{2,24}?)\s*(?:消費|付款|刷卡|交易|完成付款|使用)/,
    /(?:付款給|支付給)\s*([^\n，,。；;]{2,24})/,
    /(?:於|在)\s*([^\n，,。；;\d$]{2,24}?)\s*$/m,
  ];
  let item = "";
  for (const p of mpats) {
    const m = text.match(p);
    if (m) {
      item = m[1].replace(/\d{1,2}\/\d{1,2}|\d{1,2}:\d{2}|(?:NT\s*\$|\$)\s*[\d,]+|新[台臺]幣[\d,]+元?|您的?|信用卡|簽帳金融卡|卡號?末?四碼\s*\d{4}|\d{4}卡?/g, "").trim().replace(/^(?:在|於)\s*/, "");
      if (item.length >= 2) break;
      item = "";
    }
  }

  // Payment method.
  let payMethod = "", payDetail = "";
  const ep = EPAYS.find(([re]) => re.test(all));
  if (ep) { payMethod = "epay"; payDetail = ep[1]; }
  else if (/apple\s*pay|錢包|wallet/i.test(all)) { payMethod = "epay"; payDetail = "Apple Pay"; }
  const bank = BANKS.find((b) => all.includes(b));
  if (bank) {
    const name = BANK_NAME[bank] || bank;
    if (!payMethod || payDetail === "Apple Pay") { payMethod = "card"; payDetail = name; }
  }
  if (!payMethod && /刷卡|信用卡|簽帳/.test(text)) payMethod = "card";

  if (!item) item = (payDetail || app || "付款") + " 消費";
  return { kind: "expense", amount, item: item.slice(0, 40), payMethod, payDetail: payDetail.slice(0, 20) };
}
