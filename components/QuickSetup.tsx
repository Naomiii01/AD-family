"use client";
import { useMemo, useState } from "react";
import type { App } from "./Shell";
import { rpc, QUICK_URL } from "@/lib/supabase";
import { copyText, Confirm } from "./ui";
import { IS_DEMO } from "@/lib/util";

const DAYS = [["SU", "週日"], ["MO", "週一"], ["TU", "週二"], ["WE", "週三"], ["TH", "週四"], ["FR", "週五"], ["SA", "週六"]];

function nextDate(dayIdx: number) {
  const now = new Date();
  const tp = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const diff = (dayIdx - tp.getDay() + 7) % 7 || 7;
  tp.setDate(tp.getDate() + diff);
  return `${tp.getFullYear()}${String(tp.getMonth() + 1).padStart(2, "0")}${String(tp.getDate()).padStart(2, "0")}`;
}
function firstOfNextMonth() {
  const tp = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const d = new Date(tp.getFullYear(), tp.getMonth() + 1, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}01`;
}

function buildIcs(name: string, memberId: string, day: string, time: string, monthly: boolean, url: string) {
  const di = DAYS.findIndex((d) => d[0] === day);
  const hm = time.replace(":", "") + "00";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const ev = (uid: string, start: string, rrule: string, summary: string, desc: string) => [
    "BEGIN:VEVENT", `UID:${uid}-${memberId}@ad-family`, `DTSTAMP:${stamp}`, `DTSTART;TZID=Asia/Taipei:${start}T${hm}`,
    "DURATION:PT15M", `RRULE:${rrule}`, `SUMMARY:${summary}`, `DESCRIPTION:${desc}\\n${url}`, `URL:${url}`,
    "BEGIN:VALARM", "TRIGGER:PT0M", "ACTION:DISPLAY", `DESCRIPTION:${summary}`, "END:VALARM", "END:VEVENT",
  ];
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AD Family//San Guan//ZH", "CALSCALE:GREGORIAN",
    "BEGIN:VTIMEZONE", "TZID:Asia/Taipei", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0800", "TZOFFSETTO:+0800", "TZNAME:CST", "END:STANDARD", "END:VTIMEZONE",
    ...ev("weekly", nextDate(di), `FREQ=WEEKLY;BYDAY=${day}`, `三罐零用金：${name}每週記帳檢查`, "看看這週有沒有漏記帳，自由罐還剩多少。"),
  ];
  if (monthly) {
    lines.push(...ev("plan", firstOfNextMonth(), "FREQ=MONTHLY;BYMONTHDAY=1", `三罐零用金：${name}月初規劃`, "把這個月的零用金分進三個罐子。"));
    lines.push(...ev("review", firstOfNextMonth(), "FREQ=MONTHLY;BYMONTHDAY=-1", `三罐零用金：${name}月底檢討`, "回答三個問題、決定結餘去向、完成結算。"));
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export default function QuickSetup({ app }: { app: App }) {
  const { sel, isSelf, toast } = app;
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [day, setDay] = useState("SU");
  const [time, setTime] = useState("20:00");
  const [monthly, setMonthly] = useState(true);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const ics = useMemo(() => buildIcs(isSelf ? "" : sel.name, sel.id, day, time, monthly, origin), [sel, isSelf, day, time, monthly, origin]);
  const icsHref = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);

  async function gen() {
    setBusy(true);
    const [t, e] = await rpc<string>("rotate_quick_token", { p_member: sel.id });
    setBusy(false);
    if (e) return toast(e);
    setToken(t || "");
  }
  const copy = async (s: string, label: string) => toast((await copyText(s)) ? `已複製${label}` : "請長按文字手動複製");

  return (
    <>
      <section className="card">
        <h2>Apple 捷徑記帳{isSelf ? "" : `（${sel.name}）`}</h2>
        <p className="small">設定一次後，按一下捷徑、說出或輸入金額和品項，就會直接記進 {sel.name} 的自由罐。可以放在主畫面、用 Siri 喊，或設成動作按鈕。</p>
        {!token ? (
          <>
            <Confirm label="產生記帳碼" confirmLabel="產生（舊的記帳碼會失效）" className="btn primary" onConfirm={gen} disabled={busy} />
            <p className="note">記帳碼只會顯示一次，請直接貼進捷徑裡。弄丟了就重新產生，舊的會自動失效。</p>
          </>
        ) : (
          <>
            <div className="kv small"><span>記帳碼</span><button className="btn sm" onClick={() => copy(token, "記帳碼")}>複製</button></div>
            <div className="mono">{token}</div>
            <div className="kv small"><span>網址</span><button className="btn sm" onClick={() => copy(QUICK_URL, "網址")}>複製</button></div>
            <div className="mono">{QUICK_URL}</div>
            <p className="note">記帳碼等於 {sel.name} 的記帳權限，不要傳給其他人。</p>
          </>
        )}
      </section>

      <section className="card">
        <h3>在 iPhone 建立捷徑</h3>
        <ol className="steps">
          <li>打開「捷徑」App，按右上角 ＋，名稱取「零用金記帳」。</li>
          <li>加入動作「<b>要求輸入</b>」：輸入類型選「數字」，提示寫「花了多少錢？」</li>
          <li>再加入「<b>要求輸入</b>」：類型「文字」，提示寫「買了什麼？」</li>
          <li>加入「<b>從列表中選擇</b>」：列表放兩項「想要」「需要」。</li>
          <li>加入「<b>取得 URL 內容</b>」：網址貼上上面的網址；方法選「POST」；要求本文選「JSON」，新增 4 個欄位：
            <div className="mono" style={{ marginTop: 6 }}>token → 貼上記帳碼<br />amount → 「提供的輸入」（第 1 個）<br />item → 「提供的輸入」（第 2 個）<br />type → 「選取的項目」</div>
          </li>
          <li>加入「<b>取得字典值</b>」：取得「message」的值，來源是「URL 的內容」。</li>
          <li>加入「<b>顯示通知</b>」，內容放「字典值」。完成後按一次試試看。</li>
          <li>想更快：在捷徑上長按 → 「加入主畫面」；或對 Siri 說「零用金記帳」。</li>
        </ol>
        <p className="note">記帳一樣要先完成本月規劃，自由罐不夠時會顯示剩多少錢。</p>
      </section>

      <section className="card">
        <h3>Android 或不想設定捷徑</h3>
        <p className="small">用手機瀏覽器打開 <b>{origin}/quick</b>，按「分享 → 加入主畫面」，就有一個打開即記帳的圖示。</p>
        {!IS_DEMO && <div className="row"><a className="btn sm" href="/quick">打開快速記帳頁</a></div>}
      </section>

      <section className="card">
        <h3>每週記帳提醒</h3>
        <p className="small">加到手機行事曆，時間到會跳通知。也會一起加上每月 1 日的月初規劃和月底檢討提醒。</p>
        <div className="grid2">
          <label className="f">哪一天<select id="r-day" value={day} onChange={(e) => setDay(e.target.value)}>{DAYS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
          <label className="f">幾點<input id="r-time" type="time" value={time} onChange={(e) => setTime(e.target.value || "20:00")} /></label>
        </div>
        <label className="row small"><input type="checkbox" style={{ width: "auto" }} checked={monthly} onChange={(e) => setMonthly(e.target.checked)} />一起加上月初規劃、月底檢討提醒</label>
        {IS_DEMO ? <p className="banner small">體驗版不能下載行事曆檔。正式版部署後，按這裡就會加到手機行事曆。</p>
          : <a className="btn primary" href={icsHref} download="三罐零用金提醒.ics">加到行事曆</a>}
        <p className="note">iPhone 會跳出「加入行事曆」的畫面，按「全部加入」。Android 會用 Google 日曆打開。</p>
      </section>

      <section className="card">
        <h3>大人加碼：刷卡後自動記帳</h3>
        <p className="small">有用 Apple Pay 的人，可以在捷徑 App 的「自動化 → 錢包」設定「刷卡時」執行上面的捷徑，金額會從交易帶入，只需要補上品項。</p>
      </section>
    </>
  );
}
