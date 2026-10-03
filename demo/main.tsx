import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase, demoMembers, demoLogin, demoReset } from "@/lib/supabase";
import Shell from "@/components/Shell";
import { Avatar, JarSVG, Confirm } from "@/components/ui";
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
        <h1 className="logo" style={{ fontSize: "1.8rem" }}><b>三</b><i>罐</i><u>零用金</u></h1>
        <p className="muted small">體驗版 · 選一位家人進去看看</p>
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
        <p className="small muted">孩子只看得到自己的罐子；家長看得到全家，也能發獎勵、調整零用金。正式版每個人用家庭代碼和自己的密碼登入。</p>
      </section>
      <section className="card">
        <p className="small">這是範例家庭，資料只存在這台裝置，可以放心亂按。想從頭再試一次，可以重設。</p>
        <Confirm label="重設範例資料" confirmLabel="確定重設" className="btn" onConfirm={() => { demoReset(); setList(demoMembers()); }} />
      </section>
    </main>
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

createRoot(document.getElementById("root")!).render(<Root />);
