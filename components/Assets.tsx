"use client";
import { useCallback, useEffect, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import { fmt } from "@/lib/util";
import { useStocks, holdingsOf, stockSummary } from "./Stocks";

type Acc = { id: string; name: string; kind: "cash" | "bank" | "epay" | "card"; balance: number; updated_at: string };
const KIND: Record<Acc["kind"], [string, string]> = { cash: ["💵", "現金"], epay: ["📲", "電子支付"], bank: ["🏦", "銀行"], card: ["💳", "信用卡"] };
const GROUPS: [string, Acc["kind"][]][] = [["現金與電子支付", ["cash", "epay"]], ["銀行帳戶", ["bank"]], ["信用卡", ["card"]]];

export function useAccounts(memberId: string) {
  const [list, setList] = useState<Acc[]>([]);
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("accounts").select("id,name,kind,balance,updated_at").eq("member_id", memberId).eq("voided", false).order("sort", { ascending: true });
    setList((data as Acc[]) || []);
    setLoaded(true);
  }, [memberId]);
  useEffect(() => { load(); }, [load]);
  return { list, loaded, reload: load };
}

/** Net worth = every account (credit cards count as debt) + the stock account at market value. */
export function useNetWorth(memberId: string, bump?: unknown) {
  const acc = useAccounts(memberId);
  const st = useStocks(memberId, bump);
  const stocks = stockSummary(holdingsOf(st.trades, st.prices));
  const assets = acc.list.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0) + stocks.value;
  const debt = -acc.list.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0);
  return { acc, stocks, assets, debt, net: assets - debt };
}

/** Small card on the jars page; opens the full page. */
export function NetWorthCard({ app }: { app: App }) {
  const { sel, go } = app;
  const w = useNetWorth(sel.id);
  if (!w.acc.loaded) return null;
  return (
    <button className="card nw-card" onClick={() => go("more", "assets")}>
      <div className="card-h"><h3>我的資產</h3><span className="muted small">{w.acc.list.length ? "看全部 ›" : "開始記錄 ›"}</span></div>
      {w.acc.list.length || w.stocks.value ? (
        <div className="grid3 center">
          <div><div className="note">淨資產</div><b className="num">{fmt(w.net)}</b></div>
          <div><div className="note">資產</div><b className="num">{fmt(w.assets)}</b></div>
          <div><div className="note">負債</div><b className="num" style={{ color: w.debt ? "var(--warn)" : undefined }}>{fmt(w.debt)}</b></div>
        </div>
      ) : <p className="note" style={{ textAlign: "left" }}>把現金、銀行、LINE Pay、信用卡加進來，隨時看到自己有多少錢。</p>}
    </button>
  );
}

export default function Assets({ app }: { app: App }) {
  const { sel, go } = app;
  const w = useNetWorth(sel.id);
  const [form, setForm] = useState<"" | "add" | "move" | Acc>("");
  const [hide, setHide] = useState(false);
  const money = (v: number) => (hide ? "＊＊＊＊" : fmt(v));

  return (
    <>
      <section className="card nw-head">
        <div className="card-h">
          <span className="muted">淨資產</span>
          <button className="btn sm ghost" onClick={() => setHide(!hide)} aria-label={hide ? "顯示金額" : "隱藏金額"}>{hide ? "👁 顯示" : "🙈 隱藏"}</button>
        </div>
        <div className="big-n">{money(w.net)}</div>
        <div className="row small" style={{ gap: 14 }}>
          <span>資產 <b className="num">{money(w.assets)}</b></span>
          <span>負債 <b className="num" style={{ color: w.debt ? "var(--warn)" : undefined }}>{money(w.debt)}</b></span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm primary" onClick={() => setForm("add")}>＋ 新增帳戶</button>
          {w.acc.list.length >= 2 && <button className="btn sm" onClick={() => setForm("move")}>⇄ 轉帳</button>}
        </div>
      </section>

      {form === "add" && <AccForm app={app} onDone={() => { setForm(""); w.acc.reload(); }} />}
      {form === "move" && <MoveForm app={app} list={w.acc.list} onDone={() => { setForm(""); w.acc.reload(); }} />}
      {form && typeof form === "object" && <AccForm app={app} acc={form} onDone={() => { setForm(""); w.acc.reload(); }} />}

      {GROUPS.map(([title, kinds]) => {
        const rows = w.acc.list.filter((a) => kinds.includes(a.kind));
        if (!rows.length) return null;
        const sum = rows.reduce((s, a) => s + a.balance, 0);
        return (
          <section key={title} className="card">
            <div className="card-h"><h3>{title}</h3><span className="num small muted">{kinds[0] === "card" ? "欠款" : "合計"} {money(Math.abs(sum))}</span></div>
            <div className="list">
              {rows.map((a) => (
                <button key={a.id} className="li acc-row" onClick={() => setForm(a)}>
                  <span className="acc-ic" aria-hidden="true">{KIND[a.kind][0]}</span>
                  <span className="t">{a.name}<br /><span className="note">{KIND[a.kind][1]} · {new Date(a.updated_at).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" })} 更新</span></span>
                  <b className="num" style={{ color: a.balance < 0 ? "var(--warn)" : undefined }}>{a.balance < 0 ? "−" : ""}{money(Math.abs(a.balance))}</b>
                  <span className="muted">›</span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      {(w.stocks.value > 0 || w.stocks.held.length > 0) && (
        <button className="card nw-card" onClick={() => go("jars")}>
          <div className="card-h"><h3>投資（股票帳）</h3><span className="num">{money(w.stocks.value)}</span></div>
          <p className="note" style={{ textAlign: "left" }}>成本 {money(w.stocks.cost)}，帳面{w.stocks.gain >= 0 ? "賺" : "賠"} {money(Math.abs(w.stocks.gain))}。在「罐子 → 股票帳」記交易。</p>
        </button>
      )}

      {w.acc.loaded && !w.acc.list.length && form !== "add" && (
        <p className="note">建議先加：現金、常用的銀行帳戶、LINE Pay，還有每張信用卡（填目前欠多少）。之後每隔一陣子點帳戶校正一次餘額就好。</p>
      )}
      <p className="note">資產帳戶是看「錢放在哪裡」，跟罐子（錢打算怎麼用）分開記，不會影響罐子的金額。繳卡費時，到「記一筆 → 支出 → 固定支出 → 卡費」記一次就好：罐子扣錢、信用卡欠款減少、銀行餘額扣掉，會一起處理。</p>
    </>
  );
}

function AccForm({ app, acc, onDone }: { app: App; acc?: Acc; onDone: () => void }) {
  const { sel, toast } = app;
  const [name, setName] = useState(acc?.name || "");
  const [kind, setKind] = useState<Acc["kind"]>(acc?.kind || "bank");
  const [bal, setBal] = useState(acc ? String(Math.abs(acc.balance)) : "");
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  async function save() {
    setBusy(true);
    const [, e] = await rpc("save_account", { p_id: acc?.id || null, p_member: sel.id, p_name: name, p_kind: kind, p_balance: Math.round(+bal) || 0 });
    setBusy(false);
    if (e) return toast(e);
    toast(acc ? "帳戶更新好了" : "帳戶加好了");
    onDone();
  }
  async function remove() {
    if (!acc) return;
    const [, e] = await rpc("void_account", { p_id: acc.id });
    if (e) return toast(e);
    toast("帳戶刪掉了");
    onDone();
  }
  return (
    <section className="card">
      <h3>{acc ? `修改「${acc.name}」` : "新增帳戶"}</h3>
      <div className="seg" role="group" aria-label="帳戶種類">
        {(Object.keys(KIND) as Acc["kind"][]).map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{KIND[k][0]} {KIND[k][1]}</button>)}
      </div>
      <label className="f">名稱<input id="acc-name" maxLength={20} placeholder={kind === "card" ? "例如：兆豐信用卡" : kind === "epay" ? "例如：LINE Pay" : kind === "cash" ? "例如：錢包現金" : "例如：中國信託"} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="f">{kind === "card" ? "目前欠款（還沒繳的卡費）" : "目前餘額"}<input id="acc-bal" type="number" inputMode="numeric" value={bal} onChange={(e) => setBal(e.target.value)} placeholder="0" /></label>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={busy || !name.trim()} onClick={save}>{acc ? "儲存" : "加入"}</button>
        <button className="btn" onClick={onDone}>取消</button>
        {acc && (sure ? <button className="btn danger" onClick={remove}>確定刪除</button> : <button className="btn ghost" onClick={() => setSure(true)}>刪除帳戶</button>)}
      </div>
    </section>
  );
}

function MoveForm({ app, list, onDone }: { app: App; list: Acc[]; onDone: () => void }) {
  const { toast } = app;
  const [from, setFrom] = useState(list.find((a) => a.kind !== "card")?.id || list[0].id);
  const [to, setTo] = useState(list.find((a) => a.id !== from)?.id || "");
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const toCard = list.find((a) => a.id === to)?.kind === "card";
  async function save() {
    setBusy(true);
    const [, e] = await rpc("transfer_account", { p_from: from, p_to: to, p_amount: Math.round(+amt) || 0, p_note: note });
    setBusy(false);
    if (e) return toast(e);
    toast("轉帳記好了");
    onDone();
  }
  return (
    <section className="card">
      <h3>帳戶轉帳</h3>
      <div className="small muted">從</div>
      <div className="chips">{list.map((a) => <button key={a.id} className={`chip ${from === a.id ? "on" : ""}`} onClick={() => { setFrom(a.id); if (to === a.id) setTo(""); }}>{KIND[a.kind][0]} {a.name}</button>)}</div>
      <div className="small muted">轉到</div>
      <div className="chips">{list.filter((a) => a.id !== from).map((a) => <button key={a.id} className={`chip ${to === a.id ? "on" : ""}`} onClick={() => setTo(a.id)}>{KIND[a.kind][0]} {a.name}</button>)}</div>
      <div className="grid2">
        <label className="f">金額<input id="mv-amt" type="number" inputMode="numeric" min={1} value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
        <label className="f">備註（可不填）<input id="mv-note" maxLength={40} placeholder={toCard ? "例如：11月卡費" : ""} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {toCard && <p className="note">繳卡費建議改用「記一筆 → 固定支出 → 卡費」，罐子和資產會一起更新；在這裡轉只會改資產，不會動到罐子。</p>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={busy || !to || !(+amt > 0)} onClick={save}>記下轉帳</button>
        <button className="btn" onClick={onDone}>取消</button>
      </div>
    </section>
  );
}

