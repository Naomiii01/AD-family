import React from "react";

export type SkinKey = "morandi" | "court" | "kpop" | "earth";

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
};

export const skinOf = (m: any): SkinKey => (m?.theme && m.theme in SKINS ? m.theme : "morandi");

export function applySkin(key: SkinKey) {
  if (typeof document === "undefined") return;
  if (key === "morandi") document.documentElement.removeAttribute("data-skin");
  else document.documentElement.setAttribute("data-skin", key);
}
