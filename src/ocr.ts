// On-device text recognition for receipt photos (Tesseract.js, loaded only when needed).
// The first run downloads the recognizer and the Indonesian language data (a few MB) from a CDN;
// the service worker and Tesseract's own cache keep them for later, offline use.

/** Downscale, convert to greyscale and stretch contrast: faster and more accurate OCR on phone photos. */
export async function preprocess(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  let lo = 255, hi = 0;
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) { const v = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; g[p] = v; if (v < lo) lo = v; if (v > hi) hi = v; }
  const span = Math.max(1, hi - lo);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) { const v = ((g[p] - lo) / span) * 255; d[i] = d[i + 1] = d[i + 2] = v; }
  ctx.putImageData(img, 0, 0);
  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Foto gagal diproses'))), 'image/jpeg', 0.92));
}

interface OcrWord { text: string; confidence: number }
interface OcrData { blocks?: { paragraphs: { lines: { words: OcrWord[] }[] }[] }[] | null }
/**
 * Rebuild the text line by line, dropping low-confidence words at the start/end of a line: those are fingers,
 * table texture or the receipt edge read as letters ("ai TUNAI", "BAGS IT AIR MINERAL").
 */
const KEEP = /^(t[o0]tal|tuna[i1lt!]|cash|kembali|debit|qris|ppn|dpp|harga|jual|belanja|bayar)$/i;
export function cleanText(data: OcrData, minEdge = 20): string {
  if (!data.blocks?.length) return '';
  const out: string[] = [];
  const weak = (w: OcrWord) => w.confidence < minEdge && !KEEP.test(w.text.replace(/[^\p{L}\p{N}!]/gu, ''));
  for (const b of data.blocks) for (const p of b.paragraphs) for (const l of p.lines) {
    const words = l.words.filter((w) => w.text.trim());
    if (words.some((w) => w.confidence >= 60)) {
      while (words.length && weak(words[0])) words.shift();
      while (words.length && weak(words[words.length - 1])) words.pop();
    }
    if (words.length) out.push(words.map((w) => w.text).join(' '));
  }
  return out.join('\n');
}

export async function recognize(image: Blob, onProgress: (p: number, label: string) => void): Promise<string> {
  onProgress(0.02, 'Menyiapkan pembaca teks…');
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('ind', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress(0.35 + m.progress * 0.65, 'Membaca isi struk…');
      else onProgress(Math.min(0.35, 0.05 + m.progress * 0.3), /language|traineddata/i.test(m.status) ? 'Mengunduh data bahasa (sekali saja)…' : 'Menyiapkan pembaca teks…');
    },
  });
  try {
    // PSM 6 = "one uniform block of text". Tested on a real Indomaret photo: the default page segmentation
    // skipped the TOTAL and date lines entirely, block mode read them correctly.
    await worker.setParameters({ tessedit_pageseg_mode: '6' as never, preserve_interword_spaces: '1' });
    const { data } = await worker.recognize(image, {}, { blocks: true, text: true });
    return cleanText(data as unknown as OcrData) || data.text || '';
  } finally {
    await worker.terminate();
  }
}
