// iOS 27 notification automation endpoint: POST {token, app?, title?, body?, text?}.
// Reads the payment notification, records it (bank transfers and deposits wait in the app as 待確認), and always answers 200 with a readable message.
// The notification text is only parsed here; it is not stored.
import { admin, cors, json, readBody } from "../_shared/util.ts";
import { parseNotification } from "../_shared/parse.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, message: "請用 POST" });
  const b = await readBody(req);
  const token = String(b.token ?? "").trim();
  if (!token) return json({ ok: false, notify: true, message: "缺少記帳碼，請重新設定捷徑" });
  const app = String(b.app ?? "").slice(0, 60);
  const title = String(b.title ?? "").slice(0, 300);
  const body = String(b.body ?? b.text ?? "").slice(0, 1000);

  // The automation ran but the shortcut sent no text: the notification object wasn't turned into its title / body.
  if (!title.trim() && !body.trim()) return json({ ok: false, notify: true,
    message: "捷徑沒有收到通知的文字。請在「從通知記帳」把 body 改成通知的「內文」、title 改成「標題」。" });

  const p = parseNotification(app, title, body);
  // Quiet skips answer with no message at all: the shortcut's 「如果 有任何數值」 then shows nothing
  // (an empty string still counts as a value and made iOS show a blank 「通知」).
  if (p.kind === "skip") return p.quiet
    ? json({ ok: false, skipped: true, notify: false })
    : json({ ok: false, skipped: true, notify: true, message: `沒有自動記帳：${p.reason}。需要的話請手動記一筆。` });

  if (p.kind === "pending") {
    const q = await admin().rpc("pending_add", { p_token: token, p_dir: p.dir, p_amount: p.amount, p_bank: p.bank, p_note: p.note });
    if (q.error) return json({ ok: false, notify: true, message: q.error.message });
    if (q.data.dup) return json({ ok: true, dup: true, notify: false });
    if (q.data.matched) return json({ ok: true, notify: true,
      message: `${p.bank}股票交割 ${p.amount} 元，就是股票帳裡${q.data.side === "buy" ? "買" : "賣"}「${q.data.stock}」那筆，不用另外記。` });
    if (!p.amount) return json({ ok: true, pending: true, notify: true,
      message: `${p.bank}有一筆${p.dir === "in" ? "入帳" : "轉出"}（通知沒寫金額），打開 My零用錢 填金額（待確認 ${q.data.count} 筆）` });
    return json({ ok: true, pending: true, notify: true,
      message: `${p.bank}${p.dir === "in" ? "入帳" : "轉出"} ${p.amount} 元，打開 My零用錢 確認要怎麼記（待確認 ${q.data.count} 筆）` });
  }

  const r = await admin().rpc("notify_add", {
    p_token: token, p_item: p.item, p_amount: p.amount, p_pay_method: p.payMethod, p_pay_detail: p.payDetail,
  });
  if (r.error) return json({ ok: false, notify: true, message: r.error.message });
  if (r.data.dup) return json({ ok: true, dup: true, notify: false });
  const left = Number(r.data.left);
  const tail = left < 0 ? `自由罐透支 ${-left} 元，記得補回來。` : `自由罐還剩 ${left} 元。`;
  return json({ ok: true, notify: true, message: `已自動記帳：${p.item} ${p.amount} 元${p.payDetail ? `（${p.payDetail}）` : ""}。${tail}` });
});
