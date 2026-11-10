"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { App } from "./Shell";
import { rpc } from "@/lib/supabase";
import { fmt, num, catsFor, INCOME_CATS, spendable, jarList, jarName, curMonth, payLabel, gd } from "@/lib/util";
import { catImg, iconOf } from "@/lib/cats";
import { PayPicker, lastPay, rememberPay, type Pay } from "./Pay";
import { CardBill } from "./CardBill";
import { movableFrom, balOfJar } from "./Jars";
import { byRatio } from "./Income";

export type EditTarget = { kind: "expense" | "income"; row: any } | null;
type Tab = "out" | "in" | "move";

const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });

/** Evaluates "120+35-10" (whole dollars, + and − only); a trailing operator is ignored. */
export function evalExpr(s: string): number {
  const parts = s.replace(/[+−]$/, "").match(/[+−]?\d+/g);
  return parts ? parts.reduce((t, p) => t + (p[0] === "−" ? -+p.slice(1) : +p.replace("+", "")), 0) : 0;
}

export function CatIcon({ cat, size = 40 }: { cat?: string; size?: number }) {
  const [img, e, tint] = iconOf(cat);
  const [bad, setBad] = useState(false);
  return (
    <span className="cat-ic" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.5, background: `color-mix(in srgb, ${tint} 16%, var(--surface))` }}>
      {bad ? e : <img src={catImg(img)} alt="" width={Math.round(size * 0.68)} height={Math.round(size * 0.68)} draggable={false} onError={() => setBad(true)} />}
    </span>
  );
}

/** Bottom sheet for adding or editing a record: category icons, quick chips and a calculator keypad. */
export function Entry({ app, edit, startTab = "out", onClose, onSaved }: { app: App; edit: EditTarget; startTab?: Tab; onClose: () => void; onSaved: () => void }) {
  const { sel, data, toast, family } = app;
  const mo = data.months.find((x: any) => x.month === curMonth());
  const isKid = sel.role === "kid";
  const nwOn = sel.need_want !== false;
  const today = todayStr();
  const er = edit?.row;
  const incomeTo = (r: any) => { const ks = Object.keys(r?.split || {}); return ks.length === 1 ? ks[0] : "ratio"; };

  const [tab, setTab] = useState<Tab>(edit ? (edit.kind === "income" ? "in" : "out") : startTab);
  const outJars = spendable(sel);
  const inJars = jarList(sel).filter((j) => !(j.key === "long" && isKid));
  const [jar, setJar] = useState<string>(er ? (edit!.kind === "income" ? incomeTo(er) : er.jar || "free") : "free");
  const cats = tab === "in" ? INCOME_CATS[isKid ? "kid" : "adult"] : catsFor(jar, sel);
  const [cat, setCat] = useState<string>(er?.category || cats[0]);
  const [note, setNote] = useState<string>(er ? (edit!.kind === "income" ? er.source : er.item) : "");
  const [expr, setExpr] = useState<string>(er ? String(er.amount) : "");
  const [day, setDay] = useState<string>(er ? dayOf(er.created_at) : today);
  const [pay, setPay] = useState<Pay>(() => (er && edit!.kind === "expense" ? { m: er.pay_method || "cash", d: er.pay_detail || "" } : lastPay(sel.id)));
  const [type, setType] = useState<"" | "need" | "want">(er?.type || "");
  const [panel, setPanel] = useState<"" | "pay" | "jar">("");
  const [from, setFrom] = useState("free");
  const [to, setTo] = useState(() => jarList(sel).find((j) => j.key !== "free")?.key || "free");
  const [busy, setBusy] = useState(false);
  const [keep, setKeep] = useState(false);
  const press = useRef<number | null>(null);

  // Switching tabs or between the bill jar and the others resets the category to that list's first.
  useEffect(() => { if (!cats.includes(cat)) setCat(cats[0]); }, [tab, jar]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "in" && !inJars.some((j) => j.key === jar) && jar !== "ratio") setJar("free"); if (tab === "out" && !outJars.some((j) => j.key === jar)) setJar("free"); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const typed = evalExpr(expr);
  // A number typed into the note box with the phone keyboard counts as the amount.
  const noteNum = /^\s*\d[\d,]*\s*(元)?\s*$/.test(note) ? +note.replace(/[^\d]/g, "") : 0;
  const amount = typed > 0 ? typed : noteNum;
  const monthStart = `${curMonth()}-01`;
  const billMode = tab === "out" && jar === "fixed" && cat === "卡費" && !edit;

  function key(k: string) {
    if (k === "⌫") return setExpr((s) => s.slice(0, -1));
    if (k === "AC") return setExpr("");
    if (k === "+" || k === "−") return setExpr((s) => (s === "" ? s : /[+−]$/.test(s) ? s.slice(0, -1) + k : s + k));
    setExpr((s) => {
      const tail = s.split(/[+−]/).pop() || "";
      if (tail.length >= 8) return s;
      if (tail === "0") return s.slice(0, -1) + (k === "00" ? "0" : k);
      if (tail === "" && (k === "0" || k === "00")) return s + "0";
      return s + k;
    });
  }

  async function save() {
    if (!(amount > 0)) return toast("先輸入金額");
    setBusy(true);
    let err: string | null = null, msg = "";
    if (tab === "move") {
      if (from === to) { setBusy(false); return toast("請選兩個不同的罐子"); }
      const [, e] = await rpc("move_money", { p_member: sel.id, p_from: from, p_to: to, p_amount: amount });
      err = e; msg = `已從${jarName(sel, from)}移 ${fmt(amount)} 到${jarName(sel, to)}`;
    } else if (tab === "out") {
      const item = (noteNum && !(typed > 0) ? "" : note.trim()) || cat;
      if (edit) {
        const [, e] = await rpc("update_expense", { p_id: er.id, p_item: item, p_amount: amount, p_category: cat, p_jar: jar, p_pay_method: pay.m, p_pay_detail: pay.d, p_type: type, p_day: day });
        err = e; msg = "改好了";
      } else {
        const [r, e] = await rpc<any>("add_expense_v3", { p_member: sel.id, p_item: item, p_amount: amount, p_type: type, p_category: cat, p_jar: jar, p_pay_method: pay.m, p_pay_detail: pay.d });
        err = e;
        if (!e && day < today && r?.id) { const [, e2] = await rpc("set_record_date", { p_kind: "expense", p_id: r.id, p_day: day }); if (e2) toast(e2); }
        msg = r && r.left < 0 ? `記下來了。${r.jar_name}透支 ${fmt(-r.left)}` : `記下來了：${item} ${fmt(amount)}`;
      }
      if (!err) rememberPay(sel.id, pay);
    } else {
      const src = (noteNum && !(typed > 0) ? "" : note.trim()) || cat;
      const split = jar === "ratio" ? byRatio(jarList(sel).map((j) => j.key), mo?.ratio || {}, amount) : { [jar]: amount };
      if (edit) {
        const [, e] = await rpc("update_income_v2", { p_id: er.id, p_source: src, p_category: cat, p_amount: amount, p_split: split, p_day: day });
        err = e; msg = "改好了";
      } else {
        const [r, e] = await rpc<any>("add_income", { p_member: sel.id, p_source: src, p_category: cat, p_amount: amount, p_split: split });
        err = e;
        if (!e && day < today && r?.id) { const [, e2] = await rpc("set_record_date", { p_kind: "income", p_id: r.id, p_day: day }); if (e2) toast(e2); }
        msg = `收入記好了：${src} ${fmt(amount)}`;
      }
    }
    setBusy(false);
    if (err) return toast(err);
    toast(msg);
    await data.reload();
    onSaved();
    if (keep && !edit) { setExpr(""); setNote(""); } else onClose();
  }

  const startPress = () => { press.current = window.setTimeout(() => { press.current = null; setKeep(true); toast("連續記帳：記完會留在這裡"); }, 550); };
  const endPress = () => { if (press.current) { clearTimeout(press.current); press.current = null; save(); } };

  const tabs: [Tab, string][] = edit ? [[tab, edit.kind === "income" ? "修改收入" : "修改支出"]] : [["out", "支出"], ["in", "收入"], ["move", "移罐子"]];
  const jarOpts = tab === "in" ? [...inJars.map((j) => ({ key: j.key, name: j.name })), { key: "ratio", name: "照比例分" }] : outJars.map((j) => ({ key: j.key, name: j.name }));
  const movable = movableFrom(app);

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={edit ? "修改紀錄" : "記一筆"}>
      <button className="sheet-bg" aria-label="關閉" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-top">
          <div className="sheet-tabs">
            {tabs.map(([k, n]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setPanel(""); }}>{n}</button>)}
          </div>
          <button className="x" onClick={onClose} aria-label="關閉">×</button>
        </div>

        {tab === "move" ? (
          <div className="sheet-body">
            <div className="small muted">從哪個罐子</div>
            <div className="seg">{movable.map((j) => <button key={j.key} className={from === j.key ? "on" : ""} onClick={() => setFrom(j.key)}>{j.name}<br /><span className="note">{num(balOfJar(app, j.key))}</span></button>)}</div>
            <div className="small muted">移到哪個罐子</div>
            <div className="seg">{jarList(sel).filter((j) => j.key !== from).map((j) => <button key={j.key} className={to === j.key ? "on" : ""} onClick={() => setTo(j.key)}>{j.name}</button>)}</div>
            <p className="note">投資罐、長期罐的錢只進不出；{isKid ? `夢想罐要${gd(family)}同意才能移出。` : "從夢想罐移出會記成挪用。"}</p>
          </div>
        ) : panel === "jar" ? (
          <div className="sheet-body">
            <div className="small muted">{tab === "in" ? "放進哪個罐子" : "從哪個罐子付"}</div>
            <div className="jar-pick">
              {jarOpts.map((j) => (
                <button key={j.key} className={jar === j.key ? "on" : ""} onClick={() => { setJar(j.key); setPanel(""); }}>
                  <b style={j.key !== "ratio" ? { color: `var(--${j.key})` } : undefined}>{j.name}</b>
                  <span className="note">{j.key === "ratio" ? "照月初比例分到各罐" : fmt(balOfJar(app, j.key))}</span>
                </button>
              ))}
            </div>
          </div>
        ) : panel === "pay" ? (
          <div className="sheet-body">
            <div className="small muted">怎麼付的</div>
            <PayPicker mid={sel.id} value={pay} onChange={setPay} />
            <button className="btn primary" onClick={() => setPanel("")}>好</button>
          </div>
        ) : (
          <div className="sheet-body">
            <div className="cat-grid" role="group" aria-label="類別">
              {cats.map((c) => (
                <button key={c} className={`cat-cell ${cat === c ? "on" : ""}`} onClick={() => setCat(c)} aria-pressed={cat === c}>
                  <CatIcon cat={c} size={38} /><span>{c}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {billMode ? (
          <div className="sheet-body"><CardBill app={app} jar={jar} history={[]} onDone={() => { onSaved(); onClose(); }} /></div>
        ) : (
          <>
            {tab !== "move" && panel === "" && (
              <div className="sheet-chips">
                <label className="schip">📅
                  <input type="date" value={day} min={monthStart} max={today} disabled={isKid} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="日期" />
                  <span>{day === today ? "今天" : `${+day.slice(5, 7)}/${+day.slice(8)}`}</span>
                </label>
                <button className="schip" onClick={() => setPanel("jar")} aria-label={tab === "in" ? "放進哪個罐子" : "從哪個罐子付"}>
                  🫙 <span>{tab === "in" ? "放進" : ""}{jarOpts.find((j) => j.key === jar)?.name || "自由罐"}</span><span className="caret" aria-hidden="true">▾</span>
                </button>
                {tab === "out" && <button className="schip" onClick={() => setPanel("pay")}>💳 <span>{payLabel({ pay_method: pay.m, pay_detail: pay.d }) || "現金"}</span></button>}
                {tab === "out" && nwOn && (
                  <button className={`schip ${type ? "on" : ""}`} onClick={() => setType(type === "" ? "need" : type === "need" ? "want" : "")}>
                    {type === "need" ? "✅ 需要" : type === "want" ? "💭 想要" : "需要／想要"}
                  </button>
                )}
              </div>
            )}
            {tab !== "move" && (
              <div className="sheet-note">
                <input value={note} maxLength={40} placeholder={tab === "in" ? `收入來源（預設：${cat}）` : `寫備註（預設：${cat}）`} onChange={(e) => setNote(e.target.value)} aria-label="備註" />
              </div>
            )}
            <div className="sheet-amt" aria-live="polite">
              <span className="muted small">{expr && /[+−]/.test(expr) ? expr : ""}</span>
              <b className={`num ${tab === "in" ? "in" : tab === "out" ? "out" : ""}`}>{fmt(amount)}</b>
            </div>
            <div className="keypad">
              {["7", "8", "9", "⌫", "4", "5", "6", "+", "1", "2", "3", "−", "AC", "0", "00"].map((k) => (
                <button key={k} className={/[0-9]/.test(k) ? "" : "op"} onClick={() => key(k)} aria-label={k === "⌫" ? "刪除一位" : k === "AC" ? "清除" : k}>{k}</button>
              ))}
              <button className="done" disabled={busy || !(amount > 0)}
                onPointerDown={edit ? undefined : startPress} onPointerUp={edit ? undefined : endPress} onPointerLeave={() => { if (press.current) { clearTimeout(press.current); press.current = null; } }}
                onClick={edit ? save : undefined} onKeyDown={(e) => { if (!edit && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); save(); } }}>
                {edit ? "儲存" : keep ? "記下・繼續" : "完成"}{!edit && !keep && <small>長按連續記</small>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The round button that opens the sheet. */
export function AddFab({ onClick, onVoice }: { onClick: () => void; onVoice?: () => void }) {
  return (
    <div className="fab-row">
      {onVoice && <button className="fab mic" onClick={onVoice} aria-label="語音記帳"><span aria-hidden="true">🎙</span></button>}
      <button className="fab" onClick={onClick}><span aria-hidden="true">＋</span> 記一筆</button>
    </div>
  );
}

/** Records grouped by day, newest first; swipe a row to the right (or tap it) to edit or delete. */
export function DayList({ app, expenses, incomes, editable, onEdit, onDelete, onCopy }: {
  app: App; expenses: any[]; incomes: any[]; editable: boolean;
  onEdit: (t: EditTarget) => void; onDelete: (kind: "expense" | "income", row: any) => void;
  /** Copy a record to today; left out when the month shown isn't this month. */
  onCopy?: (kind: "expense" | "income", row: any) => void;
}) {
  const { sel } = app;
  const nwOn = sel.need_want !== false;
  const today = todayStr();
  const yest = new Date(Date.now() - 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const groups = useMemo(() => {
    const all = [...expenses.map((r) => ({ kind: "expense" as const, r })), ...incomes.map((r) => ({ kind: "income" as const, r }))]
      .sort((a, b) => (a.r.created_at < b.r.created_at ? 1 : -1));
    const by: { day: string; items: typeof all; out: number; inc: number }[] = [];
    for (const x of all) {
      const d = dayOf(x.r.created_at);
      let g = by[by.length - 1];
      if (!g || g.day !== d) { g = { day: d, items: [], out: 0, inc: 0 }; by.push(g); }
      g.items.push(x);
      if (x.kind === "expense") g.out += x.r.amount; else g.inc += x.r.amount;
    }
    return by;
  }, [expenses, incomes]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  if (!groups.length) return <div className="empty">還沒有紀錄，按下面的「記一筆」開始</div>;
  return (
    <div className="daylist">
      {groups.map((g) => (
        <div key={g.day} className="day">
          <div className="day-h">
            <span>{+g.day.slice(5, 7)}月{+g.day.slice(8)}日{g.day === today ? "・今天" : g.day === yest ? "・昨天" : ""}</span>
            <span className="day-sum">{g.out > 0 && <><i className="b out">支</i>{num(g.out)}</>}{g.inc > 0 && <> <i className="b in">入</i>{num(g.inc)}</>}</span>
          </div>
          <div className="day-card">
            {g.items.map(({ kind, r }) => (
              <SwipeRow key={r.id} wide={!!onCopy} open={openId === r.id} disabled={!editable} onOpen={(v) => { setOpenId(v ? r.id : null); setConfirm(null); }}
                actions={
                  <>
                    <button className="sw-edit" onClick={() => { setOpenId(null); onEdit({ kind, row: r }); }}>編輯</button>
                    {onCopy && <button className="sw-copy" onClick={() => { setOpenId(null); onCopy(kind, r); }}>複製</button>}
                    {confirm === r.id
                      ? <button className="sw-del" onClick={() => { setOpenId(null); setConfirm(null); onDelete(kind, r); }}>確定<br />刪除</button>
                      : <button className="sw-del" onClick={() => setConfirm(r.id)}>刪除</button>}
                  </>
                }
                onTap={() => editable && onEdit({ kind, row: r })}>
                <CatIcon cat={r.category} />
                <span className="rec-t">
                  <b>{kind === "income" ? r.source : r.item}</b>
                  <span className="rec-s">
                    {new Date(r.created_at).toLocaleTimeString("zh-TW", { timeZone: "Asia/Taipei", hour: "numeric", minute: "2-digit" })}
                    {" · "}{r.category}
                    {kind === "expense" && r.jar && r.jar !== "free" ? ` · ${jarName(sel, r.jar)}` : ""}
                    {kind === "expense" && payLabel(r) ? ` · ${payLabel(r)}` : ""}
                    {kind === "income" ? ` · ${Object.keys(r.split || {}).map((k) => jarName(sel, k)).join("、")}` : ""}
                  </span>
                  {(r.source === "notify" || r.source === "shortcut" || r.source === "voice" || (kind === "expense" && r.type && nwOn)) && (
                    <span className="rec-tags">
                      {kind === "expense" && r.type && nwOn && <span className={`tag ${r.type}`}>{r.type === "need" ? "需要" : "想要"}</span>}
                      {r.source === "notify" && <span className="tag shortcut">自動</span>}
                      {r.source === "shortcut" && <span className="tag shortcut">捷徑</span>}
                      {r.source === "voice" && <span className="tag shortcut">Siri</span>}
                    </span>
                  )}
                </span>
                <b className={`num rec-a ${kind === "income" ? "in" : ""}`}>{kind === "income" ? "+" : "−"}{num(r.amount)}</b>
              </SwipeRow>
            ))}
          </div>
        </div>
      ))}
      {editable && <p className="note center">往右滑一筆可以{onCopy ? "編輯、複製到今天或刪除" : "編輯或刪除"}，點一下也能編輯。</p>}
    </div>
  );
}

/** A record row that slides right to show its actions. Touch uses native listeners (iOS Safari
 *  cancels pointer events once it starts a pan), the mouse uses pointer events. */
function SwipeRow({ children, actions, open, onOpen, onTap, disabled, wide }: {
  children: React.ReactNode; actions: React.ReactNode; open: boolean; onOpen: (v: boolean) => void; onTap: () => void; disabled?: boolean; wide?: boolean;
}) {
  const W = wide ? 198 : 132;
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef<{ x: number; y: number; base: number; locked: "" | "x" | "y"; dx: number } | null>(null);
  const last = useRef({ open, onOpen, onTap, disabled, W });
  last.current = { open, onOpen, onTap, disabled, W };
  useEffect(() => { setDx(open ? W : 0); }, [open, W]);

  useEffect(() => {
    const el = ref.current!;
    const begin = (x: number, y: number) => { if (last.current.disabled) return; const b = last.current.open ? last.current.W : 0; st.current = { x, y, base: b, locked: "", dx: b }; };
    const step = (x: number, y: number, ev?: Event) => {
      const s = st.current; if (!s) return;
      const mx = x - s.x, my = y - s.y;
      if (!s.locked) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; s.locked = Math.abs(mx) > Math.abs(my) ? "x" : "y"; if (s.locked === "x") setDrag(true); }
      if (s.locked !== "x") return;
      if (ev && ev.cancelable) ev.preventDefault();
      s.dx = Math.max(0, Math.min(last.current.W + 30, s.base + mx));
      setDx(s.dx);
    };
    const end = () => {
      const s = st.current; st.current = null; setDrag(false);
      if (!s) return;
      const L = last.current;
      if (s.locked === "x") { const o = s.dx > L.W / 2; setDx(o ? L.W : 0); L.onOpen(o); }
      else if (!s.locked) { if (L.open) L.onOpen(false); else L.onTap(); }
    };
    const ts = (e: TouchEvent) => begin(e.touches[0].clientX, e.touches[0].clientY);
    const tm = (e: TouchEvent) => step(e.touches[0].clientX, e.touches[0].clientY, e);
    const te = (e: TouchEvent) => { e.preventDefault(); end(); };
    const tc = () => { st.current = null; setDrag(false); setDx(last.current.open ? last.current.W : 0); };
    const pd = (e: PointerEvent) => { if (e.pointerType === "mouse") begin(e.clientX, e.clientY); };
    const pm = (e: PointerEvent) => { if (e.pointerType === "mouse") step(e.clientX, e.clientY); };
    const pu = (e: PointerEvent) => { if (e.pointerType === "mouse") end(); };
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te);
    el.addEventListener("touchcancel", tc);
    el.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    return () => {
      el.removeEventListener("touchstart", ts); el.removeEventListener("touchmove", tm); el.removeEventListener("touchend", te); el.removeEventListener("touchcancel", tc);
      el.removeEventListener("pointerdown", pd); window.removeEventListener("pointermove", pm); window.removeEventListener("pointerup", pu);
    };
  }, []);

  return (
    <div className="swr">
      <div className="sw-acts" style={{ width: W }} aria-hidden={!open}>{actions}</div>
      <div ref={ref} className="sw-row" style={{ transform: `translateX(${dx}px)`, transition: drag ? "none" : "transform .2s ease" }}
        role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onTap(); }}>
        {children}
      </div>
    </div>
  );
}
