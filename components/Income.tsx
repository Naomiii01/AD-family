"use client";
import { useCallback, useEffect, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import { fmt, num, jarList, jarName, shortDate, INCOME_CATS } from "@/lib/util";

export function useIncomes(memberId: string, mk: string) {
  const [list, setList] = useState<any[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("incomes").select("id,source,category,amount,split,created_at")
      .eq("member_id", memberId).eq("month", mk).eq("voided", false).order("created_at", { ascending: false });
    setList(data || []);
  }, [memberId, mk]);
  useEffect(() => { load(); }, [load]);
  return { list, reload: load };
}

/** Split an income by this month's jar ratio; non-free jars round down, the free jar takes the remainder. */
function byRatio(keys: string[], ratio: Record<string, number>, amount: number) {
  const out: Record<string, number> = {};
  let used = 0;
  for (const k of keys) if (k !== "free") { out[k] = Math.floor((amount * (ratio[k] || 0)) / 100); used += out[k]; }
  out.free = amount - used;
  return out;
}

export function IncomeCard({ app, mo, canAdd, onChange }: { app: App; mo: any; canAdd: boolean; onChange: () => void }) {
  const { sel, mk, toast, data } = app;
  const inc = useIncomes(sel.id, mk);
  const cats = INCOME_CATS[sel.role === "kid" ? "kid" : "adult"];
  const jars = jarList(sel);
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState("");
  const [amt, setAmt] = useState("");
  const [cat, setCat] = useState(cats[0]);
  const [to, setTo] = useState<string>("ratio");
  const [busy, setBusy] = useState(false);
  const amount = Math.max(0, Math.round(+amt || 0));
  const split: Record<string, number> = to === "ratio" ? byRatio(jars.map((j) => j.key), mo.ratio || {}, amount) : { [to]: amount };
  const total = inc.list.reduce((s, x) => s + x.amount, 0);

  async function add() {
    setBusy(true);
    const [, e] = await rpc("add_income", { p_member: sel.id, p_source: src || cat, p_category: cat, p_amount: amount, p_split: split });
    setBusy(false);
    if (e) return toast(e);
    toast("收入記好了，已經放進罐子");
    setSrc(""); setAmt(""); setOpen(false);
    await Promise.all([inc.reload(), data.reload()]);
    onChange();
  }
  async function del(id: string) {
    const [, e] = await rpc("delete_income", { p_id: id });
    if (e) return toast(e);
    toast("已刪除這筆收入");
    await Promise.all([inc.reload(), data.reload()]);
    onChange();
  }

  if (!canAdd && !inc.list.length) return null;
  return (
    <section className="card">
      <div className="card-h"><h3>本月其他收入</h3>{total > 0 && <span className="num muted">共 {fmt(total)}</span>}</div>
      {inc.list.length > 0 && (
        <div className="list">
          {inc.list.map((x) => (
            <div className="li" key={x.id}>
              <span className="d">{shortDate(x.created_at)}</span>
              <span className="t">{x.source} {x.source !== x.category && <span className="tag income">{x.category}</span>}{" "}
                <span className="note">{Object.entries(x.split as Record<string, number>).map(([k, v]) => `${jarName(sel, k)} ${num(v)}`).join("、")}</span>
              </span>
              <b className="num" style={{ color: "var(--long)" }}>+{num(x.amount)}</b>
              {canAdd ? <button className="x" onClick={() => del(x.id)} aria-label={`刪除 ${x.source}`}>×</button> : <span />}
            </div>
          ))}
        </div>
      )}
      {canAdd && !open && (
        <>
          {!inc.list.length && <p className="small muted">{sel.role === "kid" ? "獎學金、比賽獎金、打工、紅包，拿到時記在這裡。" : "兼職、業外、獎金、紅包，月中有進帳就記在這裡。"}</p>}
          <button className="btn" onClick={() => setOpen(true)}>＋ 記一筆收入</button>
        </>
      )}
      {canAdd && open && (
        <div className="income-form">
          <div className="chips" role="group" aria-label="收入類別">
            {cats.map((c) => <button key={c} className={`chip ${cat === c ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}
          </div>
          <div className="grid2">
            <label className="f">來源<input id="i-src" maxLength={40} placeholder={cat === "其他" ? "例如：二手拍賣" : `例如：${cat}`} value={src} onChange={(e) => setSrc(e.target.value)} /></label>
            <label className="f">金額<input id="i-amt" type="number" inputMode="numeric" min={1} placeholder="1000" value={amt} onChange={(e) => setAmt(e.target.value)} /></label>
          </div>
          <div className="small muted">放進哪裡</div>
          <div className="chips" role="group" aria-label="放進哪個罐子">
            <button className={`chip ${to === "ratio" ? "on" : ""}`} onClick={() => setTo("ratio")}>照本月比例分</button>
            {jars.map((j) => <button key={j.key} className={`chip ${to === j.key ? "on" : ""}`} onClick={() => setTo(j.key)}>全部放{j.name}</button>)}
          </div>
          {amount > 0 && (
            <p className="note">
              {Object.entries(split).filter(([, v]) => v > 0).map(([k, v]) => `${jarName(sel, k)} ${fmt(v)}`).join("、")}
              {sel.role === "kid" && split.long > 0 ? `。額外收入放進長期罐不另外配對。` : ""}
            </p>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary" disabled={busy || amount <= 0} onClick={add}>記下這筆收入</button>
            <button className="btn" onClick={() => setOpen(false)}>取消</button>
          </div>
        </div>
      )}
    </section>
  );
}
