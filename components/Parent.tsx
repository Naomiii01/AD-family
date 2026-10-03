"use client";
import { useCallback, useEffect, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc, fn } from "@/lib/supabase";
import { JN, fmt, curMonth, gd } from "@/lib/util";
import { SKINS, SkinKey } from "@/lib/themes";
import { Avatar, Confirm, copyText, Stars } from "./ui";

export default function Parent({ app }: { app: App }) {
  return (
    <>
      <FamilyCard app={app} />
      <Advice app={app} />
      <Reward app={app} />
      <Penalty app={app} />
      <Advance app={app} />
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
  const [guard, setGuard] = useState(gd(family));
  const [sdays, setSdays] = useState(String(family.star_days ?? 4));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const [, e] = await rpc("update_family", { p_name: name, p_rate: +rate, p_bonus: Math.round(+bonus) });
    if (e) { setBusy(false); return toast(e); }
    const [, e2] = await rpc("update_family_rules", { p_bonus_step: Math.round(+step), p_bonus_pct: Math.round(+bonus), p_long_min: Math.round(+lmin), p_match_pct: Math.round(+mpct), p_match_cap: Math.round(+mcap) || 0 });
    if (e2) { setBusy(false); return toast(e2); }
    const [, e3] = await rpc("set_guardian", { p_label: guard });
    if (e3) { setBusy(false); return toast(e3); }
    const [, e4] = await rpc("set_star_days", { p_days: Math.round(+sdays) });
    setBusy(false);
    if (e4) return toast(e4);
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
      <h3>孩子怎麼稱呼負責的家長</h3>
      <div className="chips">
        {["爸爸", "媽媽", "爸媽", "家長"].map((x) => <button key={x} className={`chip ${guard === x ? "on" : ""}`} onClick={() => setGuard(x)}>{x}</button>)}
      </div>
      <label className="f">或自己輸入（例如：阿嬤、Ad）<input id="f-guard" maxLength={10} value={guard} onChange={(e) => setGuard(e.target.value)} /></label>
      <p className="note">App 裡的加碼、配對、理財約定和檢討提醒，都會用這個稱呼。</p>
      <h3>星星條件</h3>
      <label className="f">每週至少記帳幾天（0 = 不要求）<input id="f-sdays" type="number" inputMode="numeric" min={0} max={7} value={sdays} onChange={(e) => setSdays(e.target.value)} /></label>
      <p className="note">月底結算時，每週都達成，而且回答了檢討問題，才拿得到星星。</p>
      <h3>夢想罐闖關加碼</h3>
      <div className="grid2">
        <label className="f">每存滿多少錢（元）<input id="f-step" type="number" inputMode="numeric" min={100} value={step} onChange={(e) => setStep(e.target.value)} /></label>
        <label className="f">加碼比例（%）<input id="f-bonus" type="number" inputMode="numeric" min={0} max={50} value={bonus} onChange={(e) => setBonus(e.target.value)} /></label>
      </div>
      <p className="note">例：每存滿 {fmt(+step || 0)} 加碼 {+bonus || 0}%，每闖過一關拿 {fmt(((+step || 0) * (+bonus || 0)) / 100)}。月底結算時自動發放；花掉後重新算。</p>
      <h3>長期罐配對投資</h3>
      <div className="grid2">
        <label className="f">孩子每月最少（元）<input id="f-lmin" type="number" inputMode="numeric" min={0} value={lmin} onChange={(e) => setLmin(e.target.value)} /></label>
        <label className="f">{gd(family)}配對（%）<input id="f-mpct" type="number" inputMode="numeric" min={0} max={300} value={mpct} onChange={(e) => setMpct(e.target.value)} /></label>
        <label className="f">每月配對上限（0 = 不設上限）<input id="f-mcap" type="number" inputMode="numeric" min={0} value={mcap} onChange={(e) => setMcap(e.target.value)} /></label>
        <label className="f">家庭銀行月息（%）<input id="f-rate" type="number" inputMode="decimal" min={0} max={10} step={0.5} value={rate} onChange={(e) => setRate(e.target.value)} /></label>
      </div>
      <p className="note">配對 100% 代表孩子放多少、{gd(family)}就加多少。長期罐已經拿去買股票的話，家庭銀行月息可以設成 0。</p>
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
        <label className="f">名字<input id="n-name" maxLength={20} placeholder="例如：家人的名字" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="f">身分<select id="n-role" value={role} onChange={(e) => setRole(e.target.value)}><option value="kid">孩子</option><option value="parent">家長（看得到全家）</option></select></label>
        <label className="f">每月零用金<input id="n-allow" type="number" inputMode="numeric" min={0} placeholder="1500" value={allow} onChange={(e) => setAllow(e.target.value)} /></label>
      </div>
      <label className="f">登入密碼（{role === "parent" ? "家長 6–8" : "孩子 4–8"} 位數字）<input id="n-pin" type="password" inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} /></label>
      <div><button className="btn primary" disabled={busy || !name.trim() || pin.length < (role === "parent" ? 6 : 4)} onClick={add}>{busy ? "新增中…" : "新增"}</button></div>
      <p className="note">孩子只看得到自己的罐子和紀錄；家長看得到全家。</p>
    </section>
  );
}

function Penalty({ app }: { app: App }) {
  const { members, sel, toast, data } = app;
  const kids = members.filter((m) => m.role === "kid");
  const [who, setWho] = useState(kids.find((k) => k.id === sel.id)?.id || kids[0]?.id || "");
  const [jar, setJar] = useState("free");
  const [amt, setAmt] = useState("");
  const [reason, setReason] = useState("");
  const [list, setList] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data: rows } = await supabase.from("penalties").select("id,member_id,jar,amount,reason,created_at,refunded_at").order("created_at", { ascending: false }).limit(20);
    setList(rows || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!kids.length) return null;
  async function give() {
    setBusy(true);
    const [, e] = await rpc("give_penalty", { p_member: who, p_jar: jar, p_amount: Math.round(+amt), p_reason: reason });
    setBusy(false);
    if (e) return toast(e);
    toast("已扣款");
    setAmt(""); setReason("");
    await load();
    if (who === sel.id) await data.reload();
  }
  async function refund(p: any) {
    const [, e] = await rpc("refund_penalty", { p_id: p.id });
    if (e) return toast(e);
    toast("已退還");
    await load();
    if (p.member_id === sel.id) await data.reload();
  }
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || "";
  return (
    <section className="card">
      <h2>扣款</h2>
      <p className="small muted">依理財約定扣款，例如學校記警告。之後撤銷了，可以在下面按「退還」把錢還回去。</p>
      <div className="grid2">
        <label className="f">誰<select id="p-who" value={who} onChange={(e) => setWho(e.target.value)}>{kids.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="f">從哪個罐子扣<select id="p-jar" value={jar} onChange={(e) => setJar(e.target.value)}><option value="free">自由罐</option><option value="dream">夢想罐</option></select></label>
        <label className="f">金額<input id="p-amt" type="number" inputMode="numeric" min={1} placeholder="300" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
        <label className="f">原因<input id="p-reason" maxLength={40} placeholder="例如：學校警告一支" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      </div>
      <div><Confirm label="扣款" confirmLabel={`確定從${nameOf(who)}的${JN[jar]}扣 ${fmt(+amt || 0)}`} className="btn danger" danger disabled={busy || !(+amt > 0) || !reason.trim()} onConfirm={give} /></div>
      <p className="note">自由罐不夠扣時會變成負數，下個月放零用金時會先補回來。</p>
      {list.length > 0 && (
        <div className="list">
          {list.map((p) => (
            <div className="li" key={p.id} style={{ gridTemplateColumns: "1fr auto auto" }}>
              <span className="t">{nameOf(p.member_id)} · {p.reason}<br /><span className="d">{JN[p.jar]} · {new Date(p.created_at).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}{p.refunded_at ? " · 已退還" : ""}</span></span>
              <b className="num" style={{ color: p.refunded_at ? "var(--muted)" : "var(--warn)", textDecoration: p.refunded_at ? "line-through" : "none" }}>−{fmt(p.amount)}</b>
              {p.refunded_at ? <span /> : <Confirm label="退還" confirmLabel="確定退還" className="btn sm" onConfirm={() => refund(p)} />}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Advance({ app }: { app: App }) {
  const { members, sel, toast, data } = app;
  const kids = members.filter((m) => m.role === "kid");
  const [who, setWho] = useState(kids.find((k) => k.id === sel.id)?.id || kids[0]?.id || "");
  const [amt, setAmt] = useState("");
  const [list, setList] = useState<any[]>([]);
  const load = useCallback(async () => {
    const { data: rows } = await supabase.from("advances").select("id,member_id,amount,quarter,repay_month,repaid,created_at").order("created_at", { ascending: false }).limit(12);
    setList(rows || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!kids.length) return null;
  async function give() {
    const [, e] = await rpc("give_advance", { p_member: who, p_amount: Math.round(+amt) });
    if (e) return toast(e);
    toast("已預支，放進自由罐");
    setAmt("");
    await load();
    if (who === sel.id) await data.reload();
  }
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name || "";
  const kid = members.find((m) => m.id === who);
  return (
    <section className="card">
      <h2>預支零用金</h2>
      <p className="small muted">每人每季可以預支一次，最多一個月的零用金。錢會先放進自由罐，下個月月初規劃時自動從零用金扣回。</p>
      <div className="grid2">
        <label className="f">誰<select id="a-who" value={who} onChange={(e) => setWho(e.target.value)}>{kids.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="f">金額（最多 {fmt(kid?.allowance || 0)}）<input id="a-amt" type="number" inputMode="numeric" min={1} value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
      </div>
      <div><Confirm label="預支" confirmLabel={`確定預支 ${fmt(+amt || 0)} 給${nameOf(who)}`} className="btn primary" disabled={!(+amt > 0)} onConfirm={give} /></div>
      {list.length > 0 && (
        <div className="list">
          {list.map((a) => (
            <div className="kv small" key={a.id} style={{ padding: "6px 0" }}>
              <span>{nameOf(a.member_id)} · {a.quarter.replace("-Q", " 年第 ")} 季</span>
              <b>{fmt(a.amount)} · {a.repaid ? "已扣回" : `${+a.repay_month.slice(5)} 月扣回`}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
