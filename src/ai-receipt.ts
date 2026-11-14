// Receipt reading with Gemini (via the read-receipt Edge Function), turned into the same result the on-device OCR
// gives, so the app shows both the same way. The OCR scanner (scan.ts) stays as the offline / backup reader.
import * as ip from './imgproc.ts';
import { addDays } from './format.ts';
import { STORES, type Confidence, type ReceiptResult } from './receipt.ts';

export interface AiReceipt {
  items?: { name?: string; qty?: number | null; price?: number }[];
  discount?: number | null; fees?: number | null; total?: number | null;
  date?: string | null; payment?: string | null; store?: string | null;
}
type Progress = (p: number, label: string) => void;
export type ReadFn = (image: string, mime: string, model?: string) => Promise<{ model: string; receipt: unknown }>;

const PAYS = ['cash', 'card', 'qris', 'gopay', 'ovo', 'dana', 'shopeepay', 'linkaja'];

/** Gemini's JSON → ReceiptResult. Sure ("high") only when products − discount + fees equal the printed total. */
export function fromAi(a: AiReceipt, today: string, model = ''): ReceiptResult & { model: string } {
  const items = (a.items ?? [])
    .map((it) => ({ name: String(it.name ?? '').replace(/^\s*\d{3}[\s.]+/, '').trim(), amount: Math.round(Number(it.price) || 0), qty: typeof it.qty === 'number' && it.qty > 1 && Number.isInteger(it.qty) ? it.qty : undefined }))
    .filter((it) => it.name && it.amount > 0)
    .map((it) => (it.qty ? it : { name: it.name, amount: it.amount }));
  const discount = Math.abs(Math.round(Number(a.discount) || 0)), fees = Math.abs(Math.round(Number(a.fees) || 0));
  const total = a.total && a.total > 0 ? Math.round(a.total) : null;
  const sum = items.reduce((s, it) => s + it.amount, 0);
  const adds = total !== null && items.length > 0 && Math.abs(sum - discount + fees - total) <= 1;
  const confidence: Confidence = adds ? 'high' : total !== null ? 'medium' : 'low';
  // date: a real date within the last ~13 months, never in the future
  let date: string | null = null;
  if (a.date && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && !isNaN(Date.parse(a.date)) && a.date <= today && a.date >= addDays(today, -400)) date = a.date;
  const storeName = (a.store ?? '').trim();
  const known = STORES.find(([re]) => re.test(storeName));
  const pay = a.payment && PAYS.includes(a.payment) ? a.payment : null;
  return {
    merchant: known ? known[1] : storeName, storeCat: known ? { cat: known[2], sub: known[3] } : null,
    total: total ?? (sum ? sum - discount + fees : null), subtotal: sum || null, date, items, pay, confidence,
    lines: [`Dibaca oleh ${model || 'Gemini'}`, ...items.map((it) => `${it.name}  ${it.amount}`), `Diskon ${discount}`, `Biaya ${fees}`, `Total ${total ?? '-'}`], model,
  };
}

/** Photo → JPEG cropped to the paper and capped in size (fewer bytes to upload; the text stays sharp). */
export async function prepareImage(file: Blob): Promise<{ data: string; mime: string }> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const s0 = Math.min(1, 2600 / Math.max(bmp.width, bmp.height));
  const W = Math.round(bmp.width * s0), H = Math.round(bmp.height * s0);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, W, H); bmp.close?.();
  const box = ip.paperBox(ip.paperness(g.getImageData(0, 0, W, H).data, W, H));
  const b = box ?? { x: 0, y: 0, w: W, h: H };
  // long receipts: keep the width readable (≥ 900 px when possible), cap the long side at 2400 px
  const s = Math.min(1, 2400 / Math.max(b.w, b.h));
  const out = document.createElement('canvas'); out.width = Math.round(b.w * s); out.height = Math.round(b.h * s);
  out.getContext('2d')!.drawImage(c, b.x, b.y, b.w, b.h, 0, 0, out.width, out.height);
  const url = out.toDataURL('image/jpeg', 0.85);
  return { data: url.slice(url.indexOf(',') + 1), mime: 'image/jpeg' };
}

/**
 * Read with Gemini 3.5 Flash Lite; when its numbers do not add up, ask Gemini 3.1 Flash Lite for a second reading
 * and keep the one that adds up (one request for a clear receipt, two for a hard one).
 */
export async function readWithAI(file: Blob, today: string, onProgress: Progress, read: ReadFn): Promise<ReceiptResult & { model: string }> {
  onProgress(0.15, 'Menyiapkan foto…');
  const img = await prepareImage(file);
  onProgress(0.35, 'AI membaca struk…');
  const first = await read(img.data, img.mime);
  const r1 = fromAi(first.receipt as AiReceipt, today, first.model);
  if (r1.confidence === 'high') { onProgress(1, 'Selesai'); return r1; }
  onProgress(0.7, 'Memeriksa ulang dengan model kedua…');
  try {
    const other = first.model === 'gemini-3.1-flash-lite' ? 'gemini-3.5-flash-lite' : 'gemini-3.1-flash-lite';
    const second = await read(img.data, img.mime, other);
    const r2 = fromAi(second.receipt as AiReceipt, today, second.model);
    const rank = (r: ReceiptResult) => ({ high: 3, medium: 2, low: 1 }[r.confidence]) * 100 + r.items.length;
    onProgress(1, 'Selesai');
    return rank(r2) > rank(r1) ? r2 : r1;
  } catch {
    onProgress(1, 'Selesai');
    return r1;
  }
}
