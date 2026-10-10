"use client";
import { useLongHistory, ContribBars, RealReturn, avgMonthly } from "./LongReal";
import { useEffect, useState } from "react";
import type { App } from "./Shell";
import { rpc, supabase } from "@/lib/supabase";
import { fmt, num, clamp, curMonth, split, defRatio, daysSince, shortDate, matchOf, stepBonus, gd, jarList, jarName, spendable } from "@/lib/util";
import { JarSVG, Stars, Confirm } from "./ui";

export function monthlyPlan(app: App) {
  const { data, sel } = app;
  const cur = data.months.find((x) => x.month === curMonth());
  if (cur) return { match: 0, ...cur.alloc };
  const last = [...data.months].reverse()[0];
  const a = split(sel.allowance, last?.ratio || defRatio(sel.role));
  return { ...a, match: matchOf(app.family, sel.role, a.long) } as Record<string, number>;
}

export default function Jars({ app }: { app: App }) {
  const { data, sel, family } = app;
  const b = data.bal;
  const cur = data.months.find((x) => x.month === curMonth());
  const g = data.goal;
  const freeP = cur?.status === "active" && cur.free_start ? b.free / cur.free_start : b.free > 0 ? 0.5 : 0;
  const ms = Math.max(10000, Math.ceil((b.long + 1) / 10000) * 10000);
  const idle = daysSince(b.last_expense);
  const showNudge = cur?.status === "active" && (idle === null ? true : idle >= 2);
  const [advs, setAdvs] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("advances").select("amount,repay_month,repaid,kind").eq("member_id", sel.id).eq("repaid", false)
      .then(({ data: rows }: any) => setAdvs(rows || []));
  }, [sel.id, b.free]);

  return (
    <>
      {!cur && (
        <div className="banner warn">
          <span>{app.isSelf ? "這個月還沒做月初規劃。" : `${sel.name} 這個月還沒做月初規劃。`}先把零用金分進罐子，才能開始記帳。</span>
          <div><button className="btn sm primary" onClick={() => app.go("month")}>去做規劃</button></div>
        </div>
      )}
      {showNudge && (
        <div className="banner warn">
          <span>{idle === null ? "這個月還沒有記帳紀錄。" : `已經 ${idle} 天沒有記帳了。`}每週要記滿 {family.star_days ?? 4} 天才拿得到星星；沒花錢的日子也可以打卡。</span>
          <div><button className="btn sm primary" onClick={() => app.go("month")}>去記帳</button></div>
        </div>
      )}
      {advs.map((a, i) => (
        <div className="banner" key={i}>
          <span>{a.kind === "overdraft" ? `上個月透支 ${fmt(a.amount)}` : `預支了 ${fmt(a.amount)}`}，{+a.repay_month.slice(5)} 月的零用金會先扣回這筆錢。</span>
        </div>
      ))}
      <Overdraft app={app} />
      <div className="trio">
        <div className="jarcol">
          <JarSVG kind="free" pct={freeP} />
          <div className="jn k-free">自由罐</div>
          <div className="ja">{fmt(b.free)}</div>
          <div className="js">{cur?.status === "active" ? "本月可自由花" : "每月可以花光"}</div>
        </div>
        <div className="jarcol">
          <JarSVG kind="dream" pct={g ? b.dream / g.price : b.dream > 0 ? 0.4 : 0} />
          <div className="jn k-dream">夢想罐</div>
          <div className="ja">{fmt(b.dream)}</div>
          <div className="js">{g ? `${Math.min(100, Math.round((b.dream / g.price) * 100))}% · ${g.name}` : "還沒設定夢想"}</div>
        </div>
        <div className="jarcol">
          <JarSVG kind="long" pct={b.long / ms} />
          <div className="jn k-long">長期罐</div>
          <div className="ja">{fmt(b.long)}</div>
          <div className="js">只進不出<br />下個目標 {fmt(ms)}</div>
        </div>
      </div>
      <ExtraJars app={app} />
      <Stars months={data.months} />
      <DreamCard app={app} />
      <LongCard app={app} />
      <MoveMoney app={app} />
      {data.recent.length > 0 && (
        <section className="card">
          <h3>最近的進出</h3>
          <div className="list">
            {data.recent.map((e) => (
              <div className="li" key={e.id}>
                <span className="dot" style={{ background: `var(--${e.jar})` }} />
                <span className="t">{e.note}<br /><span className="d">{jarName(sel, e.jar)} · {shortDate(e.created_at)}</span></span>
                <span />
                <b className="num" style={{ color: e.amount < 0 ? "var(--warn)" : "var(--ink)" }}>{e.amount > 0 ? "+" : ""}{num(e.amount)}</b>
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="note center">
        {sel.role === "kid" ? `夢想罐每存滿 ${fmt(family.bonus_step)} 加碼 ${family.bonus_pct}% · 長期罐每月至少 ${fmt(family.long_min)}，${gd(family)}配對 ${family.match_pct}%` : "孩子的加碼和配對規則在「更多 → 罐子使用原則」"}
        {Number(family.rate) > 0 ? ` · 家庭銀行月息 ${Number(family.rate)}%` : ""}
      </p>
    </>
  );
}

function DreamCard({ app }: { app: App }) {
  const { data, sel, family, isParent, isSelf, toast } = app;
  const g = data.goal;
  const b = data.bal;
  const [form, setForm] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(fnName: string, args: any, ok: string) {
    setBusy(true);
    const [, e] = await rpc(fnName, args);
    setBusy(false);
    if (e) return toast(e);
    toast(ok);
    setForm(false);
    setName("");
    setPrice("");
    await data.reload();
  }

  if (!g || form) {
    const pending = !!g;
    return (
      <section className="card">
        <h2 className="k-dream">{pending ? "想換一個夢想？" : "設定夢想"}</h2>
        <p className="small muted">
          {pending ? "換夢想要先冷靜 7 天。7 天後還是想換，再按確認。已經存的錢會留在夢想罐。"
            : "一樣想要的東西，或一趟旅行。寫下它的價格，就知道要存多久。"}
        </p>
        <div className="grid2">
          <label className="f">夢想是什麼<input id="g-name" maxLength={30} placeholder="例如：新球鞋" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="f">大約多少錢<input id="g-price" type="number" inputMode="numeric" min={1} placeholder="3000" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        </div>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={() => act("set_goal", { p_member: sel.id, p_name: name, p_price: Math.round(+price) }, pending ? "冷靜期開始，7 天後再決定" : "夢想設定好了")}>
            {pending ? "開始 7 天冷靜期" : "設定夢想"}
          </button>
          {pending && <button className="btn ghost" onClick={() => setForm(false)}>取消</button>}
        </div>
        {data.achieved.length > 0 && <p className="note">已完成的夢想：{data.achieved.map((a) => a.name).join("、")}</p>}
      </section>
    );
  }

  const pct = clamp(b.dream / g.price, 0, 1);
  const per = monthlyPlan(app).dream;
  const rem = Math.max(0, g.price - b.dream);
  const months = per > 0 ? Math.ceil(rem / per) : Infinity;
  const pendLeft = g.pending_at ? Math.ceil((new Date(g.pending_at).getTime() + 7 * 86400000 - Date.now()) / 86400000) : 0;
  const canOverride = isParent && !isSelf;

  return (
    <section className="card">
      <div className="card-h"><h2>夢想：{g.name}</h2><span className="num muted">{fmt(g.price)}</span></div>
      <div className="bar" aria-label="夢想進度"><span style={{ width: `${pct * 100}%`, background: "var(--dream)" }} /><i className="mark" style={{ left: "50%" }} /></div>
      <div className="kv"><span>已存 <b>{fmt(b.dream)}</b></span><span>還差 <b>{fmt(rem)}</b></span></div>
      {pct >= 1 ? (
        <div className="celebrate">
          <h3>存到了！</h3>
          <p className="small">夢想罐已經夠買「{g.name}」。買下後會從夢想罐扣掉 {fmt(g.price)}。</p>
          {sel.role === "kid" ? <BuyApproval app={app} g={g} busy={busy} act={act} /> : (
            <Confirm label="買下夢想" confirmLabel="確定買下" className="btn primary" onConfirm={() => act("approve_buy", { p_member: sel.id }, "恭喜完成夢想！")} />
          )}
        </div>
      ) : (
        <>
          <p>{months === Infinity ? "目前夢想罐每月放 0 元，到「本月」把夢想罐調高一點。" : <>照目前的分配（每月 {fmt(per)}），大約還要 <b>{months} 個月</b>。</>}</p>
          {sel.role === "kid" && family.bonus_pct > 0 && <MilestoneNote app={app} />}
        </>
      )}
      {g.pending_at ? (
        <div className="sug">
          <p className="small">冷靜期中：想換成「{g.pending_name}」（{fmt(g.pending_price)}）</p>
          <div className="row">
            {pendLeft <= 0 || canOverride ? (
              <button className="btn primary sm" disabled={busy} onClick={() => act("apply_goal_change", { p_member: sel.id }, "夢想已更換")}>{pendLeft > 0 ? "家長同意，直接更換" : "確認更換"}</button>
            ) : (
              <span className="small muted">再 {pendLeft} 天就可以確認</span>
            )}
            <button className="btn sm ghost" disabled={busy} onClick={() => act("cancel_goal_change", { p_member: sel.id }, "維持原本的夢想")}>不換了</button>
          </div>
        </div>
      ) : pct < 1 ? (
        <div><button className="btn sm ghost" onClick={() => setForm(true)}>更換夢想</button></div>
      ) : null}
      {data.achieved.length > 0 && <p className="note">已完成的夢想：{data.achieved.map((a) => a.name).join("、")}</p>}
    </section>
  );
}

function LongCard({ app }: { app: App }) {
  const { data, family, sel } = app;
  const [years, setYears] = useState(10);
  const hist = useLongHistory(sel.id);
  const [mon, setMon] = useState<number | null>(null);
  const rate = Number(family.rate);
  const plan = monthlyPlan(app);
  const isKid = sel.role === "kid";
  const exYou = family.long_min;
  const exMatch = matchOf(family, "kid", exYou);
  const per = isKid ? exYou + exMatch : plan.long + (plan.match || 0);
  const actual = plan.long + (plan.match || 0);
  const avg = avgMonthly(hist.months);
  const base = Math.round((avg || per) / 100) * 100;
  const monthly = mon ?? base;
  const monMax = Math.max(5000, Math.ceil((base * 3) / 1000) * 1000);
  const lastVal = hist.values[hist.values.length - 1];
  const startVal = lastVal && lastVal.month === curMonth() ? lastVal.value : data.bal.long;
  return (
    <section className="card">
      <div className="card-h"><h2>長期罐：定期投資</h2>{rate > 0 && <span className="pill active">家庭銀行月息 {rate}%</span>}</div>
      {sel.role === "kid" ? (
        <>
          <p className="small">每月至少放 <b>{fmt(family.long_min)}</b>，你放多少，{gd(family)}就配對 {family.match_pct}%{family.match_cap > 0 ? `（每月最多 ${fmt(family.match_cap)}）` : ""}。這筆錢每月定期投資股票，只進不出。</p>
          <div className="grid3 center">
            <div><div className="note">你放</div><b className="num">{fmt(exYou)}</b></div>
            <div><div className="note">{gd(family)}配對</div><b className="num" style={{ color: "var(--long)" }}>+{fmt(exMatch)}</b></div>
            <div><div className="note">每月投資</div><b className="num">{fmt(per)}</b></div>
          </div>
          {actual !== per && <p className="note">這個月實際是：你放 {fmt(plan.long)}，{gd(family)}配對 {fmt(plan.match || 0)}，一共投資 {fmt(actual)}。</p>}
        </>
      ) : (
        <p className="small">長期罐的錢只進不出，每月定期投資。每月金額可以不一樣（定期不定額）。</p>
      )}
      <h3 style={{ marginTop: 8 }}>每月實際投入</h3>
      <ContribBars months={hist.months} family={family} />
      {hist.months.length > 0 && <p className="note">近 {Math.min(6, hist.months.length)} 個月平均每月投入 {fmt(avgMonthly(hist.months))}。</p>}
      <h3 style={{ marginTop: 8 }}>真實報酬</h3>
      <RealReturn app={app} hist={hist} />
      <h3 style={{ marginTop: 8 }}>未來試算</h3>
      {rate > 0 && <p className="note">月底結算時，家庭銀行另外依長期罐金額發 {rate}% 利息，這個月大約 {fmt((data.bal.long * rate) / 100)}。</p>}
      <div className="kv small"><span className="muted">如果每月平均投入</span><b className="num">{fmt(monthly)}</b></div>
      <input id="mon" type="range" min={0} max={monMax} step={100} value={monthly} onChange={(e) => setMon(+e.target.value)} aria-label="每月平均投入" />
      <div className="kv small"><span className="muted">持續</span><b>{years} 年</b></div>
      <input id="yrs" type="range" min={3} max={30} step={1} value={years} onChange={(e) => setYears(+e.target.value)} aria-label="年數" />
      <GrowthChart start={startVal} monthly={monthly} years={years} />
      <div className="legend"><span><i style={{ background: "var(--long)" }} />投資，年報酬 6%</span><span><i style={{ background: "var(--muted)" }} />只存不投資</span></div>
      <p className="note">預設用近幾個月的平均投入，可以拉動試算。圖表用長期投資常見的年報酬 6% 示意複利，真實股票有漲有跌，不保證報酬。</p>
    </section>
  );
}

function MilestoneNote({ app }: { app: App }) {
  const { data, family } = app;
  const own = data.bal.dream_own || 0;
  const tiers = data.bal.dream_tiers || 0;
  const step = family.bonus_step;
  const reached = Math.floor(own / step);
  const next = (reached + 1) * step;
  const bonus = stepBonus(family);
  const pending = reached > tiers;
  return (
    <div className="sug">
      <div className="kv small"><span>夢想加碼關卡</span><b>{tiers > 0 ? `已拿 ${tiers} 次 · ${fmt(tiers * bonus)}` : "還沒拿過"}</b></div>
      <div className="bar"><span style={{ width: `${clamp((own % step) / step, 0, 1) * 100}%`, background: "var(--accent)" }} /></div>
      <p className="small">
        自己存了 {fmt(own)}。{pending ? `已經存滿 ${fmt(reached * step)}，月底結算時會拿到加碼 ${fmt((reached - tiers) * bonus)}。` : `再存 ${fmt(next - own)} 到 ${fmt(next)}，月底結算時${gd(family)}加碼 ${fmt(bonus)}。`}
      </p>
      <p className="note">只算自己存進夢想罐的錢；夢想罐花掉後，關卡從 0 重新開始。</p>
    </div>
  );
}

export function GrowthChart({ start, monthly, years }: { start: number; monthly: number; years: number }) {
  const W = 320, H = 170, L = 46, R = 12, T = 14, B = 26, r = 0.06 / 12;
  const plain: number[] = [], grow: number[] = [];
  for (let y = 0; y <= years; y++) {
    plain.push(start + monthly * 12 * y);
    const n = y * 12;
    grow.push(start * Math.pow(1 + r, n) + (n ? (monthly * (Math.pow(1 + r, n) - 1)) / r : 0));
  }
  const mx = Math.max(1, grow[years]) * 1.08;
  const X = (y: number) => L + ((W - L - R) * y) / years;
  const Y = (v: number) => T + (H - T - B) * (1 - v / mx);
  const path = (a: number[]) => a.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
  const ticks = [0, mx / 3, (mx * 2) / 3].map((v) => Math.round(v / 1000) * 1000);
  const short = (v: number) => (v >= 10000 ? (v / 10000).toFixed(v >= 100000 ? 0 : 1) + "萬" : v.toLocaleString("zh-TW"));
  const xs = [0, Math.round(years / 2), years];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="長期罐成長示意">
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
          <text x={L - 6} y={Y(v) + 3} textAnchor="end">{short(v)}</text>
        </g>
      ))}
      {xs.map((y, i) => <text key={y} x={X(y)} y={H - 8} textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>{y === 0 ? "現在" : `${y} 年後`}</text>)}
      <path d={path(grow) + ` L${X(years)} ${Y(0)} L${X(0)} ${Y(0)} Z`} fill="var(--long)" fillOpacity=".12" />
      <path d={path(plain)} fill="none" stroke="var(--muted)" strokeWidth="2" strokeDasharray="4 4" />
      <path d={path(grow)} fill="none" stroke="var(--long)" strokeWidth="2.5" />
      <circle cx={X(years)} cy={Y(grow[years])} r="4" fill="var(--long)" />
      <text x={X(years) - 6} y={Y(grow[years]) - 8} textAnchor="end" style={{ fill: "var(--ink)", fontWeight: 700 }}>{fmt(grow[years])}</text>
      <circle cx={X(years)} cy={Y(plain[years])} r="3" fill="var(--muted)" />
      <text x={X(years) - 6} y={Y(plain[years]) + 14} textAnchor="end">{fmt(plain[years])}</text>
    </svg>
  );
}

function ExtraJars({ app }: { app: App }) {
  const { data, sel } = app;
  const extras = jarList(sel).filter((j) => !j.core);
  if (!extras.length) return null;
  const cur = data.months.find((x) => x.month === curMonth());
  return (
    <div className="trio more" style={{ gridTemplateColumns: `repeat(${Math.min(extras.length, 3)}, minmax(0, 1fr))` }}>
      {extras.map((j) => {
        const bal = data.bal.extras?.[j.key] || 0;
        const planned = cur?.alloc?.[j.key] || 0;
        const pct = j.target ? bal / j.target : planned ? bal / planned : bal > 0 ? 0.5 : 0;
        const sub = j.key === "fixed" ? (planned ? `本月放 ${fmt(planned)}` : "每月固定要付的錢")
          : j.target ? `目標 ${fmt(j.target)} · ${Math.min(100, Math.round((bal / j.target) * 100))}%`
          : j.key === "reserve" ? "突發狀況用" : "";
        return (
          <div className="jarcol" key={j.key}>
            <JarSVG kind={j.key} pct={pct} />
            <div className="jn" style={{ color: `var(--${j.key})` }}>{j.name}</div>
            <div className="ja">{fmt(bal)}</div>
            <div className="js">{sub}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Jars money can be moved out of: never the long jar; the dream jar for adults, or for a kid only when a parent does it. */
export function movableFrom(app: App) {
  const { sel, isSelf, isParent } = app;
  const list = spendable(sel);
  const dreamOk = sel.role !== "kid" || (isParent && !isSelf);
  const dream = jarList(sel).find((j) => j.key === "dream");
  return dreamOk && dream ? [...list, dream] : list;
}
export const balOfJar = (app: App, k: string): number =>
  k === "free" ? app.data.bal.free : k === "dream" ? app.data.bal.dream : k === "long" ? app.data.bal.long : app.data.bal.extras?.[k] || 0;

/** Shown when a jar is overdrawn: one tap covers it from another jar. */
export function Overdraft({ app }: { app: App }) {
  const { sel, toast, data, family, isSelf } = app;
  const [busy, setBusy] = useState(false);
  const neg = spendable(sel).map((j) => ({ ...j, b: balOfJar(app, j.key) })).filter((j) => j.b < 0);
  if (!neg.length) return null;
  const isKid = sel.role === "kid";
  async function cover(to: string, from: string, amount: number) {
    setBusy(true);
    const [, e] = await rpc("move_money", { p_member: sel.id, p_from: from, p_to: to, p_amount: amount });
    setBusy(false);
    if (e) return toast(e);
    toast(`已從${jarName(sel, from)}補 ${fmt(amount)} 到${jarName(sel, to)}`);
    await data.reload();
  }
  return (
    <div className="banner warn">
      {neg.map((j) => {
        const need = -j.b;
        const srcs = movableFrom(app).filter((s) => s.key !== j.key).map((s) => ({ ...s, b: balOfJar(app, s.key) })).filter((s) => s.b > 0);
        return (
          <div key={j.key} style={{ display: "grid", gap: 8 }}>
            <span><b>{j.name}透支 {fmt(need)}</b>。{isKid ? (isSelf ? `可以請${gd(family)}從夢想罐幫你補；沒補的話，月底結算時會從下個月零用金扣回。` : `可以從${sel.name}的夢想罐幫他補（夢想加碼關卡會從 0 開始）；沒補的話，月底結算時從下個月零用金扣回。`) : "從其他罐子補回來，月底才能結算。"}</span>
            {srcs.length > 0 && (
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                {srcs.map((s) => {
                  const amt = Math.min(need, s.b);
                  return <button key={s.key} className="btn sm" disabled={busy} onClick={() => cover(j.key, s.key, amt)}>從{s.name}補 {fmt(amt)}</button>;
                })}
              </div>
            )}
            {isKid && isSelf && <span className="note">夢想罐的錢移出來要{gd(family)}同意，而且夢想加碼的關卡會從 0 開始。</span>}
          </div>
        );
      })}
    </div>
  );
}

function MoveMoney({ app }: { app: App }) {
  const { data, sel, toast } = app;
  const [open, setOpen] = useState(false);
  const froms = movableFrom(app);
  const all = jarList(sel);
  const [from, setFrom] = useState("free");
  const [to, setTo] = useState("dream");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const balOf = (k: string) => balOfJar(app, k);
  async function go() {
    setBusy(true);
    const [, e] = await rpc("move_money", { p_member: sel.id, p_from: from, p_to: to, p_amount: Math.round(+amt) });
    setBusy(false);
    if (e) return toast(e);
    toast(`已從${jarName(sel, from)}移 ${fmt(+amt)} 到${jarName(sel, to)}`);
    setAmt("");
    setOpen(false);
    await data.reload();
  }
  if (!open)
    return <button className="btn" onClick={() => setOpen(true)}>移動罐子裡的錢</button>;
  return (
    <section className="card">
      <div className="card-h"><h3>移動罐子裡的錢</h3><button className="btn sm ghost" onClick={() => setOpen(false)}>收起</button></div>
      <div className="grid2">
        <label className="f">從<select id="mv-from" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value === to) setTo(all.find((j) => j.key !== e.target.value)!.key); }}>
          {froms.map((j) => <option key={j.key} value={j.key}>{j.name}（{fmt(balOf(j.key))}）</option>)}
        </select></label>
        <label className="f">到<select id="mv-to" value={to} onChange={(e) => setTo(e.target.value)}>
          {all.filter((j) => j.key !== from).map((j) => <option key={j.key} value={j.key}>{j.name}</option>)}
        </select></label>
      </div>
      <label className="f">金額<input id="mv-amt" type="number" inputMode="numeric" min={1} value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
      <div><button className="btn primary" disabled={busy || !(+amt > 0)} onClick={go}>移過去</button></div>
      <p className="note">{sel.role === "kid"
        ? `長期罐的錢只進不出。夢想罐的錢要移出來需要${gd(app.family)}同意（由${gd(app.family)}操作），移出後夢想加碼關卡從 0 開始。`
        : "長期罐的錢只進不出。從夢想罐移出的錢會記成「挪用」，月底檢討看得到。"}</p>
    </section>
  );
}

function BuyApproval({ app, g, busy, act }: { app: App; g: any; busy: boolean; act: (fn: string, args: any, ok: string) => Promise<void> }) {
  const { sel, me, isSelf, isParent, family, members } = app;
  const approver = members.find((m) => m.id === family.approver);
  const parentLabel = approver ? approver.name : gd(family);
  const canParent = isParent && !isSelf && (!family.approver || family.approver === me.id);
  const kidOk = !!g.buy_kid_at, parOk = !!g.buy_parent_at;
  const parName = members.find((m) => m.id === g.buy_parent_by)?.name || parentLabel;
  const ok = (both: boolean) => (both ? "恭喜完成夢想！" : "已同意，等另一方同意");
  return (
    <>
      <p className="small">要兩個人都同意才能買：{sel.name}本人和{parentLabel}。</p>
      <div className="sign">
        <div className={kidOk ? "done" : ""}>
          <b>{sel.name}</b>
          {kidOk ? <span className="small muted">已同意</span>
            : isSelf ? <Confirm label="我確定要買" confirmLabel="確定" className="btn primary sm" disabled={busy} onConfirm={() => act("approve_buy", { p_member: sel.id }, ok(parOk))} />
            : <span className="small muted">等 {sel.name} 同意</span>}
        </div>
        <div className={parOk ? "done" : ""}>
          <b>{parOk ? parName : parentLabel}</b>
          {parOk ? <span className="small muted">已同意</span>
            : canParent ? <Confirm label="我同意購買" confirmLabel="確定" className="btn primary sm" disabled={busy} onConfirm={() => act("approve_buy", { p_member: sel.id }, ok(kidOk))} />
            : <span className="small muted">等 {parentLabel} 同意</span>}
        </div>
      </div>
      {(kidOk || parOk) && <div><button className="btn sm ghost" disabled={busy} onClick={() => act("cancel_buy", { p_member: sel.id }, "已取消，重新考慮")}>再想想，取消同意</button></div>}
      <p className="note">兩邊都同意後，會自動從夢想罐扣掉 {fmt(g.price)}。</p>
    </>
  );
}
