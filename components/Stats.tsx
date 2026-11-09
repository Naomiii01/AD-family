"use client";
import { useMemo, useState } from "react";
import type { App } from "./Shell";
import { fmt, num, curMonth, shiftMonth } from "@/lib/util";
import { MonthNav } from "./ui";
import { useExpenses } from "./Month";
import { useIncomes } from "./Income";
import { CategoryPie } from "./CategoryPie";
import { CatIcon } from "./Entry";

const WD = ["日", "一", "二", "三", "四", "五", "六"];
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
const daysIn = (mk: string) => new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0).getDate();
const compact = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(v >= 100000 ? 0 : 1)}萬` : num(v));

/** Month statistics: totals, a spending calendar, this month against last month, and where the money went. */
export function MonthStats({ app }: { app: App }) {
  const { sel } = app;
  const [mk, setMk] = useState(curMonth());
  const ex = useExpenses(sel.id, mk);
  const prev = useExpenses(sel.id, shiftMonth(mk, -1));
  const inc = useIncomes(sel.id, mk);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const n = daysIn(mk);
  const elapsed = mk < today.slice(0, 7) ? n : mk === today.slice(0, 7) ? +today.slice(8) : 0;

  const perDay = useMemo(() => {
    const a = Array(n + 1).fill(0);
    for (const e of ex.list) a[+dayOf(e.created_at).slice(8)] += e.amount;
    return a;
  }, [ex.list, n]);
  const prevDay = useMemo(() => {
    const pn = daysIn(shiftMonth(mk, -1));
    const a = Array(pn + 1).fill(0);
    for (const e of prev.list) a[+dayOf(e.created_at).slice(8)] += e.amount;
    return a;
  }, [prev.list, mk]);
  const total = ex.list.reduce((s, e) => s + e.amount, 0);
  const prevTotal = prev.list.reduce((s, e) => s + e.amount, 0);
  const income = inc.list.reduce((s, e) => s + e.amount, 0);

  const byCat = useMemo(() => {
    const m: Record<string, { v: number; c: number }> = {};
    for (const e of ex.list) { const k = e.category || "其他"; (m[k] ||= { v: 0, c: 0 }).v += e.amount; m[k].c++; }
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v);
  }, [ex.list]);

  const first = new Date(+mk.slice(0, 4), +mk.slice(5, 7) - 1, 1).getDay();
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const maxDay = Math.max(1, ...perDay);

  return (
    <>
      <MonthNav mk={mk} setMk={setMk} />
      <section className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
          <span className="muted small">{ex.list.length} 筆 · 日均 {fmt(elapsed ? total / elapsed : 0)}</span>
          {prevTotal > 0 && <span className="small" style={{ color: total > prevTotal ? "var(--warn)" : "var(--long)" }}>比上月{total > prevTotal ? "多" : "少"} {fmt(Math.abs(total - prevTotal))}</span>}
        </div>
        <div className="big-n" style={{ color: "var(--warn)" }}>{fmt(total)}</div>
        <div className="row small" style={{ gap: 10 }}>
          <span><span className="b in">入</span>{fmt(income)}</span>
          <span className="note">其他收入（月初零用金／薪水不算在這裡）</span>
        </div>
      </section>

      <section className="card">
        <h3>支出日曆</h3>
        <div className="cal-grid st-cal" role="grid" aria-label="每天花費">
          {WD.map((w) => <div key={w} className="cal-wd" aria-hidden="true">{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`b${i}`} className="cal-cell empty" />;
            const v = perDay[d];
            const k = v ? 12 + Math.round((v / maxDay) * 58) : 0;
            const iso = `${mk}-${String(d).padStart(2, "0")}`;
            return (
              <div key={d} className={`cal-cell st ${iso === today ? "today" : ""}`} style={v ? { background: `color-mix(in srgb, var(--warn) ${k}%, var(--surface))` } : undefined}
                aria-label={`${d}日${v ? ` 花了 ${v} 元` : " 沒有花費"}`}>
                <span className="cal-n">{d}</span>
                {v > 0 && <span className="cal-out" style={k > 45 ? { color: "#fff" } : undefined}>{compact(v)}</span>}
              </div>
            );
          })}
        </div>
        <p className="note">顏色越深，那天花得越多。</p>
      </section>

      <section className="card">
        <h3>每日累積：本月 vs 上月</h3>
        <CumChart cur={perDay} prev={prevDay} upto={elapsed} />
        <div className="legend"><span><i style={{ background: "var(--accent)" }} />{+mk.slice(5)}月</span><span><i style={{ background: "var(--muted)" }} />{+shiftMonth(mk, -1).slice(5)}月</span></div>
      </section>

      <section className="card">
        <h3>支出構成</h3>
        {byCat.length ? (
          <>
            <CategoryPie list={ex.list} legend={false} />
            <div className="bud-list">
              {byCat.map(([c, x]) => (
                <div key={c} className="bud-row">
                  <CatIcon cat={c} size={34} />
                  <div className="bud-mid">
                    <div className="row" style={{ justifyContent: "space-between" }}><b>{c} <span className="note">{Math.round((x.v / total) * 100)}% · {x.c} 筆</span></b><span className="num">{fmt(x.v)}</span></div>
                    <div className="bar thin"><span style={{ width: `${(x.v / byCat[0][1].v) * 100}%`, background: (() => { const r = byCat.filter(([k]) => k !== "其他").findIndex(([k]) => k === c); return r >= 0 && r < 6 ? `var(--c-s${r + 1})` : "var(--c-other)"; })() }} /></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : <div className="empty">這個月還沒有花費紀錄</div>}
      </section>
    </>
  );
}

function CumChart({ cur, prev, upto }: { cur: number[]; prev: number[]; upto: number }) {
  const W = 320, H = 150, L = 40, R = 10, T = 12, B = 22;
  const days = Math.max(cur.length, prev.length) - 1;
  const cum = (a: number[]) => a.slice(1).reduce<number[]>((o, v) => (o.push((o[o.length - 1] || 0) + v), o), []);
  const c = cum(cur).slice(0, upto), p = cum(prev);
  const mx = Math.max(1, ...c, ...p) * 1.08;
  const X = (d: number) => L + ((W - L - R) * (d - 1)) / Math.max(days - 1, 1);
  const Y = (v: number) => T + (H - T - B) * (1 - v / mx);
  const path = (a: number[]) => a.map((v, i) => `${i ? "L" : "M"}${X(i + 1).toFixed(1)} ${Y(v).toFixed(1)}`).join(" ");
  const ticks = [0, mx / 2].map((v) => Math.round(v / 1000) * 1000);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`本月累積 ${c[c.length - 1] || 0} 元，上月 ${p[p.length - 1] || 0} 元`}>
      {ticks.map((v, i) => (
        <g key={i}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" /><text x={L - 6} y={Y(v) + 3} textAnchor="end">{compact(v)}</text></g>
      ))}
      {p.length > 1 && <path d={path(p)} fill="none" stroke="var(--muted)" strokeWidth={1.6} strokeDasharray="4 3" />}
      {c.length > 1 && <path d={path(c)} fill="none" stroke="var(--accent)" strokeWidth={2.4} strokeLinejoin="round" />}
      {c.length > 0 && <circle cx={X(c.length)} cy={Y(c[c.length - 1])} r={3.5} fill="var(--accent)" />}
      {[1, 10, 20, days].map((d) => <text key={d} x={X(d)} y={H - 6} textAnchor="middle">{d}日</text>)}
    </svg>
  );
}
