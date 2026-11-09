"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { App } from "./Shell";
import { rpc } from "@/lib/supabase";
import { fmt, jarList, jarName, curMonth } from "@/lib/util";
import { parseVoice, type VoiceItem } from "@/lib/voice";
import { CatIcon } from "./Entry";
import { rememberPay } from "./Pay";

const dayBack = (n: number) => new Date(Date.now() - n * 864e5).toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
/** Where an income of this category went last time (shared with the income card). */
const incomeJar = (mid: string, cat: string, keys: string[]) => {
  try { const v = JSON.parse(localStorage.getItem(`adf-inc-to-${mid}`) || "{}")[cat]; return v && keys.includes(v) ? v : "free"; } catch { return "free"; }
};

/** Voice logging: say 「午餐牛肉麵150，飲料60」 and the records appear for a quick check before saving. */
export function VoiceSheet({ app, onClose, onSaved }: { app: App; onClose: () => void; onSaved: () => void }) {
  const { sel, toast, data } = app;
  const isKid = sel.role === "kid";
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drop, setDrop] = useState<Set<number>>(new Set());
  const rec = useRef<any>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const Speech = typeof window !== "undefined" ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
  const items = useMemo(() => parseVoice(text, !isKid), [text, isKid]);
  const keys = jarList(sel).map((j) => j.key);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!Speech) setTimeout(() => taRef.current?.focus(), 150);
    return () => { document.body.style.overflow = prev; try { rec.current?.stop(); } catch { /* already stopped */ } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setDrop(new Set()); }, [text]);

  function listen() {
    if (!Speech) { taRef.current?.focus(); return; }
    if (listening) { rec.current?.stop(); return; }
    const r = new Speech();
    r.lang = "zh-TW"; r.interimResults = true; r.continuous = false;
    const base = text ? text + "，" : "";
    r.onresult = (e: any) => { let s = ""; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; setText(base + s); };
    r.onerror = (e: any) => { setListening(false); if (e.error === "not-allowed") toast("需要允許使用麥克風；也可以點文字框，用鍵盤上的 🎤 說"); };
    r.onend = () => setListening(false);
    rec.current = r;
    try { r.start(); setListening(true); } catch { toast("沒辦法開始收音，請改用鍵盤上的 🎤"); }
  }

  async function saveAll() {
    const keep = items.filter((_, i) => !drop.has(i));
    if (!keep.length) return toast("沒有可以記的項目");
    setBusy(true);
    let ok = 0, sum = 0;
    for (const it of keep) {
      const day = isKid ? dayBack(0) : dayBack(it.daysAgo);
      const past = day < dayBack(0) && day.slice(0, 7) === curMonth();
      let id: string | null = null, err: string | null = null;
      if (it.dir === "out") {
        const [r, e] = await rpc<any>("add_expense_v3", { p_member: sel.id, p_item: it.item, p_amount: it.amount, p_type: "", p_category: it.category, p_jar: "free", p_pay_method: it.payMethod, p_pay_detail: it.payDetail });
        id = r?.id; err = e;
        if (!e && it.payMethod) rememberPay(sel.id, { m: it.payMethod, d: it.payDetail });
      } else {
        const jar = incomeJar(sel.id, it.category, keys);
        const [r, e] = await rpc<any>("add_income", { p_member: sel.id, p_source: it.item, p_category: it.category, p_amount: it.amount, p_split: { [jar]: it.amount } });
        id = r?.id; err = e;
      }
      if (err) { toast(err); break; }
      if (past && id) await rpc("set_record_date", { p_kind: it.dir === "out" ? "expense" : "income", p_id: id, p_day: day });
      ok++; sum += it.dir === "out" ? it.amount : 0;
    }
    setBusy(false);
    if (ok) {
      toast(`記好 ${ok} 筆${sum ? `，花費共 ${fmt(sum)}` : ""}`);
      await data.reload();
      onSaved();
      onClose();
    }
  }

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label="語音記帳">
      <button className="sheet-bg" aria-label="關閉" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-top"><b>語音記帳</b><button className="x" onClick={onClose} aria-label="關閉">×</button></div>
        <div className="sheet-body">
          <button className={`voice-btn ${listening ? "on" : ""}`} onClick={listen} aria-pressed={listening}>
            <span className="mic" aria-hidden="true">🎙</span>
            <span>{listening ? "正在聽…說完會自動停" : Speech ? "按一下開始說" : "點下面的文字框，用鍵盤上的 🎤 說"}</span>
          </button>
          <textarea ref={taRef} className="voice-text" rows={3} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="例如：午餐牛肉麵150，飲料60／昨天計程車兩百五刷卡／收到兼職三千" aria-label="說的內容" />
          {items.length > 0 ? (
            <div className="day-card">
              {items.map((it, i) => (
                <div key={i} className={`voice-row ${drop.has(i) ? "off" : ""}`}>
                  <CatIcon cat={it.category} size={36} />
                  <span className="rec-t">
                    <b>{it.item}</b>
                    <span className="rec-s">{it.category}{it.dir === "in" ? ` · 收入 → ${jarName(sel, incomeJar(sel.id, it.category, keys))}` : " · 自由罐"}{it.payDetail || (it.payMethod === "card" ? " · 刷卡" : it.payMethod === "cash" ? " · 現金" : it.payMethod === "transfer" ? " · 轉帳" : "")}{it.daysAgo && !isKid ? ` · ${it.daysAgo === 1 ? "昨天" : it.daysAgo === 2 ? "前天" : `${it.daysAgo} 天前`}` : ""}</span>
                  </span>
                  <b className={`num rec-a ${it.dir === "in" ? "in" : ""}`}>{it.dir === "in" ? "+" : "−"}{it.amount.toLocaleString("zh-TW")}</b>
                  <button className="x" onClick={() => setDrop((d) => { const n = new Set(d); n.has(i) ? n.delete(i) : n.add(i); return n; })} aria-label={drop.has(i) ? "加回這筆" : "不要這筆"}>{drop.has(i) ? "↺" : "×"}</button>
                </div>
              ))}
            </div>
          ) : text.trim() ? <p className="note">還沒聽到金額，可以說「午餐 150」或「一百五十元」。</p> : (
            <p className="note">一次可以說好幾筆，用「，」或「還有」隔開。說「昨天」「前天」會記在那一天，說「刷卡」「LINE Pay」會帶入付款方式。記完可以在清單裡滑動修改。</p>
          )}
        </div>
        <button className="btn primary big" disabled={busy || !items.some((_, i) => !drop.has(i))} onClick={saveAll}>
          {busy ? "記帳中…" : `記下 ${items.filter((_, i) => !drop.has(i)).length} 筆`}
        </button>
      </div>
    </div>
  );
}

export type { VoiceItem };
