// Read a bank statement file into rows (CSV / Excel) or text lines (PDF). Everything stays on the device.
import { parseCSV } from './statement.ts';

export type Extracted = { kind: 'rows'; rows: unknown[][] } | { kind: 'lines'; lines: string[] };

/** Thrown when a PDF statement is password protected (bank e-statements often are). */
export class NeedPassword extends Error {
  constructor(public wrong: boolean) { super(wrong ? 'Kata sandi salah' : 'File dikunci kata sandi'); }
}

export async function extract(file: File, password?: string, onProgress?: (p: number, label: string) => void): Promise<Extracted> {
  const name = file.name.toLowerCase();
  // Screenshot of the bank app's transaction history (for banks without a downloadable statement, e.g. Bank Sumsel Babel).
  if (file.type.startsWith('image/') || /\.(png|jpe?g|heic|webp)$/.test(name)) {
    const { preprocess, recognize } = await import('./ocr.ts');
    const text = await recognize(await preprocess(file), onProgress || (() => {}));
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) throw new Error('Tangkapan layar tidak terbaca. Pastikan gambarnya tajam dan berisi daftar transaksi.');
    return { kind: 'lines', lines };
  }
  if (name.endsWith('.csv') || name.endsWith('.txt') || file.type === 'text/csv') return { kind: 'rows', rows: parseCSV(await file.text()) };
  if (name.endsWith('.xlsx') || file.type.includes('spreadsheetml')) {
    const { default: readExcel } = await import('read-excel-file/browser');
    const sheets = (await readExcel(file)) as unknown as { data: unknown[][] }[];
    return { kind: 'rows', rows: sheets.flatMap((s) => s.data) };
  }
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return { kind: 'lines', lines: await pdfLines(file, password) };
  if (name.endsWith('.xls')) throw new Error('Format .xls lama belum didukung. Buka di Excel lalu simpan sebagai .xlsx atau CSV.');
  throw new Error('Format file belum didukung. Gunakan CSV, Excel (.xlsx), PDF, atau tangkapan layar.');
}

async function pdfLines(file: File, password?: string): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password }).promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err?.name === 'PasswordException') throw new NeedPassword(err.code === 2);
    throw new Error('PDF gagal dibuka. Pastikan file tidak rusak.');
  }
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // Group text pieces into visual lines by their vertical position, then order left to right.
    const rows: { y: number; parts: { x: number; s: string; w: number }[] }[] = [];
    for (const it of content.items as { str: string; transform: number[]; width: number }[]) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      let row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, s: it.str, w: it.width });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x);
      let line = '', end = -Infinity;
      for (const part of r.parts) { line += (line && part.x - end > 1.5 ? ' ' : '') + part.s; end = part.x + part.w; }
      lines.push(line.replace(/\s+/g, ' ').trim());
    }
  }
  await doc.cleanup?.();
  if (!lines.some((l) => /\d/.test(l))) throw new Error('PDF ini berupa gambar hasil pindaian, jadi teksnya tidak bisa dibaca. Unduh mutasi dalam format CSV/Excel, atau e-statement PDF asli dari bank.');
  return lines;
}
