"use client";
import { useState } from "react";
import type { App } from "./Shell";
import { rpc } from "@/lib/supabase";
import { JAR_PRESETS, jarList, gd, fmt } from "@/lib/util";

type Extra = { key: string; name: string; target?: number };

export default function JarManager({ app }: { app: App }) {
  const { sel, isParent, isSelf, toast, reloadBase, data, family } = app;
  const [extras, setExtras] = useState<Extra[]>(() => (sel.extra_jars || []).map((j: any) => ({ ...j })));
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const has = (k: string) => extras.some((j) => j.key === k);
  const dirty = JSON.stringify(extras) !== JSON.stringify(sel.extra_jars || []);
  const who = isSelf ? "你" : sel.name;

  function toggle(p: { key: string; name: string }) {
    setExtras((x) => (x.some((j) => j.key === p.key) ? x.filter((j) => j.key !== p.key) : [...x, { key: p.key, name: p.name, target: 0 }]));
  }
  function addCustom() {
    const name = newName.trim();
    if (!name) return;
    const used = new Set(extras.map((j) => j.key));
    let i = 1;
    while (used.has(`c${i}`)) i++;
    if (i > 9 || extras.length >= 5) return toast("最多可以加 5 個罐子");
    setExtras([...extras, { key: `c${i}`, name, target: 0 }]);
    setNewName("");
  }
  async function save() {
    setBusy(true);
    const [, e] = await rpc("set_extra_jars", { p_member: sel.id, p_jars: extras });
    setBusy(false);
    if (e) return toast(e);
    toast("罐子已更新");
    await reloadBase();
    await data.reload();
  }

  return (
    <>
      <section className="card">
        <h2>管理罐子{isSelf ? "" : `（${sel.name}）`}</h2>
        <p className="small muted">每個人都有三個基本罐子。大人可以再加上固定支出、預備金，或自己命名的罐子；加上後，月初規劃就會多出這些罐子可以分配。</p>
        <div className="alloc">
          {jarList({}).map((j) => (
            <div className="jm-row" key={j.key}>
              <span className="dot" style={{ background: `var(--${j.key})` }} />
              <b>{j.name}</b>
              <span className="note">基本罐子</span>
            </div>
          ))}
        </div>
      </section>

      {!isParent ? (
        <section className="card">
          <p className="small">想多一個罐子嗎？請{gd(family)}幫你新增。</p>
        </section>
      ) : (
        <>
          <section className="card">
            <h3>常用的罐子</h3>
            {JAR_PRESETS.map((p) => {
              const on = has(p.key);
              const ex = extras.find((j) => j.key === p.key);
              return (
                <div key={p.key} className="sug">
                  <div className="card-h">
                    <span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: `var(--${p.key})` }} /><b>{p.name}</b></span>
                    <button className={`btn sm ${on ? "" : "primary"}`} onClick={() => toggle(p)} aria-pressed={on}>{on ? "移除" : "加上"}</button>
                  </div>
                  <p className="small muted">{p.desc}</p>
                  {on && p.key === "reserve" && (
                    <label className="f">存到多少就夠了（可不填）
                      <input id="jm-target" type="number" inputMode="numeric" min={0} placeholder={`例如 ${fmt(sel.allowance * 6)}`} value={ex?.target || ""}
                        onChange={(e) => setExtras((x) => x.map((j) => (j.key === "reserve" ? { ...j, target: Math.max(0, Math.round(+e.target.value) || 0) } : j)))} />
                    </label>
                  )}
                </div>
              );
            })}
          </section>

          <section className="card">
            <h3>自己命名的罐子</h3>
            {extras.filter((j) => j.key.startsWith("c")).map((j) => (
              <div className="row" key={j.key} style={{ flexWrap: "nowrap" }}>
                <span className="dot" style={{ background: `var(--${j.key})` }} />
                <input aria-label="罐子名稱" maxLength={10} value={j.name} onChange={(e) => setExtras((x) => x.map((y) => (y.key === j.key ? { ...y, name: e.target.value } : y)))} />
                <button className="x" aria-label={`移除${j.name}`} onClick={() => setExtras((x) => x.filter((y) => y.key !== j.key))}>×</button>
              </div>
            ))}
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input id="jm-new" maxLength={10} placeholder="例如：旅遊、孝親、進修" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} />
              <button className="btn" style={{ flex: "none" }} disabled={!newName.trim()} onClick={addCustom}>新增</button>
            </div>
            <p className="note">最多加 5 個罐子。要移除的罐子裡如果還有錢，請先用罐子頁的「移動罐子裡的錢」移走。</p>
          </section>

          <button className="btn primary big" disabled={busy || !dirty} onClick={save}>{dirty ? `儲存${who}的罐子` : "已儲存"}</button>
        </>
      )}
    </>
  );
}
