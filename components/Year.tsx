"use client";
import { useCallback, useEffect, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import { fmt, clamp, curYear, curMonth } from "@/lib/util";

type Ev = { name: string; month: number; amount: number };
type Plan = { target_long: number; wishes: string; incomes: Ev[]; spends: Ev[]; reflection: string };
const BLANK: Plan = { target_long: 0, wishes: "", incomes: [], spends: [], reflection: "" };

const SUGGEST_IN: Ev[] = [{ name: "過年紅包", month: 2, amount: 0 }, { name: "生日", month: 1, amount: 0 }];
const SUGGEST_OUT: Ev[] = [{ name: "家人生日禮物", month: 1, amount: 0 }];

export default function Year({ app }: { app: App }) {
  const { sel, data, toast } = app;
  const [year, setYear] = useState(curYear());
  const [plan, setPlan] = useState<Plan>(BLANK);
  const [stats, setStats] = useState<any>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: yp }, [st]] = await Promise.all([
      supabase.from("year_plans").select("data").eq("member_id", sel.id).eq("year", year).maybeSingle(),
      rpc("year_stats", { p_member: sel.id, p_year: year }),
    ]);
    setPlan({ ...BLANK, ...(yp?.data || {}) });
    setStats(st);
    setDirty(false);
  }, [sel.id, year]);
  useEffect(() => { load(); }, [load]);

  const upd = (p: Partial<Plan>) => { setPlan((x) => ({ ...x, ...p })); setDirty(true); };
  const setEv = (key: "incomes" | "spends", i: number, p: Partial<Ev>) =>
    upd({ [key]: plan[key].map((e, j) => (j === i ? { ...e, ...p } : e)) } as any);
  const addEv = (key: "incomes" | "spends", e?: Ev) => upd({ [key]: [...plan[key], e || { name: "", month: 1, amount: 0 }] } as any);
  const delEv = (key: "incomes" | "spends", i: number) => upd({ [key]: plan[key].filter((_, j) => j !== i) } as any);

  async function save() {
    setBusy(true);
    const clean = {
      ...plan,
      target_long: Math.max(0, Math.round(+plan.target_long) || 0),
      incomes: plan.incomes.filter((e) => e.name.trim()).map((e) => ({ ...e, amount: Math.round(+e.amount) || 0 })),
      spends: plan.spends.filter((e) => e.name.trim()).map((e) => ({ ...e, amount: Math.round(+e.amount) || 0 })),
    };
    const [, e] = await rpc("save_year_plan", { p_member: sel.id, p_year: year, p_data: clean });
    setBusy(false);
    if (e) return toast(e);
    toast("年度計畫已儲存");
    setPlan(clean);
    setDirty(false);
  }

  const allowanceYear = sel.allowance * 12;
  const extraIn = plan.incomes.reduce((s, e) => s + (+e.amount || 0), 0);
  const bigOut = plan.spends.reduce((s, e) => s + (+e.amount || 0), 0);
  const ym = data.months.filter((m) => m.month.startsWith(`${year}-`));
  const longNet = stats?.long_net || 0;
  const target = +plan.target_long || 0;
  const isNow = year === curYear();
  const monthsLeft = isNow ? 12 - Number(curMonth().slice(5)) + 1 : year > curYear() ? 12 : 0;
  const perMonth = target > longNet && monthsLeft > 0 ? Math.ceil((target - longNet) / monthsLeft) : 0;

  const evList = (key: "incomes" | "spends", title: string, hint: string, sug: Ev[]) => (
    <section className="card">
      <div className="card-h"><h3>{title}</h3><span className="num muted">{fmt(key === "incomes" ? extraIn : bigOut)}</span></div>
      <p className="small muted">{hint}</p>
      {plan[key].map((e, i) => (
        <div className="ev" key={i}>
          <input aria-label="項目" placeholder="項目" maxLength={20} value={e.name} onChange={(x) => setEv(key, i, { name: x.target.value })} />
          <select className="evm" aria-label="月份" value={e.month} onChange={(x) => setEv(key, i, { month: +x.target.value })}>
            {Array.from({ length: 12 }, (_, k) => <option key={k} value={k + 1}>{k + 1} 月</option>)}
          </select>
          <input aria-label="金額" type="number" inputMode="numeric" min={0} placeholder="金額" value={e.amount || ""} onChange={(x) => setEv(key, i, { amount: +x.target.value })} />
          <button className="x" aria-label="刪除" onClick={() => delEv(key, i)}>×</button>
        </div>
      ))}
      <div className="row">
        <button className="btn sm" onClick={() => addEv(key)}>＋ 新增</button>
        {sug.filter((s) => !plan[key].some((e) => e.name === s.name)).map((s) => (
          <button key={s.name} className="chip" onClick={() => addEv(key, { ...s })}>{s.name}</button>
        ))}
      </div>
    </section>
  );

  return (
    <>
      <div className="mnav">
        <button className="btn sm ghost" onClick={() => setYear(year - 1)}>‹ {year - 1}</button>
        <span className="lbl">{year} 年度計畫</span>
        <button className="btn sm ghost" disabled={year > curYear()} onClick={() => setYear(year + 1)}>{year + 1} ›</button>
      </div>

      <section className="card">
        <h3>今年的進度</h3>
        <div className="months12" aria-label="每月完成狀況">
          {Array.from({ length: 12 }, (_, i) => {
            const m = ym.find((x) => x.month === `${year}-${String(i + 1).padStart(2, "0")}`);
            const cls = m?.status === "closed" && m.star ? "s" : m ? "p" : "";
            return <span key={i} className={cls} title={`${i + 1} 月`}>{m?.star ? "★" : i + 1}</span>;
          })}
        </div>
        <div className="legend"><span><i style={{ background: "var(--free)" }} />拿到星星</span><span><i style={{ background: "color-mix(in srgb,var(--long) 25%,var(--surface))" }} />有規劃</span></div>
        {stats && (
          <div className="grid2">
            <div><div className="small muted">長期罐今年增加</div><b className="num">{fmt(longNet)}</b></div>
            <div><div className="small muted">其中利息</div><b className="num">{fmt(stats.interest)}</b></div>
            <div><div className="small muted">今年花掉</div><b className="num">{fmt(stats.spent)}</b></div>
            <div><div className="small muted">想要 / 需要</div><b className="num">{stats.spent ? Math.round((stats.want / stats.spent) * 100) : 0}% / {stats.spent ? Math.round((stats.need / stats.spent) * 100) : 0}%</b></div>
          </div>
        )}
      </section>

      <section className="card">
        <h3>1. 年度目標</h3>
        <label className="f">今年長期罐要增加多少<input id="y-target" type="number" inputMode="numeric" min={0} placeholder="例如 5000" value={plan.target_long || ""} onChange={(e) => upd({ target_long: +e.target.value })} /></label>
        {target > 0 && (
          <>
            <div className="bar"><span style={{ width: `${clamp(longNet / target, 0, 1) * 100}%`, background: "var(--long)" }} /></div>
            <p className="small">
              已完成 {fmt(longNet)} / {fmt(target)}
              {perMonth > 0 ? `。接下來每月長期罐要放約 ${fmt(perMonth)} 才能達成。` : longNet >= target ? "。目標達成了！" : ""}
            </p>
          </>
        )}
        <label className="f">今年想完成的夢想（一行一個）<textarea id="y-wish" maxLength={500} placeholder={"畢業旅行\n新的耳機"} value={plan.wishes} onChange={(e) => upd({ wishes: e.target.value })} /></label>
      </section>

      <section className="card">
        <h3>2. 今年的收入預估</h3>
        <div className="kv"><span>零用金 {fmt(sel.allowance)} × 12 個月</span><b>{fmt(allowanceYear)}</b></div>
        <div className="kv"><span>額外收入（下方）</span><b>{fmt(extraIn)}</b></div>
        <div className="kv"><span>預計大筆支出（下方）</span><b>−{fmt(bigOut)}</b></div>
        <div className="kv" style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}><span>可以規劃的錢</span><b>{fmt(allowanceYear + extraIn - bigOut)}</b></div>
      </section>
      {evList("incomes", "3. 預計的額外收入", "紅包、生日禮金、打工、獎學金。知道錢什麼時候會進來，就能提早規劃。", SUGGEST_IN)}
      {evList("spends", "4. 預計的大筆支出", "畢業旅行、家人生日禮物、才藝課。提早知道，就能每月先存一點。", SUGGEST_OUT)}

      <section className="card">
        <h3>5. 年底回顧</h3>
        <label className="f">這一年我在用錢上學到什麼？<textarea id="y-ref" maxLength={1000} value={plan.reflection} onChange={(e) => upd({ reflection: e.target.value })} /></label>
      </section>
      <button className="btn primary big" disabled={busy || !dirty} onClick={save}>{dirty ? "儲存年度計畫" : "已儲存"}</button>
    </>
  );
}
