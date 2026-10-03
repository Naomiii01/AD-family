"use client";
import { useCallback, useEffect, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc, fn } from "@/lib/supabase";
import { JN, fmt, curMonth } from "@/lib/util";
import { SKINS, SkinKey } from "@/lib/themes";
import { Avatar, Confirm, copyText, Stars } from "./ui";

export default function Parent({ app }: { app: App }) {
  return (
    <>
      <FamilyCard app={app} />
      <Advice app={app} />
      <Reward app={app} />
      <MembersCard app={app} />
      <AddMember app={app} />
    </>
  );
}

function FamilyCard({ app }: { app: App }) {
  const { family, toast, reloadBase, data } = app;
  const [name, setName] = useState(family.name);
  const [rate, setRate] = useState(String(Number(family.rate)));
  const [bonus, setBonus] = useState(String(family.bonus_pct));
  const [step, setStep] = useState(String(family.bonus_step));
  const [lmin, setLmin] = useState(String(family.long_min));
  const [mpct, setMpct] = useState(String(family.match_pct));
  const [mcap, setMcap] = useState(String(family.match_cap));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const [, e] = await rpc("update_family", { p_name: name, p_rate: +rate, p_bonus: Math.round(+bonus) });
    if (e) { setBusy(false); return toast(e); }
    const [, e2] = await rpc("update_family_rules", { p_bonus_step: Math.round(+step), p_bonus_pct: Math.round(+bonus), p_long_min: Math.round(+lmin), p_match_pct: Math.round(+mpct), p_match_cap: Math.round(+mcap) || 0 });
    setBusy(false);
    if (e2) return toast(e2);
    toast("已更新家庭設定");
    await reloadBase();
    await data.reload();
  }
  return (
    <section className="card">
      <h2>家庭代碼</h2>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="code">{family.code}</span>
        <button className="btn sm" onClick={async () => toast((await copyText(family.code)) ? "已複製家庭代碼" : "請手動複製")}>複製</button>
      </div>
      <p className="small muted">家人在登入頁選「家人登入」，輸入這組代碼、選自己的名字，再輸入自己的密碼。</p>
      <h3>家庭銀行規則</h3>
      <label className="f">家庭名稱<input id="f-name" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <h3>夢想罐闖關加碼</h3>
      <div className="grid2">
        <label className="f">每存滿多少錢（元）<input id="f-step" type="number" inputMode="numeric" min={100} value={step} onChange={(e) => setStep(e.target.value)} /></label>
        <label className="f">加碼比例（%）<input id="f-bonus" type="number" inputMode="numeric" min={0} max={50} value={bonus} onChange={(e) => setBonus(e.target.value)} /></label>
      </div>
      <p className="note">例：每存滿 {fmt(+step || 0)} 加碼 {+bonus || 0}%，每闖過一關拿 {fmt(((+step || 0) * (+bonus || 0)) / 100)}。月底結算時自動發放；花掉後重新算。</p>
      <h3>長期罐配對投資</h3>
      <div className="grid2">
        <label className="f">孩子每月最少（元）<input id="f-lmin" type="number" inputMode="numeric" min={0} value={lmin} onChange={(e) => setLmin(e.target.value)} /></label>
        <label className="f">爸媽配對（%）<input id="f-mpct" type="number" inputMode="numeric" min={0} max={300} value={mpct} onChange={(e) => setMpct(e.target.value)} /></label>
        <label className="f">每月配對上限（0 = 不設上限）<input id="f-mcap" type="number" inputMode="numeric" min={0} value={mcap} onChange={(e) => setMcap(e.target.value)} /></label>
        <label className="f">家庭銀行月息（%）<input id="f-rate" type="number" inputMode="decimal" min={0} max={10} step={0.5} value={rate} onChange={(e) => setRate(e.target.value)} /></label>
      </div>
      <p className="note">配對 100% 代表孩子放多少、爸媽就加多少。長期罐已經拿去買股票的話，家庭銀行月息可以設成 0。</p>
      <div><button className="btn primary" disabled={busy} onClick={save}>儲存</button></div>
    </section>
  );
}

function Advice({ app }: { app: App }) {
  const { members, family, toast, data, sel } = app;
  const kids = members.filter((m) => m.role === "kid");
  const [info, setInfo] = useState<Record<string, any>>({});
  const load = useCallback(async () => {
    const out: Record<string, any> = {};
    const [{ data: ms }, { data: gs }] = await Promise.all([
      supabase.from("months").select("member_id,month,status,star,free_start,alloc"),
      supabase.from("goals").select("member_id,name,price,bonus_given").eq("status", "active"),
    ]);
    const spentRows = await supabase.from("expenses").select("member_id,month,amount").eq("voided", false).gte("month", shiftBack(3));
    await Promise.all(kids.map(async (k) => {
      const [bal] = await rpc("balances", { p_member: k.id });
      out[k.id] = {
        bal,
        months: (ms || []).filter((x) => x.member_id === k.id),
        goal: (gs || []).find((x) => x.member_id === k.id),
        spent: (spentRows.data || []).filter((x) => x.member_id === k.id),
      };
    }));
    setInfo(out);
  }, [members.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  if (!kids.length) return null;
  async function bonus(id: string) {
    const [amt, e] = await rpc<number>("give_bonus", { p_member: id });
    if (e) return toast(e);
    toast(`已發放 ${fmt(amt || 0)}`);
    await load();
    if (sel.id === id) await data.reload();
  }

  return (
    <section className="card">
      <h2>零用金調整建議</h2>
      {kids.map((k) => {
        const d = info[k.id];
        if (!d) return <div className="sug" key={k.id}><b>{k.name}</b><span className="small muted">載入中…</span></div>;
        const closed = d.months.filter((x: any) => x.status === "closed").sort((a: any, b: any) => (a.month < b.month ? -1 : 1));
        const tips: string[] = [];
        const last3 = closed.slice(-3);
        if (last3.length === 3 && last3.every((x: any) => x.star)) tips.push("連續 3 個月完成規劃和檢討，可以考慮調高零用金，當作對紀律的肯定。");
        const last2 = closed.slice(-2);
        const spentOf = (mk: string) => d.spent.filter((x: any) => x.month === mk).reduce((s: number, x: any) => s + x.amount, 0);
        if (last2.length === 2 && last2.every((x: any) => x.free_start && spentOf(x.month) >= x.free_start * 0.95))
          tips.push("自由罐連續兩個月幾乎花光。可以一起看看「想要」的花費，再評估是否多給一些。");
        const cur = d.months.find((x: any) => x.month === curMonth());
        if (!cur) tips.push("這個月還沒做月初規劃。");
        const g = d.goal;
        if (g) {
          const per = cur?.alloc?.dream || 0;
          const rem = g.price - (d.bal?.dream || 0);
          if (per > 0 && rem > 0 && Math.ceil(rem / per) > 12) tips.push(`夢想「${g.name}」照目前存法要 ${Math.ceil(rem / per)} 個月。可以聊聊打工、做家事賺額外收入，或調整夢想。`);
        }
        if (!tips.length) tips.push(closed.length ? "目前狀況穩定，持續觀察。" : "還沒有結算過的月份，月底完成第一次檢討後會出現建議。");
        return (
          <div className="sug" key={k.id}>
            <div className="card-h"><span className="row"><Avatar m={k} /><b>{k.name}</b></span><span className="small muted num">每月 {fmt(k.allowance)}</span></div>
            <Stars months={d.months} />
            {d.bal && <div className="small muted num">自由 {fmt(d.bal.free)} · 夢想 {fmt(d.bal.dream)} · 長期 {fmt(d.bal.long)}</div>}
            {tips.map((t, i) => <p className="small" key={i}>{t}</p>)}
          </div>
        );
      })}
    </section>
  );
}

function shiftBack(n: number) {
  const [y, m] = curMonth().split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function Reward({ app }: { app: App }) {
  const { members, sel, toast, data } = app;
  const [who, setWho] = useState(sel.id);
  const [jar, setJar] = useState("long");
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function give() {
    setBusy(true);
    const [, e] = await rpc("give_reward", { p_member: who, p_jar: jar, p_amount: Math.round(+amt), p_note: note });
    setBusy(false);
    if (e) return toast(e);
    toast(`已放進${members.find((m) => m.id === who)?.name}的${JN[jar]}`);
    setAmt("");
    setNote("");
    if (who === sel.id) await data.reload();
  }
  return (
    <section className="card">
      <h2>加一筆獎勵或紅包</h2>
      <div className="grid2">
        <label className="f">給誰<select id="r-who" value={who} onChange={(e) => setWho(e.target.value)}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="f">放進哪個罐子<select id="r-jar" value={jar} onChange={(e) => setJar(e.target.value)}><option value="free">自由罐</option><option value="dream">夢想罐</option><option value="long">長期罐</option></select></label>
        <label className="f">金額<input id="r-amt" type="number" inputMode="numeric" min={1} placeholder="500" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
        <label className="f">原因<input id="r-note" maxLength={40} placeholder="例如：段考進步獎勵" value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <div><button className="btn primary" disabled={busy} onClick={give}>放進罐子</button></div>
    </section>
  );
}

function MembersCard({ app }: { app: App }) {
  const { members } = app;
  return (
    <section className="card">
      <h2>家人</h2>
      {members.map((m) => <MemberRow key={m.id} app={app} m={m} />)}
      <p className="note">零用金調整會從下一次月初規劃開始生效。</p>
    </section>
  );
}

function MemberRow({ app, m }: { app: App; m: any }) {
  const { me, toast, reloadBase } = app;
  const [name, setName] = useState(m.name);
  const [role, setRole] = useState(m.role);
  const [allow, setAllow] = useState(String(m.allowance));
  const [theme, setTheme] = useState(m.theme || "morandi");
  const [pin, setPin] = useState("");
  const [open, setOpen] = useState(false);
  const dirty = name !== m.name || role !== m.role || +allow !== m.allowance || theme !== (m.theme || "morandi");

  async function save() {
    const [, e] = await rpc("update_member", { p_id: m.id, p_name: name, p_role: role, p_allowance: Math.round(+allow) || 0, p_color: m.color });
    if (e) return toast(e);
    if (theme !== (m.theme || "morandi")) {
      const [, e2] = await rpc("set_theme", { p_member: m.id, p_theme: theme });
      if (e2) return toast(e2);
    }
    toast("已更新");
    await reloadBase();
  }
  async function setNewPin() {
    const [, e] = await rpc("set_member_pin", { p_member: m.id, p_pin: pin });
    if (e) return toast(e);
    toast(`已設定 ${m.name} 的密碼`);
    setPin("");
  }
  async function remove() {
    const [, e] = await rpc("remove_member", { p_id: m.id });
    if (e) return toast(e);
    toast(`已移除 ${m.name}`);
    await reloadBase();
  }

  return (
    <div className="sug">
      <button className="row" style={{ border: 0, background: "transparent", padding: 0, justifyContent: "space-between", width: "100%" }} onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="row"><Avatar m={{ name, theme }} /><b>{m.name}</b><span className="small muted">{m.role === "parent" ? "家長" : "孩子"} · 每月 {fmt(m.allowance)}</span></span>
        <span className="muted">{open ? "收起" : "編輯"}</span>
      </button>
      {open && (
        <>
          <div className="grid2">
            <label className="f">名字<input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} /></label>
            <label className="f">身分<select value={role} disabled={m.is_owner} onChange={(e) => setRole(e.target.value)}><option value="kid">孩子</option><option value="parent">家長</option></select></label>
            <label className="f">每月零用金<input type="number" inputMode="numeric" min={0} value={allow} onChange={(e) => setAllow(e.target.value)} /></label>
            <label className="f">畫面主題<select value={theme} onChange={(e) => setTheme(e.target.value)}>{(Object.keys(SKINS) as SkinKey[]).map((k) => <option key={k} value={k}>{SKINS[k].name}</option>)}</select></label>
          </div>
          <div><button className="btn primary sm" disabled={!dirty} onClick={save}>儲存變更</button></div>
          <div className="grid2" style={{ alignItems: "end" }}>
            <label className="f">{m.id === me.id ? "我的" : `${m.name} 的`}登入密碼（{m.role === "parent" ? "6–8" : "4–8"} 位數字）<input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></label>
            <button className="btn sm" disabled={pin.length < 4} onClick={setNewPin}>設定密碼</button>
          </div>
          {m.id !== me.id && !m.is_owner && (
            <Confirm label={`移除 ${m.name}`} confirmLabel={`確定移除 ${m.name}`} className="btn danger sm" danger onConfirm={remove} />
          )}
        </>
      )}
    </div>
  );
}

function AddMember({ app }: { app: App }) {
  const { toast, reloadBase } = app;
  const [name, setName] = useState("");
  const [role, setRole] = useState("kid");
  const [allow, setAllow] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    const [, e] = await fn("members", { name, role, allowance: Math.round(+allow) || 0, color: "sky", pin });
    setBusy(false);
    if (e) return toast(e);
    toast(`已新增 ${name}，請把家庭代碼和密碼告訴他`);
    setName("");
    setAllow("");
    setPin("");
    await reloadBase();
  }
  return (
    <section className="card">
      <h2>新增家人</h2>
      <div className="grid2">
        <label className="f">名字<input id="n-name" maxLength={20} placeholder="例如：爸爸、哥哥" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="f">身分<select id="n-role" value={role} onChange={(e) => setRole(e.target.value)}><option value="kid">孩子</option><option value="parent">家長（看得到全家）</option></select></label>
        <label className="f">每月零用金<input id="n-allow" type="number" inputMode="numeric" min={0} placeholder="1500" value={allow} onChange={(e) => setAllow(e.target.value)} /></label>
      </div>
      <label className="f">登入密碼（{role === "parent" ? "家長 6–8" : "孩子 4–8"} 位數字）<input id="n-pin" type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></label>
      <div><button className="btn primary" disabled={busy || !name.trim() || pin.length < (role === "parent" ? 6 : 4)} onClick={add}>{busy ? "新增中…" : "新增"}</button></div>
      <p className="note">孩子只看得到自己的罐子和紀錄；家長看得到全家。</p>
    </section>
  );
}
