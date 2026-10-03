// Apple Shortcuts endpoint: POST {token, item, amount, type, category}. Always answers 200 with a readable message.
import { admin, cors, json, readBody } from "../_shared/util.ts";

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
  if (!token) return json({ ok: false, message: "缺少記帳碼，請重新設定捷徑" });

  const r = await admin().rpc("quick_add", {
    p_token: token, p_item: item, p_amount: amount, p_type: type, p_category: category,
  });
  if (r.error) return json({ ok: false, message: r.error.message });
  return json({
    ok: true,
    message: `${r.data.name} 已記帳：${item} ${amount} 元。自由罐還剩 ${r.data.left} 元。`,
    left: r.data.left,
  });
});
