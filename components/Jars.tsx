"use client";
import { useState } from "react";
import type { App } from "./Shell";
import { rpc } from "@/lib/supabase";
import { JN, fmt, num, clamp, curMonth, split, defRatio, daysSince, shortDate } from "@/lib/util";
import { JarSVG, Stars, Confirm } from "./ui";

export function monthlyPlan(app: App) {
  const { data, sel } = app;
  const cur = data.months.find((x) => x.month === curMonth());
  if (cur) return cur.alloc;
  const last = [...data.months].reverse()[0];
  return split(sel.allowance, last?.ratio || defRatio(sel.role));
}

export default function Jars({ app }: { app: App }) {
  const { data, sel, family } = app;
  const b = data.bal;
  const cur = data.months.find((x) => x.month === curMonth());
  const g = data.goal;
  const freeP = cur?.status === "active" && cur.free_start ? b.free / cur.free_start : b.free > 0 ? 0.5 : 0;
  const ms = Math.max(10000, Math.ceil((b.long + 1) / 10000) * 10000);
  const idle = daysSince(b.last_expense);
  const showNudge = cur?.status === "active" && (idle === null ? true : idle >= 7);

  return (
    <>
      {!cur && (
        <div className="banner warn">
          <span>{app.isSelf ? "這個月還沒做月初規劃。" : `${sel.name} 這個月還沒做月初規劃。`}先把零用金分進三個罐子，才能開始記帳。</span>
          <div><button className="btn sm primary" onClick={() => app.go("month")}>去做規劃</button></div>
        </div>
      )}
      {showNudge && (
        <div className="banner warn">
          <span>{idle === null ? "這個月還沒有記帳紀錄。" : `已經 ${idle} 天沒有記帳了。`}花了錢記得記下來，月底檢討才看得清楚。</span>
          <div><button className="btn sm primary" onClick={() => app.go("month")}>去記帳</button></div>
        </div>
      )}
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
      <Stars months={data.months} />
      <DreamCard app={app} />
      <LongCard app={app} />
      {data.recent.length > 0 && (
        <section className="card">
          <h3>最近的進出</h3>
          <div className="list">
            {data.recent.map((e) => (
              <div className="li" key={e.id}>
                <span className="dot" style={{ background: `var(--${e.jar})` }} />
                <span className="t">{e.note}<br /><span className="d">{JN[e.jar]} · {shortDate(e.created_at)}</span></span>
                <span />
                <b className="num" style={{ color: e.amount < 0 ? "var(--warn)" : "var(--ink)" }}>{e.amount > 0 ? "+" : ""}{num(e.amount)}</b>
              </div>
            ))}
          </div>
        </section>
      )}
      <p className="note center">家庭銀行月息 {Number(family.rate)}% · 夢想過半加碼 {family.bonus_pct}%</p>
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
  const bonus = Math.round((g.price * family.bonus_pct) / 100);
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
          <Confirm label="買下夢想" confirmLabel="確定買下" className="btn primary" onConfirm={() => act("buy_goal", { p_member: sel.id }, "恭喜完成夢想！")} />
        </div>
      ) : (
        <>
          <p>{months === Infinity ? "目前夢想罐每月放 0 元，到「本月」把夢想罐調高一點。" : <>照目前的分配（每月 {fmt(per)}），大約還要 <b>{months} 個月</b>。</>}</p>
          {family.bonus_pct > 0 && (
            <p className="note">
              {g.bonus_given ? "爸媽的過半加碼已經發放了。" : pct >= 0.5 ? `已經過半！可以請爸媽發放 ${family.bonus_pct}% 加碼（${fmt(bonus)}）。` : `存到一半（${fmt(g.price / 2)}）時，爸媽會加碼 ${family.bonus_pct}%。`}
            </p>
          )}
          {canOverride && !g.bonus_given && pct >= 0.5 && (
            <div><button className="btn primary sm" disabled={busy} onClick={() => act("give_bonus", { p_member: sel.id }, `已發放 ${fmt(bonus)}`)}>發放夢想加碼 {fmt(bonus)}</button></div>
          )}
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
  const { data, family } = app;
  const [years, setYears] = useState(10);
  const rate = Number(family.rate);
  const per = monthlyPlan(app).long;
  return (
    <section className="card">
      <div className="card-h"><h2>長期罐會自己長大</h2><span className="pill active">家庭銀行月息 {rate}%</span></div>
      <p className="small">每月結算時，爸媽會依長期罐的金額發利息。這個月結算大約會拿到 <b className="num">{fmt((data.bal.long * rate) / 100)}</b>。長期罐的錢只進不出。</p>
      <div className="kv small"><span className="muted">如果每月放 {fmt(per)}，持續</span><b>{years} 年</b></div>
      <input id="yrs" type="range" min={3} max={30} step={1} value={years} onChange={(e) => setYears(+e.target.value)} aria-label="年數" />
      <GrowthChart start={data.bal.long} monthly={per} years={years} />
      <div className="legend"><span><i style={{ background: "var(--long)" }} />投資，年報酬 6%</span><span><i style={{ background: "var(--muted)" }} />只存不投資</span></div>
      <p className="note">圖表用真實世界長期投資常見的年報酬 6% 示意複利。家庭銀行的利率是爸媽給的練習利率；真實投資有漲有跌，不保證報酬。</p>
    </section>
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
      {xs.map((y) => <text key={y} x={X(y)} y={H - 8} textAnchor="middle">{y === 0 ? "現在" : `${y} 年後`}</text>)}
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
