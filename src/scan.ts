// Receipt scanner: photo → cleaned image → OCR (several ways if needed) → items, prices, total.
// Each reading is checked with the receipt's own arithmetic (items vs total vs cash − change); the scanner stops
// as soon as a reading adds up, otherwise it keeps the best of the attempts and reports how sure it is.
import { cleanText } from './ocr.ts';
import * as ip from './imgproc.ts';
import { parseReceipt, type ReceiptResult } from './receipt.ts';

export interface OcrWord { text: string; confidence: number }
export interface OcrData { text?: string; confidence?: number; blocks?: { paragraphs: { lines: { words: OcrWord[] }[] }[] }[] | null }
export type OcrFn = (img: HTMLCanvasElement, psm: '4' | '6') => Promise<OcrData>;
export interface ScanOut { result: ReceiptResult; passes: number; text: string; angle: number; cropped: boolean }
type Progress = (p: number, label: string) => void;

/** Text line pitch (px) that Tesseract reads best: letters about 30 px tall. */
export const TARGET_PITCH = 48;

async function loadGray(file: Blob, maxSide = 2600): Promise<ip.Gray> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  return ip.fromRGBA(g.getImageData(0, 0, w, h).data, w, h);
}
function toCanvas(g: ip.Gray): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = g.w; c.height = g.h;
  c.getContext("2d")!.putImageData(new ImageData(ip.toRGBA(g) as Uint8ClampedArray<ArrayBuffer>, g.w, g.h), 0, 0);
  return c;
}

/** Crop to the paper, straighten, even out the light, and scale so text lines are TARGET_PITCH apart. */
export function prepare(g: ip.Gray, pitchTarget = TARGET_PITCH) {
  const box = ip.paperBox(g);
  const cropped = box ? ip.crop(g, box) : g;
  // everything that is not paper (table, a thumb) becomes white, so OCR does not read it as "|", "j" or "1" and the
  // skew/line measurements see only ink. The mask is shrunk just enough to drop the dark band that shadow
  // correction leaves at the paper edge, but not so much that right-aligned prices are cut.
  let work = ip.flatten(cropped);
  if (box) work = ip.whitenOutside(work, ip.paperMask(cropped, 0.006));
  const angle = ip.deskewAngle(work);
  if (Math.abs(angle) >= 0.4) work = ip.rotate(work, angle);
  const pitch = ip.linePitch(ip.crop(work, { x: work.w * 0.12, y: 0, w: work.w * 0.76, h: work.h }));
  // unknown pitch: assume a ~40-character receipt line across the paper width
  let scale = pitch ? pitchTarget / pitch : (1100 / work.w);
  scale = Math.max(0.35, Math.min(3, scale));
  if (work.w * scale * work.h * scale > 9e6) scale = Math.sqrt(9e6 / (work.w * work.h));
  const out = Math.abs(scale - 1) > 0.05 ? ip.resize(work, work.w * scale, work.h * scale) : work;
  return { img: out, angle, cropped: !!box, pitch, scale };
}

const rank = (r: ReceiptResult) => ({ high: 3, medium: 2, low: 1 }[r.confidence]) * 100 + (r.total ? 20 : 0) + Math.min(r.items.length, 15);

export async function scanReceipt(file: Blob, today: string, onProgress: Progress, opts: { ocr: OcrFn; pitch?: number }): Promise<ScanOut> {
  onProgress(0.05, 'Merapikan foto…');
  const raw = await loadGray(file);
  const prep = prepare(raw, opts.pitch);
  const base = toCanvas(prep.img);
  // attempts, cheapest and most often right first
  const attempts: [string, () => HTMLCanvasElement, '4' | '6'][] = [
    ['rapi', () => base, '6'],
    ['hitam-putih', () => toCanvas(ip.sauvola(prep.img, Math.max(8, Math.round(TARGET_PITCH * 0.45)), 0.18)), '6'],
    ['kolom', () => base, '4'],
    ['asli', () => toCanvas(ip.flatten(ip.resize(raw, raw.w * Math.min(1, 1800 / Math.max(raw.w, raw.h)), raw.h * Math.min(1, 1800 / Math.max(raw.w, raw.h))))), '6'],
  ];
  let best: { r: ReceiptResult; text: string } | null = null, passes = 0;
  for (const [, make, psm] of attempts) {
    passes++;
    onProgress(0.15 + (passes - 1) * 0.2, passes === 1 ? 'Membaca isi struk…' : 'Memeriksa ulang dengan cara lain…');
    const data = await opts.ocr(make(), psm);
    const text = cleanText(data as never) || data.text || '';
    const r = parseReceipt(text, today);
    if (!best || rank(r) > rank(best.r)) best = { r, text };
    if (best.r.confidence === 'high') break;
  }
  onProgress(1, 'Selesai');
  return { result: best!.r, passes, text: best!.text, angle: prep.angle, cropped: prep.cropped };
}

/** Default OCR for the app: one Tesseract worker for all attempts of a scan. */
export async function scanWithTesseract(file: Blob, today: string, onProgress: Progress): Promise<ScanOut> {
  onProgress(0.02, 'Menyiapkan pembaca teks…');
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('ind', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status !== 'recognizing text') onProgress(Math.min(0.12, 0.02 + m.progress * 0.1), /language|traineddata/i.test(m.status) ? 'Mengunduh data bahasa (sekali saja)…' : 'Menyiapkan pembaca teks…');
    },
  });
  let psmNow = '';
  try {
    return await scanReceipt(file, today, onProgress, {
      ocr: async (img, psm) => {
        if (psm !== psmNow) { await worker.setParameters({ tessedit_pageseg_mode: psm as never, preserve_interword_spaces: '1' }); psmNow = psm; }
        return (await worker.recognize(img, {}, { blocks: true, text: true })).data as unknown as OcrData;
      },
    });
  } finally {
    await worker.terminate();
  }
}
