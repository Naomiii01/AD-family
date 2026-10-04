"use client";
import { useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import Agreement from "./Agreement";
import Rules from "./Rules";
import QuickSetup from "./QuickSetup";
import Parent from "./Parent";
import JarManager from "./JarManager";
import { SKINS, SkinKey, skinOf, LOOKS, LookKey, lookOf } from "@/lib/themes";
import { gd, jarList } from "@/lib/util";

export default function More({ app }: { app: App }) {
  const { sub, go, isParent, sel, me, isSelf } = app;
  if (sub) {
    const page =
      sub === "agreement" ? <Agreement app={app} /> :
      sub === "rules" ? <Rules app={app} /> :
      sub === "quick" ? <QuickSetup app={app} /> :
      sub === "parent" && isParent ? <Parent app={app} /> :
      sub === "pin" ? <MyPin app={app} /> :
      sub === "skin" ? <SkinPicker app={app} /> :
      sub === "jars" ? <JarManager app={app} /> : null;
    return (
      <>
        <button className="back" onClick={() => go("more")}>‹ 更多</button>
        {page}
      </>
    );
  }
  const who = isSelf ? "" : `（${sel.name}）`;
  const items: [string, string, string, string, string][] = [
    ["agreement", "約", "dream", "理財約定" + who, `孩子和${gd(app.family)}一起訂的用錢規則，雙方簽名`],
    ["rules", "則", "long", "罐子使用原則", "三個罐子怎麼用、家庭銀行和夢想加碼"],
    ["quick", "記", "sky", "快速記帳與每週提醒" + (isSelf ? "" : `（${sel.name}）`), "Apple 捷徑、加到主畫面、行事曆提醒"],
  ];
  items.push(["jars", "罐", "long", "管理罐子" + who, jarList(sel).map((j) => j.name).join("、")]);
  items.push(["skin", "色", "accent", "畫面風格與配色" + who, `${LOOKS[lookOf(sel)].name} · ${SKINS[skinOf(sel)].name}`]);
  if (isParent) items.push(["parent", "家", "free", "家長設定", "家人、零用金、密碼、獎勵、家庭銀行規則"]);
  items.push(["pin", "密", "ink", "更改我的登入密碼", `${me.name} 的 4 到 8 位數字密碼`]);
  return (
    <>
      <div className="menu">
        {items.map(([k, ic, c, t, d]) => (
          <button key={k} onClick={() => go("more", k)}>
            <span className="ic" style={{ background: `var(--${c === "ink" ? "muted" : c === "sky" ? "dream" : c})` }}>{ic}</span>
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

function SkinPicker({ app }: { app: App }) {
  const { sel, isSelf, toast, reloadBase } = app;
  const cur = skinOf(sel);
  const curLook = lookOf(sel);
  async function pick(k: SkinKey) {
    const [, e] = await rpc("set_theme", { p_member: sel.id, p_theme: k });
    if (e) return toast(e);
    toast(`配色換成「${SKINS[k].name}」`);
    await reloadBase();
  }
  async function pickLook(k: LookKey) {
    const [, e] = await rpc("set_look", { p_member: sel.id, p_look: k });
    if (e) return toast(e);
    toast(`風格換成「${LOOKS[k].name}」`);
    await reloadBase();
  }
  return (
    <>
      <section className="card">
        <h2>畫面風格{isSelf ? "" : `（${sel.name}）`}</h2>
        <p className="small muted">{isSelf ? "選你喜歡的樣子，只會改變你自己看到的畫面。風格和配色可以自由搭配。" : `幫 ${sel.name} 選，${sel.name} 登入後會看到。你自己的畫面不會變。`}</p>
        <div className="look-pick">
          {(Object.keys(LOOKS) as LookKey[]).map((k) => (
            <button key={k} className={`look-opt ${curLook === k ? "on" : ""}`} onClick={() => pickLook(k)} aria-pressed={curLook === k}>
              <div className="lk" data-look={k}>
                <div className="card">
                  <div className="card-h"><h3>{LOOKS[k].name}</h3>{curLook === k && <span className="pill active">使用中</span>}</div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="big-n" style={{ color: "var(--free)" }}>NT$ 1,250</span>
                    <span className="btn primary sm">記下來</span>
                  </div>
                  <span className="note">{LOOKS[k].desc}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>配色</h2>
        <div className="skin-pick">
          {(Object.keys(SKINS) as SkinKey[]).map((k) => {
            const t = SKINS[k];
            return (
              <button key={k} className={cur === k ? "on" : ""} style={{ background: t.bg, color: t.ink, ["--free" as any]: t.jars[0], ["--ink" as any]: t.ink, ["--surface" as any]: t.surface }} onClick={() => pick(k)} aria-pressed={cur === k}>
                <span className="row" style={{ gap: 6, color: t.accent }}>{t.motif}<b style={{ color: t.ink }}>{t.name}</b></span>
                <span className="sw">{t.jars.map((c) => <i key={c} style={{ background: c }} />)}<i style={{ background: t.accent }} /></span>
                <span style={{ fontSize: ".78rem", opacity: 0.8 }}>{t.desc}</span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
