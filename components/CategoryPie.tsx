"use client";
import { useState } from "react";
import { fmt } from "@/lib/util";

// Validated categorical order (light / dark), assigned by rank of spending; the rest folds into a gray 其他.
const SLOTS = ["var(--c-s1)", "var(--c-s2)", "var(--c-s3)", "var(--c-s4)", "var(--c-s5)", "var(--c-s6)"];
const OTHER = "var(--c-other)";

/** Donut of where the month's money went, by category, with a legend that carries every number. */
export function CategoryPie({ list }: { list: { category: string; amount: number }[] }) {
  const [hi, setHi] = useState<number | null>(null);
  const total = list.reduce((s, e) => s + e.amount, 0);
  if (!total) return null;
  const by: Record<string, number> = {};
  list.forEach((e) => (by[e.category || "其他"] = (by[e.category || "其他"] || 0) + e.amount));
  const sorted = Object.entries(by).filter(([c]) => c !== "其他").sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, SLOTS.length);
  const rest = total - top.reduce((s, [, v]) => s + v, 0);
  const parts = [...top.map(([c, v], i) => ({ c, v, color: SLOTS[i] })), ...(rest > 0 ? [{ c: "其他", v: rest, color: OTHER }] : [])];

  const R = 70, r = 44, C = 90, gap = parts.length > 1 ? 0.012 : 0; // gap in turns → a thin surface seam between slices
  let a0 = -0.25;
  const arc = (from: number, to: number) => {
    const p = (t: number, rad: number) => [C + rad * Math.cos(t * 2 * Math.PI), C + rad * Math.sin(t * 2 * Math.PI)];
    const large = to - from > 0.5 ? 1 : 0;
    const [x1, y1] = p(from, R), [x2, y2] = p(to, R), [x3, y3] = p(to, r), [x4, y4] = p(from, r);
    return `M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
  };
  const shown = hi !== null ? parts[hi] : null;

  return (
    <div className="pie-wrap">
      <svg viewBox="0 0 180 180" className="pie" role="img" aria-label={`這個月花費分類：${parts.map((p) => `${p.c} ${Math.round((p.v / total) * 100)}%`).join("、")}`}>
        {parts.map((p, i) => {
          const f = p.v / total;
          const from = a0 + gap / 2, to = a0 + f - gap / 2;
          a0 += f;
          if (parts.length === 1) return <g key={p.c}><circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke={p.color} strokeWidth={R - r} /></g>;
          return (
            <path key={p.c} d={arc(from, Math.max(from + 0.002, to))} fill={p.color}
              opacity={hi === null || hi === i ? 1 : 0.35}
              onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} onClick={() => setHi(hi === i ? null : i)}>
              <title>{`${p.c} ${fmt(p.v)}（${Math.round(f * 100)}%）`}</title>
            </path>
          );
        })}
        <text x={C} y={C - 4} textAnchor="middle" className="pie-k">{shown ? shown.c : "共花"}</text>
        <text x={C} y={C + 16} textAnchor="middle" className="pie-v">{fmt(shown ? shown.v : total)}</text>
      </svg>
      <div className="pie-legend">
        {parts.map((p, i) => (
          <button key={p.c} className={`pl ${hi === i ? "on" : ""}`} onClick={() => setHi(hi === i ? null : i)} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)}>
            <i style={{ background: p.color }} />
            <span>{p.c}</span>
            <b className="num">{fmt(p.v)}</b>
            <span className="muted pct">{Math.round((p.v / total) * 100)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}
