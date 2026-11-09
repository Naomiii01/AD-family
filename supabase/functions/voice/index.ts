// Siri / Shortcuts voice logging: POST {token, text}. Splits the sentence into records and logs them.
// Always answers 200 with a readable message for the shortcut to show or speak.
import { admin, cors, json, readBody } from "../_shared/util.ts";
import { parseVoice } from "../_shared/voice.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const b = await readBody(req);
  const token = String(b.token ?? "").trim();
  const text = String(b.text ?? b.body ?? "").slice(0, 300);
  if (!token) return json({ ok: false, message: "缺少記帳碼，請重新設定捷徑" });
  if (!text.trim()) return json({ ok: false, message: "沒有聽到內容，再說一次，例如「午餐一百五」" });
  const items = parseVoice(text, true);
  if (!items.length) return json({ ok: false, message: `沒聽到金額：「${text}」。可以說「午餐 150」或「飲料六十元」` });
  const r = await admin().rpc("voice_add", { p_token: token, p_items: items });
  if (r.error) return json({ ok: false, message: r.error.message });
  const list = items.map((i) => `${i.item} ${i.dir === "in" ? "+" : ""}${i.amount}`).join("、");
  const free = Number(r.data.free);
  return json({ ok: true, message: `已記 ${items.length} 筆：${list}。自由罐${free < 0 ? `透支 ${-free}` : `還剩 ${free}`} 元。` });
});
