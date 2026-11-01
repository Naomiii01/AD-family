"use client";
import { useCallback, useEffect, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import { fmt, curMonth, payLabel } from "@/lib/util";
import { PayPicker, lastPay, rememberPay, type Pay } from "./Pay";
import { useWeeks } from "./Weeks";

/** Picture buttons: tapping one sets both the item name (if empty) and the category. */
export const QUICK_CATS: [string, string, string][] = [
  ["🧋", "飲料", "飲料點心"], ["🍱", "吃飯", "正餐"], ["🍪", "零食", "飲料點心"], ["🚌", "交通", "交通"],
  ["✏️", "文具", "文具學習"], ["🎮", "娛樂", "娛樂"], ["👕", "衣服", "衣物"], ["🎁", "禮物", "禮物"], ["📦", "其他", "其他"],
];

/** Simple mode: on by default for kids, off for adults; each person can switch it in 記帳設定. */
export const simpleOf = (m: any) => (m?.simple_log ?? null) === null ? m?.role === "kid" : !!m.simple_log;

function useRecent(memberId: string) {
  const [list, setList] = useState<any[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("expenses").select("item,amount,category,created_at")
      .eq("member_id", memberId).eq("voided", false).order("created_at", { ascending: false }).limit(40);
    const seen = new Set<string>(), out: any[] = [];
    for (const e of data || []) {
      const k = `${e.item}|${e.amount}`;
      if (!seen.has(k)) { seen.add(k); out.push(e); }
      if (out.length >= 4) break;
    }
    setList(out);
  }, [memberId]);
  useEffect(() => { load(); }, [load]);
  return { list, reload: load };
}

export function QuickLog({ app, onDone, onFull }: { app: App; onDone?: () => void; onFull?: () => void }) {
  const { sel, data, toast } = app;
  const mk = curMonth();
  const recent = useRecent(sel.id);
  const wk = useWeeks(sel.id, mk);
  const [amt, setAmt] = useState("");
  const [pick, setPick] = useState<number | null>(null);
  const [item, setItem] = useState("");
  const [more, setMore] = useState(false);
  const [pay, setPay] = useState<Pay>(() => lastPay(sel.id));
  const [busy, setBusy] = useState(false);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const week = wk.w?.weeks.find((x) => x.start <= today && x.end >= today);
  const weekLine = week && week.need > 0
    ? (week.days >= week.need ? `這週已經記了 ${week.days} 天，達標了 ⭐` : `這週記了 ${week.days} 天，再 ${week.need - week.days} 天就拿到這週的 ⭐`)
    : "";

  async function save(it: string, a: number, cat: string) {
    setBusy(true);
    const [r, e] = await rpc<any>("add_expense_v3", { p_member: sel.id, p_item: it, p_amount: a, p_type: "", p_category: cat, p_jar: "free", p_pay_method: pay.m, p_pay_detail: pay.d });
    setBusy(false);
    if (e) return toast(e);
    rememberPay(sel.id, pay);
    toast(r && r.left < 0 ? `記好了！自由罐透支 ${fmt(-r.left)}` : `記好了！自由罐還有 ${fmt(r?.left ?? 0)}`);
    setAmt(""); setItem(""); setPick(null); setMore(false);
    await Promise.all([recent.reload(), wk.reload(), data.reload()]);
    onDone?.();
  }
  function add() {
    const a = Math.round(+amt);
    if (!(a > 0)) return toast("先輸入花了多少錢");
    const c = pick !== null ? QUICK_CATS[pick] : null;
    if (!c && !item.trim()) return toast("點一個圖示，或寫下買了什麼");
    save(item.trim() || c![1], a, c ? c[2] : "其他");
  }
  async function noSpend() {
    const [, e] = await rpc("no_spend_today", { p_member: sel.id });
    if (e) return toast(e);
    toast("今天沒花錢，打卡完成 👍");
    await wk.reload();
  }

  return (
    <section className="card quick-log">
      <div className="card-h">
        <h3>花了多少？</h3>
        <span className="small muted">自由罐 <b className="num" style={{ color: data.bal.free < 0 ? "var(--warn)" : "var(--ink)" }}>{fmt(data.bal.free)}</b></span>
      </div>
      <input id="ql-amt" className="ql-amt" type="number" inputMode="numeric" min={1} placeholder="0" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label="金額" />
      <div className="ql-cats" role="group" aria-label="買了什麼">
        {QUICK_CATS.map(([ic, name], i) => (
          <button key={name} className={pick === i ? "on" : ""} onClick={() => setPick(pick === i ? null : i)} aria-pressed={pick === i}>
            <span className="ic">{ic}</span><span>{name}</span>
          </button>
        ))}
      </div>
      <button className="btn primary big" disabled={busy} onClick={add}>記下來</button>

      {recent.list.length > 0 && (
        <div className="ql-again">
          <div className="small muted">一鍵再記一次</div>
          <div className="chips">
            {recent.list.map((r) => (
              <button key={`${r.item}|${r.amount}`} className="chip" disabled={busy} onClick={() => save(r.item, r.amount, r.category)}>{r.item} {fmt(r.amount)}</button>
            ))}
          </div>
        </div>
      )}

      {!wk.w?.today_logged && <button className="btn ghost" onClick={noSpend}>今天沒花錢，打卡 ✓</button>}
      {weekLine && <p className="small" style={{ margin: 0 }}>{weekLine}</p>}

      {!more ? (
        <button className="link-note" onClick={() => setMore(true)}>寫品項、改付款方式（{payLabel({ pay_method: pay.m, pay_detail: pay.d }) || "現金"}）</button>
      ) : (
        <div className="income-form">
          <label className="f">買了什麼（可不填）<input id="ql-item" maxLength={40} placeholder={pick !== null ? QUICK_CATS[pick][1] : "例如：手搖飲"} value={item} onChange={(e) => setItem(e.target.value)} /></label>
          <div className="small muted">怎麼付的</div>
          <PayPicker mid={sel.id} value={pay} onChange={setPay} />
        </div>
      )}
      {onFull && <button className="link-note" onClick={onFull}>切換成完整記帳</button>}
    </section>
  );
}
