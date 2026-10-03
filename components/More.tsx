"use client";
import { useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import Agreement from "./Agreement";
import Rules from "./Rules";
import QuickSetup from "./QuickSetup";
import Parent from "./Parent";

export default function More({ app }: { app: App }) {
  const { sub, go, isParent, sel, me, isSelf } = app;
  if (sub) {
    const page =
      sub === "agreement" ? <Agreement app={app} /> :
      sub === "rules" ? <Rules app={app} /> :
      sub === "quick" ? <QuickSetup app={app} /> :
      sub === "parent" && isParent ? <Parent app={app} /> :
      sub === "pin" ? <MyPin app={app} /> : null;
    return (
      <>
        <button className="back" onClick={() => go("more")}>‹ 更多</button>
        {page}
      </>
    );
  }
  const who = isSelf ? "" : `（${sel.name}）`;
  const items: [string, string, string, string, string][] = [
    ["agreement", "約", "dream", "理財約定" + who, "孩子和爸媽一起訂的用錢規則，雙方簽名"],
    ["rules", "則", "long", "罐子使用原則", "三個罐子怎麼用、家庭銀行和夢想加碼"],
    ["quick", "記", "sky", "快速記帳與每週提醒" + (isSelf ? "" : `（${sel.name}）`), "Apple 捷徑、加到主畫面、行事曆提醒"],
  ];
  if (isParent) items.push(["parent", "家", "free", "家長設定", "家人、零用金、密碼、獎勵、家庭銀行規則"]);
  items.push(["pin", "密", "ink", "更改我的登入密碼", `${me.name} 的 4 到 8 位數字密碼`]);
  return (
    <>
      <div className="menu">
        {items.map(([k, ic, c, t, d]) => (
          <button key={k} onClick={() => go("more", k)}>
            <span className="ic" style={{ background: `var(--${c === "ink" ? "muted" : c})` }}>{ic}</span>
            <span>{t}<small>{d}</small></span>
            <span className="muted">›</span>
          </button>
        ))}
      </div>
      <button className="btn" onClick={() => supabase.auth.signOut()}>登出 {me.name}</button>
    </>
  );
}

function MyPin({ app }: { app: App }) {
  const { me, toast } = app;
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const min = me.role === "parent" ? 6 : 4;
  async function save() {
    if (pin !== pin2) return toast("兩次輸入的密碼不一樣");
    setBusy(true);
    const [, e] = await rpc("set_member_pin", { p_member: me.id, p_pin: pin });
    setBusy(false);
    if (e) return toast(e);
    toast("密碼已更新");
    setPin("");
    setPin2("");
  }
  return (
    <section className="card">
      <h2>更改我的登入密碼</h2>
      <p className="small muted">用「家庭代碼＋名字＋密碼」登入時用的密碼。{me.role === "parent" ? "家長至少 6 位數字。" : "4 到 8 位數字。"}</p>
      <label className="f">新密碼<input id="np1" type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></label>
      <label className="f">再輸入一次<input id="np2" type="password" inputMode="numeric" maxLength={8} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} /></label>
      <button className="btn primary" disabled={busy || pin.length < min} onClick={save}>更新密碼</button>
    </section>
  );
}
