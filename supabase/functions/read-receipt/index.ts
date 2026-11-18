// Supabase Edge Function: read a receipt photo with Gemini and return its products, prices and total as JSON.
// Gemini API keys live only here, as Supabase secrets (one per account, see keyFor); the app never sees them.
// Only signed-in users of this Supabase project can call it (Supabase checks the login token before this runs).
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function → "Via Editor", name it read-receipt,
// paste this file. Then Edge Functions → Secrets → add GEMINI_API_KEY. See supabase/SETUP-AI.md.

const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']; // first = default, second = backup / second opinion
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PROMPT = `You read a photo of an Indonesian shopping receipt. Return only what was bought and paid, as JSON.
- items: every purchased product line, in printed order.
  - printed: the product name exactly as printed, WITHOUT item numbers (001, 002), barcodes or PLU codes.
  - name: the same product written out in full so a person understands it, in Indonesian Title Case.
    This applies to every store (minimarket, supermarket, grosir, apotek, restaurant, SPBU, online shop): shop
    systems cut names to fit a few columns, so use your knowledge of products sold in Indonesia and the rest of
    the line to expand every abbreviation you can resolve with confidence. Common ones (not a complete list):
    GRG = Goreng, PGG = Panggang, JMB = Jumbo, AYM = Ayam, SP/SPC = Spesial, KLDU = Kaldu, BTL = Botol, KLG = Kaleng,
    SCH/SACH = Sachet, PCH = Pouch, RF/REF = Refill, BOX = Kotak, PK/PCK = Pack, LIQ = Liquid, PWR = Power,
    ORI = Original, TC = Toilet Cleaner, PG = Pasta Gigi, SMP = Sampo, SBN = Sabun, DTRJ/DTG = Deterjen,
    MNY/MNYK = Minyak, GRG/GORENG, SS = Susu, KNTL = Kental, UHT, CKLT/COKL = Coklat, STRW/STRB = Strawberry,
    VNL = Vanila, MNS = Manis, ASN = Asin, PDS = Pedas, PTH = Putih, MRH = Merah, HJ = Hijau, KCL = Kecil,
    BSR = Besar, SDG = Sedang, ISI = Isi, BKS = Bungkus, KMS = Kemasan, ANK = Anak, DWS = Dewasa, TAB = Tablet,
    KPL/KAPS = Kapsul, SIR = Sirup, FF = Frisian Flag, IND = Indomilk (in milk names), MIE/MI = Mie, KRP = Kerupuk.
    Split words that are run together ("INDOMIEGRGAYAM" → "Indomie Goreng Ayam"), write brands the usual way
    (Indomie, Sedaap, Aqua, Le Minerale, Ultra Milk, Frisian Flag, Rinso, Harpic, So Klin, Golda, Roma, Pepsodent).
    Sizes: a space before a lower-case unit, and grams always as "gr": "127 gr", "300 gr", "1,5 kg", "200 ml", "1 L".
    Examples: "INDOMIEGRGAYAM PGG JMB127G" → "Indomie Goreng Ayam Panggang Jumbo 127 gr";
    "FF SS KNTL MNS PTH 370G" → "Frisian Flag Susu Kental Manis Putih 370 gr";
    "RINSO MTC CAIR RF 750ML" → "Rinso Matic Cair Refill 750 ml".
    Only expand what the abbreviation clearly means; when unsure, keep that word as printed. Do not add the quantity.
  - qty: quantity as a number (a weight in kg such as 1.024 is allowed), or null when not printed.
  - price: the line total in rupiah for that product (quantity × unit price, before receipt-level discounts), integer.
  - Never list subtotal, total, tax, service, discount, payment, change, points, cashier or address lines as items.
- discount: sum of all discounts (item discount lines such as DISC/potongan/hemat, and total discount), positive integer, 0 if none.
- fees: charges added on top of the item prices (service, PB1/pajak restoran, ongkir, packaging), positive integer, 0 if none.
  Tax that is already included in the prices (e.g. "harga sudah termasuk PPN", DPP/PPN information lines) is NOT a fee.
- total: the final amount to pay (TOTAL / TOTAL BELANJA / TOTAL BAYAR / GRAND TOTAL / TOTAL HARUS DIBAYAR / JUMLAH), integer.
- date: purchase date as YYYY-MM-DD, or null.
- payment: one of cash, card, qris, gopay, ovo, dana, shopeepay, linkaja, other, or null.
- store: the store name, or null.
Rupiah amounts: "21,500", "21.500" and "Rp 21.500,00" all mean 21500. Read digits carefully. Never invent lines; skip a line you cannot read.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { printed: { type: 'STRING' }, name: { type: 'STRING' }, qty: { type: 'NUMBER', nullable: true }, price: { type: 'INTEGER' } }, required: ['name', 'price'], propertyOrdering: ['printed', 'name', 'qty', 'price'] } },
    discount: { type: 'INTEGER' },
    fees: { type: 'INTEGER' },
    total: { type: 'INTEGER', nullable: true },
    date: { type: 'STRING', nullable: true },
    payment: { type: 'STRING', nullable: true },
    store: { type: 'STRING', nullable: true },
  },
  required: ['items', 'discount', 'fees', 'total'],
};

async function ask(model: string, key: string, image: string, mime: string, thinking: boolean) {
  const body = {
    contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: image } }, { text: PROMPT }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
      mediaResolution: 'MEDIA_RESOLUTION_HIGH', // small receipt print needs the detailed reading
      ...(thinking ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
    },
  };
  return await fetch(`${API}/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body) });
}

/** Email of the signed-in caller, from the login token Supabase already verified (Verify JWT on). */
function emailOf(req: Request): string {
  try {
    const tok = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const p = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return String(JSON.parse(atob(p + '='.repeat((4 - (p.length % 4)) % 4))).email ?? '').trim().toLowerCase();
  } catch { return ''; }
}

/**
 * Each account reads receipts with its own Gemini key, so quotas stay separate:
 * - GEMINI_KEYS: JSON {"email": "key", ...}, one entry per person.
 * - GEMINI_API_KEY: the original single key, used only by GEMINI_OWNER_EMAIL.
 * No key for this account → null (the app then reads the receipt on the phone instead).
 */
function keyFor(email: string): string | null {
  if (!email) return null;
  try {
    const map = JSON.parse(Deno.env.get('GEMINI_KEYS') || '{}') as Record<string, string>;
    for (const [e, k] of Object.entries(map)) if (e.trim().toLowerCase() === email && k) return k.trim();
  } catch { /* malformed GEMINI_KEYS: ignore it */ }
  const owner = (Deno.env.get('GEMINI_OWNER_EMAIL') || '').trim().toLowerCase();
  const legacy = Deno.env.get('GEMINI_API_KEY');
  return legacy && owner && owner === email ? legacy : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const key = keyFor(emailOf(req));
  if (!key) return json({ error: 'Akun ini belum punya kunci Gemini sendiri (lihat supabase/SETUP-PASANGAN.md).', code: 'no_key' }, 403);
  let input: { image?: string; mime?: string; model?: string };
  try { input = await req.json(); } catch { return json({ error: 'Permintaan tidak valid.' }, 400); }
  const image = input.image ?? '', mime = input.mime ?? 'image/jpeg';
  if (!image || image.length > 7_000_000 || !/^image\/(jpeg|png|webp)$/.test(mime)) return json({ error: 'Foto tidak valid atau terlalu besar.' }, 400);
  const order = input.model && MODELS.includes(input.model) ? [input.model, ...MODELS.filter((m) => m !== input.model)] : MODELS;

  let last = '';
  for (const model of order) {
    let res = await ask(model, key, image, mime, true);
    if (res.status === 400) { const t = await res.text(); if (/thinking/i.test(t)) res = await ask(model, key, image, mime, false); else { last = t; break; } }
    if (res.status === 429 || res.status >= 500) { last = `${model}: ${res.status}`; continue; } // quota or busy → next model
    if (!res.ok) { last = await res.text(); break; }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
    try {
      return json({ model, receipt: JSON.parse(text), usage: data?.usageMetadata ?? null });
    } catch { last = `${model}: jawaban bukan JSON`; continue; }
  }
  const quota = /429/.test(last);
  return json({ error: quota ? 'Kuota harian Gemini habis untuk hari ini.' : 'Gemini tidak dapat membaca struk saat ini.', detail: last.slice(0, 300) }, quota ? 429 : 502);
});
