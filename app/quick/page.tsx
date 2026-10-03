"use client";
import { useEffect, useState } from "react";
import { supabase, rpc, MEMBER_COLS } from "@/lib/supabase";
import { CATS, fmt } from "@/lib/util";

export default function QuickPage() {
  const [me, setMe] = useState<any>(undefined);
  const [left, setLeft] = useState<number | null>(null);
  const [item, setItem] = useState("");
  const [amt, setAmt] = useState("");
  const [type, setType] = useState<"need" | "want">("want");
  const [cat, setCat] = useState("飲料點心");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return setMe(null);
      const { data } = await supabase.from("members").select(MEMBER_COLS).eq("user_id", s.session.user.id).maybeSingle();
      setMe(data || null);
      if (data) {
        const [b] = await rpc("balances", { p_member: data.id });
        setLeft(b?.free ?? null);
      }
    })();
  }, []);

  async function add() {
    setBusy(true);
    setMsg("");
    const [r, e] = await rpc("add_expense", { p_member: me.id, p_item: item, p_amount: Math.round(+amt), p_type: type, p_category: cat });
    setBusy(false);
    if (e) return setMsg(e);
    setLeft(r.left);
    setMsg(`已記帳：${item} ${Math.round(+amt)} 元`);
    setItem("");
    setAmt("");
  }

  if (me === undefined) return <div className="splash">載入中…</div>;
  if (me === null)
    return (
      <main className="login">
        <section className="card"><p>請先登入。</p><a className="btn primary" href="/">去登入</a></section>
      </main>
    );

  return (
    <main className="login">
      <div className="card-h"><h1>快速記帳</h1><a className="small" href="/">回到 App</a></div>
      <section className="card">
        <div className="kv"><span className="muted">{me.name} 的自由罐還有</span><b className="k-free">{left === null ? "—" : fmt(left)}</b></div>
        <label className="f">多少錢<input id="q-amt" type="number" inputMode="numeric" autoFocus min={1} placeholder="60" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
        <label className="f">買了什麼<input id="q-item" maxLength={40} placeholder="例如：手搖飲" value={item} onChange={(e) => setItem(e.target.value)} /></label>
        <div className="chips">{CATS.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}</div>
        <div className="seg">
          <button className={type === "need" ? "on" : ""} onClick={() => setType("need")}>需要</button>
          <button className={type === "want" ? "on" : ""} onClick={() => setType("want")}>想要</button>
        </div>
        <button className="btn primary big" disabled={busy} onClick={add}>記下來</button>
        {msg && <p className="small center" role="status">{msg}</p>}
      </section>
    </main>
  );
}
