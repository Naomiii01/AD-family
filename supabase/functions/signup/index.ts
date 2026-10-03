// Creates a parent account (already confirmed) and a new family.
import { admin, cors, json, readBody } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "請用 POST" }, 405);
  const b = await readBody(req);
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const familyName = String(b.family_name ?? "").trim();
  const myName = String(b.my_name ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: false, error: "Email 格式不正確" });
  if (password.length < 8) return json({ ok: false, error: "密碼至少 8 個字元" });
  if (!myName) return json({ ok: false, error: "請填你的稱呼" });

  const sb = admin();
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    const msg = /already|registered|exists/i.test(error?.message ?? "")
      ? "這個 Email 已經註冊過了，請直接登入"
      : "註冊失敗，請稍後再試";
    return json({ ok: false, error: msg });
  }
  const r = await sb.rpc("create_family_for", { p_user: data.user.id, p_family: familyName, p_name: myName });
  if (r.error) {
    await sb.auth.admin.deleteUser(data.user.id);
    return json({ ok: false, error: r.error.message });
  }
  return json({ ok: true, code: r.data.code });
});
