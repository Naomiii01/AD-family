"use client";
import { useCallback, useEffect, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import { CATS, fmt, num, clamp, curMonth, split, defRatio, mkLabel, shortDate, matchOf, gd, jarList, jarName, spendable } from "@/lib/util";
import { MonthNav } from "./ui";
import { WeekCard } from "./Weeks";

const SL: Record<string, string> = { plan: "月初規劃中", active: "進行中", closed: "已結算" };

export function useExpenses(memberId: string, mk: string) {
  const [list, setList] = useState<any[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("expenses").select("id,item,amount,type,category,source,spent_on,created_at,jar")
      .eq("member_id", memberId).eq("month", mk).eq("voided", false).order("created_at", { ascending: false });
    setList(data || []);
  }, [memberId, mk]);
  useEffect(() => { load(); }, [load]);
  return { list, reload: load };
}

export default function Month({ app }: { app: App }) {
  const { data, sel, mk, setMk } = app;
  const mo = data.months.find((x) => x.month === mk);
  const status = mo ? mo.status : "plan";
  return (
    <>
      <MonthNav mk={mk} setMk={setMk} />
      <div><span className={`pill ${status}`}>{SL[status]}</span></div>
      {!mo ? (mk < curMonth() ? <section className="card"><p className="muted">{mkLabel(mk)} 沒有規劃紀錄。</p></section> : <Plan app={app} />) : <Active app={app} mo={mo} />}
    </>
  );
}

function Plan({ app }: { app: App }) {
  const { data, sel, mk, toast } = app;
  const last = [...data.months].reverse()[0];
  const jars = jarList(sel);
  const others = jars.filter((j) => j.key !== "free").map((j) => j.key);
  const isAdult = sel.role === "parent";
  const isKid = !isAdult;
  const [extra, setExtra] = useState("");
  const [salary, setSalary] = useState(String(sel.allowance || ""));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [adv, setAdv] = useState(0);
  useEffect(() => {
    supabase.from("advances").select("amount,repay_month,repaid").eq("member_id", sel.id).eq("repaid", false)
      .then(({ data: rows }: any) => setAdv((rows || []).filter((x: any) => x.repay_month <= mk).reduce((t: number, x: any) => t + x.amount, 0)));
  }, [sel.id, mk]);
  const base = isAdult ? Math.max(0, Math.round(+salary) || 0) : Math.max(0, sel.allowance - adv);
  const total = base + (Math.max(0, Math.round(+extra)) || 0);

  // amounts per jar (NT$); free takes whatever is left
  const [amt, setAmt] = useState<Record<string, string>>(() => {
    const start = split(isAdult ? sel.allowance || 0 : sel.allowance, startRatio(sel, last?.ratio));
    const o: Record<string, string> = {};
    for (const k of others) o[k] = String(last?.alloc?.[k] ?? start[k] ?? 0);
    return o;
  });
  const a: Record<string, number> = {};
  let used = 0;
  for (const k of others) { a[k] = Math.max(0, Math.round(+amt[k]) || 0); used += a[k]; }
  a.free = total - used;
  const over = a.free < 0;
  const pct = (k: string) => (total > 0 ? Math.round((Math.max(0, a[k]) * 100) / total) : 0);
  const setFrom = (r: Record<string, number>) => {
    const sp = split(total, r);
    setAmt(Object.fromEntries(others.map((k) => [k, String(sp[k] || 0)])));
  };

  const g = data.goal;
  const openPrev = data.months.find((x) => x.status === "active" && x.month < mk);
  const minLong = isKid ? Math.min(app.family.long_min, total) : 0;
  const lowLong = a.long < minLong;
  const match = matchOf(app.family, sel.role, a.long);

  async function confirm() {
    setBusy(true);
    const [, e] = await rpc("plan_month_amt", {
      p_member: sel.id, p_month: mk, p_income: isAdult ? base : null, p_extra: Math.max(0, Math.round(+extra)) || 0, p_extra_note: note,
      p_amounts: Object.fromEntries(others.map((k) => [k, a[k]])),
    });
    setBusy(false);
    if (e) return toast(e);
    toast("已放進罐子");
    await data.reload();
  }

  let insight = null;
  if (g && g.price > data.bal.dream && !over) {
    const rem = g.price - data.bal.dream;
    const n = a.dream > 0 ? Math.ceil(rem / a.dream) : Infinity;
    const move = Math.min(a.free, Math.round(total * 0.1 / 100) * 100);
    const n2 = a.dream + move > 0 ? Math.ceil(rem / (a.dream + move)) : Infinity;
    insight = (
      <div className="insight">
        照這個分配，「{g.name}」{n === Infinity ? "不會前進，夢想罐是 0 元。" : <>還要 <b>{n} 個月</b>。</>}
        {move > 0 && n2 < n && <><br /><span className="small">如果從自由罐多挪 {fmt(move)} 給夢想，只要 {n2} 個月。少花一點，夢想就近一點。</span></>}
      </div>
    );
  }

  const hint = (k: string) =>
    k === "free" ? "剩下的錢自動放這裡" : k === "dream" ? "為夢想存" : k === "long" ? (isKid ? `每月至少 ${fmt(app.family.long_min)}，定期買股票` : "只進不出，定期投資")
      : k === "fixed" ? "房租、保險、電話費" : k === "reserve" ? "突發狀況用" : "";
  const row = (k: string) => (
    <div className="arow" key={k}>
      <span className="dot" style={{ background: `var(--${k})` }} />
      <div style={{ minWidth: 0 }}>
        <div className="nm">{jarName(sel, k)} <span className="pct small muted" style={{ fontWeight: 500 }}>{pct(k)}%</span></div>
        <div className="small muted">{hint(k)}</div>
      </div>
      {k === "free" ? (
        <span className="amt" style={{ color: over ? "var(--warn)" : undefined }}>{fmt(a.free)}</span>
      ) : (
        <label className="amt-in">
          <span className="small muted">NT$</span>
          <input id={`amt-${k}`} type="number" inputMode="numeric" min={0} step={100} aria-label={`${jarName(sel, k)}金額`}
            value={amt[k]} onChange={(e) => setAmt({ ...amt, [k]: e.target.value })} onFocus={(e) => e.target.select()} />
        </label>
      )}
    </div>
  );

  return (
    <>
      <section className="card">
        <h3>1. 這個月有多少錢</h3>
        {isAdult ? (
          <label className="f">這個月的薪資收入<input id="p-salary" type="number" inputMode="numeric" min={0} placeholder="例如 45000" value={salary} onChange={(e) => setSalary(e.target.value)} /></label>
        ) : (
          <div className="kv"><span>零用金（{gd(app.family)}設定）</span><b>{fmt(sel.allowance)}</b></div>
        )}
        {!isAdult && adv > 0 && <div className="kv"><span>扣回上次預支</span><b style={{ color: "var(--warn)" }}>−{fmt(adv)}</b></div>}
        <div className="grid2">
          <label className="f">{isAdult ? "其他收入" : "額外收入"}<input id="p-ext" type="number" inputMode="numeric" min={0} placeholder="0" value={extra} onChange={(e) => setExtra(e.target.value)} /></label>
          <label className="f">來源<input id="p-note" maxLength={40} placeholder={isAdult ? "獎金、兼職、利息" : "紅包、打工、獎學金"} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </div>
        <div className="kv"><span className="muted">本月總共</span><b>{fmt(total)}</b></div>
      </section>
      <section className="card">
        <h3>2. 每個罐子放多少錢</h3>
        <p className="small muted">直接填金額，百分比會自動算好；沒分出去的錢都放進自由罐。</p>
        <div className="alloc">{jars.map((j) => row(j.key))}</div>
        {over && <div className="banner warn"><span>分配的錢比這個月的收入多了 {fmt(-a.free)}，請把其他罐子減少一點。</span></div>}
        {app.isParent && (
          <div><button className="btn sm" onClick={() => app.go("more", "jars")}>＋ 新增或移除罐子</button></div>
        )}
        {jars.length === 3 && <div className="row">
          <span className="small muted">快速選：</span>
          <button className="btn sm" onClick={() => setFrom({ free: 50, dream: 30, long: 20 })}>均衡 5:3:2</button>
          <button className="btn sm" onClick={() => setFrom({ free: 30, dream: 50, long: 20 })}>衝夢想 3:5:2</button>
          <button className="btn sm" onClick={() => setFrom({ free: 40, dream: 20, long: 40 })}>長期派 4:2:4</button>
        </div>}
        {isKid && (
          lowLong ? (
            <div className="banner warn">
              <span>長期罐每月至少要放 {fmt(minLong)}，現在只有 {fmt(a.long)}。</span>
              <div><button className="btn sm primary" onClick={() => setAmt({ ...amt, long: String(minLong) })}>改成 {fmt(minLong)}</button></div>
            </div>
          ) : (
            <div className="sug">
              <div className="kv small"><span>你放進長期罐</span><b>{fmt(a.long)}</b></div>
              <div className="kv small"><span>{gd(app.family)}配對 {app.family.match_pct}%</span><b style={{ color: "var(--long)" }}>+{fmt(match)}</b></div>
              <div className="kv"><span>這個月一起投資</span><b>{fmt(a.long + match)}</b></div>
              <p className="note">長期罐放越多，{gd(app.family)}配對越多。</p>
            </div>
          )
        )}
        {insight}
      </section>
      {openPrev && (
        <div className="banner warn">
          <span>{mkLabel(openPrev.month)} 還沒結算。先完成上個月的檢討和結算，再開始這個月。</span>
          <div><button className="btn sm primary" onClick={() => { app.setMk(openPrev.month); app.go("review"); }}>去結算 {mkLabel(openPrev.month)}</button></div>
        </div>
      )}
      <button className="btn primary big" disabled={busy || total <= 0 || !!openPrev || lowLong || over} onClick={confirm}>確認本月規劃，放進罐子</button>
      <p className="note center">確認後錢會放進罐子，這個月的分配就不能再改。</p>
      {!isAdult && sel.allowance === 0 && <p className="note center">零用金目前是 0 元，請家長到「更多 → 家長設定」設定金額。</p>}
    </>
  );
}

function Active({ app, mo }: { app: App; mo: any }) {
  const { data, sel, mk, toast } = app;
  const ex = useExpenses(sel.id, mk);
  const [item, setItem] = useState("");
  const [amt, setAmt] = useState("");
  const [type, setType] = useState<"need" | "want">("want");
  const [cat, setCat] = useState("飲料點心");
  const [payJar, setPayJar] = useState("free");
  const [busy, setBusy] = useState(false);
  const isCur = mk === curMonth();
  const sp = ex.list.reduce((s, e) => s + e.amount, 0);
  const spFree = ex.list.filter((e) => (e.jar || "free") === "free").reduce((s, e) => s + e.amount, 0);
  const pct = mo.free_start ? clamp(spFree / mo.free_start, 0, 1) : 0;
  const payJars = spendable(sel);
  const shown = [...jarList(sel).map((j) => j.key).filter((k) => mo.alloc[k] !== undefined),
    ...Object.keys(mo.alloc).filter((k) => !["match", "advance", "bonus", "weeks_ok"].includes(k) && !jarList(sel).some((j) => j.key === k))];

  async function add() {
    setBusy(true);
    const [, e] = await rpc("add_expense_v2", { p_member: sel.id, p_item: item, p_amount: Math.round(+amt), p_type: type, p_category: cat, p_jar: payJar });
    setBusy(false);
    if (e) return toast(e);
    toast("記下來了");
    setItem("");
    setAmt("");
    await Promise.all([ex.reload(), data.reload()]);
  }
  async function del(id: string) {
    const [, e] = await rpc("delete_expense", { p_id: id });
    if (e) return toast(e);
    toast("已刪除，錢退回原本的罐子");
    await Promise.all([ex.reload(), data.reload()]);
  }

  return (
    <>
      <section className="card">
        <div className="grid3">
          {shown.map((k) => (
            <div key={k}>
              <div className="small" style={{ color: `var(--${k})`, fontWeight: 700 }}>{jarName(sel, k)}</div>
              <div className="num" style={{ fontWeight: 700 }}>{fmt(mo.alloc[k])}</div>
              <div className="note">{mo.ratio?.[k] ?? 0}%</div>
            </div>
          ))}
        </div>
        {mo.alloc.advance > 0 && <p className="note">這個月零用金已先扣回預支 {fmt(mo.alloc.advance)}。</p>}
        {mo.alloc.match > 0 && <p className="small">{gd(app.family)}配對投資 <b style={{ color: "var(--long)" }}>+{fmt(mo.alloc.match)}</b>，這個月長期罐一共投資 {fmt(mo.alloc.long + mo.alloc.match)}。</p>}
        {mo.extra > 0 && <p className="note">含額外收入 {fmt(mo.extra)}{mo.extra_note ? `（${mo.extra_note}）` : ""}</p>}
      </section>

      {mo.status === "active" && isCur && (
        <section className="card">
          <div className="card-h"><span className="muted">自由罐還有</span><span className="small muted">本月可用 {fmt(mo.free_start)}</span></div>
          <div className="big-n">{fmt(data.bal.free)}</div>
          <div className="bar"><span style={{ width: `${pct * 100}%`, background: pct > 0.85 ? "var(--warn)" : "var(--free)" }} /></div>
          {payJars.length > 1 && (
            <div className="row small muted" style={{ gap: 12 }}>
              {payJars.filter((j) => j.key !== "free").map((j) => <span key={j.key}>{j.name} <b className="num" style={{ color: "var(--ink)" }}>{fmt(data.bal.extras?.[j.key] || 0)}</b></span>)}
            </div>
          )}
          <h3 style={{ marginTop: 6 }}>記一筆花費</h3>
          {payJars.length > 1 && (
            <div className="seg" role="group" aria-label="從哪個罐子付">
              {payJars.map((j) => <button key={j.key} className={payJar === j.key ? "on" : ""} onClick={() => setPayJar(j.key)}>{j.name}</button>)}
            </div>
          )}
          <div className="grid2">
            <label className="f">買了什麼<input id="e-item" maxLength={40} placeholder="例如：手搖飲" value={item} onChange={(e) => setItem(e.target.value)} /></label>
            <label className="f">多少錢<input id="e-amt" type="number" inputMode="numeric" min={1} placeholder="60" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
          </div>
          <div className="chips" role="group" aria-label="類別">
            {CATS.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div className="seg" role="group" aria-label="需要或想要">
            <button className={type === "need" ? "on" : ""} onClick={() => setType("need")}>需要（非買不可）</button>
            <button className={type === "want" ? "on" : ""} onClick={() => setType("want")}>想要（可以不買）</button>
          </div>
          <button className="btn primary" disabled={busy} onClick={add}>記下來</button>
        </section>
      )}
      {mo.status === "active" && isCur && <WeekCard key={ex.list.length} app={app} mk={mk} />}
      {mo.status === "active" && !isCur && (
        <div className="banner warn">
          <span>{mkLabel(mk)} 還沒結算。月份已經過了，請到「檢討」完成結算，才能開始新的月份。</span>
          <div><button className="btn sm primary" onClick={() => app.go("review")}>去結算</button></div>
        </div>
      )}

      <section className="card">
        <div className="card-h"><h3>本月花費</h3><span className="num muted">共 {fmt(sp)}</span></div>
        {ex.list.length ? (
          <div className="list">
            {ex.list.map((e) => (
              <div className="li" key={e.id}>
                <span className="d">{shortDate(e.created_at)}</span>
                <span className="t">{e.item} <span className={`tag ${e.type}`}>{e.type === "need" ? "需要" : "想要"}</span> <span className="note">{e.category}</span>{e.source === "shortcut" && <> <span className="tag shortcut">捷徑</span></>}{e.jar && e.jar !== "free" && <> <span className="tag" style={{ background: `color-mix(in srgb, var(--${e.jar}) 25%, var(--surface))` }}>{jarName(sel, e.jar)}</span></>}</span>
                <b className="num">{num(e.amount)}</b>
                {mo.status === "active" ? <button className="x" onClick={() => del(e.id)} aria-label={`刪除 ${e.item}`}>×</button> : <span />}
              </div>
            ))}
          </div>
        ) : <div className="empty">還沒有花費紀錄</div>}
      </section>
      {mo.status === "active" && <button className="btn big" onClick={() => app.go("review")}>月底了，去做檢討 →</button>}
    </>
  );
}

/** Starting ratio: last month's split, adjusted for jars added or removed since. */
function startRatio(sel: any, last?: Record<string, number>): Record<string, number> {
  const keys = jarList(sel).map((j) => j.key);
  let base: Record<string, number>;
  if (last) base = { ...last };
  else if (sel.role !== "kid" && keys.includes("fixed") && keys.includes("reserve")) base = { free: 20, dream: 10, long: 20, fixed: 40, reserve: 10 };
  else base = { ...defRatio(sel.role) };
  const out: Record<string, number> = {};
  let used = 0;
  for (const k of keys) { if (k !== "free") { out[k] = Math.max(0, base[k] || 0); used += out[k]; } }
  if (used > 100) { for (const k of keys) if (k !== "free") out[k] = 0; used = 0; out.dream = 30; out.long = 30; used = 60; }
  out.free = 100 - used;
  return out;
}
