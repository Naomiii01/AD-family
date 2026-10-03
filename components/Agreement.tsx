"use client";
import { useCallback, useEffect, useState } from "react";
import type { App } from "./Shell";
import { supabase, rpc } from "@/lib/supabase";
import { fmt } from "@/lib/util";
import { Confirm } from "./ui";

function template(app: App): string[] {
  const { sel, family } = app;
  return [
    `零用金每月 ${fmt(sel.allowance)}，每月 1 日發放。`,
    `每月 1 日前完成月初規劃；長期罐每月至少 ${fmt(family.long_min)}。`,
    `長期罐放多少，爸媽就配對 ${family.match_pct}%，一起每月定期買股票；18 歲前不提領。`,
    `夢想罐自己存的錢每存滿 ${fmt(family.bonus_step)}，月底結算時爸媽加碼 ${family.bonus_pct}%；花掉後從 0 重新算。`,
    "花了錢當天記帳；每週日晚上檢查一次有沒有漏記。",
    "每月最後一個週末，和爸爸或媽媽一起完成月底檢討。",
    "買超過 NT$ 1,000 的東西前，先和爸媽討論。",
    "連續 3 個月拿到星星，可以提出調高零用金，和爸媽一起討論。",
  ];
}

const fmtDate = (iso: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric" }).format(new Date(iso));

export default function Agreement({ app }: { app: App }) {
  const { sel, me, members, isParent, isSelf, toast } = app;
  const [ag, setAg] = useState<any>(undefined);
  const [edit, setEdit] = useState(false);
  const [items, setItems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("agreements").select("items,kid_signed_at,parent_signed_at,parent_signer,updated_at").eq("member_id", sel.id).maybeSingle();
    setAg(data || null);
    setItems(data?.items?.length ? data.items : template(app));
    setEdit(false);
  }, [sel.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  if (sel.role === "parent")
    return (
      <section className="card">
        <h2>理財約定</h2>
        <p className="small muted">理財約定是給孩子的。請在畫面上方選一位孩子，再回到這裡。</p>
      </section>
    );
  if (ag === undefined) return <div className="splash">載入中…</div>;

  async function save() {
    const clean = items.map((s) => s.trim()).filter(Boolean);
    if (!clean.length) return toast("至少寫一條約定");
    setBusy(true);
    const [, e] = await rpc("save_agreement", { p_member: sel.id, p_items: clean });
    setBusy(false);
    if (e) return toast(e);
    toast("約定已儲存，請雙方重新簽名");
    await load();
  }
  async function sign() {
    setBusy(true);
    const [, e] = await rpc("sign_agreement", { p_member: sel.id });
    setBusy(false);
    if (e) return toast(e);
    toast("已簽名");
    await load();
  }

  const signerName = members.find((m) => m.id === ag?.parent_signer)?.name || "家長";
  const parentLabel = isParent ? me.name : "爸爸或媽媽";

  return (
    <>
      <section className="card">
        <div className="card-h">
          <h2>{sel.name} 的理財約定</h2>
          {ag && !edit && <button className="btn sm ghost" onClick={() => setEdit(true)}>修改</button>}
        </div>
        {!ag && !edit && <p className="small muted">還沒有約定。下面是建議的內容，可以先修改成你們家的規則，儲存後雙方簽名。</p>}
        {edit || !ag ? (
          <>
            {items.map((s, i) => (
              <div className="row" key={i} style={{ flexWrap: "nowrap" }}>
                <b className="muted" style={{ minWidth: 20 }}>{i + 1}.</b>
                <textarea aria-label={`第 ${i + 1} 條`} style={{ minHeight: 68 }} maxLength={120} value={s}
                  onChange={(e) => setItems(items.map((x, j) => (j === i ? e.target.value : x)))} />
                <button className="x" aria-label="刪除這條" onClick={() => setItems(items.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <div className="row">
              {items.length < 20 && <button className="btn sm" onClick={() => setItems([...items, ""])}>＋ 新增一條</button>}
              <button className="btn sm ghost" onClick={() => setItems(template(app))}>恢復建議內容</button>
            </div>
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={save}>儲存約定</button>
              {ag && <button className="btn ghost" onClick={() => { setItems(ag.items); setEdit(false); }}>取消</button>}
            </div>
            {ag && (ag.kid_signed_at || ag.parent_signed_at) && <p className="note">修改後，雙方的簽名會清除，需要重新簽名。</p>}
          </>
        ) : (
          <ol className="steps">{ag.items.map((s: string, i: number) => <li key={i}>{s}</li>)}</ol>
        )}
      </section>

      {ag && !edit && (
        <section className="card">
          <h3>簽名</h3>
          <div className="sign">
            <div className={ag.kid_signed_at ? "done" : ""}>
              <b>{sel.name}</b>
              {ag.kid_signed_at ? <span className="small muted">已簽名 · {fmtDate(ag.kid_signed_at)}</span>
                : isSelf ? <Confirm label="我同意並簽名" confirmLabel="確定簽名" className="btn primary sm" onConfirm={sign} />
                : <span className="small muted">等待 {sel.name} 簽名</span>}
            </div>
            <div className={ag.parent_signed_at ? "done" : ""}>
              <b>{ag.parent_signed_at ? signerName : parentLabel}</b>
              {ag.parent_signed_at ? <span className="small muted">已簽名 · {fmtDate(ag.parent_signed_at)}</span>
                : isParent && !isSelf ? <Confirm label="我同意並簽名" confirmLabel="確定簽名" className="btn primary sm" onConfirm={sign} />
                : <span className="small muted">等待家長簽名</span>}
            </div>
          </div>
          {ag.kid_signed_at && ag.parent_signed_at && <p className="small center">約定生效。想調整時，雙方討論後再修改。</p>}
        </section>
      )}
    </>
  );
}
