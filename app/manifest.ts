import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "My零用錢",
    short_name: "My零用錢",
    description: "全家一起學習零用金規劃",
    start_url: "/",
    display: "standalone",
    background_color: "#ede9e4",
    theme_color: "#6f857a",
    icons: [
      { src: "/icon-192-v2.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512-v2.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-v2.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "快速記帳", url: "/quick" }],
  };
}
