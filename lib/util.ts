export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
export type Jar = "free" | "dream" | "long";
export const JARS: Jar[] = ["free", "dream", "long"];
export const JN: Record<string, string> = { free: "自由罐", dream: "夢想罐", long: "長期罐", keep: "自由罐" };
export const CATS = ["飲料點心", "正餐", "交通", "文具學習", "娛樂", "衣物", "禮物", "其他"];
export const COLORS = ["free", "dream", "long", "sky", "ink"];

export const fmt = (n: number) => "NT$ " + Math.round(n || 0).toLocaleString("zh-TW");
export const num = (n: number) => Math.round(n || 0).toLocaleString("zh-TW");
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function taipeiParts(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value || "";
  return { y: +g("year"), m: +g("month"), d: +g("day") };
}
export function curMonth() {
  const { y, m } = taipeiParts();
  return `${y}-${String(m).padStart(2, "0")}`;
}
export function curYear() {
  return taipeiParts().y;
}
export function shiftMonth(mk: string, n: number) {
  const [y, m] = mk.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function mkLabel(mk: string) {
  const [y, m] = mk.split("-");
  return `${y} 年 ${Number(m)} 月`;
}
export function split(total: number, r: { free: number; dream: number; long: number }) {
  const free = Math.round((total * r.free) / 100);
  const dream = Math.round((total * r.dream) / 100);
  return { free, dream, long: Math.max(0, total - free - dream) };
}
export function defRatio(role: string) {
  return role === "parent" ? { free: 40, dream: 30, long: 30 } : { free: 50, dream: 30, long: 20 };
}
export function shortDate(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric" }).format(d);
}
export function daysSince(iso?: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
export function store(key: string, val?: string) {
  try {
    if (val === undefined) return localStorage.getItem(key) || "";
    localStorage.setItem(key, val);
  } catch {}
  return "";
}

/** Parent matching for a kid's long-term deposit. */
export function matchOf(family: any, role: string, long: number) {
  if (role !== "kid") return 0;
  let m = Math.round((long * (family.match_pct ?? 100)) / 100);
  if (family.match_cap > 0) m = Math.min(m, family.match_cap);
  return m;
}
/** Bonus paid for each full step of dream savings. */
export const stepBonus = (family: any) => Math.round(((family.bonus_step ?? 5000) * (family.bonus_pct ?? 10)) / 100);

/** What the kids call the parent who sets the rules (爸爸, 媽媽, 爸媽, 阿嬤...). */
export const gd = (family: any) => (family?.guardian || "家長");
