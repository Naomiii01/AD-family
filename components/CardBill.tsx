"use client";
import { useEffect, useMemo, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import { fmt, num, shortDate } from "@/lib/util";
import { PayPicker, cardBanks, type Pay } from "./Pay";
import { useAccounts } from "./Assets";

/** A swipe counts toward a card when it was paid with that card, directly or through Apple Pay. */
const onCard = (e: any, bank: string) =>
  (e.pay_method === "card" && e.pay_detail === bank) || (e.pay_method === "epay" && e.pay_detail === `Apple Pay·${bank}`);
const unknownCard = (e: any) => e.pay_method === "epay" && e.pay_detail === "Apple Pay";

/**
 * Paying a credit-card bill: swipes already logged one by one were spent when they happened,
 * so only the part of the bill that was never logged is taken from the jar.
 */
export function CardBill({ app, jar, history, onDone, initialBill }: { app: App; jar: string; history: any[]; onDone: () => void; initialBill?: number }) {
  const { sel, toast, data } = app;
  const [bank, setBank] = useState("");
  const [custom, setCustom] = useState("");
  const [bill, setBill] = useState(initialBill ? String(initialBill) : "");
  const [swipes, setSwipes] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pay, setPay] = useState<Pay>({ m: "transfer", d: "" });
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  // The asset side: lower the card's debt in 我的資產 and (optionally) take it from a bank account.
  const acc = useAccounts(sel.id);
  const [fromAcc, setFromAcc] = useState<string>(() => { try { return localStorage.getItem(`adf-billfrom-${sel.id}`) || ""; } catch { return ""; } });

  useEffect(() => {
    const since = new Date(Date.now() - 120 * 864e5).toISOString();
    supabase.from("expenses").select("id,item,amount,created_at,pay_method,pay_detail,card_paid,jar")
      .eq("member_id", sel.id).eq("voided", false).gte("created_at", since).order("created_at", { ascending: true })
      .then(({ data: rows }: any) => setSwipes((rows || []).filter((e: any) => !e.card_paid && (e.pay_method === "card" || e.pay_method === "epay"))));
  }, [sel.id, tick]);

  const banks = useMemo(() => cardBanks(sel.id, [...swipes, ...history]), [sel.id, swipes, history]);
  const mine = bank ? swipes.filter((e) => onCard(e, bank)) : [];
  const unsure = bank ? swipes.filter(unknownCard) : [];
  useEffect(() => { setPicked(new Set(mine.map((e) => e.id))); }, [bank, swipes]); // eslint-disable-line react-hooks/exhaustive-deps

  const billN = Math.max(0, Math.round(+bill) || 0);
  const logged = [...mine, ...unsure].filter((e) => picked.has(e.id)).reduce((s, e) => s + e.amount, 0);
  const rest = billN - logged;
  const cardAcc = bank ? acc.list.find((a) => a.kind === "card" && a.name.includes(bank)) : undefined;
  const banksAcc = acc.list.filter((a) => a.kind !== "card");
  const fromOk = banksAcc.some((a) => a.id === fromAcc) ? fromAcc : "";
  useEffect(() => { if (cardAcc && !bill && cardAcc.balance < 0) setBill(String(-cardAcc.balance)); }, [cardAcc?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function payIt() {
    setBusy(true);
    const [r, e] = await rpc<any>("pay_card_bill", {
      p_member: sel.id, p_bank: bank, p_bill: billN, p_ids: Array.from(picked), p_jar: jar, p_pay_method: pay.m, p_pay_detail: pay.d,
    });
    setBusy(false);
    if (e) return toast(e);
    if (cardAcc) {
      const note = `${new Date().getMonth() + 1}月${bank}卡費`;
      const [, e2] = fromOk
        ? await rpc("transfer_account", { p_from: fromOk, p_to: cardAcc.id, p_amount: billN, p_note: note })
        : await rpc("save_account", { p_id: cardAcc.id, p_member: sel.id, p_name: cardAcc.name, p_kind: "card", p_balance: Math.max(0, -cardAcc.balance - billN) });
      if (e2) toast(`罐子記好了，但資產沒更新：${e2}`);
      try { localStorage.setItem(`adf-billfrom-${sel.id}`, fromOk); } catch { /* private mode */ }
      acc.reload();
    }
    toast(r.charged > 0
      ? `繳好了：${bank}帳單 ${fmt(r.bill)}，${r.logged ? `其中 ${fmt(r.logged)} 已經記過，` : ""}從${r.jar_name || "固定支出"}扣 ${fmt(r.charged)}`
      : `繳好了：${bank}帳單的 ${fmt(r.bill)} 都已經一筆一筆記過，不用再扣錢`);
    setBill(""); setBank(""); setTick((t) => t + 1);
    await data.reload();
    onDone();
  }

  const row = (e: any) => (
    <label key={e.id} className="cb-row">
      <input type="checkbox" checked={picked.has(e.id)} onChange={() => toggle(e.id)} />
      <span className="d">{shortDate(e.created_at)}</span>
      <span className="t">{e.item}</span>
      <b className="num">{num(e.amount)}</b>
    </label>
  );

  return (
    <div className="card-bill">
      <p className="note">刷卡當下已經記過的消費，那時就從罐子扣掉了。繳卡費時只扣「沒有另外記過」的部分，同一筆錢不會扣兩次。</p>
      <div className="small muted">繳哪一張卡</div>
      <div className="chips" role="group" aria-label="哪一張信用卡">
        {banks.map((b) => <button key={b} className={`chip ${bank === b ? "on" : ""}`} onClick={() => setBank(bank === b ? "" : b)}>{b}</button>)}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <input className="pay-other" maxLength={12} placeholder="其他銀行，例如：凱基" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button className="btn sm" disabled={!custom.trim()} onClick={() => { setBank(custom.trim()); setCustom(""); }}>選這個</button>
      </div>
      {bank && (
        <>
          <label className="f">{bank}這期帳單金額<input id="cb-bill" type="number" inputMode="numeric" min={1} placeholder="例如 8368" value={bill} onChange={(e) => setBill(e.target.value)} /></label>
          <div className="small muted">已經一筆一筆記過的{bank}刷卡<span className="note">（不在這期帳單的請取消勾選）</span></div>
          {mine.length ? <div className="cb-list">{mine.map(row)}</div> : <p className="note">沒有找到標記為{bank}、還沒繳過的刷卡紀錄。</p>}
          {unsure.length > 0 && (
            <>
              <div className="small muted">Apple Pay 沒標卡別的<span className="note">（是用{bank}付的才勾）</span></div>
              <div className="cb-list">{unsure.map(row)}</div>
            </>
          )}
          {billN > 0 && (
            <div className="sug">
              <div className="kv small"><span>帳單</span><b className="num">{fmt(billN)}</b></div>
              <div className="kv small"><span>已經記過</span><b className="num">−{fmt(logged)}</b></div>
              <div className="kv"><span>這次要扣</span><b className="num" style={{ color: rest < 0 ? "var(--warn)" : undefined }}>{fmt(Math.max(0, rest))}</b></div>
              {rest < 0 && <p className="note" style={{ color: "var(--warn)" }}>勾選的比帳單多 {fmt(-rest)}，有幾筆應該在下一期，請取消勾選。</p>}
            </div>
          )}
          <div className="small muted">怎麼繳的</div>
          <PayPicker mid={sel.id} value={pay} onChange={setPay} history={history} />
          {cardAcc && (
            <>
              <div className="small muted">從哪個帳戶繳<span className="note">（我的資產裡的「{cardAcc.name}」欠款 {fmt(Math.max(0, -cardAcc.balance))}，繳完會自動減掉）</span></div>
              <div className="chips" role="group" aria-label="從哪個帳戶繳">
                {banksAcc.map((a) => <button key={a.id} className={`chip ${fromOk === a.id ? "on" : ""}`} onClick={() => setFromAcc(a.id)}>{a.name}</button>)}
                <button className={`chip ${!fromOk ? "on" : ""}`} onClick={() => setFromAcc("")}>不扣帳戶，只減欠款</button>
              </div>
            </>
          )}
          <button className="btn primary" disabled={busy || billN <= 0 || rest < 0} onClick={payIt}>繳卡費</button>
        </>
      )}
    </div>
  );
}
