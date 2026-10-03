// Parent adds a family member: creates the member row with a PIN and a login account behind it.
import { admin, cors, json, randomPassword, readBody } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "請用 POST" }, 405);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const sb = admin();
  const who = await sb.auth.getUser(token);
  if (who.error || !who.data.user) return json({ ok: false, error: "請重新登入" }, 401);

  const b = await readBody(req);
  const r = await sb.rpc("admin_add_member", {
    p_caller: who.data.user.id,
    p_name: String(b.name ?? ""),
    p_role: String(b.role ?? "kid"),
    p_allowance: Math.round(Number(b.allowance ?? 0)) || 0,
    p_color: String(b.color ?? "sky"),
    p_pin: String(b.pin ?? ""),
  });
  if (r.error) return json({ ok: false, error: r.error.message });
  const memberId = r.data as string;

  const created = await sb.auth.admin.createUser({
    email: `m-${memberId}@members.ad-family.app`,
    password: randomPassword(),
    email_confirm: true,
  });
  if (created.error || !created.data.user) return json({ ok: false, error: "建立登入帳號失敗，請再試一次" });
  const l = await sb.rpc("admin_link_user", { p_member: memberId, p_user: created.data.user.id });
  if (l.error) return json({ ok: false, error: "建立登入帳號失敗，請再試一次" });
  return json({ ok: true, member_id: memberId });
});
