// Supabase Edge Function: latest prices of Indonesian shares (IDX) by ticker, e.g. { codes: ["BBCA", "TLKM"] }
// → { prices: { BBCA: 5600, TLKM: 3120 } }. Only signed-in users can call it (keep "Verify JWT" on).
//
// The source is Yahoo Finance's public chart data (ticker + ".JK"). It is unofficial and may be delayed or stop
// working; the app then simply keeps the prices typed by hand. No secret is needed.
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function → "Via Editor", name it stock-price.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function price(code: string): Promise<number | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(code)}.JK?range=1d&interval=1d`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return null;
    const meta = (await res.json())?.chart?.result?.[0]?.meta;
    const p = Number(meta?.regularMarketPrice);
    return meta?.currency === 'IDR' && p > 0 ? p : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let input: { codes?: unknown };
  try { input = await req.json(); } catch { return json({ error: 'Permintaan tidak valid.' }, 400); }
  const codes = [...new Set((Array.isArray(input.codes) ? input.codes : []).map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z0-9]{2,6}$/.test(c)))].slice(0, 40);
  const prices: Record<string, number> = {};
  await Promise.all(codes.map(async (c) => { const p = await price(c); if (p) prices[c] = p; }));
  return json({ prices, at: new Date().toISOString() });
});
