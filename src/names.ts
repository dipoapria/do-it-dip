// Tidy product names from receipts (AI or OCR): readable capitals, consistent units, quantity tag.

const UNIT: Record<string, string> = { g: 'gr', gr: 'gr', grm: 'gr', gram: 'gr', ml: 'ml', kg: 'kg', l: 'L', lt: 'L', ltr: 'L', liter: 'L', litre: 'L' };
const NUM = String.raw`\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?`;

/** Sizes with a space and one spelling per unit: "127G" → "127 gr", "200ML" → "200 ml", "2L" → "2 L", "525/510gr" → "525/510 gr". */
export function tidyUnits(name: string): string {
  return name
    // "JMB127G" → "JMB 127G": a size glued to a word
    .replace(new RegExp(String.raw`(\p{L})(${NUM}\s*(?:gram|grm|gr|g|ml|kg|liter|litre|ltr|lt|l)\b)`, 'giu'), '$1 $2')
    .replace(new RegExp(String.raw`(${NUM})\s*(gram|grm|gr|g|ml|kg|liter|litre|ltr|lt|l)\b`, 'gi'), (_m, n: string, u: string) => `${n.replace(/\s*\/\s*/, '/')} ${UNIT[u.toLowerCase()]}`)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Mostly capitals ("SO KLIN LIQ KOREAN 525/510GR") → Title Case; names already written normally are kept. */
export function niceName(n: string): string {
  const letters = n.replace(/[^A-Za-z]/g, ''), upper = n.replace(/[^A-Z]/g, '');
  const cased = letters.length && upper.length / letters.length < 0.7 ? n : n.toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
  return tidyUnits(cased.trim());
}

/** "(3 pcs)" for 3 pieces, nothing for 1, "(1,024 kg)" for a weighed item. */
export function qtyTag(q?: number): string {
  if (!q) return '';
  if (Number.isInteger(q)) return q > 1 ? ` (${q} pcs)` : '';
  return ` (${String(q).replace('.', ',')} kg)`;
}

/** The name shown in the product list: tidied, with the quantity in brackets. */
export const productLabel = (name: string, qty?: number) => niceName(name) + qtyTag(qty);

/** Shop name as a title: "LOTTE Grosir" → "Lotte Grosir", "INDOMARET" → "Indomaret"; short all-caps words (KFC, BCA) stay. */
export function shopName(s: string): string {
  return s.replace(/\s+/g, ' ').trim().split(' ')
    .map((w) => (/^[A-Z]{4,}$/.test(w) ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ');
}

/**
 * The transaction title (note) for a receipt:
 *   1 product                → its name                          "Aqua Botol 600 ml"
 *   several, shop known      → "Belanja <shop> · n produk"        (restaurants: "Makan di <shop> · n produk")
 *   several, shop unknown    → first two names "+ the rest"       "Indomie Goreng…, Roma Kelapa… +6"
 */
export function receiptTitle(items: { name: string }[], shop = '', cat = ''): string {
  const names = items.map((it) => niceName(it.name).replace(/\s\([\d,.]+ (pcs|kg)\)$/, '')).filter(Boolean);
  const cut = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  if (names.length === 1) return cut(names[0]);
  const store = shopName(shop);
  if (names.length > 1 && store) return cut(`${cat === 'makan' ? 'Makan di' : 'Belanja'} ${cut(store, 32)} · ${names.length} produk`);
  if (!names.length) return store ? cut(`${cat === 'makan' ? 'Makan di' : 'Belanja'} ${store}`) : 'Belanja';
  const short = (s: string) => cut(s, 26);
  return cut(`${short(names[0])}, ${short(names[1])}${names.length > 2 ? ` +${names.length - 2}` : ''}`);
}
