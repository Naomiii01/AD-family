"use client";
import React, { useState } from "react";
import { clamp, mkLabel, shiftMonth, curMonth } from "@/lib/util";

export function JarSVG({ kind, pct }: { kind: string; pct: number }) {
  const p = clamp(pct || 0, 0, 1);
  const body = "M20 24 h40 v5 c9 4 13 11 13 21 v37 c0 7-4 11-11 11 h-44 c-7 0-11-4-11-11 v-37 c0-10 4-17 13-21z";
  const y = 98 - 69 * p;
  const id = `cp-${kind}`;
  return (
    <svg className="jar" viewBox="0 0 80 102" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d={body} />
        </clipPath>
      </defs>
      <path d={body} fill={`color-mix(in srgb, var(--${kind}) 10%, var(--surface))`} />
      <rect className="fill" x="0" y={y} width="80" height="110" fill={`var(--${kind})`} clipPath={`url(#${id})`} />
      <path d={body} fill="none" stroke="var(--ink)" strokeOpacity=".28" strokeWidth="2" />
      <path d="M24 40 v40" stroke="#fff" strokeOpacity=".35" strokeWidth="4" strokeLinecap="round" />
      <rect x="15" y="12" width="50" height="12" rx="4" fill={`var(--${kind})`} stroke="var(--ink)" strokeOpacity=".28" strokeWidth="2" />
    </svg>
  );
}

export function Avatar({ m, lg }: { m: { name: string; color: string }; lg?: boolean }) {
  return <span className={`av av-${m.color || "ink"} ${lg ? "lg" : ""}`}>{(m.name || "?").slice(0, 1)}</span>;
}

export function Stars({ months }: { months: any[] }) {
  const closed = months.filter((x) => x.status === "closed").sort((a, b) => (a.month < b.month ? -1 : 1));
  if (!closed.length) return <div className="streak">完成第一次月底檢討就會拿到星星</div>;
  let streak = 0;
  for (let i = closed.length - 1; i >= 0 && closed[i].star; i--) streak++;
  return (
    <div className="streak">
      <span>
        {closed.slice(-6).map((x) => (
          <span key={x.month} className={`star ${x.star ? "" : "off"}`} title={mkLabel(x.month)}>
            ★
          </span>
        ))}
      </span>
      <span>{streak ? `連續 ${streak} 個月完成檢討` : "這個月記得完成檢討"}</span>
    </div>
  );
}

export function MonthNav({ mk, setMk }: { mk: string; setMk: (m: string) => void }) {
  const max = shiftMonth(curMonth(), 1);
  return (
    <div className="mnav">
      <button className="btn sm ghost" onClick={() => setMk(shiftMonth(mk, -1))} aria-label="上個月">
        ‹ 上月
      </button>
      <span className="lbl">{mkLabel(mk)}</span>
      <button className="btn sm ghost" disabled={mk >= max} onClick={() => setMk(shiftMonth(mk, 1))} aria-label="下個月">
        下月 ›
      </button>
    </div>
  );
}

export function Confirm({
  label, confirmLabel, onConfirm, className = "btn", danger, disabled,
}: { label: string; confirmLabel: string; onConfirm: () => void; className?: string; danger?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useStateSafe(false);
  if (!open)
    return (
      <button className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  return (
    <div className="row">
      <button className={`btn ${danger ? "danger" : "primary"}`} onClick={() => { setOpen(false); onConfirm(); }}>
        {confirmLabel}
      </button>
      <button className="btn ghost" onClick={() => setOpen(false)}>取消</button>
    </div>
  );
}

function useStateSafe<T>(v: T) {
  return useState<T>(v);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export const ICONS: Record<string, React.ReactElement> = {
  jars: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><rect x="7" y="3" width="10" height="3" rx="1" /><path d="M8 6h8v1.5c2 1 3 2.5 3 5V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6.5c0-2.5 1-4 3-5z" /><path d="M5 14h14" /></svg>
  ),
  month: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h3M8 17h6" /></svg>
  ),
  review: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" /></svg>
  ),
  year: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
  ),
};
