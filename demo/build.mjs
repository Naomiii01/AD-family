// Builds the single-file 體驗版 (demo) page: same components, local data layer instead of Supabase.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const alias = {
  name: "alias",
  setup(b) {
    b.onResolve({ filter: /^@\// }, (a) => {
      if (a.path === "@/lib/supabase") return { path: resolve(root, "demo/mock.ts") };
      const base = resolve(root, a.path.slice(2));
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        try { readFileSync(base + ext); return { path: base + ext }; } catch {}
      }
      return { path: base };
    });
  },
};

const out = await build({
  entryPoints: [resolve(root, "demo/main.tsx")],
  bundle: true, minify: true, write: false, format: "iife", target: "es2020",
  jsx: "automatic", plugins: [alias], legalComments: "none", banner: { js: "var process={env:{}};" },
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_DEMO": '"1"' },
});
const js = out.outputFiles[0].text.replace(/<\/script/g, "<\\/script");
const css = readFileSync(resolve(root, "app/globals.css"), "utf8");
const html = `<title>My零用錢</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chiron+GoRound+TC:wght@500;700;800&family=Noto+Sans+TC:wght@400;500;700;900&family=Huninn&family=LXGW+WenKai+TC:wght@400;700&family=IBM+Plex+Mono:wght@500;700&display=swap">
<style>${css}
body{padding-top:0}
</style>
<div id="root"><div class="splash">載入中…</div></div>
<script>${js}</script>
`;
writeFileSync(process.argv[2] || resolve(root, "demo/three-jars-demo.html"), html);
console.log("demo built", (html.length / 1024).toFixed(0) + " KB");
