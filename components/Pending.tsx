"use client";
import { useCallback, useEffect, useId, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import { fmt, shortDate, catsFor, INCOME_CATS, jarList, spendable } from "@/lib/util";
import { CardBill } from "./CardBill";

type Tx = { id: string; dir: "out" | "in"; amount: number; bank: string; note: string; created_at: string };
type Rule = { bank: string; dir: string; action: string; jar: string; category: string; item: string };

// Every mounted card shares one refresh signal, and only the first one on screen draws itself,
// so a resolved item can never linger in a second copy of the card.
const bus = typeof window !== "undefined" ? new EventTarget() : null;
const shown: string[] = [];

/** Bank transfers and deposits caught from notifications, waiting for the person to say what they were. */
export function usePending(memberId: string) {
  const [list, setList] = useState<Tx[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const load = useCallback(async () => {
    const [{ data: tx }, { data: rl }] = await Promise.all([
      supabase.from("pending_tx").select("id,dir,amount,bank,note,created_at").eq("member_id", memberId).eq("status", "pending").order("created_at", { ascending: true }),
      supabase.from("pending_rules").select("bank,dir,action,jar,category,item").eq("member_id", memberId),
    ]);
    setList((tx as Tx[]) || []);
    setRules((rl as Rule[]) || []);
  }, [memberId]);
  useEffect(() => {
    load();
    const on = () => load();
    bus?.addEventListener("pending", on);
    return () => bus?.removeEventListener("pending", on);
  }, [load]);
  const reload = useCallback(async () => { bus?.dispatchEvent(new Event("pending")); }, []);
  return { list, rules, reload };
}

export function PendingCard({ app }: { app: App }) {
  const { sel } = app;
  const p = usePending(sel.id);
  const [open, setOpen] = useState<string | null>(null);
  const me = useId();
  const [first, setFirst] = useState(false);
  useEffect(() => {
    shown.push(me);
    const check = () => setFirst(shown[0] === me);
    check();
    bus?.addEventListener("owner", check);
    return () => { shown.splice(shown.indexOf(me), 1); bus?.removeEventListener("owner", check); bus?.dispatchEvent(new Event("owner")); };
  }, [me]);
  if (!first || !p.list.length) return null;
  return (
    <section className="card pending">
      <div className="card-h"><h3>待確認 {p.list.length} 筆</h3><span className="small muted">從銀行通知抓到的</span></div>
      <p className="note">轉帳和入帳的通知沒寫錢去哪、從哪來，請告訴 App 這筆要怎麼記。選過的方式會記住，下次同一家銀行會先幫你選好。</p>
      <div className="list">
        {p.list.map((t) => (
          <PendingRow key={t.id} app={app} tx={t} rule={p.rules.find((r) => r.bank === t.bank && r.dir === t.dir)}
            open={open === t.id} onOpen={() => setOpen(open === t.id ? null : t.id)} onDone={() => { setOpen(null); p.reload(); }} />
        ))}
      </div>
    </section>
  );
}

function PendingRow({ app, tx, rule, open, onOpen, onDone }: { app: App; tx: Tx; rule?: Rule; open: boolean; onOpen: () => void; onDone: () => void }) {
  const { sel, toast, data } = app;
  const isOut = tx.dir === "out";
  const def = rule?.action || (isOut ? "expense" : "income");
  const [action, setAction] = useState(def);
  const [jar, setJar] = useState(rule?.jar || "free");
  const [cat, setCat] = useState(rule?.category || (isOut ? "其他" : "兼職"));
  const [item, setItem] = useState(rule?.item || "");
  const [busy, setBusy] = useState(false);
  const noAmt = !tx.amount;
  const [amt, setAmt] = useState("");
  const amount = noAmt ? Math.round(+amt) || 0 : tx.amount;
  const [maybe, setMaybe] = useState<string>("");

  // Already logged by hand? Look for the same amount within two days either side.
  useEffect(() => {
    if (!open || noAmt) return;
    const t = Date.parse(tx.created_at), from = new Date(t - 2 * 864e5).toISOString();
    const q = isOut
      ? supabase.from("expenses").select("item,amount,created_at").eq("member_id", sel.id).eq("voided", false).eq("amount", tx.amount).gte("created_at", from)
      : supabase.from("incomes").select("source,amount,created_at").eq("member_id", sel.id).eq("amount", tx.amount).gte("created_at", from);
    q.then(({ data: rows }: any) => {
      const r = (rows || []).find((x: any) => Math.abs(Date.parse(x.created_at) - t) < 2 * 864e5);
      setMaybe(r ? `${shortDate(r.created_at)} 已經有一筆「${r.item || r.source}」${fmt(r.amount)}，可能就是這筆` : "");
    });
  }, [open, tx, sel.id, isOut]);

  const jars = isOut ? spendable(sel) : jarList(sel).filter((j) => j.key !== "long" || sel.role !== "kid");
  const cats = isOut ? catsFor(jar) : INCOME_CATS[sel.role === "kid" ? "kid" : "adult"];
  const acts: [string, string][] = isOut
    ? [["expense", "記成支出"], ["card", "繳卡費"], ["stock", "買股票"], ["ignore", "不用記"]]
    : [["income", "記成收入"], ["stock", "賣股票"], ["ignore", "不用記"]];
  const hint: Record<string, string> = {
    card: "下面勾掉已經逐筆記過的刷卡，只扣沒記過的部分。",
    stock: "股票的錢在「罐子 → 股票帳」記交易，這筆通知直接關掉，不會重複記。",
    ignore: "自己帳戶之間轉來轉去、已經記過的、薪水（月初規劃已算）都選這個。",
  };

  async function resolve(a: string) {
    setBusy(true);
    const [, e] = await rpc("resolve_pending_v2", { p_id: tx.id, p_action: a, p_jar: jar, p_item: item, p_category: cat, p_remember: true, p_amount: noAmt ? amount : null });
    setBusy(false);
    if (e) return toast(e);
    toast(a === "expense" ? "記成支出了" : a === "income" ? "記成收入了" : a === "card" ? "卡費繳好了" : "已關掉這筆");
    await data.reload();
    onDone();
  }

  return (
    <div className="pend-row">
      <button className="pend-head" onClick={onOpen} aria-expanded={open}>
        <span className={`tag ${isOut ? "want" : "income"}`}>{isOut ? "轉出" : "入帳"}</span>
        <span className="t">{tx.bank}<br /><span className="d">{tx.note} · {shortDate(tx.created_at)}</span></span>
        {noAmt ? <b className="small" style={{ color: "var(--warn)" }}>金額待填</b>
          : <b className="num" style={{ color: isOut ? "var(--warn)" : "var(--long)" }}>{isOut ? "−" : "+"}{fmt(tx.amount)}</b>}
      </button>
      {!open && rule && (
        <div className="pend-quick">
          <span className="note">上次：{acts.find(([k]) => k === rule.action)?.[1]}{rule.jar && ["expense", "income"].includes(rule.action) ? ` · ${jars.find((j) => j.key === rule.jar)?.name || rule.jar}` : ""}{rule.item ? ` · ${rule.item}` : ""}</span>
          {rule.action !== "card" && (!noAmt || !["expense", "income"].includes(rule.action)) && <button className="btn sm primary" disabled={busy} onClick={() => resolve(rule.action)}>照上次</button>}
          <button className="btn sm" onClick={onOpen}>改</button>
        </div>
      )}
      {!open && !rule && <div className="pend-quick"><button className="btn sm primary" onClick={onOpen}>確認怎麼記</button></div>}
      {open && (
        <div className="income-form">
          {noAmt && (
            <label className="f">{tx.bank}的通知沒寫金額，請打開{tx.bank} App 查一下再填<input id={`pd-amt-${tx.id}`} type="number" inputMode="numeric" min={1} placeholder="金額" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
          )}
          {maybe && <p className="note" style={{ color: "var(--warn)" }}>{maybe}。是的話選「不用記」。</p>}
          <div className="seg" role="group" aria-label="這筆是什麼">
            {acts.map(([k, n]) => <button key={k} className={action === k ? "on" : ""} onClick={() => setAction(k)}>{n}</button>)}
          </div>
          {hint[action] && <p className="note">{hint[action]}</p>}
          {(action === "expense" || action === "income") && (
            <>
              <label className="f">{isOut ? "付給誰／買了什麼" : "收入來源"}<input id={`pd-item-${tx.id}`} maxLength={40} placeholder={isOut ? `例如：婕樂纖進貨` : "例如：雯婷叫貨"} value={item} onChange={(e) => setItem(e.target.value)} /></label>
              <div className="small muted">{isOut ? "從哪個罐子付" : "放進哪個罐子"}</div>
              <div className="seg" role="group" aria-label="哪個罐子">
                {jars.map((j) => <button key={j.key} className={jar === j.key ? "on" : ""} onClick={() => { setJar(j.key); if (isOut && (j.key === "fixed") !== (jar === "fixed")) setCat(catsFor(j.key)[0]); }}>{j.name}</button>)}
              </div>
              <div className="chips" role="group" aria-label="類別">
                {cats.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
              </div>
              <button className="btn primary" disabled={busy || !(amount > 0)} onClick={() => resolve(action)}>{isOut ? `記成支出 ${fmt(amount)}` : `記成收入 ${fmt(amount)}`}</button>
            </>
          )}
          {action === "card" && <CardBill app={app} jar="fixed" history={[]} initialBill={amount || undefined} onDone={() => resolve("card")} />}
          {(action === "stock" || action === "ignore") && <button className="btn primary" disabled={busy} onClick={() => resolve(action)}>關掉這筆</button>}
        </div>
      )}
    </div>
  );
}
