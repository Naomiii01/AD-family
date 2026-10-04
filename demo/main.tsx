import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase, demoMembers, demoLogin, demoReset, demoExport, demoImport } from "@/lib/supabase";
import Shell from "@/components/Shell";
import { Avatar, JarSVG, Confirm, copyText } from "@/components/ui";
import { SKINS, skinOf } from "@/lib/themes";

function Picker() {
  const [list, setList] = useState(demoMembers());
  return (
    <main className="login">
      <div className="hero-j" aria-hidden="true">
        <JarSVG kind="free" pct={0.55} />
        <JarSVG kind="dream" pct={0.35} />
        <JarSVG kind="long" pct={0.75} />
      </div>
      <div className="center" style={{ display: "grid", gap: 6 }}>
        <h1 className="logo" style={{ fontSize: "1.8rem" }}><b>My</b><i>零用</i><u>錢</u></h1>
        <p className="muted small">選你的名字進去</p>
      </div>
      <section className="card">
        <div className="pick">
          {list.map((m) => (
            <button key={m.id} onClick={() => demoLogin(m.id)}>
              <Avatar m={m} lg />
              <span><b>{m.name}</b></span>
              <span className="note">{m.role === "parent" ? "家長" : "孩子"} · {SKINS[skinOf(m)].name}</span>
            </button>
          ))}
        </div>
        <p className="small muted">孩子只看得到自己的罐子；家長看得到全家。這個版本不用密碼，正式版每個人會用家庭代碼和自己的密碼登入。</p>
      </section>
      <Backup onChange={() => setList(demoMembers())} />
    </main>
  );
}

function Backup({ onChange }: { onChange: () => void }) {
  const [msg, setMsg] = useState("");
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <section className="card">
      <h3>資料備份</h3>
      <p className="small muted">這個版本的紀錄只存在這台裝置的瀏覽器裡，其他人的手機看不到。建議每週按一次「複製備份碼」，貼到 LINE 記事本或備忘錄保存。換手機或清除瀏覽器資料後，可以用備份碼還原。</p>
      <div className="row">
        <button className="btn" onClick={async () => setMsg((await copyText(demoExport())) ? "已複製備份碼" : "複製失敗，請再試一次")}>複製備份碼</button>
        <button className="btn ghost" onClick={() => setOpen(!open)}>{open ? "收起" : "用備份碼還原"}</button>
      </div>
      {open && (
        <>
          <textarea className="ta" aria-label="備份碼" placeholder="把備份碼貼在這裡" value={text} onChange={(e) => setText(e.target.value)} />
          <Confirm label="還原" confirmLabel="確定還原（目前的紀錄會被取代）" className="btn" onConfirm={() => {
            try { demoImport(text); setText(""); setOpen(false); setMsg("已還原"); onChange(); } catch { setMsg("備份碼不完整，請確認整段都有貼上"); }
          }} />
        </>
      )}
      {msg && <p className="note" role="status">{msg}</p>}
      <Confirm label="清空所有紀錄，從頭開始" confirmLabel="確定清空（無法復原）" className="btn danger" danger onConfirm={() => { demoReset(); onChange(); setMsg("已清空"); }} />
    </section>
  );
}

function Root() {
  const [uid, setUid] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => setUid(data.session?.user.id ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e: string, s: any) => setUid(s?.user.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  if (uid === undefined) return <div className="splash">載入中…</div>;
  return uid ? <Shell key={uid} userId={uid} /> : <Picker />;
}

document.documentElement.setAttribute("data-look", "korean");
createRoot(document.getElementById("root")!).render(<Root />);
