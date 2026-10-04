"use client";
import { useState } from "react";
import { PAY_METHODS, PAY_NAME, PAY_PRESETS, fmt } from "@/lib/util";

export type Pay = { m: string; d: string };

const kLast = (mid: string) => `adf-pay-last-${mid}`;
const kNames = (mid: string) => `adf-pay-names-${mid}`;
function read<T>(k: string, fb: T): T {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fb; } catch { return fb; }
}
function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ }
}

/** Last payment method this member used on this device (cash if none yet). */
export const lastPay = (mid: string): Pay => read<Pay>(kLast(mid), { m: "cash", d: "" });
/** Remember the choice and any custom card/e-pay name so it appears as a chip next time. */
export function rememberPay(mid: string, p: Pay) {
  write(kLast(mid), p);
  if (p.d && !(PAY_PRESETS[p.m] || []).includes(p.d)) {
    const names = read<Record<string, string[]>>(kNames(mid), {});
    const list = [p.d, ...(names[p.m] || []).filter((x) => x !== p.d)].slice(0, 6);
    write(kNames(mid), { ...names, [p.m]: list });
  }
}

export function PayPicker({ mid, value, onChange, history = [] }: { mid: string; value: Pay; onChange: (p: Pay) => void; history?: any[] }) {
  const [custom, setCustom] = useState("");
  const saved = read<Record<string, string[]>>(kNames(mid), {})[value.m] || [];
  const used = history.filter((e) => e.pay_method === value.m && e.pay_detail).map((e) => e.pay_detail);
  const opts = value.m === "cash" ? [] : Array.from(new Set([...saved, ...used, ...(PAY_PRESETS[value.m] || [])])).slice(0, 9);
  return (
    <div className="pay-pick">
      <div className="seg" role="group" aria-label="支付方式">
        {PAY_METHODS.map(([k, n]) => (
          <button key={k} className={value.m === k ? "on" : ""} onClick={() => onChange({ m: k, d: k === value.m ? value.d : "" })}>{n}</button>
        ))}
      </div>
      {value.m !== "cash" && (
        <>
          <div className="chips" role="group" aria-label={value.m === "card" ? "哪一家信用卡" : value.m === "transfer" ? "哪個帳戶" : "哪一種電子支付"}>
            {opts.map((o) => <button key={o} className={`chip ${value.d === o ? "on" : ""}`} onClick={() => onChange({ ...value, d: value.d === o ? "" : o })}>{o}</button>)}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <input className="pay-other" maxLength={20} placeholder={value.m === "epay" ? "其他，例如：icash Pay" : "其他銀行，例如：永豐"} value={custom}
              onChange={(e) => setCustom(e.target.value)} />
            <button className="btn sm" disabled={!custom.trim()} onClick={() => { onChange({ ...value, d: custom.trim() }); setCustom(""); }}>選這個</button>
          </div>
        </>
      )}
    </div>
  );
}

/** Totals by payment method and by card / e-pay name, for this month's list. */
export function PayStats({ list }: { list: any[] }) {
  if (!list.length) return null;
  const by: Record<string, { t: number; d: Record<string, number> }> = {};
  for (const e of list) {
    const m = e.pay_method || "";
    const g = (by[m] ||= { t: 0, d: {} });
    g.t += e.amount;
    if (e.pay_detail) g.d[e.pay_detail] = (g.d[e.pay_detail] || 0) + e.amount;
  }
  const order = ["cash", "card", "epay", "transfer", ""].filter((k) => by[k]);
  if (order.length === 1 && order[0] === "") return null;
  return (
    <div className="pay-stats">
      {order.map((k) => (
        <div key={k} className="ps-row">
          <span className={`tag pay-${k || "none"}`}>{PAY_NAME[k] || "沒填"}</span>
          <b className="num">{fmt(by[k].t)}</b>
          {Object.keys(by[k].d).length > 0 && (
            <span className="note">{Object.entries(by[k].d).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${n} ${fmt(v)}`).join("、")}</span>
          )}
        </div>
      ))}
    </div>
  );
}
