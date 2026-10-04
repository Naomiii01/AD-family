"use client";
import { useEffect, useState } from "react";
import type { App } from "./Shell";
import { rpc } from "@/lib/supabase";
import { fmt, mkLabel, gd, jarList, jarName } from "@/lib/util";
import { MonthNav, Confirm } from "./ui";
import { useExpenses } from "./Month";
import { useWeeks, WeekList } from "./Weeks";

export default function Review({ app }: { app: App }) {
  const { data, sel, mk, setMk, toast, family } = app;
  const mo = data.months.find((x) => x.month === mk);
  const ex = useExpenses(sel.id, mk);
  const wk = useWeeks(sel.id, mk);
  const [rv, setRv] = useState({ best: "", regret: "", next: "", to: "dream" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mo) setRv({ best: mo.review?.best || "", regret: mo.review?.regret || "", next: mo.review?.next || "", to: mo.review?.to || "dream" });
  }, [mo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mo)
    return (
      <>
        <MonthNav mk={mk} setMk={setMk} />
        <section className="card">
          <p>{mkLabel(mk)} 還沒做規劃。先到「本月」把零用金分進三個罐子，月底再回來檢討。</p>
          <div><button className="btn primary" onClick={() => app.go("month")}>去做規劃</button></div>
        </section>
      </>
    );

  const sp = ex.list.reduce((s, e) => s + e.amount, 0);
  const need = ex.list.filter((e) => e.type === "need").reduce((s, e) => s + e.amount, 0);
  const want = sp - need;
  const cats: Record<string, number> = {};
  ex.list.forEach((e) => (cats[e.category] = (cats[e.category] || 0) + e.amount));
  const topCats = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 4);

  const stat = (
    <section className="card">
      <h3>這個月花在哪</h3>
      <div className="kv"><span>自由罐可用</span><b>{fmt(mo.free_start)}</b></div>
      <div className="kv"><span>實際花掉</span><b>{fmt(sp)}</b></div>
      {sp > 0 && (
        <>
          <div className="bar">
            <span style={{ width: `${(need / sp) * 100}%`, background: "var(--long)" }} />
            <span style={{ left: `${(need / sp) * 100}%`, width: `${(want / sp) * 100}%`, background: "var(--free)" }} />
          </div>
          <div className="legend"><span><i style={{ background: "var(--long)" }} />需要 {fmt(need)}</span><span><i style={{ background: "var(--free)" }} />想要 {fmt(want)}</span></div>
          <div className="list">
            {topCats.map(([c, v]) => <div className="kv small" key={c}><span>{c}</span><b>{fmt(v)}</b></div>)}
          </div>
        </>
      )}
    </section>
  );

  if (mo.status === "closed")
    return (
      <>
        <MonthNav mk={mk} setMk={setMk} />
        {stat}
        <section className="card">
          <div className="card-h"><h3>結算完成</h3><span className={`star ${mo.star ? "" : "off"}`} style={{ fontSize: "1.5rem" }}>★</span></div>
          {mo.moved > 0 && <div className="kv"><span>自由罐結餘轉入{jarName(sel, mo.review?.to)}</span><b>{fmt(mo.moved)}</b></div>}
          {mo.alloc?.bonus > 0 && <div className="kv"><span>夢想加碼</span><b style={{ color: "var(--dream)" }}>+{fmt(mo.alloc.bonus)}</b></div>}
          {mo.alloc?.weeks_ok === false && <p className="small muted">這個月有幾週記帳不到 {family.star_days} 天，所以沒有拿到星星。</p>}
          {mo.interest > 0 && <div className="kv"><span>長期罐利息</span><b>{fmt(mo.interest)}</b></div>}
          {mo.review?.best && <p><span className="muted small">最滿意的花費</span><br />{mo.review.best}</p>}
          {mo.review?.regret && <p><span className="muted small">有點後悔的花費</span><br />{mo.review.regret}</p>}
          {mo.review?.next && <p><span className="muted small">下個月想調整</span><br />{mo.review.next}</p>}
        </section>
      </>
    );

  const left = data.bal.free;
  const rate = Number(family.rate);
  const after = data.bal.long + (rv.to === "long" ? left : 0);
  const ownAfter = (data.bal.dream_own || 0) + (rv.to === "dream" ? left : 0);
  const bonusPreview = sel.role === "kid" && family.bonus_pct > 0
    ? Math.max(0, Math.floor(ownAfter / family.bonus_step) - (data.bal.dream_tiers || 0)) * Math.round((family.bonus_step * family.bonus_pct) / 100) : 0;

  async function save(next = rv) {
    const [, e] = await rpc("save_review", { p_member: sel.id, p_month: mk, p_review: next });
    if (e) toast(e);
  }
  async function close() {
    setBusy(true);
    await save();
    const [r, e] = await rpc("close_month", { p_member: sel.id, p_month: mk });
    setBusy(false);
    if (e) return toast(e);
    toast((r?.star ? "結算完成，拿到一顆星 ★" : "結算完成") + (r?.bonus > 0 ? `，夢想加碼 ${fmt(r.bonus)}` : ""));
    await data.reload();
  }
  const setTo = (to: string) => { const n = { ...rv, to }; setRv(n); save(n); };

  return (
    <>
      <MonthNav mk={mk} setMk={setMk} />
      {stat}
      <section className="card">
        <h3>自由罐還剩 <span className="num">{fmt(left)}</span></h3>
        {left > 0 ? (
          <>
            <p className="small muted">剩下的錢要怎麼處理？</p>
            <div className="seg" role="group" aria-label="結餘去向">
              {[["keep", "留在自由罐"], ["dream", "轉進夢想罐"], ["long", "轉進長期罐"]].map(([k, t]) => (
                <button key={k} className={rv.to === k ? "on" : ""} onClick={() => setTo(k)}>{t}</button>
              ))}
            </div>
          </>
        ) : <p className="small muted">這個月的自由罐剛好用完。</p>}
        {jarList(sel).some((j) => !j.core) && <p className="note">{jarList(sel).filter((j) => !j.core).map((j) => j.name).join("、")}的餘額會留在罐子裡，帶到下個月。</p>}
        {rate > 0 && <div className="kv"><span>結算後長期罐利息（月息 {rate}%）</span><b>+{fmt((after * rate) / 100)}</b></div>}
        {bonusPreview > 0 && <div className="kv"><span>結算時夢想加碼</span><b style={{ color: "var(--dream)" }}>+{fmt(bonusPreview)}</b></div>}
      </section>
      <section className="card">
        <h3>三個問題</h3>
        {([["best", "這個月最滿意的一筆花費？"], ["regret", "有沒有買了有點後悔的？"], ["next", "下個月想怎麼調整？"]] as const).map(([k, q]) => (
          <label className="f" key={k}>
            {q}
            <textarea id={`rv-${k}`} maxLength={300} value={rv[k]} onChange={(e) => setRv({ ...rv, [k]: e.target.value })} onBlur={() => save()} />
          </label>
        ))}
      </section>
      <section className="card">
        <h3>本月星星 ★ 的兩個條件</h3>
        {(() => {
          const qa = !!rv.next.trim() && (!!rv.best.trim() || !!rv.regret.trim());
          const wkOk = family.star_days === 0 || !!wk.w?.ok;
          return (
            <>
              <div className="kv small"><span>{wkOk ? "✓" : "○"} 每週至少記帳 {family.star_days} 天</span><b style={{ color: wkOk ? "var(--accent)" : "var(--warn)" }}>{wkOk ? "達成" : "還沒達成"}</b></div>
              {wk.w && family.star_days > 0 && <WeekList w={wk.w} />}
              <div className="kv small"><span>{qa ? "✓" : "○"} 回答第 3 題，再加上第 1 或第 2 題</span><b style={{ color: qa ? "var(--accent)" : "var(--warn)" }}>{qa ? "達成" : "還沒達成"}</b></div>
            </>
          );
        })()}
      </section>
      <Confirm label="完成本月結算" confirmLabel="確定結算" className="btn primary big" disabled={busy} onConfirm={close} />
      <p className="note center">結算後這個月就不能再記帳或修改。建議和{gd(family)}一起完成。</p>
    </>
  );
}
