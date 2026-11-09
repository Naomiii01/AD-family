"use client";
import { useCallback, useEffect, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import { fmt, num, catsFor, FIXED_CATS } from "@/lib/util";
import { CatIcon } from "./Entry";

export function useBudgets(memberId: string) {
  const [map, setMap] = useState<Record<string, number>>({});
  const load = useCallback(async () => {
    const { data } = await supabase.from("cat_budgets").select("category,amount").eq("member_id", memberId);
    setMap(Object.fromEntries(((data as any[]) || []).filter((r) => r.amount > 0).map((r) => [r.category, r.amount])));
  }, [memberId]);
  useEffect(() => { load(); }, [load]);
  return { map, reload: load };
}

const daysLeft = (mk: string) => {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const last = new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0).getDate();
  return mk === today.slice(0, 7) ? last - +today.slice(8) + 1 : mk > today.slice(0, 7) ? last : 0;
};

/** Monthly budget per category: how much is set, spent and left, with the daily amount still available. */
export function BudgetCard({ app, expenses }: { app: App; expenses: any[] }) {
  const { sel, mk } = app;
  const b = useBudgets(sel.id);
  const [edit, setEdit] = useState(false);
  const spent: Record<string, number> = {};
  for (const e of expenses) spent[e.category || "其他"] = (spent[e.category || "其他"] || 0) + e.amount;
  const cats = Object.keys(b.map);
  const total = cats.reduce((s, c) => s + b.map[c], 0);
  const used = cats.reduce((s, c) => s + (spent[c] || 0), 0);
  const left = total - used;
  const dl = daysLeft(mk);
  const pct = total ? Math.min(1, used / total) : 0;

  if (edit) return <BudgetEditor app={app} map={b.map} onDone={() => { setEdit(false); b.reload(); }} />;
  if (!cats.length) {
    return (
      <section className="card">
        <div className="card-h"><h3>分類預算</h3><button className="btn sm" onClick={() => setEdit(true)}>設定預算</button></div>
        <p className="note">幫餐飲、購物這些分類設每月上限，App 會顯示還剩多少、每天大概還能花多少。</p>
      </section>
    );
  }
  return (
    <section className="card">
      <div className="card-h"><h3>本月預算</h3><button className="btn sm ghost" onClick={() => setEdit(true)}>調整</button></div>
      <div className="grid3 center">
        <div><div className="note">已花</div><b className="num">{fmt(used)}</b></div>
        <div><div className="note">{left >= 0 ? "剩餘" : "超支"}</div><b className="num" style={{ color: left < 0 ? "var(--warn)" : undefined }}>{fmt(Math.abs(left))}</b></div>
        <div><div className="note">剩餘日均</div><b className="num">{dl > 0 && left > 0 ? fmt(left / dl) : "—"}</b></div>
      </div>
      <div className="bar"><span style={{ width: `${pct * 100}%`, background: pct >= 1 ? "var(--warn)" : pct > 0.85 ? "var(--free)" : "var(--accent)" }} /></div>
      <div className="row small muted" style={{ justifyContent: "space-between" }}><span>總預算 {fmt(total)} · 用了 {Math.round(pct * 100)}%</span>{dl > 0 && <span>還有 {dl} 天</span>}</div>
      <div className="bud-list">
        {cats.sort((x, y) => (spent[y] || 0) / b.map[y] - (spent[x] || 0) / b.map[x]).map((c) => {
          const s = spent[c] || 0, a = b.map[c], p = Math.min(1, s / a);
          return (
            <div key={c} className="bud-row">
              <CatIcon cat={c} size={34} />
              <div className="bud-mid">
                <div className="row" style={{ justifyContent: "space-between" }}><b>{c}</b><span className="num small">{num(s)} / {num(a)}</span></div>
                <div className="bar thin"><span style={{ width: `${p * 100}%`, background: s > a ? "var(--warn)" : p > 0.85 ? "var(--free)" : "var(--accent)" }} /></div>
                <span className="note" style={{ color: s > a ? "var(--warn)" : undefined }}>{s > a ? `超出 ${num(s - a)}` : `還可以花 ${num(a - s)}`}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BudgetEditor({ app, map, onDone }: { app: App; map: Record<string, number>; onDone: () => void }) {
  const { sel, toast } = app;
  const cats = Array.from(new Set([...catsFor("free", sel), ...FIXED_CATS.filter((c) => c !== "其他"), ...Object.keys(map)]));
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(cats.map((c) => [c, map[c] ? String(map[c]) : ""])));
  const [busy, setBusy] = useState(false);
  const total = cats.reduce((s, c) => s + (Math.round(+vals[c]) || 0), 0);
  async function save() {
    setBusy(true);
    for (const c of cats) {
      const v = Math.max(0, Math.round(+vals[c]) || 0);
      if (v !== (map[c] || 0)) {
        const [, e] = await rpc("set_cat_budget", { p_member: sel.id, p_category: c, p_amount: v });
        if (e) { setBusy(false); return toast(e); }
      }
    }
    setBusy(false);
    toast("預算存好了");
    onDone();
  }
  return (
    <section className="card">
      <div className="card-h"><h3>設定每月分類預算</h3><span className="num small muted">合計 {fmt(total)}</span></div>
      <p className="note">只填想控制的分類就好，空白代表不設預算。每個月都會沿用，隨時可以調整。</p>
      <div className="bud-edit">
        {cats.map((c) => (
          <label key={c} className="bud-cell">
            <CatIcon cat={c} size={34} />
            <span>{c}</span>
            <input type="number" inputMode="numeric" min={0} placeholder="—" value={vals[c]} onChange={(e) => setVals({ ...vals, [c]: e.target.value })} aria-label={`${c}每月預算`} />
          </label>
        ))}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={busy} onClick={save}>儲存預算</button>
        <button className="btn" onClick={onDone}>取消</button>
      </div>
    </section>
  );
}

