import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "三罐零用金",
    short_name: "三罐零用金",
    description: "全家一起學習零用金規劃",
    start_url: "/",
    display: "standalone",
    background_color: "#eef3ef",
    theme_color: "#1d8768",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcuts: [{ name: "快速記帳", url: "/quick" }],
  };
}
