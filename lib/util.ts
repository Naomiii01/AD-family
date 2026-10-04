export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
export type Jar = "free" | "dream" | "long";
export const JARS: Jar[] = ["free", "dream", "long"];
export const JN: Record<string, string> = { free: "自由罐", dream: "夢想罐", long: "長期罐", keep: "自由罐" };
export const PAY_METHODS: [string, string][] = [["cash", "現金"], ["card", "信用卡"], ["epay", "電子支付"]];
export const PAY_NAME: Record<string, string> = { cash: "現金", card: "信用卡", epay: "電子支付" };
export const PAY_PRESETS: Record<string, string[]> = {
  card: ["國泰世華", "中國信託", "台新", "玉山", "富邦"],
  epay: ["LINE Pay", "Apple Pay", "街口", "全支付", "悠遊付"],
};
export const payLabel = (e: any) => (e?.pay_method ? e.pay_detail || PAY_NAME[e.pay_method] || "" : "");
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
/** Every jar except free gets floor(total × pct); free takes the remainder (same rule as the database). */
export function split(total: number, r: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let others = 0;
  for (const k of Object.keys(r)) {
    if (k === "free") continue;
    out[k] = Math.floor((total * (r[k] || 0)) / 100);
    others += out[k];
  }
  out.free = total - others;
  if (out.dream === undefined) out.dream = 0;
  if (out.long === undefined) out.long = 0;
  return out;
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

export const CORE_JARS = ["free", "dream", "long"];
export const JAR_PRESETS = [
  { key: "fixed", name: "固定支出", desc: "房租、保險、電話費、學費這類每月固定要付的錢" },
  { key: "reserve", name: "預備金", desc: "生病、修車、家電壞掉這類突發狀況用；建議存到 3–6 個月的生活費" },
];
export type JarDef = { key: string; name: string; core: boolean; target?: number };
/** The member's jars in display order: the three core jars, then any extra jars. */
export function jarList(m: any): JarDef[] {
  return [
    ...CORE_JARS.map((k) => ({ key: k, name: JN[k], core: true })),
    ...((m?.extra_jars || []) as any[]).map((j) => ({ key: j.key, name: j.name, core: false, target: j.target || 0 })),
  ];
}
export function jarName(m: any, key: string) {
  return JN[key] && key !== "keep" ? JN[key] : (m?.extra_jars || []).find((j: any) => j.key === key)?.name || key;
}
/** Jars money can be spent from directly (not dream, not long). */
export const spendable = (m: any) => jarList(m).filter((j) => j.key !== "dream" && j.key !== "long");
