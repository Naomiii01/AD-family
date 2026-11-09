import React from "react";

export type SkinKey = "morandi" | "court" | "kpop" | "earth" | "mint" | "lavender" | "peach" | "latte";

export const SKINS: Record<SkinKey, {
  name: string; desc: string; bg: string; surface: string; ink: string; accent: string; jars: [string, string, string]; motif: React.ReactElement;
}> = {
  morandi: {
    name: "莫蘭迪", desc: "灰調的柔和色，看起來舒服不刺眼",
    bg: "#ede9e4", surface: "#f8f6f3", ink: "#3e3934", accent: "#6f857a", jars: ["#c4a57a", "#c28e8e", "#8ea396"],
    motif: (
      <svg className="motif" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="10" r="6" fill="currentColor" opacity=".35" /><circle cx="15" cy="14" r="6" fill="currentColor" opacity=".6" /></svg>
    ),
  },
  court: {
    name: "球場", desc: "籃球橘配灰藍，像球館和電競螢幕",
    bg: "#e8e9ec", surface: "#f6f6f7", ink: "#2e333b", accent: "#56688a", jars: ["#c98a5b", "#7c8db5", "#7fa59a"],
    motif: (
      <svg className="motif" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="9" fill="var(--free)" stroke="var(--ink)" strokeOpacity=".5" />
        <path d="M3 12h18M12 3v18M5.6 5.6c3 3 3 9.8 0 12.8M18.4 5.6c-3 3-3 9.8 0 12.8" stroke="var(--ink)" strokeOpacity=".5" />
      </svg>
    ),
  },
  kpop: {
    name: "星光", desc: "粉紫和薄荷，應援色的柔和版",
    bg: "#eee8ee", surface: "#faf7fa", ink: "#3d3542", accent: "#957aa6", jars: ["#d29baf", "#a598c9", "#92b5b1"],
    motif: (
      <svg className="motif" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3L3.5 11l6.3-2.2z" fill="currentColor" />
        <path d="M19 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="var(--free)" />
      </svg>
    ),
  },
  earth: {
    name: "大地", desc: "苔綠、卡其和陶土，沉穩的自然色",
    bg: "#e8e6dc", surface: "#f5f4ee", ink: "#33352b", accent: "#5f7651", jars: ["#bfa373", "#a9806a", "#6f8559"],
    motif: (
      <svg className="motif" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" fill="currentColor" opacity=".8" />
        <path d="M5 19c3-4 6-7 10-10" stroke="var(--surface)" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      </svg>
    ),
  },
  mint: {
    name: "海鹽薄荷", desc: "清爽的薄荷綠和海鹽白",
    bg: "#e6eeec", surface: "#f5f9f8", ink: "#2f3b39", accent: "#4f9a8e", jars: ["#d4ad72", "#d99393", "#6fae9f"],
    motif: (
      <svg className="motif" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c4 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2-6 6-10z" fill="currentColor" opacity=".75" /><circle cx="10" cy="13" r="1.6" fill="var(--surface)" /></svg>
    ),
  },
  lavender: {
    name: "柔霧紫", desc: "霧面薰衣草紫，安靜又溫柔",
    bg: "#ebe8f1", surface: "#f8f6fb", ink: "#393446", accent: "#7d6fad", jars: ["#d3a978", "#c497b8", "#8aa9c1"],
    motif: (
      <svg className="motif" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3" fill="currentColor" /><circle cx="8" cy="12" r="3" fill="currentColor" opacity=".7" /><circle cx="16" cy="12" r="3" fill="currentColor" opacity=".7" /><path d="M12 13v8" stroke="currentColor" strokeWidth="1.6" /></svg>
    ),
  },
  peach: {
    name: "蜜桃粉", desc: "甜甜的蜜桃粉配奶油白",
    bg: "#f3e9e7", surface: "#fcf7f6", ink: "#45363a", accent: "#c4707a", jars: ["#dfa47b", "#dd8d9a", "#8fb4a2"],
    motif: (
      <svg className="motif" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20c-4.5 0-7-3-7-6.5S8 6 12 8c4-2 7 2 7 5.5S16.5 20 12 20z" fill="currentColor" opacity=".8" /><path d="M12 8c0-2 1-4 3-5" stroke="var(--long)" strokeWidth="1.6" fill="none" strokeLinecap="round" /></svg>
    ),
  },
  latte: {
    name: "香草奶咖", desc: "奶茶色和焦糖咖啡，溫暖的咖啡館",
    bg: "#efe8df", surface: "#faf6f1", ink: "#3f342b", accent: "#946b4f", jars: ["#c69c69", "#b48a80", "#8a9b7b"],
    motif: (
      <svg className="motif" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" fill="currentColor" /><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" stroke="currentColor" strokeWidth="1.6" fill="none" /><path d="M8 3c0 1.5 1.5 1.5 1.5 3M12 3c0 1.5 1.5 1.5 1.5 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity=".6" /></svg>
    ),
  },
};

export const skinOf = (m: any): SkinKey => (m?.theme && m.theme in SKINS ? m.theme : "morandi");

export type LookKey = "korean" | "herbal" | "industrial" | "cute" | "general";
export const LOOKS: Record<LookKey, { name: string; desc: string }> = {
  korean: { name: "簡約韓系", desc: "大量留白、柔和陰影、圓潤按鈕" },
  herbal: { name: "草本日系", desc: "手寫感字體、細線與和紙點點" },
  industrial: { name: "工業風", desc: "粗框直角、等寬數字、網格背景" },
  cute: { name: "可愛Q版", desc: "粉圓字體、貼紙邊框、會搖的罐子" },
  general: { name: "一般", desc: "原本的圓角卡片樣式" },
};
export const lookOf = (m: any): LookKey => (m?.look && m.look in LOOKS ? m.look : "korean");

export function applySkin(key: SkinKey, look: LookKey = "korean") {
  if (typeof document === "undefined") return;
  if (key === "morandi") document.documentElement.removeAttribute("data-skin");
  else document.documentElement.setAttribute("data-skin", key);
  document.documentElement.setAttribute("data-look", look);
}
