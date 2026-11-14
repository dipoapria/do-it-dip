// OCR lab: generate synthetic receipt photos, read them with the app's pipeline, score against ground truth.
// Open /tools/ocr-lab/ on the dev server. Query: ?n=4 (per template & difficulty) &d=easy,medium,hard &pipe=new|old &seed=1 &w=4 &t=indomaret,kafe
import { createScheduler, createWorker } from 'tesseract.js';
import { makeSample, rng, TEMPLATES, type Diff, type TemplateName, type Truth } from './gen.ts';
import { photoParams, photograph, renderReceipt, toJpeg } from './render.ts';
import { score, type Score } from './score.ts';
import { cleanText, preprocess } from '../../src/ocr.ts';
import { parseReceipt } from '../../src/receipt.ts';

const q = new URLSearchParams(location.search);
const N = Number(q.get('n') || 2), SEED = Number(q.get('seed') || 1), WORKERS = Number(q.get('w') || 4), PIPE = q.get('pipe') || 'new';
const DIFFS = (q.get('d') || 'easy,medium,hard,extreme').split(',') as Diff[];
const TPLS = (q.get('t') || Object.keys(TEMPLATES).join(',')).split(',') as TemplateName[];
const TODAY = '2026-11-14';
const $ = (id: string) => document.getElementById(id)!;
const status = (s: string) => { $('status').textContent = s; (window as any).__lab.status = s; };

interface Row { truth: Truth; score: Score; ms: number; text: string; pred: { total: number | null; items: { name: string; amount: number }[] }; img: string; conf?: string; passes?: number }
(window as any).__lab = { status: 'start', rows: [] as Row[], summary: null, done: false };

async function main() {
  const cases: { truth: Truth; blob: Blob }[] = [];
  let k = 0;
  for (const d of DIFFS) for (const t of TPLS) for (let i = 0; i < N; i++) {
    const seed = SEED * 1000 + k++;
    const s = makeSample(seed, d, t), r = rng(seed * 31 + 7);
    const photo = photograph(renderReceipt(s, r), photoParams(d, r), r);
    cases.push({ truth: s.truth, blob: await toJpeg(photo, d === 'extreme' ? 0.6 : d === 'hard' ? 0.75 : 0.85) });
    status(`Membuat struk ${cases.length}…`);
  }
  if (q.get('show')) { await showPrep(cases); return; }
  status(`Menyiapkan ${WORKERS} pembaca…`);
  // one scheduler per page-segmentation mode (Tesseract parameters are per worker)
  const scheds: Record<string, ReturnType<typeof createScheduler>> = {};
  for (const psm of PIPE === 'new' ? ['6', '4'] : [q.get('psm') || '6']) {
    const sc = createScheduler();
    for (let i = 0; i < (psm === '6' ? WORKERS : Math.max(1, WORKERS >> 1)); i++) {
      const w = await createWorker('ind', 1);
      await w.setParameters({ tessedit_pageseg_mode: psm as never, preserve_interword_spaces: '1' });
      sc.addWorker(w);
    }
    scheds[psm] = sc;
  }
  const ocr = async (img: Blob | HTMLCanvasElement, psm = '6') => (await scheds[psm in scheds ? psm : '6'].addJob('recognize', img as never, {}, { blocks: true, text: true })).data as any;
  const scan = PIPE === 'new' ? (await import('../../src/scan.ts')).scanReceipt : null;
  const PITCH = q.get('pitch') ? Number(q.get('pitch')) : undefined;
  let done = 0;
  const rows: Row[] = await Promise.all(cases.map(async (c) => {
    const t0 = performance.now();
    let pred: Row['pred'], text = '', conf: string | undefined, passes: number | undefined;
    if (scan) {
      const out = await scan(c.blob, TODAY, () => {}, { ocr, pitch: PITCH });
      pred = { total: out.result.total, items: out.result.items }; text = out.result.lines.join('\n'); conf = out.result.confidence; passes = out.passes;
    } else {
      const data = await ocr(await preprocess(c.blob));
      text = cleanText(data) || data.text || '';
      const res = parseReceipt(text, TODAY);
      pred = { total: res.total, items: res.items };
    }
    const row: Row = { truth: c.truth, score: score(c.truth, pred), ms: performance.now() - t0, text, pred, img: URL.createObjectURL(c.blob), conf, passes };
    status(`Membaca ${++done}/${cases.length}…`);
    return row;
  }));
  for (const sc of Object.values(scheds)) await sc.terminate();
  (window as any).__lab.rows = rows;
  const summary = summarize(rows);
  (window as any).__lab.summary = summary;
  render(rows, summary);
  status(`Selesai: ${rows.length} struk, pipeline ${PIPE}`);
  (window as any).__lab.done = true;
}

/** ?show=1: show each photo next to the cleaned image the scanner feeds to OCR (no OCR run). */
async function showPrep(cases: { truth: Truth; blob: Blob }[]) {
  const ip = await import('../../src/imgproc.ts'), { prepare } = await import('../../src/scan.ts');
  const html: string[] = [];
  for (const c of cases) {
    const bmp = await createImageBitmap(c.blob), cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
    const g = cv.getContext('2d')!; g.drawImage(bmp, 0, 0);
    const raw = ip.fromRGBA(g.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height);
    const p = prepare(raw, q.get('pitch') ? Number(q.get('pitch')) : undefined);
    const oc = document.createElement('canvas'); oc.width = p.img.w; oc.height = p.img.h;
    oc.getContext('2d')!.putImageData(new ImageData(ip.toRGBA(p.img), p.img.w, p.img.h), 0, 0);
    html.push(`<div class="case"><b>${c.truth.id}</b> · sudut ${p.angle}° · ${p.cropped ? 'dipotong' : 'tidak dipotong'} · jarak baris ${p.pitch}px · skala ${p.scale.toFixed(2)} · ${p.img.w}×${p.img.h}<div style="display:flex;gap:6px"><img src="${URL.createObjectURL(c.blob)}" style="width:50%"><img src="${oc.toDataURL('image/jpeg', 0.8)}" style="width:50%;background:#fff"></div></div>`);
  }
  $('cases').innerHTML = html.join('');
  status('Tampilan pra-proses');
  (window as any).__lab.done = true;
}

function agg(rs: Row[]) {
  const n = rs.length, it = rs.reduce((s, r) => s + r.score.itemsTrue, 0);
  return {
    n,
    total: rs.filter((r) => r.score.totalOk).length / n,
    items: rs.reduce((s, r) => s + r.score.itemsRight, 0) / Math.max(1, it),
    prices: rs.reduce((s, r) => s + r.score.pricesRight, 0) / Math.max(1, it),
    junk: rs.reduce((s, r) => s + r.score.junk, 0) / n,
    perfect: rs.filter((r) => r.score.perfect).length / n,
    sec: rs.reduce((s, r) => s + r.ms, 0) / n / 1000,
  };
}
function summarize(rows: Row[]) {
  const by = (key: (r: Row) => string) => Object.fromEntries([...new Set(rows.map(key))].map((k) => [k, agg(rows.filter((r) => key(r) === k))]));
  return { all: agg(rows), byDiff: by((r) => r.truth.difficulty), byTemplate: by((r) => r.truth.template) };
}
const pc = (x: number) => (x * 100).toFixed(0) + '%';
function table(title: string, o: Record<string, ReturnType<typeof agg>>) {
  return `<h3>${title}</h3><table><tr><th></th><th>n</th><th>Total benar</th><th>Produk benar</th><th>Harga benar</th><th>Sampah/struk</th><th>Sempurna</th><th>Detik</th></tr>${Object.entries(o).map(([k, a]) => `<tr><td>${k}</td><td>${a.n}</td><td>${pc(a.total)}</td><td>${pc(a.items)}</td><td>${pc(a.prices)}</td><td>${a.junk.toFixed(2)}</td><td>${pc(a.perfect)}</td><td>${a.sec.toFixed(1)}</td></tr>`).join('')}</table>`;
}
function render(rows: Row[], s: ReturnType<typeof summarize>) {
  $('summary').innerHTML = table('Semua', { semua: s.all }) + table('Per kesulitan', s.byDiff) + table('Per jenis struk', s.byTemplate);
  $('cases').innerHTML = rows.filter((r) => !r.score.perfect).map((r) => `<div class="case"><img src="${r.img}"><b>${r.truth.id}</b> ${r.conf ? `· ${r.conf}` : ''}
    <div class="${r.score.totalOk ? 'ok' : 'bad'}">total ${r.pred.total} / benar ${r.truth.total}</div>
    ${r.score.missing.length ? `<div class="bad">hilang: ${r.score.missing.join('; ')}</div>` : ''}${r.score.extra.length ? `<div class="bad">sampah: ${r.score.extra.join('; ')}</div>` : ''}
    <pre>${r.text.replace(/</g, '&lt;')}</pre></div>`).join('');
}
main().catch((e) => { status('Error: ' + (e?.message || e)); console.error(e); });
