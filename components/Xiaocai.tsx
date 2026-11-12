"use client";
import { useEffect, useMemo, useState } from "react";
import type { App } from "./Shell";
import { rpc } from "@/lib/supabase";
import { fmt, num } from "@/lib/util";
import { useStocks, holdingsOf, replay, tradeOrder, TradeForm, NoteFields, noteOf, saveNote, STYLES, brokersOf, type Trade, type NoteVals, type Move, type Holding } from "./Stocks";

// 小財怪投資成長紀錄: every trade with its type, reason and planned prices, and how the gains add up over time.
// Taiwan convention on this page: up / gain is red, down / loss is green.

type Pnl = { gain: number; pct: number };
const UP = "var(--xc-up)", DOWN = "var(--xc-down)";
const tone = (v: number) => (v > 0 ? UP : v < 0 ? DOWN : "var(--muted)");
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}`;
const pctTxt = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const md = (d: string) => `${+d.slice(5, 7)}/${+d.slice(8)}`;

/** Realized gain of every sell (each broker account at its own average cost, transfers included) and the running total by day. */
function pnlOf(all: Trade[], moves: Move[], shown: Trade[]) {
  const r = replay(all, moves);
  const by: Record<string, Pnl> = {};
  const daily: Record<string, number> = {};
  for (const t of shown) {
    const p = r.sells[t.id];
    if (!p) continue;
    by[t.id] = p;
    daily[t.traded_on] = (daily[t.traded_on] || 0) + p.gain;
  }
  let run = 0;
  const curve = Object.keys(daily).sort().map((d) => ({ d, v: (run += daily[d]) }));
  return { by, curve, moveAvg: r.moveAvg };
}

export default function Xiaocai({ app }: { app: App }) {
  const { sel, toast, data } = app;
  const st = useStocks(sel.id);
  const [acct, setAcct] = useState("全部");
  // Everything below follows the chosen broker account.
  const trades = useMemo(() => (acct === "全部" ? st.trades : st.trades.filter((t) => (t.broker || "") === acct)), [st.trades, acct]);
  const b = acct === "全部" ? undefined : acct;
  const h = useMemo(() => holdingsOf(st.trades, st.prices, st.moves, b), [st.trades, st.prices, st.moves, b]);
  const { by, curve, moveAvg } = useMemo(() => pnlOf(st.trades, st.moves, trades), [st.trades, st.moves, trades]);
  const moves = st.moves.filter((m) => !b || m.from_broker === b || m.to_broker === b);
  const brokers = brokersOf(st.trades);
  const [xfer, setXfer] = useState(false);
  const [filter, setFilter] = useState("全部");
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState(false);

  const held = h.list.filter((x) => x.shares > 0);
  const heldSyms = held.map((x) => x.symbol).join(",");
  useEffect(() => {
    if (!st.loaded || !heldSyms) return;
    const stale = held.some((x) => { const p = st.prices[x.symbol]; return !p || Date.now() - Date.parse(p.updated_at) > 30 * 60e3; });
    if (stale) st.refresh(heldSyms.split(","));
  }, [st.loaded, heldSyms]); // eslint-disable-line react-hooks/exhaustive-deps

  const realized = Object.values(by).reduce((s, x) => s + x.gain, 0);
  const sells = Object.values(by);
  const wins = sells.filter((x) => x.gain > 0).length;
  const value = held.reduce((s, x) => s + (x.value ?? x.cost), 0);
  const unreal = held.reduce((s, x) => s + ((x.value ?? x.cost) - x.cost), 0);

  // Which kind of trading actually makes money.
  const styleStats = useMemo(() => {
    const m: Record<string, { n: number; gain: number; win: number; sells: number }> = {};
    for (const t of trades) {
      const k = t.style || "未分類";
      const s = (m[k] ||= { n: 0, gain: 0, win: 0, sells: 0 });
      s.n++;
      const p = by[t.id];
      if (p) { s.gain += p.gain; s.sells++; if (p.gain > 0) s.win++; }
    }
    return Object.entries(m).sort((a, b) => b[1].gain - a[1].gain);
  }, [trades, by]);

  // Holdings measured against the stop / take-profit / target set on their latest buy.
  const alerts = useMemo(() => held.map((x) => {
    const plan = [...trades].filter((t) => t.symbol === x.symbol && t.side === "buy" && (t.stop_loss || t.take_profit || t.target)).sort(tradeOrder).pop();
    if (!plan || x.price == null) return null;
    const p = x.price, stop = Number(plan.stop_loss) || 0, take = Number(plan.take_profit) || 0, target = Number(plan.target) || 0;
    const hit = stop && p <= stop ? ["跌破停損", DOWN] : target && p >= target ? ["到目標價", UP] : take && p >= take ? ["到停利價", UP] : null;
    return { x, p, stop, take, target, hit };
  }).filter(Boolean) as { x: (typeof held)[number]; p: number; stop: number; take: number; target: number; hit: string[] | null }[], [held, trades]);

  const shown = [...trades].sort(tradeOrder).reverse().filter((t) => filter === "全部" || (filter === "未分類" ? !t.style : t.style === filter));
  // 轉股 sit in the timeline too (only when no type filter is on).
  type Item = { d: string; t?: Trade; m?: Move };
  const items: Item[] = [...shown.map((t) => ({ d: t.traded_on, t })), ...(filter === "全部" ? moves.map((m) => ({ d: m.moved_on, m })) : [])]
    .sort((a, b) => (a.d === b.d ? 0 : a.d < b.d ? 1 : -1));
  const groups: [string, Item[]][] = [];
  for (const it of items) {
    const k = `${it.d.slice(0, 4)} 年 ${+it.d.slice(5, 7)} 月`;
    if (!groups.length || groups[groups.length - 1][0] !== k) groups.push([k, []]);
    groups[groups.length - 1][1].push(it);
  }
  const usedStyles = ["全部", ...STYLES.filter((k) => trades.some((t) => t.style === k)), ...(trades.some((t) => !t.style) ? ["未分類"] : [])];

  return (
    <div className="xc">
      <div className="seg xc-acct" role="group" aria-label="券商帳戶">
        {["全部", ...brokers].map((b) => <button key={b} className={acct === b ? "on" : ""} onClick={() => setAcct(b)}>{b === "全部" ? "全部帳戶" : b}</button>)}
      </div>
      <section className="xc-hero">
        <Monster happy={realized + unreal >= 0} />
        <div className="xc-hero-t">
          <div className="xc-cap">小財怪投資成長紀錄{acct !== "全部" ? `・${acct}` : ""}</div>
          <div className="xc-label">已實現損益</div>
          <div className="xc-big" style={{ color: realized >= 0 ? "var(--xc-gold-hi)" : "var(--xc-down-hi)" }}>{signed(Math.round(realized))}</div>
        </div>
        <div className="xc-stats">
          <div><span>持股市值</span><b>{fmt(Math.round(value))}</b></div>
          <div><span>未實現</span><b style={{ color: unreal >= 0 ? "var(--xc-up-hi)" : "var(--xc-down-hi)" }}>{signed(Math.round(unreal))}</b></div>
          <div><span>勝率</span><b>{sells.length ? `${Math.round((wins / sells.length) * 100)}%` : "—"}</b><small>{wins}/{sells.length} 次賣出</small></div>
        </div>
      </section>

      <div className="xc-actions">
        <button className="btn primary big xc-add" onClick={() => { setForm(!form); setXfer(false); }}>{form ? "收起" : "＋ 記一筆交易"}</button>
        {brokers.length > 1 && <button className="btn big xc-xfer" onClick={() => { setXfer(!xfer); setForm(false); }}>{xfer ? "收起" : "⇄ 轉股"}</button>}
      </div>
      {xfer && <XferForm app={app} st={st} brokers={brokers} from0={b} onDone={async () => { setXfer(false); await st.reload(); }} />}
      {form && (
        <section className="card">
          <h3>記一筆交易</h3>
          <TradeForm app={app} st={st} holdings={h.list} withNote defaultBroker={acct !== "全部" ? acct : undefined} onClose={() => setForm(false)} />
        </section>
      )}

      {curve.length > 1 && (
        <section className="card">
          <div className="card-h"><h3>成長曲線</h3><span className="note">累積已實現損益</span></div>
          <Curve pts={curve} />
        </section>
      )}

      {held.length > 0 && (
        <section className="card">
          <div className="card-h"><h3>目前持股</h3><span className="note">{acct === "全部" ? "兩個帳戶合併的均價" : `${acct}帳戶的均價`}</span></div>
          <div className="hold-list">
            {held.map((x) => {
              const g = x.price != null ? (x.price - x.avg) * x.shares : null;
              return (
                <div className="hold-row" key={x.symbol}>
                  <span className="t"><b>{x.name || x.symbol} <span className="note">{x.symbol}</span></b>
                    <span className="note">{num(x.shares)} 股 · 均價 {x.avg.toFixed(2)}{x.price != null ? ` · 現價 ${x.price}` : ""}{x.costUnknown ? " · 成本不明" : ""}</span></span>
                  <span className="num r">{fmt(Math.round(x.value ?? x.cost))}{g != null && <small style={{ color: tone(g) }}>{signed(Math.round(g))}（{pctTxt(x.avg ? (x.price! / x.avg - 1) * 100 : 0)}）</small>}</span>
                </div>
              );
            })}
          </div>
          <p className="note">均價含買進手續費。轉股會把均價一起帶過去，和轉入帳戶原本的持股加權平均。</p>
        </section>
      )}

      {alerts.length > 0 && (
        <section className="card">
          <h3>持股提醒</h3>
          <div className="xc-alerts">
            {alerts.map(({ x, p, stop, take, target, hit }) => (
              <div key={x.symbol} className="xc-alert">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <b>{x.name || x.symbol} <span className="note">{x.symbol}</span></b>
                  {hit ? <span className="xc-tag solid" style={{ background: hit[1] }}>{hit[0]}</span> : <span className="num">{p}</span>}
                </div>
                <PriceBar p={p} stop={stop} take={take} target={target} avg={x.avg} />
              </div>
            ))}
          </div>
        </section>
      )}

      {styleStats.length > 0 && (
        <section className="card">
          <h3>各類型戰績</h3>
          <div className="xc-styles">
            {styleStats.map(([k, s]) => (
              <button key={k} className={`xc-style ${filter === k ? "on" : ""}`} onClick={() => setFilter(filter === k ? "全部" : k)}>
                <span className="xc-tag">{k}</span>
                <b className="num" style={{ color: tone(s.gain) }}>{s.sells ? signed(Math.round(s.gain)) : "—"}</b>
                <small>{s.n} 筆{s.sells ? ` · 勝率 ${Math.round((s.win / s.sells) * 100)}%` : ""}</small>
              </button>
            ))}
          </div>
          {styleStats.some(([k]) => k === "未分類") && <p className="note">點下面的交易可以補上類型和原因，這裡就會分得更清楚。</p>}
        </section>
      )}

      <section className="card">
        <div className="card-h"><h3>進出紀錄</h3><span className="note">{items.length} 筆</span></div>
        <div className="chips" role="group" aria-label="篩選類型">
          {usedStyles.map((k) => <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{k}</button>)}
        </div>
        {!st.loaded ? <div className="empty">讀取中…</div> : !items.length ? <div className="empty">還沒有交易紀錄</div> : groups.map(([g, list]) => (
          <div key={g} className="xc-group">
            <div className="xc-month">{g}</div>
            {list.map(({ t, m }) => m ? (
              <MoveRow key={m.id} m={m} avg={moveAvg[m.id]} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)}
                onDelete={async () => {
                  const [, e] = await rpc("void_stock_transfer", { p_id: m.id });
                  if (e) return toast(e);
                  toast("轉股紀錄刪掉了");
                  setOpen(null);
                  await st.reload();
                }} />
            ) : t && (
              <TradeRow key={t.id} t={t} brokers={brokers} showBroker={acct === "全部"} pnl={by[t.id]} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)}
                onSaved={async () => { setOpen(null); await st.reload(); }}
                onDelete={async () => {
                  const [, e] = await rpc("void_stock_trade", { p_id: t.id });
                  if (e) return toast(e);
                  toast("交易刪掉了，罐子的錢也還原了");
                  setOpen(null);
                  await Promise.all([st.reload(), data.reload()]);
                }} app={app} />
            ))}
          </div>
        ))}
      </section>
      <p className="note center">這頁和「罐子 → 股票帳」用同一份交易紀錄。轉股是把股票連同均價搬到另一個券商帳戶，不算賣出，也不動罐子的錢。紅色是賺、綠色是賠（台股習慣）。</p>
    </div>
  );
}

function MoveRow({ m, avg, open, onToggle, onDelete }: { m: Move; avg?: number; open: boolean; onToggle: () => void; onDelete: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <div className={`xc-row ${open ? "open" : ""}`}>
      <button className="xc-row-main" onClick={() => { setSure(false); onToggle(); }} aria-expanded={open}>
        <span className="xc-date">{md(m.moved_on)}</span>
        <span className="xc-side move">轉</span>
        <span className="xc-mid">
          <span className="xc-name"><b>{m.name || m.symbol}</b> <span className="note">{m.symbol}</span></span>
          <span className="note">{m.from_broker} → {m.to_broker} · {num(m.shares)} 股{avg ? ` · 均價 ${avg.toFixed(2)}` : ""}</span>
          {m.note && <span className="xc-reason">{m.note}</span>}
        </span>
        <span className="xc-right"><small className="muted">不算賣出</small></span>
      </button>
      {open && (
        <div className="xc-edit">
          <div className="row" style={{ gap: 8 }}>
            {sure ? <button className="btn danger" onClick={onDelete}>確定刪除這筆轉股</button> : <button className="btn ghost" onClick={() => setSure(true)}>刪除轉股紀錄</button>}
            <button className="btn" onClick={onToggle}>取消</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 轉股: pick the stock in one broker account and move some or all of it to the other. */
function XferForm({ app, st, brokers, from0, onDone }: { app: App; st: ReturnType<typeof useStocks>; brokers: string[]; from0?: string; onDone: () => void }) {
  const { sel, toast } = app;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const [from, setFrom] = useState(from0 || brokers[0]);
  const [to, setTo] = useState(brokers.find((x) => x !== (from0 || brokers[0])) || "");
  const [sym, setSym] = useState("");
  const [shares, setShares] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const held: Holding[] = useMemo(() => holdingsOf(st.trades, st.prices, st.moves, from).list.filter((x) => x.shares > 0), [st.trades, st.prices, st.moves, from]);
  const pick = held.find((x) => x.symbol === sym);
  const n = Math.round(+shares) || 0;
  async function save() {
    setBusy(true);
    const [, e] = await rpc("add_stock_transfer", { p_member: sel.id, p_date: date, p_symbol: sym, p_shares: n, p_from: from, p_to: to, p_note: note });
    setBusy(false);
    if (e) return toast(e);
    toast(`轉好了：${pick?.name || sym} ${num(n)} 股 ${from} → ${to}`);
    onDone();
  }
  return (
    <section className="card">
      <h3>轉股（券商帳戶之間）</h3>
      <div className="grid2">
        <div><div className="small muted">從</div><div className="chips">{brokers.map((x) => <button key={x} className={`chip ${from === x ? "on" : ""}`} onClick={() => { setFrom(x); setSym(""); if (to === x) setTo(brokers.find((y) => y !== x) || ""); }}>{x}</button>)}</div></div>
        <div><div className="small muted">轉到</div><div className="chips">{brokers.filter((x) => x !== from).map((x) => <button key={x} className={`chip ${to === x ? "on" : ""}`} onClick={() => setTo(x)}>{x}</button>)}</div></div>
      </div>
      <div className="small muted">{from}帳戶裡的股票</div>
      {held.length ? (
        <div className="chips">{held.map((x) => <button key={x.symbol} className={`chip ${sym === x.symbol ? "on" : ""}`} onClick={() => { setSym(x.symbol); setShares(String(x.shares)); }}>{x.name || x.symbol} · {num(x.shares)} 股</button>)}</div>
      ) : <p className="note">{from}帳戶裡目前沒有股票。</p>}
      {pick && (
        <>
          <div className="grid2">
            <label className="f">轉幾股<input type="number" inputMode="numeric" min={1} max={pick.shares} value={shares} onChange={(e) => setShares(e.target.value)} /></label>
            <label className="f">轉股日<input type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <label className="f">備註（可不填）<input maxLength={100} value={note} placeholder="例如：轉去富邦做波段" onChange={(e) => setNote(e.target.value)} /></label>
          <p className="note">會用 {from} 的均價 {pick.avg.toFixed(2)} 帶過去，不算賣出、沒有損益，也不動罐子的錢。</p>
        </>
      )}
      <button className="btn primary" disabled={busy || !pick || !to || n <= 0 || n > (pick?.shares || 0)} onClick={save}>轉過去</button>
    </section>
  );
}

function TradeRow({ t, pnl, open, onToggle, onSaved, onDelete, app, brokers, showBroker }: { t: Trade; pnl?: Pnl; brokers: string[]; showBroker: boolean; open: boolean; onToggle: () => void; onSaved: () => void; onDelete: () => void; app: App }) {
  const [v, setV] = useState<NoteVals>(noteOf(t));
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [bk, setBk] = useState(t.broker || "");
  useEffect(() => { if (open) { setV(noteOf(t)); setSure(false); setBk(t.broker || ""); } }, [open, t]);
  const buy = t.side === "buy";
  async function save() {
    setBusy(true);
    let [, e] = await saveNote(t.id, v);
    if (!e && bk !== (t.broker || "")) [, e] = await rpc("set_trade_broker", { p_id: t.id, p_broker: bk });
    setBusy(false);
    if (e) return app.toast(e);
    app.toast("記好了");
    onSaved();
  }
  return (
    <div className={`xc-row ${open ? "open" : ""}`}>
      <button className="xc-row-main" onClick={onToggle} aria-expanded={open}>
        <span className="xc-date">{md(t.traded_on)}</span>
        <span className={`xc-side ${buy ? "buy" : "sell"}`}>{buy ? "買" : "賣"}</span>
        <span className="xc-mid">
          <span className="xc-name"><b>{t.name || t.symbol}</b> <span className="note">{t.symbol}</span>{t.style && <span className="xc-tag">{t.style}</span>}</span>
          <span className="note">{showBroker && t.broker ? `${t.broker} · ` : ""}{num(t.shares)} 股 @ {Number(t.price)}{t.jar === "none" ? " · 以前買的" : ""}</span>
          {t.reason && <span className="xc-reason">{t.reason}</span>}
          {buy && (t.stop_loss || t.take_profit || t.target) ? (
            <span className="xc-plan">
              {t.stop_loss ? <span>停損 {Number(t.stop_loss)}</span> : null}
              {t.take_profit ? <span>停利 {Number(t.take_profit)}</span> : null}
              {t.target ? <span>目標 {Number(t.target)}</span> : null}
            </span>
          ) : null}
        </span>
        <span className="xc-right">
          {pnl ? <><b className="num" style={{ color: tone(pnl.gain) }}>{signed(Math.round(pnl.gain))}</b><small style={{ color: tone(pnl.gain) }}>{pctTxt(pnl.pct)}</small></>
            : <b className="num">{fmt(Math.round(t.shares * Number(t.price) + t.fee))}</b>}
        </span>
      </button>
      {open && (
        <div className="xc-edit">
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="small muted">券商帳戶</span>
            <div className="chips" role="group" aria-label="券商帳戶">{brokers.map((b) => <button key={b} className={`chip ${bk === b ? "on" : ""}`} onClick={() => setBk(b)}>{b}</button>)}</div>
          </div>
          <NoteFields v={v} set={setV} side={t.side} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" disabled={busy} onClick={save}>儲存</button>
            <button className="btn" onClick={onToggle}>取消</button>
            {sure ? <button className="btn danger" onClick={onDelete}>確定刪除這筆交易</button> : <button className="btn ghost" onClick={() => setSure(true)}>刪除交易</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Where today's price sits between the stop-loss and the target. */
function PriceBar({ p, stop, take, target, avg }: { p: number; stop: number; take: number; target: number; avg: number }) {
  const marks = [stop, avg, take, target, p].filter((x) => x > 0);
  const lo = Math.min(...marks) * 0.98, hi = Math.max(...marks) * 1.02;
  const X = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="xc-bar" role="img" aria-label={`現價 ${p}${stop ? `，停損 ${stop}` : ""}${take ? `，停利 ${take}` : ""}${target ? `，目標 ${target}` : ""}`}>
      <div className="xc-track" />
      {stop > 0 && <span className="xc-mk" style={{ left: X(stop), color: DOWN }}><i />損 {stop}</span>}
      {avg > 0 && <span className="xc-mk dim" style={{ left: X(avg) }}><i />均 {avg.toFixed(1)}</span>}
      {take > 0 && <span className="xc-mk" style={{ left: X(take), color: UP }}><i />利 {take}</span>}
      {target > 0 && <span className="xc-mk" style={{ left: X(target), color: "var(--xc-gold)" }}><i />標 {target}</span>}
      <span className="xc-now" style={{ left: X(p) }} title={`現價 ${p}`} />
    </div>
  );
}

function Curve({ pts }: { pts: { d: string; v: number }[] }) {
  const W = 320, H = 150, L = 44, R = 10, T = 12, B = 22;
  const vs = pts.map((p) => p.v);
  const mn = Math.min(0, ...vs), mx = Math.max(0, ...vs);
  const span = mx - mn || 1;
  const X = (i: number) => L + ((W - L - R) * i) / Math.max(pts.length - 1, 1);
  const Y = (v: number) => T + (H - T - B) * (1 - (v - mn) / span);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${X(pts.length - 1).toFixed(1)} ${Y(0).toFixed(1)} L${X(0).toFixed(1)} ${Y(0).toFixed(1)} Z`;
  const last = pts[pts.length - 1];
  const k = (v: number) => (Math.abs(v) >= 10000 ? `${(v / 10000).toFixed(1)}萬` : num(Math.round(v)));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`累積已實現損益 ${Math.round(last.v)} 元`}>
      <defs><linearGradient id="xcg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--xc-gold)" stopOpacity=".35" /><stop offset="1" stopColor="var(--xc-gold)" stopOpacity="0" /></linearGradient></defs>
      <line x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} stroke="var(--line)" />
      <text x={L - 6} y={Y(0) + 3} textAnchor="end">0</text>
      {mx > 0 && <text x={L - 6} y={Y(mx) + 3} textAnchor="end">{k(mx)}</text>}
      {mn < 0 && <text x={L - 6} y={Y(mn) + 3} textAnchor="end">{k(mn)}</text>}
      <path d={area} fill="url(#xcg)" />
      <path d={line} fill="none" stroke="var(--xc-gold)" strokeWidth={2.4} strokeLinejoin="round" />
      <circle cx={X(pts.length - 1)} cy={Y(last.v)} r={4} fill={last.v >= 0 ? UP : DOWN} />
      <text x={L} y={H - 6}>{md(pts[0].d)}</text>
      <text x={W - R} y={H - 6} textAnchor="end">{md(last.d)}</text>
    </svg>
  );
}

/** 小財怪: a round gold critter holding a coin; smiles when the account is up. */
function Monster({ happy }: { happy: boolean }) {
  return (
    <svg className="xc-monster" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M30 26 L24 8 L40 20 Z M70 26 L76 8 L60 20 Z" fill="#e8b84a" />
      <ellipse cx="50" cy="56" rx="38" ry="36" fill="#f4c955" />
      <ellipse cx="50" cy="64" rx="24" ry="20" fill="#fbe39a" />
      <circle cx="37" cy="48" r="7" fill="#1f2a44" /><circle cx="63" cy="48" r="7" fill="#1f2a44" />
      <circle cx="39.5" cy="45.5" r="2.4" fill="#fff" /><circle cx="65.5" cy="45.5" r="2.4" fill="#fff" />
      <ellipse cx="27" cy="60" rx="5" ry="3" fill="#f39a8b" opacity=".7" /><ellipse cx="73" cy="60" rx="5" ry="3" fill="#f39a8b" opacity=".7" />
      {happy ? <path d="M41 62 Q50 72 59 62" stroke="#1f2a44" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        : <path d="M42 68 Q50 61 58 68" stroke="#1f2a44" strokeWidth="3.2" fill="none" strokeLinecap="round" />}
      <circle cx="80" cy="76" r="13" fill="#e2a93a" stroke="#c48a22" strokeWidth="2" />
      <text x="80" y="81" textAnchor="middle" fontSize="14" fontWeight="800" fill="#7a5410">$</text>
      {happy && <path d="M14 26 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z M88 30 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z" fill="#ffe08a" />}
    </svg>
  );
}
