"use client";
import { useCallback, useEffect, useState } from "react";
import type { App } from "./Shell";
import { rpc } from "@/lib/supabase";

export type WeekInfo = { ok: boolean; need: number; today_logged: boolean; weeks: { start: string; end: string; days: number; need: number; counted: boolean; done: boolean; future: boolean }[] };

export function useWeeks(memberId: string, mk: string) {
  const [w, setW] = useState<WeekInfo | null>(null);
  const load = useCallback(async () => {
    const [d] = await rpc<WeekInfo>("week_progress", { p_member: memberId, p_month: mk });
    setW(d);
  }, [memberId, mk]);
  useEffect(() => { load(); }, [load]);
  return { w, reload: load };
}

const md = (iso: string) => `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}`;

/** One row per week of the month with logged days against what that week needs. */
export function WeekList({ w, compact }: { w: WeekInfo; compact?: boolean }) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const rows = compact ? w.weeks.filter((x) => x.start <= today && x.end >= today) : w.weeks;
  return (
    <div className="list">
      {rows.map((x) => {
        const isNow = x.start <= today && x.end >= today;
        const state = !x.counted ? "不計算" : x.done ? "達成" : x.future ? "還沒開始" : isNow ? "進行中" : "沒達成";
        return (
          <div key={x.start} className="kv small" style={{ padding: "6px 0", fontWeight: isNow ? 700 : 400 }}>
            <span>{md(x.start)}–{md(x.end)}{isNow ? "（本週）" : ""}</span>
            <span className="row" style={{ gap: 6 }}>
              {x.counted && (
                <span aria-hidden="true" style={{ letterSpacing: 2 }}>
                  {Array.from({ length: x.need }, (_, i) => <span key={i} style={{ color: i < x.days ? "var(--accent)" : "var(--line)" }}>●</span>)}
                </span>
              )}
              <b className="num" style={{ color: x.counted && !x.done && !x.future && !isNow ? "var(--warn)" : undefined }}>
                {x.counted ? `${x.days} 天（需 ${x.need}）` : ""} {state}
              </b>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function WeekCard({ app, mk }: { app: App; mk: string }) {
  const { sel, toast, isSelf, family } = app;
  const { w, reload } = useWeeks(sel.id, mk);
  const [busy, setBusy] = useState(false);
  if (!w || family.star_days === 0) return null;
  async function checkin() {
    setBusy(true);
    const [, e] = await rpc("no_spend_today", { p_member: sel.id });
    setBusy(false);
    if (e) return toast(e);
    toast("打卡完成，今天算一天");
    reload();
  }
  return (
    <section className="card">
      <div className="card-h"><h3>每週記帳</h3><span className="small muted">每週至少 {w.need} 天</span></div>
      <WeekList w={w} compact />
      {w.today_logged ? (
        <p className="small muted">今天已經記過了 ✓</p>
      ) : (
        <div className="row">
          <button className="btn sm" disabled={busy} onClick={checkin}>{isSelf ? "今天沒有花錢，打卡" : `幫 ${sel.name} 打卡：今天沒花錢`}</button>
        </div>
      )}
      <p className="note">有記一筆花費、或按「今天沒有花錢」，那天就算記帳。月初、月底不滿一週的會依天數減少；每一週都達成，月底才拿得到星星。</p>
    </section>
  );
}
