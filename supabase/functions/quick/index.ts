// Apple Shortcuts endpoint: POST {token, item, amount, type, category, pay, pay_method}. Always answers 200 with a readable message.
// `pay` is free text such as "LINE Pay", "國泰世華 CUBE卡" (Apple Pay card name) or "現金"; the method is inferred when pay_method is absent.
import { admin, cors, json, readBody } from "../_shared/util.ts";

const EPAY = /line\s*pay|街口|jko|全支付|px\s*pay|悠遊付|easy\s*wallet|icash\s*pay|全盈|pi\s*拍|拍錢包|一卡通|ipass|台灣\s*pay|taiwan\s*pay|apple\s*pay|google\s*pay|samsung\s*pay|電子支付/i;
const METHOD: Record<string, string> = { cash: "cash", 現金: "cash", card: "card", 信用卡: "card", epay: "epay", 電子支付: "epay", transfer: "transfer", 轉帳: "transfer", 扣款: "transfer", 自動扣款: "transfer" };
const LABEL: Record<string, string> = { cash: "現金", card: "信用卡", epay: "電子支付", transfer: "轉帳" };

function inferPay(methodRaw: string, payRaw: string): [string, string] {
  let m = METHOD[methodRaw.trim().toLowerCase()] ?? METHOD[methodRaw.trim()] ?? "";
  const p = payRaw.trim();
  if (!m && p) m = /現金|cash/i.test(p) ? "cash" : /轉帳|扣款|匯款|transfer/i.test(p) ? "transfer" : EPAY.test(p) ? "epay" : "card";
  const detail = m === "cash" ? "" : (METHOD[p] || METHOD[p.toLowerCase()] ? "" : p).slice(0, 20);
  return [m, detail];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, message: "請用 POST" });
  const b = await readBody(req);
  const token = String(b.token ?? "").trim();
  const item = String(b.item ?? "").trim();
  const amount = Math.round(Number(String(b.amount ?? "").replace(/[^\d.]/g, "")));
  const typeRaw = String(b.type ?? "want");
  const type = /need|需要/.test(typeRaw) ? "need" : "want";
  const category = String(b.category ?? "").trim();
  const [pm, pd] = inferPay(String(b.pay_method ?? ""), String(b.pay ?? ""));
  if (!token) return json({ ok: false, message: "缺少記帳碼，請重新設定捷徑" });

  const r = await admin().rpc("quick_add_v2", {
    p_token: token, p_item: item, p_amount: amount, p_type: type, p_category: category, p_pay_method: pm, p_pay_detail: pd,
  });
  if (r.error) return json({ ok: false, message: r.error.message });
  const payTxt = pm ? `（${pd || LABEL[pm]}）` : "";
  return json({
    ok: true,
    message: `${r.data.name} 已記帳：${item} ${amount} 元${payTxt}。自由罐還剩 ${r.data.left} 元。`,
    left: r.data.left,
  });
});
