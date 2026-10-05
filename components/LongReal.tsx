"use client";
import { useCallback, useEffect, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import { fmt, curMonth, gd } from "@/lib/util";

/** Long-jar history: money put in per month (own vs matched) and recorded market values. */
export function useLongHistory(memberId: string) {
  const [months, setMonths] = useState<{ month: string; own: number; match: number }[]>([]);
  const [values, setValues] = useState<any[]>([]);
  const load = useCallback(async () => {
    const [{ data: led }, { data: lv }] = await Promise.all([
      supabase.from("ledger").select("month,amount,kind").eq("member_id", memberId).eq("jar", "long"),
      supabase.from("long_values").select("month,value,principal,updated_at").eq("member_id", memberId).order("month", { ascending: true }),
    ]);
    const by: Record<string, { own: number; match: number }> = {};
    for (const r of led || []) {
      if (r.amount <= 0 || r.kind === "interest") continue;
      const g = (by[r.month] ||= { own: 0, match: 0 });
      if (r.kind === "match") g.match += r.amount; else g.own += r.amount;
    }
    setMonths(Object.keys(by).sort().map((m) => ({ month: m, ...by[m] })));
    setValues(lv || []);
  }, [memberId]);
  useEffect(() => { load(); }, [load]);
  return { months, values, reload: load };
}

const short = (v: number) => (Math.abs(v) >= 10000 ? (v / 10000).toFixed(Math.abs(v) >= 100000 ? 0 : 1) + "萬" : Math.round(v).toLocaleString("zh-TW"));
const mLabel = (mk: string) => `${+mk.slice(5)}月`;

/** Average monthly amount put into the long jar over the last 6 months that had any. */
export const avgMonthly = (months: { own: number; match: number }[]) => {
  const last = months.slice(-6);
  return last.length ? Math.round(last.reduce((s, m) => s + m.own + m.match, 0) / last.length) : 0;
};

export function ContribBars({ months, family }: { months: { month: string; own: number; match: number }[]; family: any }) {
  const list = months.slice(-12);
  if (!list.length) return <p className="note">還沒有投入紀錄。完成月初規劃後，每月放進長期罐的錢會畫在這裡。</p>;
  const W = 320, H = 130, L = 8, R = 8, T = 16, B = 22;
  const mx = Math.max(...list.map((m) => m.own + m.match), 1);
  const slot = (W - L - R) / Math.max(list.length, 6);
  const bw = Math.min(26, slot * 0.62);
  const hasMatch = list.some((m) => m.match > 0);
  const Y = (v: number) => (H - T - B) * (v / mx);
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="每月放進長期罐的錢">
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--line)" />
        {list.map((m, i) => {
          const x = L + slot * i + (slot - bw) / 2;
          const ho = Y(m.own), hm = Y(m.match);
          return (
            <g key={m.month}>
              <rect x={x} y={H - B - ho} width={bw} height={ho} rx={3} fill="var(--long)" />
              {hm > 0 && <rect x={x} y={H - B - ho - hm} width={bw} height={hm} rx={3} fill="color-mix(in srgb, var(--long) 45%, var(--surface))" />}
              <text x={x + bw / 2} y={H - B - ho - hm - 4} textAnchor="middle" style={{ fontSize: 9 }}>{short(m.own + m.match)}</text>
              <text x={x + bw / 2} y={H - 6} textAnchor="middle">{mLabel(m.month)}</text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        <span><i style={{ background: "var(--long)" }} />自己放的</span>
        {hasMatch && <span><i style={{ background: "color-mix(in srgb, var(--long) 45%, var(--surface))" }} />{gd(family)}配對</span>}
      </div>
    </>
  );
}

function ValueChart({ values }: { values: any[] }) {
  const W = 320, H = 150, L = 46, R = 12, T = 14, B = 24;
  const n = values.length;
  const mx = Math.max(...values.map((v) => Math.max(v.value, v.principal)), 1) * 1.1;
  const X = (i: number) => L + ((W - L - R) * i) / Math.max(n - 1, 1);
  const Y = (v: number) => T + (H - T - B) * (1 - v / mx);
  const line = (k: "value" | "principal") => values.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v[k]).toFixed(1)).join(" ");
  const step = values.map((v, i) => (i ? `L${X(i).toFixed(1)} ${Y(values[i - 1].principal).toFixed(1)} ` : "M") + `${X(i).toFixed(1)} ${Y(v.principal).toFixed(1)}`).join(" ");
  const ticks = [0, mx / 2].map((v) => Math.round(v / 1000) * 1000);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="長期罐本金和市值">
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
          <text x={L - 6} y={Y(v) + 3} textAnchor="end">{short(v)}</text>
        </g>
      ))}
      <path d={step} fill="none" stroke="var(--muted)" strokeWidth={1.6} strokeDasharray="4 3" />
      <path d={line("value")} fill="none" stroke="var(--long)" strokeWidth={2.4} strokeLinejoin="round" />
      {values.map((v, i) => <circle key={v.month} cx={X(i)} cy={Y(v.value)} r={3} fill={v.value >= v.principal ? "var(--long)" : "var(--warn)"} />)}
      {[0, n - 1].filter((i, k, a) => a.indexOf(i) === k).map((i) => (
        <text key={i} x={X(i)} y={H - 6} textAnchor={i === 0 && n > 1 ? "start" : "end"}>{mLabel(values[i].month)}</text>
      ))}
    </svg>
  );
}

export function RealReturn({ app, hist, compact }: { app: App; hist: ReturnType<typeof useLongHistory>; compact?: boolean }) {
  const { sel, data, toast } = app;
  const mk = curMonth();
  const mine = hist.values.find((v) => v.month === mk);
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const last = hist.values[hist.values.length - 1];
  const principal = data.bal.long;
  const gain = last ? last.value - last.principal : 0;
  const pct = last && last.principal > 0 ? (gain / last.principal) * 100 : 0;

  async function save() {
    setBusy(true);
    const [, e] = await rpc("set_long_value", { p_member: sel.id, p_value: Math.round(+val) });
    setBusy(false);
    if (e) return toast(e);
    toast("市值記好了");
    setVal("");
    await hist.reload();
  }

  return (
    <div className="real-return">
      {!compact && last && (
        <>
          <div className="grid3 center">
            <div><div className="note">投入本金</div><b className="num">{fmt(last.principal)}</b></div>
            <div><div className="note">目前市值</div><b className="num">{fmt(last.value)}</b></div>
            <div><div className="note">{gain >= 0 ? "賺了" : "賠了"}</div>
              <b className="num" style={{ color: gain >= 0 ? "var(--long)" : "var(--warn)" }}>{gain >= 0 ? "+" : "−"}{fmt(Math.abs(gain))}</b>
              <div className="note" style={{ color: gain >= 0 ? "var(--long)" : "var(--warn)" }}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</div>
            </div>
          </div>
          {hist.values.length >= 2 ? (
            <>
              <ValueChart values={hist.values} />
              <div className="legend"><span><i style={{ background: "var(--long)" }} />市值</span><span><i style={{ background: "var(--muted)" }} />投入本金</span></div>
            </>
          ) : <p className="note">再記一個月，就會畫出本金和市值的變化。</p>}
          <p className="note">以 {mLabel(last.month)} 記錄的市值計算。{gain < 0 ? "市場下跌時繼續定期投入，平均成本會變低，漲回來時賺得更多。" : ""}</p>
        </>
      )}
      <label className="f">{mine ? `${mLabel(mk)}市值已記 ${fmt(mine.value)}，可以更新` : `${mLabel(mk)}的市值（看證券 App 的庫存現值）`}
        <div className="row" style={{ gap: 8 }}>
          <input id="lv-val" type="number" inputMode="numeric" min={0} placeholder={String(principal || 0)} value={val} onChange={(e) => setVal(e.target.value)} style={{ flex: 1, minWidth: 0 }} />
          <button className="btn primary sm" disabled={busy || val === ""} onClick={save}>記下市值</button>
        </div>
      </label>
      {!compact && !last && <p className="note">每月填一次證券 App 上的市值，App 會算出賺賠和報酬率。目前投入本金 {fmt(principal)}。</p>}
    </div>
  );
}
