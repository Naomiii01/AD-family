"use client";
import { useEffect, useState } from "react";
import { supabase, rpc, fn } from "@/lib/supabase";
import { store } from "@/lib/util";
import { Avatar, JarSVG } from "./ui";

type Mode = "family" | "email" | "signup";

export default function Login() {
  const [mode, setMode] = useState<Mode>("family");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // family login
  const [code, setCode] = useState("");
  const [roster, setRoster] = useState<any[] | null>(null);
  const [pick, setPick] = useState<string>("");
  const [pin, setPin] = useState("");
  // email login / signup
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [famName, setFamName] = useState("");
  const [myName, setMyName] = useState("");

  useEffect(() => {
    const c = store("adf.code");
    if (c) {
      setCode(c);
      loadRoster(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRoster(c = code) {
    setErr("");
    const v = c.trim().toUpperCase();
    if (v.length !== 6) return setErr("家庭代碼是 6 個英文或數字");
    setBusy(true);
    const [data, e] = await rpc<any[]>("family_roster", { p_code: v });
    setBusy(false);
    if (e) return setErr(e);
    if (!data?.length) return setErr("找不到這個家庭代碼，請向家長確認");
    store("adf.code", v);
    setRoster(data);
    const last = store("adf.member");
    if (data.find((m) => m.id === last)) setPick(last);
  }

  async function pinLogin() {
    setErr("");
    if (!pick) return setErr("請先選你的名字");
    if (!/^\d{4,8}$/.test(pin)) return setErr("密碼是 4 到 8 位數字");
    setBusy(true);
    const [d, e] = await fn("pin-login", { code: code.trim().toUpperCase(), member_id: pick, pin });
    if (e) {
      setBusy(false);
      setPin("");
      return setErr(e);
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: d.token_hash, type: "magiclink" });
    setBusy(false);
    if (error) return setErr("登入失敗，請再試一次");
    store("adf.member", pick);
  }

  async function emailLogin() {
    setErr("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setErr("Email 或密碼不對");
  }

  async function signup() {
    setErr("");
    if (!myName.trim()) return setErr("請填你的稱呼");
    setBusy(true);
    const [d, e] = await fn("signup", { email: email.trim(), password: pw, family_name: famName, my_name: myName });
    if (e) {
      setBusy(false);
      return setErr(e);
    }
    store("adf.code", d.code);
    store("adf.welcome", d.code);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setErr("家庭建立好了，但登入失敗，請改用 Email 登入");
  }

  const sel = roster?.find((m) => m.id === pick);

  return (
    <main className="login">
      <div className="hero-j" aria-hidden="true">
        <JarSVG kind="free" pct={0.55} />
        <JarSVG kind="dream" pct={0.35} />
        <JarSVG kind="long" pct={0.75} />
      </div>
      <div className="center" style={{ display: "grid", gap: 6 }}>
        <h1 className="logo" style={{ fontSize: "1.8rem" }}>
          <b>My</b><i>零用</i><u>錢</u>
        </h1>
        <p className="muted small">全家一起學習規劃零用金、為夢想存錢</p>
      </div>

      <div className="seg" role="tablist">
        <button className={mode === "family" ? "on" : ""} onClick={() => { setMode("family"); setErr(""); }}>家人登入</button>
        <button className={mode === "email" ? "on" : ""} onClick={() => { setMode("email"); setErr(""); }}>家長 Email</button>
        <button className={mode === "signup" ? "on" : ""} onClick={() => { setMode("signup"); setErr(""); }}>建立家庭</button>
      </div>

      {mode === "family" && (
        <section className="card">
          {!roster ? (
            <>
              <label className="f">
                家庭代碼（向家長拿）
                <input id="code" value={code} maxLength={6} autoCapitalize="characters" autoComplete="off"
                  placeholder="例如 PRG7KQ" onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && loadRoster()} />
              </label>
              <button className="btn primary big" disabled={busy} onClick={() => loadRoster()}>下一步</button>
            </>
          ) : (
            <>
              <div className="card-h">
                <h2>{roster[0]?.family_name}</h2>
                <button className="btn sm ghost" onClick={() => { setRoster(null); setPick(""); setPin(""); }}>換家庭代碼</button>
              </div>
              <p className="small muted">你是誰？</p>
              <div className="pick">
                {roster.map((m) => (
                  <button key={m.id} className={pick === m.id ? "on" : ""} onClick={() => { setPick(m.id); setPin(""); setErr(""); }}>
                    <Avatar m={m} lg />
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>
              {sel && !sel.has_pin && <p className="small muted">{sel.name} 還沒有登入密碼。請用家長 Email 登入，或請家長在「家長設定」幫你設定。</p>}
              {sel && sel.has_pin && (
                <>
                  <label className="f">
                    {sel.name} 的密碼
                    <input id="pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={8}
                      value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && pinLogin()} />
                  </label>
                  <button className="btn primary big" disabled={busy} onClick={pinLogin}>{busy ? "登入中…" : "登入"}</button>
                </>
              )}
            </>
          )}
          {err && <p className="err">{err}</p>}
        </section>
      )}

      {mode === "email" && (
        <section className="card">
          <p className="small muted">建立家庭的家長用 Email 登入。</p>
          <label className="f">Email<input id="em" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="f">密碼<input id="pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && emailLogin()} /></label>
          <button className="btn primary big" disabled={busy} onClick={emailLogin}>{busy ? "登入中…" : "登入"}</button>
          {err && <p className="err">{err}</p>}
        </section>
      )}

      {mode === "signup" && (
        <section className="card">
          <p className="small muted">第一次使用：由一位家長建立家庭，之後再把其他家人加進來。</p>
          <div className="grid2">
            <label className="f">家庭名稱<input id="fam" placeholder="例如：林家" value={famName} onChange={(e) => setFamName(e.target.value)} /></label>
            <label className="f">你的稱呼<input id="me" placeholder="例如：Naomi" value={myName} onChange={(e) => setMyName(e.target.value)} /></label>
          </div>
          <label className="f">Email<input id="em2" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="f">密碼（至少 8 個字元）<input id="pw2" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <button className="btn primary big" disabled={busy} onClick={signup}>{busy ? "建立中…" : "建立家庭"}</button>
          {err && <p className="err">{err}</p>}
        </section>
      )}
    </main>
  );
}
