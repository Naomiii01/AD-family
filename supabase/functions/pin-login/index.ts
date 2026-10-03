// Family code + member + PIN login. Returns a one-time token the app exchanges for a session.
import { admin, cors, json, readBody } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "請用 POST" }, 405);
  const b = await readBody(req);
  const code = String(b.code ?? "").trim().toUpperCase();
  const memberId = String(b.member_id ?? "");
  const pin = String(b.pin ?? "");
  if (code.length !== 6 || !memberId || !/^\d{4,8}$/.test(pin)) return json({ ok: false, error: "請輸入家庭代碼、選擇名字並輸入密碼" });

  const sb = admin();
  const v = await sb.rpc("verify_pin", { p_code: code, p_member: memberId, p_pin: pin });
  if (v.error) return json({ ok: false, error: "登入失敗，請稍後再試" });
  if (!v.data?.ok) return json({ ok: false, error: v.data?.error ?? "登入失敗" });

  const u = await sb.auth.admin.getUserById(v.data.user_id);
  const email = u.data.user?.email;
  if (!email) return json({ ok: false, error: "帳號資料不完整，請家長重新新增這位成員" });
  const link = await sb.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) return json({ ok: false, error: "登入失敗，請稍後再試" });
  return json({ ok: true, token_hash: link.data.properties.hashed_token });
});
