"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import { fmt, num, catsFor, INCOME_CATS, spendable, jarList, jarName, curMonth, payLabel, IS_DEMO } from "@/lib/util";
import { useExpenses } from "./Month";
import { useIncomes } from "./Income";
import { PayPicker, lastPay, rememberPay, type Pay } from "./Pay";

type Ev = { id: string; day: string; time: string; title: string; note: string; amount: number | null; dir: "" | "out" | "in"; repeat: "none" | "monthly"; done_months: string[] };

const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
/** The record's day in Taipei time, as YYYY-MM-DD. */
const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
const daysIn = (mk: string) => new Date(+mk.slice(0, 4), +mk.slice(5, 7), 0).getDate();
const compact = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(v >= 100000 ? 0 : 1)}萬` : num(v));
const WD = ["日", "一", "二", "三", "四", "五", "六"];

/** Where a monthly item lands in this month (clamped to the month's last day). */
function occursOn(e: Ev, mk: string): string | null {
  if (e.repeat === "monthly") {
    if (e.day.slice(0, 7) > mk) return null;
    const d = Math.min(+e.day.slice(8, 10), daysIn(mk));
    return `${mk}-${String(d).padStart(2, "0")}`;
  }
  return e.day.slice(0, 7) === mk ? e.day : null;
}

function useEvents(memberId: string) {
  const [list, setList] = useState<Ev[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("events").select("id,day,time,title,note,amount,dir,repeat,done_months")
      .eq("member_id", memberId).eq("voided", false).order("day", { ascending: true });
    setList((data as Ev[]) || []);
  }, [memberId]);
  useEffect(() => { load(); }, [load]);
  return { list, reload: load };
}

/** One event as an .ics file the phone's calendar can add (with a reminder at the time, or 9:00 for all-day items). */
function icsOf(e: Ev, day: string) {
  const d = day.replace(/-/g, "");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const money = e.amount ? `${e.dir === "in" ? "預計入帳" : "預計付款"} ${e.amount} 元` : "";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//My Allowance//Calendar//ZH", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${e.id}@my-allowance`, `DTSTAMP:${stamp}`,
    ...(e.time ? [`DTSTART;TZID=Asia/Taipei:${d}T${e.time.replace(":", "")}00`, "DURATION:PT30M"] : [`DTSTART;VALUE=DATE:${d}`]),
    ...(e.repeat === "monthly" ? ["RRULE:FREQ=MONTHLY"] : []),
    `SUMMARY:${e.title}${money ? `（${money}）` : ""}`, `DESCRIPTION:${[money, e.note].filter(Boolean).join("\\n")}`,
    "BEGIN:VALARM", e.time ? "TRIGGER:PT0M" : "TRIGGER:PT9H", "ACTION:DISPLAY", `DESCRIPTION:${e.title}`, "END:VALARM", "END:VEVENT", "END:VCALENDAR"];
  return "data:text/calendar;charset=utf-8," + encodeURIComponent(lines.join("\r\n"));
}

export function Calendar({ app }: { app: App }) {
  const { sel, mk, data } = app;
  const ex = useExpenses(sel.id, mk);
  const inc = useIncomes(sel.id, mk);
  const ev = useEvents(sel.id);
  const today = todayStr();
  const [day, setDay] = useState(() => (today.slice(0, 7) === mk ? today : `${mk}-01`));
  useEffect(() => { setDay(today.slice(0, 7) === mk ? today : `${mk}-01`); }, [mk]); // eslint-disable-line react-hooks/exhaustive-deps

  const byDay = useMemo(() => {
    const m: Record<string, { out: number; in: number; ev: Ev[]; ex: any[]; inc: any[] }> = {};
    const g = (d: string) => (m[d] ||= { out: 0, in: 0, ev: [], ex: [], inc: [] });
    for (const e of ex.list) { const d = dayOf(e.created_at); g(d).out += e.amount; g(d).ex.push(e); }
    for (const i of inc.list) { const d = dayOf(i.created_at); g(d).in += i.amount; g(d).inc.push(i); }
    for (const e of ev.list) { const d = occursOn(e, mk); if (d) g(d).ev.push(e); }
    return m;
  }, [ex.list, inc.list, ev.list, mk]);

  const first = new Date(+mk.slice(0, 4), +mk.slice(5, 7) - 1, 1).getDay();
  const n = daysIn(mk);
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: n }, (_, i) => `${mk}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const reloadAll = async () => { await Promise.all([ex.reload(), inc.reload(), ev.reload(), data.reload()]); };

  const upcoming = ev.list.map((e) => ({ e, d: occursOn(e, mk) })).filter((x) => x.d && x.d >= today && x.e.dir && !x.e.done_months.includes(mk))
    .sort((a, b) => (a.d! < b.d! ? -1 : 1));

  return (
    <>
      <section className="card cal">
        <div className="cal-grid" role="grid" aria-label="月曆">
          {WD.map((w) => <div key={w} className="cal-wd" aria-hidden="true">{w}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={`b${i}`} className="cal-cell empty" />;
            const x = byDay[d];
            const planned = x?.ev.filter((e) => e.dir && !e.done_months.includes(mk)) || [];
            return (
              <button key={d} className={`cal-cell ${d === day ? "on" : ""} ${d === today ? "today" : ""}`} onClick={() => setDay(d)}
                aria-label={`${+d.slice(5, 7)}月${+d.slice(8)}日${x?.out ? `，花了 ${x.out} 元` : ""}${x?.in ? `，收入 ${x.in} 元` : ""}${x?.ev.length ? `，${x.ev.length} 個行程` : ""}`}>
                <span className="cal-n">{+d.slice(8)}</span>
                {x?.out ? <span className="cal-out">−{compact(x.out)}</span> : null}
                {x?.in ? <span className="cal-in">+{compact(x.in)}</span> : null}
                {x?.ev.length ? <span className="cal-dots">{x.ev.slice(0, 3).map((e) => <i key={e.id} className={e.dir ? (planned.includes(e) ? "plan" : "done") : ""} />)}</span> : null}
              </button>
            );
          })}
        </div>
        <div className="legend small">
          <span><b style={{ color: "var(--warn)" }}>−</b> 花費</span><span><b style={{ color: "var(--long)" }}>+</b> 收入</span>
          <span><i className="cal-key" /> 行程</span><span><i className="cal-key plan" /> 預定帳務</span>
        </div>
      </section>
      <DayPanel app={app} day={day} items={byDay[day]} today={today} onChange={reloadAll} />
      {upcoming.length > 0 && (
        <section className="card">
          <h3>這個月還沒處理的預定帳務</h3>
          <div className="list">
            {upcoming.map(({ e, d }) => (
              <button key={e.id} className="li cal-up" onClick={() => setDay(d!)}>
                <span className="d">{+d!.slice(5, 7)}/{+d!.slice(8)}</span>
                <span className="t">{e.title}{e.repeat === "monthly" && <span className="note"> 每月</span>}</span>
                <span />
                <b className="num" style={{ color: e.dir === "in" ? "var(--long)" : "var(--warn)" }}>{e.dir === "in" ? "+" : "−"}{num(e.amount || 0)}</b>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function DayPanel({ app, day, items, today, onChange }: { app: App; day: string; items?: { out: number; in: number; ev: Ev[]; ex: any[]; inc: any[] }; today: string; onChange: () => Promise<void> }) {
  const { sel, mk, data, toast } = app;
  const [mode, setMode] = useState<"" | "event" | "out" | "in">("");
  const [edit, setEdit] = useState<Ev | null>(null);
  const [fromEv, setFromEv] = useState<Ev | null>(null);
  useEffect(() => { setMode(""); setEdit(null); setFromEv(null); }, [day]);
  const mo = data.months.find((x) => x.month === mk);
  const canBook = mo?.status === "active" && mk === curMonth() && day <= today && (sel.role !== "kid" || day === today);
  const past = day < today;
  const label = `${+day.slice(5, 7)}月${+day.slice(8)}日（${WD[new Date(day + "T00:00:00").getDay()]}）`;
  const evs = items?.ev || [];

  async function done(e: Ev, v: boolean) {
    const [, err] = await rpc("set_event_done", { p_id: e.id, p_month: mk, p_done: v });
    if (err) return toast(err);
    await onChange();
  }
  async function remove(e: Ev) {
    const [, err] = await rpc("void_event", { p_id: e.id });
    if (err) return toast(err);
    toast("行程刪掉了");
    await onChange();
  }
  function book(e: Ev) {
    setFromEv(e);
    setMode(e.dir === "in" ? "in" : "out");
  }

  return (
    <section className="card">
      <div className="card-h"><h3>{label}</h3>{day === today && <span className="pill active">今天</span>}</div>
      {evs.length === 0 && !items?.ex.length && !items?.inc.length && !mode && <p className="note">這天還沒有行程或帳務。</p>}
      {evs.length > 0 && (
        <div className="list">
          {evs.map((e) => {
            const isDone = e.done_months.includes(mk);
            return (
              <div key={e.id} className="li cal-ev">
                <span className="d">{e.time || "整天"}</span>
                <span className="t">
                  <b style={isDone ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>{e.title}</b>
                  {e.repeat === "monthly" && <span className="note"> 每月</span>}
                  {e.amount ? <> <span className={`tag ${e.dir === "in" ? "income" : "want"}`}>{e.dir === "in" ? "預計入帳" : "預計付款"} {num(e.amount)}</span></> : null}
                  {e.note && <><br /><span className="note">{e.note}</span></>}
                  <span className="cal-acts">
                    {e.dir && !isDone && canBook && <button className="btn sm primary" onClick={() => book(e)}>{e.dir === "in" ? "已入帳，記收入" : "已付款，記支出"}</button>}
                    {e.dir && <button className="btn sm" onClick={() => done(e, !isDone)}>{isDone ? "改回未完成" : "標成已處理"}</button>}
                    <button className="btn sm ghost" onClick={() => { setEdit(e); setMode("event"); }}>修改</button>
                    {!IS_DEMO && <a className="btn sm ghost" href={icsOf(e, day)} download={`${e.title}.ics`}>加到手機行事曆</a>}
                  </span>
                </span>
                <span />
                <button className="x" onClick={() => remove(e)} aria-label={`刪除行程 ${e.title}`}>×</button>
              </div>
            );
          })}
        </div>
      )}
      {(items?.ex.length || items?.inc.length) ? (
        <div className="list">
          {items!.ex.map((e) => (
            <div key={e.id} className="li">
              <span className="dot" style={{ background: `var(--${e.jar || "free"})` }} />
              <span className="t">{e.item} <span className="note">{e.category} · {jarName(sel, e.jar || "free")}{payLabel(e) ? ` · ${payLabel(e)}` : ""}</span></span>
              <span />
              <b className="num" style={{ color: "var(--warn)" }}>−{num(e.amount)}</b>
            </div>
          ))}
          {items!.inc.map((i) => (
            <div key={i.id} className="li">
              <span className="dot" style={{ background: "var(--long)" }} />
              <span className="t">{i.source} <span className="note">{i.category}</span></span>
              <span />
              <b className="num" style={{ color: "var(--long)" }}>+{num(i.amount)}</b>
            </div>
          ))}
        </div>
      ) : null}

      {!mode && (
        <div className="row" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => setMode("event")}>＋ 行程</button>
          {canBook && <button className="btn sm" onClick={() => setMode("out")}>＋ 支出</button>}
          {canBook && <button className="btn sm" onClick={() => setMode("in")}>＋ 收入</button>}
        </div>
      )}
      {!mode && !canBook && day > today && <p className="note">未來的帳單、薪水，可以先記成「行程」並填預定金額，到時候按一下就能記帳。</p>}
      {!mode && !canBook && day <= today && mk === curMonth() && sel.role === "kid" && day !== today && <p className="note">以前的日子不能補記花費，記帳要在當天記喔。</p>}
      {mode === "event" && <EventForm app={app} day={day} edit={edit} onDone={async () => { setMode(""); setEdit(null); await onChange(); }} onCancel={() => { setMode(""); setEdit(null); }} />}
      {(mode === "out" || mode === "in") && (
        <BookForm app={app} dir={mode} day={day} past={past} fromEv={fromEv}
          onDone={async () => { if (fromEv) await rpc("set_event_done", { p_id: fromEv.id, p_month: mk, p_done: true }); setMode(""); setFromEv(null); await onChange(); }}
          onCancel={() => { setMode(""); setFromEv(null); }} />
      )}
    </section>
  );
}

function EventForm({ app, day, edit, onDone, onCancel }: { app: App; day: string; edit: Ev | null; onDone: () => void; onCancel: () => void }) {
  const { sel, toast } = app;
  const [title, setTitle] = useState(edit?.title || "");
  const [date, setDate] = useState(edit?.day || day);
  const [time, setTime] = useState(edit?.time || "");
  const [note, setNote] = useState(edit?.note || "");
  const [dir, setDir] = useState<"" | "out" | "in">(edit?.dir || "");
  const [amt, setAmt] = useState(edit?.amount ? String(edit.amount) : "");
  const [monthly, setMonthly] = useState(edit?.repeat === "monthly");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const [, e] = await rpc("save_event", { p_id: edit?.id || null, p_member: sel.id, p_day: date, p_time: time, p_title: title, p_note: note,
      p_amount: dir ? Math.round(+amt) || 0 : null, p_dir: dir, p_repeat: monthly ? "monthly" : "none" });
    setBusy(false);
    if (e) return toast(e);
    toast(edit ? "行程改好了" : "行程加好了");
    onDone();
  }
  return (
    <div className="income-form">
      <label className="f">行程<input id="ev-title" maxLength={40} placeholder="例如：繳房租、牙醫、雯婷來拿貨" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <div className="grid2">
        <label className="f">日期<input id="ev-day" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label className="f">時間（可不填）<input id="ev-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
      </div>
      <div className="small muted">有預定的金額嗎？</div>
      <div className="seg" role="group" aria-label="預定帳務">
        <button className={dir === "" ? "on" : ""} onClick={() => setDir("")}>沒有</button>
        <button className={dir === "out" ? "on" : ""} onClick={() => setDir("out")}>要付錢</button>
        <button className={dir === "in" ? "on" : ""} onClick={() => setDir("in")}>會入帳</button>
      </div>
      {dir && <label className="f">預定金額<input id="ev-amt" type="number" inputMode="numeric" min={1} placeholder="例如 12000" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>}
      <label className="f">備註（可不填）<input id="ev-note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <label className="check"><input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.target.checked)} /> 每個月的這一天都有（房租、卡費、訂閱）</label>
      {dir && <p className="note">預定帳務不會先扣錢。到了那天按「已付款，記支出」，才會從罐子扣。</p>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={busy || !title.trim() || !date || (!!dir && !(+amt > 0))} onClick={save}>{edit ? "儲存" : "加入行程"}</button>
        <button className="btn" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

function BookForm({ app, dir, day, past, fromEv, onDone, onCancel }: { app: App; dir: "out" | "in"; day: string; past: boolean; fromEv: Ev | null; onDone: () => void; onCancel: () => void }) {
  const { sel, toast } = app;
  const isOut = dir === "out";
  const jars = isOut ? spendable(sel) : jarList(sel).filter((j) => !(j.key === "long" && sel.role === "kid"));
  const [item, setItem] = useState(fromEv?.title || "");
  const [amt, setAmt] = useState(fromEv?.amount ? String(fromEv.amount) : "");
  const [jar, setJar] = useState("free");
  const cats = isOut ? catsFor(jar, sel) : INCOME_CATS[sel.role === "kid" ? "kid" : "adult"];
  const [cat, setCat] = useState(cats[0]);
  const [pay, setPay] = useState<Pay>(() => lastPay(sel.id));
  const [busy, setBusy] = useState(false);

  async function save() {
    const a = Math.round(+amt);
    setBusy(true);
    const [r, e] = isOut
      ? await rpc<any>("add_expense_v3", { p_member: sel.id, p_item: item, p_amount: a, p_type: "", p_category: cat, p_jar: jar, p_pay_method: pay.m, p_pay_detail: pay.d })
      : await rpc<any>("add_income", { p_member: sel.id, p_source: item, p_category: cat, p_amount: a, p_split: { [jar]: a } });
    if (!e && past && r?.id) {
      const [, e2] = await rpc("set_record_date", { p_kind: isOut ? "expense" : "income", p_id: r.id, p_day: day });
      if (e2) toast(e2);
    }
    setBusy(false);
    if (e) return toast(e);
    if (isOut) rememberPay(sel.id, pay);
    toast(isOut ? (r?.left < 0 ? `記下來了。${r.jar_name}透支 ${fmt(-r.left)}` : "記下來了") : "收入記好了");
    onDone();
  }
  return (
    <div className="income-form">
      <div className="small muted">{isOut ? "記一筆支出" : "記一筆收入"}{past ? `（記在 ${+day.slice(5, 7)}/${+day.slice(8)}）` : ""}</div>
      <div className="grid2">
        <label className="f">{isOut ? "買了什麼" : "收入來源"}<input id="bk-item" maxLength={40} value={item} onChange={(e) => setItem(e.target.value)} /></label>
        <label className="f">多少錢<input id="bk-amt" type="number" inputMode="numeric" min={1} value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
      </div>
      <div className="small muted">{isOut ? "從哪個罐子付" : "放進哪個罐子"}</div>
      <div className="seg" role="group" aria-label="哪個罐子">
        {jars.map((j) => <button key={j.key} className={jar === j.key ? "on" : ""} onClick={() => { setJar(j.key); if (isOut) setCat(catsFor(j.key, sel)[0]); }}>{j.name}</button>)}
      </div>
      <div className="chips" role="group" aria-label="類別">
        {cats.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
      </div>
      {isOut && <PayPicker mid={sel.id} value={pay} onChange={setPay} />}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn primary" disabled={busy || !item.trim() || !(+amt > 0)} onClick={save}>記下來</button>
        <button className="btn" onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}
