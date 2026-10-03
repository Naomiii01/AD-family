"use client";
import type { App } from "./Shell";
import { fmt, stepBonus } from "@/lib/util";

export default function Rules({ app }: { app: App }) {
  const { family } = app;
  return (
    <>
      <section className="card">
        <h2>罐子使用原則</h2>
        <p className="small muted">每個月的零用金，在月初先分進三個罐子。每個罐子有自己的用途和規則。</p>
      </section>

      <section className="card">
        <div className="rule">
          <span className="ic" style={{ background: "var(--free)" }}>自</span>
          <div className="stack" style={{ gap: 6 }}>
            <h3 className="k-free">自由罐：這個月可以自由花的錢</h3>
            <ul className="plain">
              <li>買飲料、零食、娛樂、和朋友出去，都從自由罐出。</li>
              <li>花了錢就記帳，分清楚是「需要」還是「想要」。</li>
              <li>自由罐的錢不夠時就不能買，不能先挪用其他罐子。</li>
              <li>月底有剩，可以留著，或轉進夢想罐、長期罐。</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="rule">
          <span className="ic" style={{ background: "var(--dream)" }}>夢</span>
          <div className="stack" style={{ gap: 6 }}>
            <h3 className="k-dream">夢想罐：為一個想要的東西存錢</h3>
            <ul className="plain">
              <li>一次只存一個夢想，寫下名稱和價格。</li>
              <li>夢想罐的錢只能用來買這個夢想。</li>
              <li><b>闖關加碼</b>：夢想罐裡自己存的錢，每存滿 {fmt(family.bonus_step)}，爸媽加碼 {family.bonus_pct}%（{fmt(stepBonus(family))}）。存到 {fmt(family.bonus_step * 2)} 再拿一次，以此類推。</li>
              <li>加碼在月底結算時發，只看有沒有「新」闖過一關。這個月到 {fmt(family.bonus_step)} 拿到加碼，下個月沒存到 {fmt(family.bonus_step * 2)}，就沒有新的加碼。</li>
              <li>爸媽給的加碼本身不算進關卡，只算自己存的錢。</li>
              <li>夢想罐的錢花掉後，關卡從 0 重新開始算。</li>
              <li>想換夢想要先冷靜 7 天，7 天後還是想換再確認。</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="rule">
          <span className="ic" style={{ background: "var(--long)" }}>長</span>
          <div className="stack" style={{ gap: 6 }}>
            <h3 className="k-long">長期罐：定期投資，留給未來的自己</h3>
            <ul className="plain">
              <li>每月至少放 {fmt(family.long_min)} 進長期罐。</li>
              <li><b>爸媽配對</b>：你放多少，爸媽就配對 {family.match_pct}%{family.match_cap > 0 ? `（每月最多 ${fmt(family.match_cap)}）` : ""}。放 {fmt(family.long_min)}，爸媽加 {fmt(Math.round(family.long_min * family.match_pct / 100))}；放 {fmt(1000)}，爸媽加 {fmt(Math.round(1000 * family.match_pct / 100))}。</li>
              <li>兩邊加起來的錢，每月定期定額買股票，是未來的第一桶金。</li>
              <li>長期罐的錢只進不出，股票會有漲有跌，時間拉長才看得出複利的力量。</li>
              {Number(family.rate) > 0 && <li>家庭銀行另外每月發 {Number(family.rate)}% 利息。</li>}
            </ul>
          </div>
        </div>
      </section>

      <section className="card">
        <h3>每個月的節奏</h3>
        <ol className="steps">
          <li><b>月初規劃</b>：確認零用金和額外收入，決定三個罐子的比例。</li>
          <li><b>每天記帳</b>：花了錢就記，或用 Apple 捷徑快速記。</li>
          <li><b>每週檢查</b>：週日晚上看看有沒有漏記，自由罐還剩多少。</li>
          <li><b>月底檢討</b>：回答三個問題、決定結餘去向，結算時發夢想加碼。完成檢討就拿到一顆星。</li>
        </ol>
      </section>

      <section className="card">
        <h3>零用金怎麼調整</h3>
        <ul className="plain">
          <li>連續 3 個月拿到星星，可以提出調高零用金。</li>
          <li>自由罐連續兩個月不夠用，先一起檢查「想要」的花費，再討論要不要多給。</li>
          <li>額外收入（紅包、打工）在月初規劃時填進去，一樣分進三個罐子。</li>
        </ul>
      </section>
    </>
  );
}
