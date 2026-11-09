"use client";
import { useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import Agreement from "./Agreement";
import Rules from "./Rules";
import QuickSetup from "./QuickSetup";
import Parent from "./Parent";
import JarManager from "./JarManager";
import Assets from "./Assets";
import { simpleOf } from "./QuickLog";
import { SKINS, SkinKey, skinOf, LOOKS, LookKey, lookOf } from "@/lib/themes";
import { gd, jarList, IS_DEMO } from "@/lib/util";

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
      sub === "jars" ? <JarManager app={app} /> :
      sub === "logset" ? <LogSettings app={app} /> :
      sub === "assets" ? <Assets app={app} /> : null;
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
  if (sel.role !== "kid") items.unshift(["assets", "產", "long", "我的資產" + who, "現金、銀行、電子支付、信用卡和股票，一次看淨資產"]);
  items.push(["jars", "罐", "long", "管理罐子" + who, jarList(sel).map((j) => j.name).join("、")]);
  items.push(["logset", "帳", "free", "記帳設定" + who, `${simpleOf(sel) ? "簡易記帳" : "完整記帳"} · ${sel.need_want === false ? "不分需要／想要" : "需要／想要月底補標"}`]);
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
      {isSelf && !IS_DEMO && <IconPicker app={app} />}
    </>
  );
}

const APP_ICONS: [string, string][] = [["sage", "鼠尾草綠"], ["mint", "海鹽薄荷"], ["lavender", "柔霧紫"], ["peach", "蜜桃粉"], ["latte", "奶咖"], ["navy", "灰藍"], ["night", "夜空黑"]];
/** Home-screen icon: iPhone reads it when the page is added to the home screen, so a change needs re-adding. */
function IconPicker({ app }: { app: App }) {
  const [cur, setCur] = useState(() => { try { return localStorage.getItem("adf-icon") || "sage"; } catch { return "sage"; } });
  function pick(k: string) {
    setCur(k);
    try { localStorage.setItem("adf-icon", k); } catch { /* storage unavailable */ }
    applyAppIcon(k);
    app.toast("圖示換好了，照下面的步驟重新加到主畫面就會更新");
  }
  return (
    <section className="card">
      <h2>主畫面圖示</h2>
      <div className="icon-pick">
        {APP_ICONS.map(([k, n]) => (
          <button key={k} className={cur === k ? "on" : ""} onClick={() => pick(k)} aria-pressed={cur === k}>
            <img src={`/icons/${k}-180.png`} alt="" width={56} height={56} /><span>{n}</span>
          </button>
        ))}
      </div>
      <p className="note">iPhone 只在「加入主畫面」時讀取圖示：選好後，先長按主畫面上的 My零用錢 刪除（資料不會不見），再用 Safari 打開網站 → 分享 →「加入主畫面」。</p>
    </section>
  );
}

export function applyAppIcon(k?: string) {
  if (typeof document === "undefined") return;
  let key = k;
  if (!key) { try { key = localStorage.getItem("adf-icon") || ""; } catch { key = ""; } }
  if (!key || key === "sage") return;
  const href = `/icons/${key}-180.png`;
  let el = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
  if (!el) { el = document.createElement("link"); el.rel = "apple-touch-icon"; document.head.appendChild(el); }
  el.href = href;
}

function LogSettings({ app }: { app: App }) {
  const { sel, isSelf, isParent, family, toast, reloadBase } = app;
  const on = sel.need_want !== false;
  const simple = simpleOf(sel);
  async function setSimple(v: boolean) {
    const [, e] = await rpc("set_simple_log", { p_member: sel.id, p_on: v });
    if (e) return toast(e);
    toast(v ? "已切換成簡易記帳" : "已切換成完整記帳");
    await reloadBase();
  }
  async function setNw(v: boolean) {
    const [, e] = await rpc("set_need_want", { p_member: sel.id, p_on: v });
    if (e) return toast(e);
    toast(v ? "已開啟需要／想要" : "已關閉需要／想要");
    await reloadBase();
  }
  async function setStar(v: boolean) {
    const [, e] = await rpc("set_star_label", { p_on: v });
    if (e) return toast(e);
    toast(v ? "孩子要標完才拿得到星星" : "標記不影響星星");
    await reloadBase();
  }
  return (
    <>
      <section className="card">
        <h2>記帳畫面{isSelf ? "" : `（${sel.name}）`}</h2>
        <p className="small muted">簡易記帳：輸入金額、點一個圖示就記好，打開 App 的「罐子」頁就能直接記。孩子預設是簡易，大人預設是完整。</p>
        <div className="seg" role="group" aria-label="記帳畫面">
          <button className={simple ? "on" : ""} onClick={() => setSimple(true)}>簡易</button>
          <button className={!simple ? "on" : ""} onClick={() => setSimple(false)}>完整</button>
        </div>
      </section>
      <section className="card">
        <h2>需要／想要{isSelf ? "" : `（${sel.name}）`}</h2>
        <p className="small muted">記帳時可以先不選，月底檢討再一次補標。關掉後，記帳和檢討都不會再出現需要／想要。</p>
        <div className="seg" role="group" aria-label="需要想要開關">
          <button className={on ? "on" : ""} onClick={() => setNw(true)}>開啟</button>
          <button className={!on ? "on" : ""} onClick={() => setNw(false)}>關閉</button>
        </div>
      </section>
      {isParent && (
        <section className="card">
          <h2>孩子的星星條件</h2>
          <p className="small muted">開啟後，孩子每筆花費都要在月底前標好需要／想要，才拿得到當月星星。</p>
          <div className="seg" role="group" aria-label="星星需要標記">
            <button className={family.star_needs_label ? "on" : ""} onClick={() => setStar(true)}>要標完</button>
            <button className={!family.star_needs_label ? "on" : ""} onClick={() => setStar(false)}>不影響星星</button>
          </div>
        </section>
      )}
    </>
  );
}

