"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, MEMBER_COLS } from "@/lib/supabase";
import { curMonth, store } from "@/lib/util";
import { useMember, MemberData } from "@/lib/useMember";
import { Avatar, ICONS } from "./ui";
import { SKINS, skinOf, applySkin } from "@/lib/themes";
import Jars from "./Jars";
import Month from "./Month";
import Review from "./Review";
import Year from "./Year";
import More from "./More";

export type App = {
  me: any;
  family: any;
  members: any[];
  sel: any;
  isParent: boolean;
  isSelf: boolean;
  data: MemberData;
  mk: string;
  setMk: (m: string) => void;
  toast: (m: string) => void;
  reloadBase: () => Promise<void>;
  go: (tab: string, sub?: string) => void;
  sub: string;
};

const TABS: [string, string][] = [["jars", "罐子"], ["month", "本月"], ["review", "檢討"], ["year", "年度"], ["more", "更多"]];

export default function Shell({ userId }: { userId: string }) {
  const [me, setMe] = useState<any>(null);
  const [family, setFamily] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [selId, setSelId] = useState<string>("");
  const [tab, setTab] = useState("jars");
  const [sub, setSub] = useState("");
  const [mk, setMk] = useState(curMonth());
  const [msg, setMsg] = useState("");
  const [fatal, setFatal] = useState("");
  const [welcome, setWelcome] = useState("");
  const timer = useRef<any>(null);

  const toast = useCallback((m: string) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(""), 2800);
  }, []);

  const reloadBase = useCallback(async () => {
    const { data: m, error } = await supabase.from("members").select(MEMBER_COLS).eq("user_id", userId).maybeSingle();
    if (error) return setFatal("連線失敗，請檢查網路後重新整理");
    if (!m) return setFatal("這個帳號找不到家庭資料，可能已被家長移除。");
    const [{ data: f }, { data: ms }] = await Promise.all([
      supabase.from("families").select("id,name,code,rate,bonus_pct,bonus_step,long_min,match_pct,match_cap,guardian,star_days").eq("id", m.family_id).single(),
      supabase.from("members").select(MEMBER_COLS).eq("archived", false).order("created_at"),
    ]);
    const list = (ms || []).sort((a, b) => (a.id === m.id ? -1 : b.id === m.id ? 1 : a.role === b.role ? 0 : a.role === "kid" ? 1 : -1));
    setMe(m);
    setFamily(f);
    setMembers(list);
    setSelId((cur) => (list.find((x) => x.id === cur) ? cur : (m.role === "parent" ? list.find((x) => x.role === "kid")?.id : null) || m.id));
  }, [userId]);

  useEffect(() => {
    reloadBase();
    const w = store("adf.welcome");
    if (w) setWelcome(w);
  }, [reloadBase]);

  useEffect(() => { applySkin(skinOf(me)); return () => applySkin("morandi"); }, [me?.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = members.find((x) => x.id === selId) || me;
  const data = useMember(sel?.id);

  if (fatal)
    return (
      <main className="login">
        <section className="card">
          <p>{fatal}</p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>登出</button>
        </section>
      </main>
    );
  if (!me || !family || !sel) return <div className="splash">載入中…</div>;

  const isParent = me.role === "parent";
  const go = (t: string, s = "") => {
    setTab(t);
    setSub(s);
    window.scrollTo(0, 0);
  };
  const app: App = { me, family, members, sel, isParent, isSelf: sel.id === me.id, data, mk, setMk, toast, reloadBase, go, sub };

  return (
    <>
      <div className="wrap">
        <header className="top">
          <div className="brand">
            <span className="row" style={{ gap: 6 }}>{SKINS[skinOf(me)].motif}<span className="logo"><b>三</b><i>罐</i><u>零用金</u></span></span>
            <span className="small muted">{family.name}</span>
          </div>
          {isParent && members.length > 1 && (
            <div className="members" role="tablist" aria-label="家人">
              {members.map((x) => (
                <button key={x.id} className={`mchip ${x.id === sel.id ? "on" : ""}`} onClick={() => setSelId(x.id)}>
                  <Avatar m={x} />
                  {x.name}
                  {x.id === me.id ? "（我）" : ""}
                </button>
              ))}
            </div>
          )}
          {!isParent && <div className="streak"><Avatar m={me} /> <b style={{ color: "var(--ink)" }}>{me.name}</b> 的零用金</div>}
        </header>

        {welcome && isParent && (
          <div className="banner" style={{ marginBottom: 14 }}>
            <b>家庭建立好了！</b>
            <span>家庭代碼是 <span className="code">{welcome}</span>。接下來到「更多 → 家長設定」把其他家人和孩子加進來，並幫每個人設定登入密碼。</span>
            <div className="row">
              <button className="btn sm primary" onClick={() => { store("adf.welcome", ""); setWelcome(""); go("more", "parent"); }}>去新增家人</button>
              <button className="btn sm ghost" onClick={() => { store("adf.welcome", ""); setWelcome(""); }}>知道了</button>
            </div>
          </div>
        )}

        <main className="stack">
          {!data.loaded ? (
            <div className="splash">載入中…</div>
          ) : tab === "jars" ? (
            <Jars app={app} />
          ) : tab === "month" ? (
            <Month app={app} />
          ) : tab === "review" ? (
            <Review app={app} />
          ) : tab === "year" ? (
            <Year app={app} />
          ) : (
            <More app={app} />
          )}
        </main>
      </div>
      {msg && <div className="toast" role="status">{msg}</div>}
      <nav className="tabs">
        <div className="in">
          {TABS.map(([k, t]) => (
            <button key={k} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined} onClick={() => go(k)}>
              {ICONS[k]}
              {t}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
