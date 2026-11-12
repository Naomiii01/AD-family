"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc, fn } from "@/lib/supabase";
import { fmt, num, jarList } from "@/lib/util";

export type Trade = { id: string; traded_on: string; symbol: string; name: string; side: "buy" | "sell"; shares: number; price: number; fee: number; tax: number; jar: string; created_at: string; cost_known?: boolean;
  style?: string; reason?: string; stop_loss?: number | null; take_profit?: number | null; target?: number | null };
export const STYLES = ["當沖", "隔日沖", "波段", "長期存股", "權證", "其他"];
/** Chronological order; on the same day buys come first, so a 先賣後買 day trade is priced against that day's buy. */
export const tradeOrder = (a: Trade, b: Trade) => a.traded_on !== b.traded_on ? (a.traded_on < b.traded_on ? -1 : 1) : a.side !== b.side ? (a.side === "buy" ? -1 : 1) : a.created_at < b.created_at ? -1 : 1;
type Price = { symbol: string; name: string; price: number | null; price_date: string | null; updated_at: string };
export type Holding = { symbol: string; name: string; shares: number; cost: number; avg: number; realized: number; price: number | null; value: number | null; costUnknown?: boolean };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
/** 手續費 0.1425%：整張最低 20 元，零股最低 1 元（各家券商折扣不同，可以自己改）。 */
export const feeOf = (shares: number, price: number) => (shares > 0 && price > 0 ? Math.max(shares % 1000 === 0 ? 20 : 1, Math.round(shares * price * 0.001425)) : 0);
/** 證交稅：股票 0.3%，ETF（代號 00 開頭）0.1%，賣出才收。 */
export const taxOf = (symbol: string, shares: number, price: number) => Math.floor(shares * price * (/^00/.test(symbol) ? 0.001 : 0.003));

/** Weighted-average cost per symbol, with realized gains from every sale. */
export function holdingsOf(trades: Trade[], prices: Record<string, Price>): { list: Holding[]; realized: number } {
  const by: Record<string, Holding> = {};
  let realized = 0;
  for (const t of [...trades].sort(tradeOrder)) {
    const h = (by[t.symbol] ||= { symbol: t.symbol, name: t.name, shares: 0, cost: 0, avg: 0, realized: 0, price: null, value: null });
    if (t.name) h.name = t.name;
    if (t.side === "buy") {
      h.cost += t.shares * Number(t.price) + t.fee;
      h.shares += t.shares;
      if (t.cost_known === false) h.costUnknown = true;
    } else {
      const avg = h.shares ? h.cost / h.shares : 0;
      const gain = t.shares * Number(t.price) - t.fee - t.tax - avg * t.shares;
      h.realized += gain;
      realized += gain;
      h.cost -= avg * t.shares;
      h.shares -= t.shares;
    }
    h.avg = h.shares ? h.cost / h.shares : 0;
  }
  const list = Object.values(by).map((h) => {
    const p = prices[h.symbol];
    const price = p?.price != null ? Number(p.price) : null;
    return { ...h, name: h.name || p?.name || "", price, value: price != null ? price * h.shares : null };
  });
  return { list, realized };
}

export function useStocks(memberId: string, bump?: unknown) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [prices, setPrices] = useState<Record<string, Price>>({});
  const [loaded, setLoaded] = useState(false);
  const loadPrices = useCallback(async () => {
    const { data } = await supabase.from("stock_prices").select("symbol,name,price,price_date,updated_at");
    setPrices(Object.fromEntries(((data as Price[]) || []).map((p) => [p.symbol, p])));
  }, []);
  const load = useCallback(async () => {
    const { data } = await supabase.from("stock_trades").select("id,traded_on,symbol,name,side,shares,price,fee,tax,jar,created_at,cost_known,style,reason,stop_loss,take_profit,target")
      .eq("member_id", memberId).eq("voided", false).order("traded_on", { ascending: true });
    setTrades((data as Trade[]) || []);
    await loadPrices();
    setLoaded(true);
  }, [memberId, loadPrices, bump]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  /** Ask the server for fresh prices; answers an error message or null. */
  const refresh = useCallback(async (symbols: string[]) => {
    if (!symbols.length) return null;
    const [, e] = await fn("stock-price", { symbols });
    await loadPrices();
    return e;
  }, [loadPrices]);
  return { trades, prices, loaded, reload: load, refresh };
}

const pctTxt = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const gainColor = (v: number) => (v >= 0 ? "var(--long)" : "var(--warn)");
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;

/** Summary of the stock account for the jar column: market value (or cost while no price yet). */
export function stockSummary(h: ReturnType<typeof holdingsOf>) {
  const held = h.list.filter((x) => x.shares > 0);
  const cost = held.reduce((s, x) => s + x.cost, 0);
  const value = held.reduce((s, x) => s + (x.value ?? x.cost), 0);
  return { cost, value, gain: value - cost, held };
}

export function StockCard({ app }: { app: App }) {
  const { sel, toast, data } = app;
  const st = useStocks(sel.id);
  const h = useMemo(() => holdingsOf(st.trades, st.prices), [st.trades, st.prices]);
  const sum = stockSummary(h);
  const [form, setForm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [del, setDel] = useState<Trade | null>(null);
  const [showAll, setShowAll] = useState(false);

  const heldSyms = sum.held.map((x) => x.symbol).join(",");
  useEffect(() => {
    if (!st.loaded || !heldSyms) return;
    const stale = sum.held.some((x) => { const p = st.prices[x.symbol]; return !p || Date.now() - Date.parse(p.updated_at) > 30 * 60e3; });
    if (stale) st.refresh(heldSyms.split(","));
  }, [st.loaded, heldSyms]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshNow() {
    setRefreshing(true);
    const e = await st.refresh(sum.held.map((x) => x.symbol));
    setRefreshing(false);
    toast(e || "股價更新好了");
  }
  async function removeTrade() {
    if (!del) return;
    const [, e] = await rpc("void_stock_trade", { p_id: del.id });
    setDel(null);
    if (e) return toast(e);
    toast("已刪除，錢退回原本的罐子");
    await Promise.all([st.reload(), data.reload()]);
  }

  const lastDate = sum.held.map((x) => st.prices[x.symbol]?.price_date).filter(Boolean).sort().pop();
  const noPrice = sum.held.some((x) => x.price == null);
  const recent = [...st.trades].reverse();

  return (
    <section className="card">
      <div className="card-h"><h2>股票帳</h2><span className="row" style={{ gap: 6 }}>{sel.role !== "kid" && <button className="btn sm ghost" onClick={() => app.go("more", "xiaocai")}>小財怪紀錄 ›</button>}{sum.held.length > 0 && <button className="btn sm" disabled={refreshing} onClick={refreshNow}>{refreshing ? "更新中…" : "更新股價"}</button>}</span></div>
      {st.trades.length === 0 && !form && (
        <p className="small">買股票時記一筆，App 會幫你算平均成本、目前市值和賺賠。買股票的錢從你選的罐子出，不算「花費」，不會出現在月檢討的圓餅圖；賣掉的錢會回到你選的罐子。</p>
      )}
      {sum.held.length > 0 && (
        <>
          <div className="grid3 center">
            <div><div className="note">投入成本</div><b className="num">{fmt(sum.cost)}</b></div>
            <div><div className="note">目前市值</div><b className="num">{fmt(sum.value)}</b></div>
            <div><div className="note">{sum.gain >= 0 ? "帳面賺" : "帳面賠"}</div>
              <b className="num" style={{ color: gainColor(sum.gain) }}>{signed(sum.gain)}</b>
              <div className="note" style={{ color: gainColor(sum.gain) }}>{sum.cost > 0 ? pctTxt((sum.gain / sum.cost) * 100) : ""}</div>
            </div>
          </div>
          <div className="list stock-list">
            {sum.held.map((x) => {
              const g = x.value != null ? x.value - x.cost : null;
              return (
                <div className="li" key={x.symbol}>
                  <span className="t"><b>{x.name || x.symbol}</b> <span className="note">{x.symbol}</span><br />
                    <span className="d">{num(x.shares)} 股 · {x.costUnknown ? `成本不明（以 ${x.avg.toFixed(2)} 計）` : `均價 ${x.avg.toFixed(2)}`}{x.price != null ? ` · 現價 ${x.price}` : " · 還沒有股價"}</span></span>
                  <span />
                  <span className="num" style={{ textAlign: "right" }}>{fmt(x.value ?? x.cost)}<br />
                    {g != null && <span className="small" style={{ color: gainColor(g) }}>{signed(g)}（{pctTxt(x.cost ? (g / x.cost) * 100 : 0)}）</span>}</span>
                </div>
              );
            })}
          </div>
          <p className="note">{lastDate ? `股價：證交所 / 櫃買中心 ${+lastDate.slice(5, 7)}/${+lastDate.slice(8)}，盤中約有幾十秒延遲。` : ""}{noPrice ? "有幾支還沒抓到股價，先用成本計算。" : ""}帳面賺賠還沒扣賣出時的手續費和稅。</p>
        </>
      )}
      {h.list.some((x) => x.realized !== 0) && (
        <div className="kv"><span>已經賣出的實際賺賠</span><b className="num" style={{ color: gainColor(h.realized) }}>{signed(h.realized)}</b></div>
      )}
      {form ? <TradeForm app={app} st={st} holdings={h.list} onClose={() => setForm(false)} /> : (
        <button className="btn primary" onClick={() => setForm(true)}>＋ 記一筆股票交易</button>
      )}
      {recent.length > 0 && (
        <>
          <h3 style={{ marginTop: 8 }}>交易紀錄</h3>
          <div className="list">
            {(showAll ? recent : recent.slice(0, 5)).map((t) => (
              <div className="li" key={t.id}>
                <span className="d">{+t.traded_on.slice(5, 7)}/{+t.traded_on.slice(8)}</span>
                <span className="t"><span className={`tag ${t.side === "buy" ? "need" : "want"}`}>{t.side === "buy" ? "買" : "賣"}</span> {t.name || t.symbol} {num(t.shares)} 股 @ {Number(t.price)}
                  <br /><span className="note">{t.side === "buy" ? "付出" : "拿回"} {fmt(t.side === "buy" ? t.shares * t.price + t.fee : t.shares * t.price - t.fee - t.tax)} · {t.jar === "none" ? "以前買的，沒扣罐子" : jarList(sel).find((j) => j.key === t.jar)?.name || t.jar}</span></span>
                <span />
                <button className="x" onClick={() => setDel(t)} aria-label={`刪除 ${t.symbol} 這筆交易`}>×</button>
              </div>
            ))}
          </div>
          {recent.length > 5 && <button className="link-note" onClick={() => setShowAll(!showAll)}>{showAll ? "收起" : `看全部 ${recent.length} 筆`}</button>}
        </>
      )}
      {del && (
        <div className="banner warn">
          <span>刪除「{del.side === "buy" ? "買進" : "賣出"} {del.name || del.symbol} {num(del.shares)} 股」？錢會退回原本的罐子。</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm danger" onClick={removeTrade}>刪除</button>
            <button className="btn sm ghost" onClick={() => setDel(null)}>取消</button>
          </div>
        </div>
      )}
    </section>
  );
}

export function TradeForm({ app, st, holdings, onClose, withNote }: { app: App; st: ReturnType<typeof useStocks>; holdings: Holding[]; onClose: () => void; withNote?: boolean }) {
  const { sel, toast, data } = app;
  const real = jarList(sel).filter((j) => j.key !== "dream");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [date, setDate] = useState(today());
  const [sym, setSym] = useState("");
  const [name, setName] = useState("");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState<string | null>(null);
  const [tax, setTax] = useState<string | null>(null);
  const [jar, setJar] = useState(() => (data.bal.long > 0 ? "long" : "free"));
  const [busy, setBusy] = useState(false);
  const [looking, setLooking] = useState(false);
  const [note, setNote] = useState<NoteVals>(blankNote);

  const S = sym.trim().toUpperCase();
  const n = Math.max(0, Math.round(+shares) || 0);
  const p = Math.max(0, +price || 0);
  const autoFee = feeOf(n, p);
  const autoTax = side === "sell" ? taxOf(S, n, p) : 0;
  const f = fee === null ? autoFee : Math.max(0, Math.round(+fee) || 0);
  const t = side === "sell" ? (tax === null ? autoTax : Math.max(0, Math.round(+tax) || 0)) : 0;
  const total = side === "buy" ? Math.round(n * p + f) : Math.round(n * p - f - t);
  const held = holdings.find((x) => x.symbol === S);
  const jars = side === "buy" ? [...real, { key: "none", name: "以前買的", core: false }] : real;
  const old = side === "buy" && jar === "none";
  const notHeld = side === "sell" && /^[0-9A-Z]{2,8}$/.test(S) && !(held && held.shares > 0);
  function asOld() { setSide("buy"); setJar("none"); setShares(""); setPrice(""); setFee(null); setTax(null); }
  const bal = (k: string) => (k === "free" ? data.bal.free : k === "long" ? data.bal.long : data.bal.extras?.[k] || 0);

  async function lookup() {
    if (!/^[0-9A-Z]{2,8}$/.test(S)) return;
    const known = st.prices[S] || (held ? { name: held.name, price: held.price } : null);
    if (known?.name) setName(known.name);
    setLooking(true);
    const e = await st.refresh([S]);
    setLooking(false);
    const { data: row } = await supabase.from("stock_prices").select("symbol,name,price").eq("symbol", S).maybeSingle();
    if (row?.name) setName(row.name);
    if (row?.price && !price) setPrice(String(Number(row.price)));
    if (!row && e) toast(e);
    else if (!row) toast(`找不到 ${S}，請確認代號（目前支援台股和 ETF）`);
  }

  async function save() {
    setBusy(true);
    // An old holding without a known cost is booked at today's price, so its gain starts from 0.
    let px = p, unknown = false;
    if (old && !(p > 0)) {
      await st.refresh([S]);
      const { data: row } = await supabase.from("stock_prices").select("price").eq("symbol", S).maybeSingle();
      px = Number(row?.price) || 0;
      unknown = true;
      if (!(px > 0)) { setBusy(false); return toast(`查不到 ${S} 的現價，請填成本價`); }
    }
    const [r, e] = await rpc<any>("add_stock_trade", {
      p_member: sel.id, p_date: date, p_symbol: S, p_name: name, p_side: side, p_shares: n, p_price: px, p_fee: unknown ? 0 : f, p_tax: t, p_jar: jar,
    });
    if (!e && unknown) await rpc("mark_cost_unknown", { p_id: r.id });
    if (!e && withNote && hasNote(note)) await saveNote(r.id, note);
    setBusy(false);
    if (e) return toast(e);
    toast(old ? `記好了：${name || S} ${num(n)} 股加進持股${unknown ? `，成本先用現價 ${px} 計算` : ""}，沒有從罐子扣錢`
      : side === "buy"
      ? `記好了：從${r.jar_name}付 ${fmt(-r.amount)}${r.left < 0 ? `，${r.jar_name}透支 ${fmt(-r.left)}` : ""}`
      : `記好了：${fmt(r.amount)} 放回${r.jar_name}`);
    await Promise.all([st.reload(), data.reload()]);
    onClose();
  }

  return (
    <div className="income-form">
      <div className="seg" role="group" aria-label="買進或賣出">
        <button className={side === "buy" ? "on" : ""} onClick={() => setSide("buy")}>買進</button>
        <button className={side === "sell" ? "on" : ""} onClick={() => { setSide("sell"); if (jar === "none") setJar(data.bal.long > 0 ? "long" : "free"); }}>賣出</button>
      </div>
      {side === "sell" && (
        <div className="chips" role="group" aria-label="賣哪一支">
          {holdings.filter((x) => x.shares > 0).map((x) => (
            <button key={x.symbol} className={`chip ${S === x.symbol ? "on" : ""}`}
              onClick={() => { setSym(x.symbol); setName(x.name); setShares(String(x.shares)); if (x.price) setPrice(String(x.price)); }}>{x.name || x.symbol}</button>
          ))}
        </div>
      )}
      <div className="grid2">
        <label className="f">股票代號<input id="st-sym" maxLength={8} autoCapitalize="characters" placeholder="例如 0050" value={sym}
          onChange={(e) => { setSym(e.target.value); setName(""); }} onBlur={lookup} /></label>
        <label className="f">{old ? "買進日（不確定可以不改）" : "成交日"}<input id="st-date" type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      {(name || looking) && <p className="small" style={{ margin: 0 }}>{looking && !name ? "查詢中…" : <>{name}{held && held.shares > 0 ? <span className="note">　目前有 {num(held.shares)} 股，均價 {held.avg.toFixed(2)}</span> : null}</>}</p>}
      <div className="grid2">
        <label className="f">股數<input id="st-shares" type="number" inputMode="numeric" min={1} placeholder="1 張 = 1000 股" value={shares} onChange={(e) => setShares(e.target.value)} /></label>
        <label className="f">{old ? "成本價（查不到可以不填）" : "成交價"}<input id="st-price" type="number" inputMode="decimal" min={0} step="0.01" placeholder={old ? "不填就用現價" : "每股價格"} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
      </div>
      <div className="grid2">
        <label className="f">手續費<input id="st-fee" type="number" inputMode="numeric" min={0} value={fee ?? String(autoFee)} onChange={(e) => setFee(e.target.value)} /></label>
        {side === "sell" && <label className="f">證交稅<input id="st-tax" type="number" inputMode="numeric" min={0} value={tax ?? String(autoTax)} onChange={(e) => setTax(e.target.value)} /></label>}
      </div>
      <p className="note">手續費預設 0.1425%，有券商折扣的話照對帳單改。{side === "sell" ? "證交稅：股票 0.3%、ETF 0.1%。" : ""}</p>
      {notHeld && (
        <div className="banner warn">
          <span>App 裡還沒有 {name || S} 的持股，所以不能記賣出。如果是開始用 App 之前就買的，先補記一筆「以前買的持股」（填當初的買進價，賺賠才算得準），再回來記賣出。</span>
          <div><button className="btn sm primary" onClick={asOld}>補記以前買的 {name || S}</button></div>
        </div>
      )}
      <div className="small muted">{side === "buy" ? "錢從哪個罐子出" : "賣掉的錢放回哪個罐子"}</div>
      <div className="seg" role="group" aria-label="哪個罐子">
        {jars.map((j) => <button key={j.key} className={jar === j.key ? "on" : ""} onClick={() => setJar(j.key)}>{j.name}</button>)}
      </div>
      {n > 0 && p > 0 && (
        <div className="kv"><span>{old ? "持股成本" : side === "buy" ? "一共付出" : "實際拿回"}</span><b className="num">{fmt(total)}</b></div>
      )}
      {jar === "none" && side === "buy" && <p className="note">「以前買的」只把股票加進持股，不會從任何罐子扣錢。查得到成本價就填（分好幾次買的可以填平均價），賺賠才算得準；查不到就空著，App 會先用現在的股價當成本，之後的漲跌從今天開始算。</p>}
      {side === "buy" && jar !== "none" && n > 0 && p > 0 && total > bal(jar) && <p className="note" style={{ color: "var(--warn)" }}>這個罐子只有 {fmt(bal(jar))}，記下去會透支 {fmt(total - bal(jar))}。</p>}
      {withNote && <NoteFields v={note} set={setNote} side={side} />}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={busy || !S || n <= 0 || (p <= 0 && !old) || (side === "sell" && (!held || n > held.shares))} onClick={save}>記下來</button>
        <button className="btn" onClick={onClose}>取消</button>
      </div>
      {side === "sell" && held && n > held.shares && <p className="note" style={{ color: "var(--warn)" }}>你只有 {num(held.shares)} 股。</p>}
    </div>
  );
}

/* ---------- 小財怪 notes on a trade ---------- */
export type NoteVals = { style: string; reason: string; stop: string; take: string; target: string };
export const blankNote: NoteVals = { style: "", reason: "", stop: "", take: "", target: "" };
export const noteOf = (t: Trade): NoteVals => ({ style: t.style || "", reason: t.reason || "", stop: t.stop_loss ? String(Number(t.stop_loss)) : "", take: t.take_profit ? String(Number(t.take_profit)) : "", target: t.target ? String(Number(t.target)) : "" });
const hasNote = (v: NoteVals) => !!(v.style || v.reason.trim() || +v.stop || +v.take || +v.target);
export const saveNote = (id: string, v: NoteVals) =>
  rpc("set_trade_note", { p_id: id, p_style: v.style, p_reason: v.reason.trim(), p_stop: +v.stop || 0, p_take: +v.take || 0, p_target: +v.target || 0 });

export function NoteFields({ v, set, side }: { v: NoteVals; set: (v: NoteVals) => void; side: "buy" | "sell" }) {
  return (
    <div className="xc-note">
      <div className="small muted">交易類型</div>
      <div className="chips" role="group" aria-label="交易類型">
        {STYLES.map((k) => <button key={k} className={`chip ${v.style === k ? "on" : ""}`} onClick={() => set({ ...v, style: v.style === k ? "" : k })}>{k}</button>)}
      </div>
      <label className="f">{side === "buy" ? "為什麼買" : "為什麼賣"}<textarea rows={2} maxLength={300} value={v.reason} placeholder={side === "buy" ? "例如：法說會轉好、站上月線、存股定期定額" : "例如：到停利、跌破停損、資金要換股"} onChange={(e) => set({ ...v, reason: e.target.value })} /></label>
      {side === "buy" && (
        <div className="grid3">
          <label className="f">停損價<input type="number" inputMode="decimal" min={0} step="0.01" value={v.stop} onChange={(e) => set({ ...v, stop: e.target.value })} /></label>
          <label className="f">停利價<input type="number" inputMode="decimal" min={0} step="0.01" value={v.take} onChange={(e) => set({ ...v, take: e.target.value })} /></label>
          <label className="f">目標價<input type="number" inputMode="decimal" min={0} step="0.01" value={v.target} onChange={(e) => set({ ...v, target: e.target.value })} /></label>
        </div>
      )}
    </div>
  );
}
