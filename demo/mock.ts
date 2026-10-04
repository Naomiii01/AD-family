// 體驗版 data layer: same API surface as lib/supabase.ts, backed by this device's storage.
// Mirrors the database functions in supabase/migrations so the demo behaves like the real app.
import { curMonth, shiftMonth } from "@/lib/util";

export const SUPABASE_URL = "https://example.invalid";
export const QUICK_URL = "（正式版部署後才會有網址）";
export const MEMBER_COLS = "*";
const KEY = "adf-demo-v8";

type Row = Record<string, any>;
type DB = { families: Row[]; members: Row[]; ledger: Row[]; months: Row[]; expenses: Row[]; goals: Row[]; year_plans: Row[]; agreements: Row[]; checkins: Row[]; penalties: Row[]; advances: Row[]; seq: number; uid: string | null };

let db: DB = blank();
const listeners: ((e: string, s: any) => void)[] = [];

function blank(): DB {
  return { families: [], members: [], ledger: [], months: [], expenses: [], goals: [], year_plans: [], agreements: [], checkins: [], penalties: [], advances: [], seq: 1, uid: null };
}
function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return seed();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
}
const id = () => "x" + (db.seq++).toString(36) + Math.random().toString(36).slice(2, 6);
const now = () => new Date().toISOString();
class Fail extends Error {}
const fail = (m: string): never => { throw new Fail(m); };

// ---------- access helpers (same rules as can_access / am_parent) ----------
const meRow = () => db.members.find((m) => m.user_id === db.uid && !m.archived);
const myFam = () => meRow()?.family_id;
const amParent = () => meRow()?.role === "parent";
const mem = (mid: string) => db.members.find((m) => m.id === mid);
function canAccess(mid: string) {
  const m = mem(mid);
  if (!m) return false;
  return m.user_id === db.uid || (m.family_id === myFam() && amParent());
}
const needAccess = (mid: string) => { if (!canAccess(mid)) fail("沒有權限"); };
const needParentOf = (mid: string) => { if (!(amParent() && mem(mid)?.family_id === myFam())) fail("只有家長可以做這件事"); };
const bal = (mid: string, jar: string) => db.ledger.filter((l) => l.member_id === mid && l.jar === jar).reduce((s, l) => s + l.amount, 0);
function log(mid: string, jar: string, amount: number, note: string, month: string, kind: string, at?: string) {
  if (!amount) return;
  db.ledger.push({ id: db.seq++, family_id: mem(mid).family_id, member_id: mid, jar, amount, note: note.slice(0, 60), month, kind, created_at: at || now() });
}
const label = (mk: string) => `${mk.slice(0, 4)} 年 ${+mk.slice(5)} 月零用金`;

// ---------- functions ----------
const F: Record<string, (a: any) => any> = {
  family_roster: () => [],
  balances: ({ p_member }) => {
    needAccess(p_member);
    const ex = db.expenses.filter((e) => e.member_id === p_member && !e.voided).map((e) => e.created_at).sort();
    return { free: bal(p_member, "free"), dream: bal(p_member, "dream"), long: bal(p_member, "long"), dream_own: dreamOwn(p_member),
      dream_tiers: mem(p_member).dream_tiers || 0, last_expense: ex[ex.length - 1] || null,
      extras: Object.fromEntries(extraKeys(p_member).map((k) => [k, bal(p_member, k)])) };
  },
  plan_month_v2: ({ p_member, p_month, p_extra, p_extra_note, p_ratio }) => {
    needAccess(p_member);
    const keys = jarKeys(p_member);
    for (const k of Object.keys(p_ratio || {})) if (!keys.includes(k)) fail("沒有這個罐子：" + k);
    const ratio: Row = {};
    let sum = 0;
    for (const k of keys) { const v = Math.round(p_ratio[k] || 0); if (v < 0 || v > 100) fail("比例要在 0 到 100% 之間"); ratio[k] = v; sum += v; }
    if (sum !== 100) fail("所有罐子的比例加起來要是 100%");
    if (p_month > shiftMonth(curMonth(), 1)) fail("只能規劃本月或下個月");
    if (db.months.some((m) => m.member_id === p_member && m.month === p_month)) fail("這個月已經規劃過了");
    const open = db.months.filter((m) => m.member_id === p_member && m.status === "active" && m.month < p_month).sort((a, b) => (a.month < b.month ? -1 : 1))[0];
    if (open) fail(`${open.month.slice(0, 4)} 年 ${+open.month.slice(5)} 月還沒結算，請先完成上個月的檢討`);
    let inc = mem(p_member).allowance;
    const adv = db.advances.find((x) => x.member_id === p_member && !x.repaid && x.repay_month <= p_month);
    if (adv) { inc = Math.max(0, inc - adv.amount); adv.repaid = true; }
    const total = inc + (p_extra || 0);
    const a: Row = {};
    let others = 0;
    for (const k of keys) if (k !== "free") { a[k] = Math.floor((total * ratio[k]) / 100); others += a[k]; }
    a.free = total - others;
    const me = mem(p_member), fam = famOf(p_member);
    let match = 0;
    if (me.role === "kid") {
      const min = Math.min(fam.long_min, total);
      if (a.long < min) fail(`長期罐每月至少要放 ${min} 元，這樣分配只有 ${a.long} 元`);
      match = Math.round((a.long * fam.match_pct) / 100);
      if (fam.match_cap > 0) match = Math.min(match, fam.match_cap);
    }
    keys.forEach((j) => log(p_member, j, a[j], label(p_month), p_month, "allowance"));
    log(p_member, "long", match, fam.guardian + "配對投資", p_month, "match");
    a.match = match;
    a.advance = adv ? adv.amount : 0;
    db.months.push({ id: db.seq++, family_id: mem(p_member).family_id, member_id: p_member, month: p_month, status: "active", income: inc,
      extra: p_extra || 0, extra_note: (p_extra_note || "").slice(0, 40), ratio, alloc: a,
      free_start: bal(p_member, "free"), review: {}, interest: 0, moved: 0, star: false, created_at: now() });
  },
  set_extra_jars: ({ p_member, p_jars }) => {
    needAccess(p_member);
    if (!amParent()) fail("請家長幫你新增或移除罐子");
    if (!Array.isArray(p_jars) || p_jars.length > 5) fail("最多可以加 5 個罐子");
    const seen = new Set<string>();
    for (const j of p_jars) {
      if (!/^(fixed|reserve|c[1-9])$/.test(j.key || "")) fail("罐子代碼不正確");
      if (!(j.name || "").trim() || j.name.trim().length > 10) fail("罐子名稱要在 10 個字以內");
      if (seen.has(j.key)) fail("罐子重複了");
      seen.add(j.key);
    }
    for (const k of extraKeys(p_member)) if (!seen.has(k) && bal(p_member, k) !== 0) fail(`「${jarNm(p_member, k)}」還有 ${bal(p_member, k)} 元，請先把錢移到其他罐子再移除`);
    mem(p_member).extra_jars = p_jars.map((j: Row) => ({ key: j.key, name: j.name.trim(), target: Math.max(0, Math.round(j.target || 0)) }));
  },
  move_money: ({ p_member, p_from, p_to, p_amount }) => {
    needAccess(p_member);
    const keys = jarKeys(p_member);
    if (!keys.includes(p_from) || !keys.includes(p_to) || p_from === p_to) fail("請選兩個不同的罐子");
    if (p_from === "dream" || p_from === "long") fail("夢想罐和長期罐的錢不能移出");
    if (!(p_amount > 0)) fail("請輸入金額");
    if (p_amount > bal(p_member, p_from)) fail(`「${jarNm(p_member, p_from)}」只有 ${bal(p_member, p_from)} 元`);
    log(p_member, p_from, -p_amount, "移到" + jarNm(p_member, p_to), curMonth(), "move");
    log(p_member, p_to, p_amount, "從" + jarNm(p_member, p_from) + "移入", curMonth(), "move");
  },
  add_expense_v2: (a) => { needAccess(a.p_member); return addExpense(a, "app"); },
  delete_expense: ({ p_id }) => {
    const e = db.expenses.find((x) => x.id === p_id && !x.voided) || fail("找不到這筆花費");
    needAccess(e.member_id);
    if (!db.months.some((m) => m.member_id === e.member_id && m.month === e.month && m.status === "active")) fail("這個月已經結算，不能再修改");
    e.voided = true;
    log(e.member_id, e.jar || "free", e.amount, "刪除：" + e.item, e.month, "refund");
  },
  save_review: ({ p_member, p_month, p_review }) => {
    needAccess(p_member);
    const m = db.months.find((x) => x.member_id === p_member && x.month === p_month && x.status === "active") || fail("這個月不能再修改檢討");
    m.review = { best: (p_review.best || "").slice(0, 300), regret: (p_review.regret || "").slice(0, 300), next: (p_review.next || "").slice(0, 300),
      to: ["keep", "dream", "long"].includes(p_review.to) ? p_review.to : "keep" };
  },
  close_month: ({ p_member, p_month }) => {
    needAccess(p_member);
    const m = db.months.find((x) => x.member_id === p_member && x.month === p_month && x.status === "active") || fail("這個月不能結算");
    const to = m.review?.to || "keep";
    let left = bal(p_member, "free");
    if (left > 0 && (to === "dream" || to === "long")) { log(p_member, "free", -left, "月底轉存", p_month, "move"); log(p_member, to, left, "自由罐結餘轉入", p_month, "move"); } else left = 0;
    const rate = db.families.find((f) => f.id === mem(p_member).family_id).rate;
    const it = Math.round((bal(p_member, "long") * rate) / 100);
    log(p_member, "long", it, `家庭銀行利息 ${rate}%`, p_month, "interest");
    const me = mem(p_member), fam = famOf(p_member);
    let bonus = 0;
    if (me.role === "kid" && fam.bonus_pct > 0) {
      const tiers = Math.floor(dreamOwn(p_member) / fam.bonus_step);
      if (tiers > (me.dream_tiers || 0)) {
        bonus = (tiers - (me.dream_tiers || 0)) * Math.round((fam.bonus_step * fam.bonus_pct) / 100);
        log(p_member, "dream", bonus, `夢想加碼：存滿 ${(tiers * fam.bonus_step).toLocaleString("en-US")} 元`, p_month, "bonus");
        me.dream_tiers = tiers;
      }
    }
    const r = m.review || {};
    const weeksOk = weekProgress(p_member, p_month).ok;
    const star = weeksOk && !!(r.next || "").trim() && (!!(r.best || "").trim() || !!(r.regret || "").trim());
    Object.assign(m, { status: "closed", interest: it, moved: left, star, closed_at: now(), alloc: { ...m.alloc, bonus, weeks_ok: weeksOk } });
    return { star, interest: it, moved: left, bonus, weeks_ok: weeksOk };
  },
  set_goal: ({ p_member, p_name, p_price }) => {
    needAccess(p_member);
    if (!(p_name || "").trim() || p_name.trim().length > 30) fail("夢想名稱要在 30 字以內");
    if (!(p_price > 0)) fail("請輸入正確的價格");
    const g = activeGoal(p_member);
    if (g) { Object.assign(g, { pending_name: p_name.trim(), pending_price: p_price, pending_at: now() }); return "pending"; }
    db.goals.push({ id: id(), family_id: mem(p_member).family_id, member_id: p_member, name: p_name.trim(), price: p_price, status: "active", bonus_given: false, created_at: now() });
    return "set";
  },
  apply_goal_change: ({ p_member }) => {
    needAccess(p_member);
    const g = activeGoal(p_member);
    if (!g?.pending_at) fail("沒有等待中的更換");
    const override = amParent() && meRow().id !== p_member;
    if (Date.now() - new Date(g.pending_at).getTime() < 7 * 864e5 && !override) fail("冷靜期還沒結束");
    Object.assign(g, { name: g.pending_name, price: g.pending_price, bonus_given: false, pending_name: null, pending_price: null, pending_at: null, buy_kid_at: null, buy_parent_at: null, buy_parent_by: null });
  },
  cancel_goal_change: ({ p_member }) => { needAccess(p_member); const g = activeGoal(p_member); if (g) Object.assign(g, { pending_name: null, pending_price: null, pending_at: null }); },
  buy_goal: (args) => F.approve_buy(args),
  approve_buy: ({ p_member }) => {
    needAccess(p_member);
    const g = activeGoal(p_member) || fail("還沒有設定夢想");
    if (bal(p_member, "dream") < g.price) fail("夢想罐還不夠");
    const m = mem(p_member), me = meRow();
    const doBuy = () => {
      log(p_member, "dream", -g.price, "買下：" + g.name, curMonth(), "goal");
      Object.assign(g, { status: "achieved", achieved_at: now(), pending_name: null, pending_price: null, pending_at: null });
      Object.assign(m, { dream_tiers: 0, dream_reset_at: now() });
      return "bought";
    };
    if (m.role === "parent") return doBuy();
    const f = famOf(p_member);
    if (me.id === p_member) g.buy_kid_at = now();
    else {
      if (f.approver && f.approver !== me.id) fail(`這個家的夢想購買要由 ${mem(f.approver).name} 同意`);
      Object.assign(g, { buy_parent_at: now(), buy_parent_by: me.id });
    }
    return g.buy_kid_at && g.buy_parent_at ? doBuy() : "waiting";
  },
  cancel_buy: ({ p_member }) => {
    needAccess(p_member);
    const g = activeGoal(p_member);
    if (g) Object.assign(g, { buy_kid_at: null, buy_parent_at: null, buy_parent_by: null });
  },
  set_approver: ({ p_member }) => {
    if (!amParent()) fail("只有家長可以做這件事");
    if (p_member && mem(p_member)?.role !== "parent") fail("請選一位家長");
    db.families.find((f) => f.id === myFam()).approver = p_member || null;
  },
  week_progress: ({ p_member, p_month }) => { needAccess(p_member); return weekProgress(p_member, p_month); },
  no_spend_today: ({ p_member }) => {
    needAccess(p_member);
    const day = todayTW();
    if (!db.checkins.some((c) => c.member_id === p_member && c.day === day)) db.checkins.push({ family_id: mem(p_member).family_id, member_id: p_member, day, created_at: now() });
  },
  give_penalty: ({ p_member, p_jar, p_amount, p_reason }) => {
    needParentOf(p_member);
    if (!(p_amount > 0)) fail("請輸入正確的金額");
    if (!(p_reason || "").trim()) fail("請寫下扣款原因");
    db.penalties.push({ id: id(), family_id: mem(p_member).family_id, member_id: p_member, jar: p_jar, amount: p_amount, reason: p_reason.trim().slice(0, 40), created_at: now(), refunded_at: null });
    log(p_member, p_jar, -p_amount, "扣款：" + p_reason.trim().slice(0, 40), curMonth(), "penalty");
  },
  refund_penalty: ({ p_id }) => {
    const p = db.penalties.find((x) => x.id === p_id) || fail("找不到這筆扣款");
    needParentOf(p.member_id);
    if (p.refunded_at) fail("這筆已經退還了");
    p.refunded_at = now();
    log(p.member_id, p.jar, p.amount, "退還：" + p.reason, curMonth(), "refund");
  },
  give_advance: ({ p_member, p_amount }) => {
    needParentOf(p_member);
    const m = mem(p_member);
    if (!(p_amount > 0)) fail("請輸入正確的金額");
    if (p_amount > m.allowance) fail(`預支不能超過一個月的零用金（${m.allowance} 元）`);
    const t = todayTW(); const q = `${t.slice(0, 4)}-Q${Math.ceil(+t.slice(5, 7) / 3)}`;
    if (db.advances.some((x) => x.member_id === p_member && x.quarter === q)) fail("這一季已經預支過了");
    if (db.advances.some((x) => x.member_id === p_member && !x.repaid)) fail("上一次預支還沒扣回");
    const nm = shiftMonth(curMonth(), 1);
    db.advances.push({ id: id(), family_id: m.family_id, member_id: p_member, amount: p_amount, quarter: q, repay_month: nm, repaid: false, created_at: now() });
    log(p_member, "free", p_amount, `預支零用金（${+nm.slice(5)} 月扣回）`, curMonth(), "advance");
  },
  set_star_days: ({ p_days }) => {
    if (!amParent()) fail("只有家長可以做這件事");
    if (!(p_days >= 0 && p_days <= 7)) fail("天數要在 0 到 7 之間");
    db.families.find((f) => f.id === myFam()).star_days = p_days;
  },
  set_guardian: ({ p_label }) => {
    if (!amParent()) fail("只有家長可以做這件事");
    if (!(p_label || "").trim() || p_label.trim().length > 10) fail("稱呼要在 10 個字以內");
    db.families.find((f) => f.id === myFam()).guardian = p_label.trim();
  },
  update_family_rules: ({ p_bonus_step, p_bonus_pct, p_long_min, p_match_pct, p_match_cap }) => {
    if (!amParent()) fail("只有家長可以做這件事");
    if (!(p_bonus_step >= 100)) fail("加碼關卡至少 100 元");
    if (!(p_bonus_pct >= 0 && p_bonus_pct <= 50)) fail("加碼比例要在 0 到 50% 之間");
    if (!(p_long_min >= 0)) fail("長期罐最低金額不正確");
    if (!(p_match_pct >= 0 && p_match_pct <= 300)) fail("配對比例要在 0 到 300% 之間");
    Object.assign(db.families.find((f) => f.id === myFam()), { bonus_step: p_bonus_step, bonus_pct: p_bonus_pct, long_min: p_long_min, match_pct: p_match_pct, match_cap: Math.max(0, p_match_cap || 0) });
  },
  give_bonus: ({ p_member }) => {
    needParentOf(p_member);
    const g = activeGoal(p_member);
    if (!g || g.bonus_given) fail("目前沒有可以發放的加碼");
    if (bal(p_member, "dream") * 2 < g.price) fail("夢想還沒存到一半");
    const amt = Math.round((g.price * db.families.find((f) => f.id === g.family_id).bonus_pct) / 100);
    log(p_member, "dream", amt, "爸爸夢想加碼", curMonth(), "bonus");
    g.bonus_given = true;
    return amt;
  },
  give_reward: ({ p_member, p_jar, p_amount, p_note }) => {
    needParentOf(p_member);
    if (!jarKeys(p_member).includes(p_jar)) fail("罐子不正確");
    if (!(p_amount > 0)) fail("請輸入正確的金額");
    log(p_member, p_jar, p_amount, (p_note || "").trim() || "獎勵", curMonth(), "reward");
  },
  update_member: ({ p_id, p_name, p_role, p_allowance }) => {
    needParentOf(p_id);
    const m = mem(p_id);
    if (!(p_name || "").trim()) fail("名字要在 20 字以內");
    if (m.role === "parent" && p_role === "kid") {
      if (m.is_owner) fail("建立家庭的家長不能改成孩子");
      if (db.members.filter((x) => x.family_id === m.family_id && x.role === "parent" && !x.archived).length <= 1) fail("家裡至少要有一位家長");
    }
    Object.assign(m, { name: p_name.trim(), role: p_role, allowance: Math.max(0, p_allowance || 0) });
  },
  remove_member: ({ p_id }) => {
    needParentOf(p_id);
    if (p_id === meRow().id) fail("不能移除自己");
    if (mem(p_id).is_owner) fail("不能移除建立家庭的家長");
    Object.assign(mem(p_id), { archived: true, user_id: null });
  },
  update_family: ({ p_name, p_rate, p_bonus }) => {
    if (!amParent()) fail("只有家長可以做這件事");
    if (!(p_rate >= 0 && p_rate <= 10)) fail("月息要在 0 到 10% 之間");
    if (!(p_bonus >= 0 && p_bonus <= 50)) fail("加碼要在 0 到 50% 之間");
    Object.assign(db.families.find((f) => f.id === myFam()), { name: (p_name || "").trim() || "我們家", rate: p_rate, bonus_pct: p_bonus });
  },
  set_member_pin: ({ p_member, p_pin }) => {
    needAccess(p_member);
    if (!/^\d{4,8}$/.test(p_pin)) fail("密碼要是 4 到 8 位數字");
    if (mem(p_member).role === "parent" && p_pin.length < 6) fail("家長的密碼至少 6 位數字");
  },
  set_theme: ({ p_member, p_theme }) => { needAccess(p_member); mem(p_member).theme = p_theme; },
  save_year_plan: ({ p_member, p_year, p_data }) => {
    needAccess(p_member);
    const y = db.year_plans.find((x) => x.member_id === p_member && x.year === p_year);
    if (y) Object.assign(y, { data: p_data, updated_at: now() });
    else db.year_plans.push({ id: db.seq++, family_id: mem(p_member).family_id, member_id: p_member, year: p_year, data: p_data, updated_at: now() });
  },
  save_agreement: ({ p_member, p_items }) => {
    needAccess(p_member);
    const a = db.agreements.find((x) => x.member_id === p_member);
    if (a) Object.assign(a, { items: p_items, kid_signed_at: null, parent_signed_at: null, parent_signer: null, updated_at: now() });
    else db.agreements.push({ id: db.seq++, family_id: mem(p_member).family_id, member_id: p_member, items: p_items, kid_signed_at: null, parent_signed_at: null, parent_signer: null, updated_at: now() });
  },
  sign_agreement: ({ p_member }) => {
    needAccess(p_member);
    const a = db.agreements.find((x) => x.member_id === p_member) || fail("還沒有約定內容");
    if (meRow().id === p_member) a.kid_signed_at = now();
    else Object.assign(a, { parent_signed_at: now(), parent_signer: meRow().id });
  },
  year_stats: ({ p_member, p_year }) => {
    needAccess(p_member);
    const y = `${p_year}-`;
    const L = db.ledger.filter((l) => l.member_id === p_member && l.month.startsWith(y));
    const E = db.expenses.filter((e) => e.member_id === p_member && !e.voided && e.month.startsWith(y));
    const sum = (a: Row[]) => a.reduce((s, x) => s + x.amount, 0);
    const cats: Row = {};
    E.forEach((e) => (cats[e.category] = (cats[e.category] || 0) + e.amount));
    return { long_net: sum(L.filter((l) => l.jar === "long")), dream_net: sum(L.filter((l) => l.jar === "dream")), interest: sum(L.filter((l) => l.kind === "interest")),
      spent: sum(E), need: sum(E.filter((e) => e.type === "need")), want: sum(E.filter((e) => e.type === "want")), cats };
  },
  rotate_quick_token: () => fail("體驗版不能設定 Apple 捷徑。正式版部署到 Vercel 後就能用。"),
};
const todayTW = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function weekProgress(mid: string, mk: string) {
  const need = famOf(mid).star_days ?? 4;
  const days = new Set<string>([
    ...db.expenses.filter((e) => e.member_id === mid && !e.voided).map((e) => e.spent_on),
    ...db.checkins.filter((c) => c.member_id === mid).map((c) => c.day),
  ]);
  const mStart = mk + "-01", mEnd = addDays(shiftMonth(mk, 1) + "-01", -1), today = todayTW();
  const dow = (new Date(mStart + "T00:00:00Z").getUTCDay() + 6) % 7;
  let w = addDays(mStart, -dow), ok = true;
  const weeks: Row[] = [];
  while (w <= mEnd) {
    const st = w < mStart ? mStart : w, en = addDays(w, 6) > mEnd ? mEnd : addDays(w, 6);
    const len = Math.round((new Date(en).getTime() - new Date(st).getTime()) / 864e5) + 1;
    let n = 0; for (let d = st; d <= en; d = addDays(d, 1)) if (days.has(d)) n++;
    const wneed = len >= 4 ? Math.ceil((need * len) / 7) : 0;
    weeks.push({ start: st, end: en, days: n, need: wneed, counted: len >= 4, done: n >= wneed, future: st > today });
    if (n < wneed) ok = false;
    w = addDays(w, 7);
  }
  return { ok, need, weeks, today_logged: days.has(today) };
}
const famOf = (mid: string) => db.families.find((f) => f.id === mem(mid).family_id);
function dreamOwn(mid: string) {
  const reset = mem(mid).dream_reset_at || "2000-01-01";
  return db.ledger.filter((l) => l.member_id === mid && l.jar === "dream" && l.amount > 0 && l.kind !== "bonus" && l.created_at > reset).reduce((s, l) => s + l.amount, 0);
}
function activeGoal(mid: string) {
  return db.goals.find((g) => g.member_id === mid && g.status === "active");
}
const extraKeys = (mid: string): string[] => (mem(mid).extra_jars || []).map((j: Row) => j.key);
const jarKeys = (mid: string) => ["free", "dream", "long", ...extraKeys(mid)];
const jarNm = (mid: string, k: string) => ({ free: "自由罐", dream: "夢想罐", long: "長期罐" } as Row)[k] || (mem(mid).extra_jars || []).find((j: Row) => j.key === k)?.name || k;
function addExpense({ p_member, p_item, p_amount, p_type, p_category, p_jar }: any, source: string, at?: string, month?: string) {
  const mk = month || curMonth();
  const jar = p_jar || "free";
  if (!(p_amount > 0)) fail("請輸入金額");
  if (!(p_item || "").trim()) fail("請寫下買了什麼");
  if (jar === "dream") fail("夢想罐的錢要用「買下夢想」來花");
  if (jar === "long") fail("長期罐的錢只進不出");
  if (!jarKeys(p_member).includes(jar)) fail("沒有這個罐子");
  const m = db.months.find((x) => x.member_id === p_member && x.month === mk);
  if (!m) fail("這個月還沒做月初規劃，先到「本月」把零用金放進罐子");
  if (m.status === "closed") fail("這個月已經結算了");
  const free = bal(p_member, jar);
  if (p_amount > free) fail(`${jarNm(p_member, jar)}只剩 ${free} 元，這筆錢不夠付`);
  const row = { id: id(), family_id: mem(p_member).family_id, member_id: p_member, month: mk, item: p_item.trim().slice(0, 40), amount: p_amount, type: p_type,
    category: p_category || "其他", source, jar, voided: false, spent_on: at ? at.slice(0, 10) : todayTW(), created_at: at || now() };
  db.expenses.push(row);
  log(p_member, jar, -p_amount, row.item, mk, "expense", at);
  return { id: row.id, left: free - p_amount, jar };
}

// ---------- table reads with the same visibility rules as RLS ----------
function visible(table: string, r: Row) {
  if (!db.uid) return false;
  if (table === "families") return r.id === myFam();
  if (table === "members") return r.user_id === db.uid || (r.family_id === myFam() && amParent());
  return canAccess(r.member_id);
}
class Query {
  private f: ((r: Row) => boolean)[] = [];
  private o: [string, boolean][] = [];
  private n = 0;
  private mode: "" | "single" | "maybe" = "";
  constructor(private t: string) {}
  select() { return this; }
  eq(k: string, v: any) { this.f.push((r) => r[k] === v); return this; }
  gte(k: string, v: any) { this.f.push((r) => r[k] >= v); return this; }
  order(k: string, opt?: { ascending?: boolean }) { this.o.push([k, opt?.ascending !== false]); return this; }
  limit(n: number) { this.n = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  then(res: (v: any) => any, rej?: (e: any) => any) {
    let rows = ((db as any)[this.t] as Row[]).filter((r) => visible(this.t, r) && this.f.every((fn) => fn(r)));
    for (const [k, asc] of [...this.o].reverse()) rows = [...rows].sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1));
    if (this.n) rows = rows.slice(0, this.n);
    rows = JSON.parse(JSON.stringify(rows));
    const out = this.mode ? { data: rows[0] ?? null, error: this.mode === "single" && !rows[0] ? { message: "not found" } : null } : { data: rows, error: null };
    return Promise.resolve(out).then(res, rej);
  }
}

const wait = () => new Promise((r) => setTimeout(r, 120));

export const supabase = {
  from: (t: string) => new Query(t),
  rpc: async (name: string, args: any) => {
    await wait();
    const snap = JSON.stringify(db);
    try {
      const data = F[name] ? F[name](args || {}) : fail("體驗版不支援這個功能");
      save();
      return { data: data === undefined ? null : JSON.parse(JSON.stringify(data)), error: null };
    } catch (e: any) {
      db = JSON.parse(snap); // discard partial changes, like a rolled-back transaction
      return { data: null, error: { message: e instanceof Fail ? e.message : "發生錯誤" } };
    }
  },
  auth: {
    getSession: async () => ({ data: { session: db.uid ? { user: { id: db.uid } } : null } }),
    onAuthStateChange: (cb: (e: string, s: any) => void) => {
      listeners.push(cb);
      return { data: { subscription: { unsubscribe: () => listeners.splice(listeners.indexOf(cb), 1) } } };
    },
    signOut: async () => { db.uid = null; save(); listeners.forEach((l) => l("SIGNED_OUT", null)); return { error: null }; },
  },
  functions: {
    invoke: async (name: string, { body }: any) => {
      await wait();
      if (name !== "members") return { data: { ok: false, error: "體驗版不支援" }, error: null };
      try {
        if (!amParent()) fail("只有家長可以新增成員");
        if (!(body.name || "").trim()) fail("名字要在 20 字以內");
        if (!/^\d{4,8}$/.test(body.pin) || (body.role === "parent" && body.pin.length < 6)) fail(body.role === "parent" ? "家長的密碼至少 6 位數字" : "密碼要是 4 到 8 位數字");
        const mid = id();
        db.members.push({ id: mid, family_id: myFam(), user_id: "u-" + mid, name: body.name.trim(), role: body.role, allowance: Math.max(0, body.allowance || 0),
          color: "sky", is_owner: false, archived: false, theme: body.role === "kid" ? "morandi" : "earth", created_at: now() });
        save();
        return { data: { ok: true, member_id: mid }, error: null };
      } catch (e: any) {
        return { data: { ok: false, error: e.message }, error: null };
      }
    },
  },
};

export async function rpc<T = any>(name: string, args: Record<string, unknown> = {}): Promise<[T | null, string | null]> {
  const { data, error } = await supabase.rpc(name, args);
  return error ? [null, error.message] : [data as T, null];
}
export async function fn<T = any>(name: string, body: Record<string, unknown>): Promise<[T | null, string | null]> {
  const { data } = await supabase.functions.invoke(name, { body });
  return data?.ok === false ? [null, data.error] : [data as T, null];
}

// ---------- demo-only helpers ----------
export function demoMembers() {
  return db.members.filter((m) => !m.archived);
}
export function demoLogin(memberId: string) {
  db.uid = mem(memberId).user_id;
  save();
  listeners.forEach((l) => l("SIGNED_IN", { user: { id: db.uid } }));
}
export function demoReset() {
  db = seed();
  save();
  listeners.forEach((l) => l("SIGNED_OUT", null));
}

function seed(): DB {
  db = blank();
  const fam = { id: "f1", name: "我們家", code: "DEMO26", rate: 0, bonus_pct: 10, bonus_step: 5000, long_min: 500, match_pct: 100, match_cap: 0, guardian: "爸爸", star_days: 4, approver: "m2", created_at: now() };
  db.families.push(fam);
  const adultJars = [{ key: "fixed", name: "固定支出", target: 0 }, { key: "reserve", name: "預備金", target: 200000 }];
  const add = (mid: string, name: string, role: string, allowance: number, theme: string, owner = false) =>
    db.members.push({ id: mid, family_id: "f1", user_id: "u-" + mid, name, role, allowance, color: "sky", is_owner: owner, archived: false, theme,
      extra_jars: role === "parent" ? adultJars.map((j) => ({ ...j })) : [], created_at: now() });
  add("m1", "Naomi", "parent", 40000, "morandi", true);
  add("m2", "Ad", "parent", 45000, "earth");
  add("m3", "Jalen", "kid", 4500, "court");
  add("m4", "Rebecca", "kid", 4000, "kpop");
  const prev = shiftMonth(curMonth(), -1), cur = curMonth();
  const as = (mid: string) => (db.uid = mem(mid).user_id);
  const d = (mk: string, day: number) => `${mk}-${String(day).padStart(2, "0")}T04:00:00.000Z`;
  const startOf = d(prev, 1);
  const seedJar = (mid: string, dream: number, long: number, reserve = 0) => {
    log(mid, "dream", dream, "之前存的", prev, "reward", startOf); log(mid, "long", long, "之前存的", prev, "reward", startOf);
    log(mid, "reserve", reserve, "之前存的", prev, "reward", startOf);
  };
  seedJar("m1", 18000, 120000, 60000); seedJar("m2", 6000, 150000, 80000); seedJar("m3", 2500, 6000); seedJar("m4", 1500, 4000);
  const goal = (mid: string, name: string, price: number) => db.goals.push({ id: id(), family_id: "f1", member_id: mid, name, price, status: "active", bonus_given: false, created_at: startOf });
  goal("m1", "全家沖繩旅行", 60000); goal("m2", "登山背包", 6800); goal("m3", "暑假籃球營＋新球鞋", 8800); goal("m4", "演唱會門票", 3800);

  const checkin = (mid: string, mk: string, upto: number, skip: (day: number) => boolean) => {
    for (let dd = 1; dd <= upto; dd++) if (!skip(dd)) db.checkins.push({ family_id: "f1", member_id: mid, day: `${mk}-${String(dd).padStart(2, "0")}`, created_at: now() });
  };
  const lastDay = +addDays(shiftMonth(prev, 1) + "-01", -1).slice(8);
  checkin("m3", prev, lastDay, (dd) => dd % 3 === 0);
  checkin("m4", prev, lastDay, (dd) => dd % 3 === 0 || (dd >= 8 && dd <= 14));
  const month = (mid: string, mk: string, r: number[], exps: [string, number, string, string, number, string?][], review?: Row) => {
    as(mid);
    const ratio: Row = { free: r[0], dream: r[1], long: r[2] };
    if (r.length > 3) { ratio.fixed = r[3]; ratio.reserve = r[4]; }
    F.plan_month_v2({ p_member: mid, p_month: mk, p_extra: 0, p_extra_note: "", p_ratio: ratio });
    const m = db.months.find((x) => x.member_id === mid && x.month === mk);
    m.created_at = d(mk, 1);
    db.ledger.filter((l) => l.member_id === mid && l.month === mk).forEach((l) => (l.created_at = d(mk, 1)));
    exps.forEach(([item, amt, type, cat, day, jar]) => addExpense({ p_member: mid, p_item: item, p_amount: amt, p_type: type, p_category: cat, p_jar: jar }, "app", d(mk, day), mk));
    if (review) {
      F.save_review({ p_member: mid, p_month: mk, p_review: review });
      F.close_month({ p_member: mid, p_month: mk });
      db.ledger.filter((l) => l.member_id === mid && l.month === mk && ["move", "interest", "bonus"].includes(l.kind)).forEach((l) => (l.created_at = d(mk, 28)));
    }
  };
  month("m3", prev, [60, 25, 15], [["珍珠奶茶", 65, "want", "飲料點心", 3], ["籃球場租借", 100, "want", "娛樂", 8], ["遊戲點數", 150, "want", "娛樂", 12], ["補習班講義", 120, "need", "文具學習", 18]],
    { best: "和同學一起租球場打球", regret: "遊戲點數一下就用完了", next: "遊戲點數一個月最多 100 元", to: "dream" });
  month("m4", prev, [60, 25, 15], [["偶像小卡", 180, "want", "娛樂", 5], ["文具", 90, "need", "文具學習", 10], ["手搖飲", 55, "want", "飲料點心", 20]],
    { best: "文具用得到", regret: "小卡買太多張", next: "小卡先列清單再買", to: "dream" });
  month("m1", prev, [20, 10, 20, 40, 10], [["房租", 12000, "need", "其他", 5, "fixed"], ["保險", 3500, "need", "其他", 10, "fixed"], ["咖啡", 450, "want", "飲料點心", 9], ["書", 380, "need", "文具學習", 15]],
    { best: "買了一本好書", regret: "", next: "和孩子一起做月底檢討", to: "long" });
  month("m2", prev, [20, 10, 20, 40, 10], [["房貸", 15000, "need", "其他", 5, "fixed"], ["登山步道交通", 300, "need", "交通", 14]], { best: "週末帶孩子去爬山", regret: "", next: "記得每週記帳", to: "long" });
  const today = +new Date().toLocaleString("en-CA", { timeZone: "Asia/Taipei", day: "2-digit" });
  checkin("m3", cur, Math.max(0, today - 1), () => false);
  month("m3", cur, [60, 25, 15], [["雞排", 85, "want", "正餐", 1], ["公車", 30, "need", "交通", Math.max(1, Math.min(today, 2))]]);
  month("m1", cur, [20, 10, 20, 40, 10], [["房租", 12000, "need", "其他", 1, "fixed"]]);

  as("m3");
  const items = (amt: string) => [
    `每月零用金 NT$ ${amt}，每月 1 日約定轉帳（若遇銀行休假，延到下一個工作日）。`,
    "每月最後一天和爸爸一起做結算和檢討，並設定下個月的罐子分配（長期罐每月最少 NT$ 500，爸爸配對同樣金額）。",
    "要買高於 NT$ 1,000 的東西，需要先和爸爸討論。",
    "夢想罐存滿後，要由自己和爸爸一起同意才能買下夢想。",
    "每人每季可以預支一次，預支後的下一個月從零用金扣除。",
    "花了錢當天記帳，每週檢視有沒有遺漏；每週至少記帳 4 天。",
    "大考成績和爸爸討論：高於＿＿分，加碼＿＿元；低於＿＿分，扣＿＿元。",
    "在學校要有學生的樣子：老師記警告扣＿＿元、記小過扣＿＿元（老師撤銷後退還）。"];
  F.save_agreement({ p_member: "m3", p_items: items("4,500") });
  as("m4");
  F.save_agreement({ p_member: "m4", p_items: items("4,000") });
  as("m3");
  F.save_year_plan({ p_member: "m3", p_year: +cur.slice(0, 4), p_data: { target_long: 15000, wishes: "新籃球鞋\n暑假籃球營", incomes: [{ name: "過年紅包", month: 2, amount: 6000 }], spends: [{ name: "暑假籃球營", month: 7, amount: 3500 }], reflection: "" } });
  db.uid = null;
  return db;
}

db = load();
