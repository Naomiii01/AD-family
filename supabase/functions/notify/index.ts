// iOS 27 notification automation endpoint: POST {token, app?, title?, body?, text?}.
// Reads the payment notification, records it, and always answers 200 with a readable message.
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

  const p = parseNotification(app, title, body);
  // Quiet skips answer with an empty message so the shortcut shows nothing.
  if (p.kind === "skip") return p.quiet
    ? json({ ok: false, skipped: true, notify: false, message: "" })
    : json({ ok: false, skipped: true, notify: true, message: `沒有自動記帳：${p.reason}。需要的話請手動記一筆。` });

  const r = await admin().rpc("notify_add", {
    p_token: token, p_item: p.item, p_amount: p.amount, p_pay_method: p.payMethod, p_pay_detail: p.payDetail,
  });
  if (r.error) return json({ ok: false, notify: true, message: r.error.message });
  if (r.data.dup) return json({ ok: true, dup: true, notify: false, message: "" });
  const left = Number(r.data.left);
  const tail = left < 0 ? `自由罐透支 ${-left} 元，記得補回來。` : `自由罐還剩 ${left} 元。`;
  return json({ ok: true, notify: true, message: `已自動記帳：${p.item} ${p.amount} 元${p.payDetail ? `（${p.payDetail}）` : ""}。${tail}` });
});
