"use client";
import type { App } from "./Shell";
import { fmt, stepBonus, gd, matchOf } from "@/lib/util";

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
              <li><b>闖關加碼</b>：夢想罐裡自己存的錢，每存滿 {fmt(family.bonus_step)}，{gd(family)}加碼 {family.bonus_pct}%（{fmt(stepBonus(family))}）。存到 {fmt(family.bonus_step * 2)} 再拿一次，以此類推。</li>
              <li>加碼在月底結算時發，只看有沒有「新」闖過一關。這個月到 {fmt(family.bonus_step)} 拿到加碼，下個月沒存到 {fmt(family.bonus_step * 2)}，就沒有新的加碼。</li>
              <li>{gd(family)}給的加碼本身不算進關卡，只算自己存的錢。</li>
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
              <li><b>{gd(family)}配對</b>：你放多少，{gd(family)}就配對 {family.match_pct}%{family.match_cap > 0 ? `（每月最多 ${fmt(family.match_cap)}）` : ""}。</li>
              <li>舉例：你放 {fmt(family.long_min)}，{gd(family)}配對 {fmt(matchOf(family, "kid", family.long_min))}，每月投資 {fmt(family.long_min + matchOf(family, "kid", family.long_min))}。</li>
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
          <li><b>每天記帳</b>：花了錢就記；沒花錢的日子按「今天沒有花錢」打卡。</li>
          <li><b>每週檢查</b>：每週至少記帳 {family.star_days ?? 4} 天，週日晚上看看有沒有漏記。</li>
          <li><b>月底檢討</b>：月底和{gd(family)}一起回答三個問題、決定結餘去向，結算時發夢想加碼。</li>
        </ol>
      </section>

      <section className="card">
        <h3>怎麼拿到星星 ★</h3>
        <ul className="plain">
          <li>每一週都至少記帳 {family.star_days ?? 4} 天（月初、月底不滿一週的，依天數減少）。</li>
          <li>月底檢討回答第 3 題「下個月想怎麼調整」，再加上第 1 或第 2 題。</li>
          <li>兩個條件都做到，結算時就拿到這個月的星星。</li>
        </ul>
      </section>

      <section className="card">
        <h3>賞與罰</h3>
        <ul className="plain">
          <li>獎勵（例如成績進步）由{gd(family)}直接放進罐子。</li>
          <li>扣款（例如學校記警告）從自由罐扣，事後撤銷會退還。</li>
          <li>每季可以預支一次，下個月從零用金扣回。</li>
          <li>詳細金額寫在「理財約定」，由{gd(family)}和你一起討論、簽名。</li>
        </ul>
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
