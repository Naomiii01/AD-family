// Latest Taiwan stock / ETF prices for the stock account: POST {symbols: string[]} with the user's session.
// Answers {ok, prices: {symbol: {name, price, date}}} and caches them in stock_prices.
// Source: TWSE MIS quote API (listed + OTC); falls back to the TWSE / TPEx daily close open data.
import { admin, cors, json, readBody } from "../_shared/util.ts";

type Quote = { name: string; price: number | null; date: string | null };
const UA = { "User-Agent": "Mozilla/5.0 (MyAllowance stock account)", Accept: "application/json" };

const toNum = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const ymd = (s: string) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);

async function fromMis(symbols: string[]): Promise<Record<string, Quote>> {
  const ch = symbols.flatMap((s) => [`tse_${s.toLowerCase()}.tw`, `otc_${s.toLowerCase()}.tw`]).join("|");
  const r = await fetch(`https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(ch)}&json=1&delay=0`, { headers: UA });
  if (!r.ok) throw new Error(`mis ${r.status}`);
  const j = await r.json();
  const out: Record<string, Quote> = {};
  for (const q of j.msgArray || []) {
    const code = String(q.c || "").toUpperCase();
    if (!code) continue;
    // z = last trade ('-' when none yet today); fall back to the best bid/ask, then yesterday's close
    const bid = toNum(String(q.b || "").split("_")[0]);
    const price = toNum(q.z) ?? bid ?? toNum(q.y);
    out[code] = { name: String(q.n || ""), price, date: ymd(String(q.d || "")) };
  }
  return out;
}

async function fromOpenData(symbols: string[]): Promise<Record<string, Quote>> {
  const want = new Set(symbols);
  const out: Record<string, Quote> = {};
  try {
    const r = await fetch("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", { headers: UA });
    for (const q of (await r.json()) as any[]) {
      const code = String(q.Code || "").toUpperCase();
      if (want.has(code)) out[code] = { name: String(q.Name || ""), price: toNum(q.ClosingPrice), date: null };
    }
  } catch { /* try TPEx next */ }
  if (symbols.every((s) => out[s])) return out;
  try {
    const r = await fetch("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes", { headers: UA });
    for (const q of (await r.json()) as any[]) {
      const code = String(q.SecuritiesCompanyCode || "").toUpperCase();
      if (want.has(code) && !out[code]) out[code] = { name: String(q.CompanyName || ""), price: toNum(q.Close), date: null };
    }
  } catch { /* nothing more to try */ }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = admin();
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return json({ ok: false, error: "請先登入" });

  const b = await readBody(req);
  const symbols = Array.from(new Set(((b.symbols as unknown[]) || []).map((s) => String(s).trim().toUpperCase())))
    .filter((s) => /^[0-9A-Z]{2,8}$/.test(s)).slice(0, 30);
  if (!symbols.length) return json({ ok: true, prices: {} });

  let quotes: Record<string, Quote> = {};
  try { quotes = await fromMis(symbols); } catch { /* fall back below */ }
  const missing = symbols.filter((s) => !quotes[s]?.price);
  if (missing.length) {
    const more = await fromOpenData(missing);
    for (const s of missing) if (more[s]?.price) quotes[s] = { ...more[s], name: quotes[s]?.name || more[s].name };
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  const rows = symbols.filter((s) => quotes[s]?.price).map((s) => ({
    symbol: s, name: quotes[s].name, price: quotes[s].price, price_date: quotes[s].date || today, updated_at: new Date().toISOString(),
  }));
  if (rows.length) await db.from("stock_prices").upsert(rows);
  const prices = Object.fromEntries(rows.map((r) => [r.symbol, { name: r.name, price: r.price, date: r.price_date }]));
  return json({ ok: true, prices, missing: symbols.filter((s) => !prices[s]) });
});
