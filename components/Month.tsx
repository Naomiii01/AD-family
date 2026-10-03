"use client";
import { useCallback, useEffect, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import { CATS, JARS, JN, fmt, num, clamp, curMonth, split, defRatio, mkLabel, shortDate, matchOf } from "@/lib/util";
import { MonthNav } from "./ui";

const SL: Record<string, string> = { plan: "月初規劃中", active: "進行中", closed: "已結算" };

export function useExpenses(memberId: string, mk: string) {
  const [list, setList] = useState<any[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("expenses").select("id,item,amount,type,category,source,spent_on,created_at")
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
  const [r, setR] = useState(last?.ratio || defRatio(sel.role));
  const [extra, setExtra] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const total = sel.allowance + (Math.max(0, Math.round(+extra)) || 0);
  const a = split(total, r);
  const g = data.goal;
  const openPrev = data.months.find((x) => x.status === "active" && x.month < mk);
  const isKid = sel.role === "kid";
  const minLong = isKid ? Math.min(app.family.long_min, total) : 0;
  const lowLong = a.long < minLong;
  const match = matchOf(app.family, sel.role, a.long);
  const fixLong = () => {
    setR((x) => {
      const y = { ...x };
      while (split(total, y).long < minLong && (y.free >= 5 || y.dream >= 5)) {
        if (y.free >= 5) y.free -= 5; else y.dream -= 5;
        y.long += 5;
      }
      return y;
    });
  };

  const bump = (k: "dream" | "long", d: number) => {
    setR((x) => {
      const y = { ...x };
      if (d > 0 && y.free >= 5) { y[k] += 5; y.free -= 5; }
      if (d < 0 && y[k] >= 5) { y[k] -= 5; y.free += 5; }
      return y;
    });
  };

  async function confirm() {
    setBusy(true);
    const [, e] = await rpc("plan_month", {
      p_member: sel.id, p_month: mk, p_extra: Math.max(0, Math.round(+extra)) || 0, p_extra_note: note,
      p_free: r.free, p_dream: r.dream, p_long: r.long,
    });
    setBusy(false);
    if (e) return toast(e);
    toast("已放進三個罐子");
    await data.reload();
  }

  let insight = null;
  if (g && g.price > data.bal.dream) {
    const rem = g.price - data.bal.dream;
    const n = a.dream > 0 ? Math.ceil(rem / a.dream) : Infinity;
    const move = Math.min(10, r.free);
    const more = split(total, { free: r.free - move, dream: r.dream + move, long: r.long }).dream;
    const n2 = more > 0 ? Math.ceil(rem / more) : Infinity;
    insight = (
      <div className="insight">
        照這個分配，「{g.name}」{n === Infinity ? "不會前進，夢想罐是 0%。" : <>還要 <b>{n} 個月</b>。</>}
        {move > 0 && n2 < n && <><br /><span className="small">如果從自由罐多挪 {move}% 給夢想，只要 {n2} 個月。少花一點，夢想就近一點。</span></>}
      </div>
    );
  }

  const row = (k: "free" | "dream" | "long") => (
    <div className="arow" key={k}>
      <span className="dot" style={{ background: `var(--${k})` }} />
      <div>
        <div className="nm">{JN[k]}</div>
        <div className="small muted">{k === "free" ? "剩下的都在這裡" : k === "dream" ? "為夢想存" : sel.role === "kid" ? `每月至少 ${fmt(app.family.long_min)}，定期買股票` : "只進不出，定期投資"}</div>
      </div>
      <div style={{ display: "grid", justifyItems: "end", gap: 4 }}>
        {k === "free" ? <span className="pct">{r.free}%</span> : (
          <div className="step">
            <button onClick={() => bump(k, -5)} aria-label={`${JN[k]}減少`} disabled={r[k] < 5}>−</button>
            <span className="pct">{r[k]}%</span>
            <button onClick={() => bump(k, 5)} aria-label={`${JN[k]}增加`} disabled={r.free < 5}>+</button>
          </div>
        )}
        <span className="amt">{fmt(a[k])}</span>
      </div>
    </div>
  );

  return (
    <>
      <section className="card">
        <h3>1. 這個月有多少錢</h3>
        <div className="kv"><span>零用金（家長設定）</span><b>{fmt(sel.allowance)}</b></div>
        <div className="grid2">
          <label className="f">額外收入<input id="p-ext" type="number" inputMode="numeric" min={0} placeholder="0" value={extra} onChange={(e) => setExtra(e.target.value)} /></label>
          <label className="f">來源<input id="p-note" maxLength={40} placeholder="紅包、打工、獎學金" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </div>
        <div className="kv"><span className="muted">本月總共</span><b>{fmt(total)}</b></div>
      </section>
      <section className="card">
        <h3>2. 分配到三個罐子</h3>
        <div className="alloc">{JARS.map(row)}</div>
        <div className="row">
          <span className="small muted">快速選：</span>
          <button className="btn sm" onClick={() => setR({ free: 50, dream: 30, long: 20 })}>均衡 5:3:2</button>
          <button className="btn sm" onClick={() => setR({ free: 30, dream: 50, long: 20 })}>衝夢想 3:5:2</button>
          <button className="btn sm" onClick={() => setR({ free: 40, dream: 20, long: 40 })}>長期派 4:2:4</button>
        </div>
        {isKid && (
          lowLong ? (
            <div className="banner warn">
              <span>長期罐每月至少要放 {fmt(minLong)}，現在只有 {fmt(a.long)}。</span>
              <div><button className="btn sm primary" onClick={fixLong}>調到至少 {fmt(minLong)}</button></div>
            </div>
          ) : (
            <div className="sug">
              <div className="kv small"><span>你放進長期罐</span><b>{fmt(a.long)}</b></div>
              <div className="kv small"><span>爸爸配對 {app.family.match_pct}%</span><b style={{ color: "var(--long)" }}>+{fmt(match)}</b></div>
              <div className="kv"><span>這個月一起投資</span><b>{fmt(a.long + match)}</b></div>
              <p className="note">長期罐放越多，爸爸配對越多。</p>
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
      <button className="btn primary big" disabled={busy || total <= 0 || !!openPrev || lowLong} onClick={confirm}>確認本月規劃，放進罐子</button>
      <p className="note center">確認後錢會放進三個罐子，這個月的比例就不能再改。</p>
      {sel.allowance === 0 && <p className="note center">零用金目前是 0 元，請家長到「更多 → 家長設定」設定金額。</p>}
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
  const [busy, setBusy] = useState(false);
  const isCur = mk === curMonth();
  const sp = ex.list.reduce((s, e) => s + e.amount, 0);
  const pct = mo.free_start ? clamp(sp / mo.free_start, 0, 1) : 0;

  async function add() {
    setBusy(true);
    const [, e] = await rpc("add_expense", { p_member: sel.id, p_item: item, p_amount: Math.round(+amt), p_type: type, p_category: cat });
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
    toast("已刪除，錢退回自由罐");
    await Promise.all([ex.reload(), data.reload()]);
  }

  return (
    <>
      <section className="card">
        <div className="grid3">
          {JARS.map((k) => (
            <div key={k}>
              <div className="small" style={{ color: `var(--${k})`, fontWeight: 700 }}>{JN[k]}</div>
              <div className="num" style={{ fontWeight: 700 }}>{fmt(mo.alloc[k])}</div>
              <div className="note">{mo.ratio[k]}%</div>
            </div>
          ))}
        </div>
        {mo.alloc.match > 0 && <p className="small">爸爸配對投資 <b style={{ color: "var(--long)" }}>+{fmt(mo.alloc.match)}</b>，這個月長期罐一共投資 {fmt(mo.alloc.long + mo.alloc.match)}。</p>}
        {mo.extra > 0 && <p className="note">含額外收入 {fmt(mo.extra)}{mo.extra_note ? `（${mo.extra_note}）` : ""}</p>}
      </section>

      {mo.status === "active" && isCur && (
        <section className="card">
          <div className="card-h"><span className="muted">自由罐還有</span><span className="small muted">本月可用 {fmt(mo.free_start)}</span></div>
          <div className="big-n">{fmt(data.bal.free)}</div>
          <div className="bar"><span style={{ width: `${pct * 100}%`, background: pct > 0.85 ? "var(--warn)" : "var(--free)" }} /></div>
          <h3 style={{ marginTop: 6 }}>記一筆花費</h3>
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
                <span className="t">{e.item} <span className={`tag ${e.type}`}>{e.type === "need" ? "需要" : "想要"}</span> <span className="note">{e.category}</span>{e.source === "shortcut" && <> <span className="tag shortcut">捷徑</span></>}</span>
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
