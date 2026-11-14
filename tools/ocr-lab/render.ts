// Draws a synthetic receipt like a thermal printer would, then "photographs" it the way a phone does:
// background, rotation, perspective, uneven light, blur, noise, faded ink, creases, a thumb, JPEG.
import type { Diff, Rng, Sample } from './gen.ts';

const FONTS = ['Consolas', 'Courier New', 'Lucida Console', 'Cascadia Mono', 'Ubuntu Mono', 'monospace'];

export function renderReceipt(s: Sample, r: Rng): HTMLCanvasElement {
  const paperW = s.width >= 42 ? 576 : r.chance(0.5) ? 384 : 432; // 80 mm or 58 mm thermal at ~203 dpi
  const font = r.pick(FONTS), bold = r.chance(0.35);
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = `${bold ? 'bold ' : ''}20px "${font}"`;
  const charW = probe.measureText('M'.repeat(20)).width / 20;
  const margin = Math.round(paperW * r.range(0.03, 0.06));
  const size = Math.max(11, Math.min(26, ((paperW - 2 * margin) / s.width / charW) * 20));
  const lh = size * r.range(1.15, 1.4);
  const H = Math.round(margin * 2 + lh * (s.lines.length + 2) + r.int(10, 60));
  const c = document.createElement('canvas'); c.width = paperW; c.height = H;
  const g = c.getContext('2d')!;
  const paper = r.pick(['#fbfaf6', '#f6f4ee', '#f2f1ec', '#faf7ef', '#eeeeea']);
  g.fillStyle = paper; g.fillRect(0, 0, paperW, H);
  const ink = r.pick(['#141414', '#1f1f22', '#2a2a2e', '#333336']);
  let y = margin + lh;
  for (const line of s.lines) {
    const sz = line.big ? size * 1.35 : size;
    g.font = `${bold || line.bold ? 'bold ' : ''}${sz}px "${font}"`;
    g.fillStyle = ink; g.textBaseline = 'alphabetic';
    const w = g.measureText(line.text).width;
    const x = line.align === 'c' ? (paperW - w) / 2 : margin;
    // big headers on real receipts are often wider than the paper allows: squeeze rather than clip
    if (w > paperW - margin * 2) { g.save(); g.translate(margin, y); g.scale((paperW - margin * 2) / w, 1); g.fillText(line.text, 0, 0); g.restore(); }
    else g.fillText(line.text, x, y);
    y += line.big ? lh * 1.3 : lh;
  }
  return c;
}

export interface PhotoParams {
  rot: number; keystone: number; blur: number; noise: number; fade: number; shadow: number; glare: boolean;
  creases: number; thumb: boolean; fill: number; jpeg: number; bg: string; longSide: number; streaks: number;
}
export function photoParams(d: Diff, r: Rng): PhotoParams {
  const P: Record<Diff, () => PhotoParams> = {
    easy: () => ({ rot: r.range(-2, 2), keystone: r.range(0, 0.02), blur: r.range(0, 0.5), noise: r.range(2, 5), fade: r.range(0, 0.1), shadow: r.range(0, 0.15), glare: false, creases: 0, thumb: false, fill: r.range(0.8, 0.92), jpeg: 0.9, bg: r.pick(['wood', 'dark', 'gray']), longSide: 2400, streaks: 0 }),
    medium: () => ({ rot: r.range(-5, 5), keystone: r.range(0.02, 0.05), blur: r.range(0.4, 0.9), noise: r.range(4, 8), fade: r.range(0.08, 0.25), shadow: r.range(0.15, 0.35), glare: r.chance(0.3), creases: r.int(0, 2), thumb: r.chance(0.3), fill: r.range(0.7, 0.88), jpeg: 0.85, bg: r.pick(['wood', 'dark', 'gray', 'light']), longSide: 2200, streaks: r.int(0, 1) }),
    hard: () => ({ rot: r.range(-9, 9), keystone: r.range(0.04, 0.09), blur: r.range(0.9, 1.4), noise: r.range(8, 13), fade: r.range(0.25, 0.42), shadow: r.range(0.3, 0.5), glare: r.chance(0.5), creases: r.int(1, 4), thumb: r.chance(0.6), fill: r.range(0.6, 0.8), jpeg: 0.75, bg: r.pick(['wood', 'dark', 'gray', 'light', 'fabric']), longSide: 2000, streaks: r.int(0, 2) }),
    extreme: () => ({ rot: r.range(-14, 14), keystone: r.range(0.08, 0.14), blur: r.range(1.6, 2.3), noise: r.range(13, 20), fade: r.range(0.45, 0.6), shadow: r.range(0.45, 0.65), glare: true, creases: r.int(3, 6), thumb: true, fill: r.range(0.5, 0.7), jpeg: 0.6, bg: r.pick(['light', 'fabric', 'wood']), longSide: 1600, streaks: r.int(1, 3) }),
  };
  return P[d]();
}

function background(g: CanvasRenderingContext2D, w: number, h: number, kind: string, r: Rng) {
  const grad = g.createLinearGradient(0, 0, w, h);
  const C: Record<string, [string, string]> = { wood: ['#7a5232', '#4f3320'], dark: ['#2a2d31', '#15171a'], gray: ['#8d9298', '#5b6066'], light: ['#d9d6cf', '#bdb8ae'], fabric: ['#3e5a7a', '#24384f'] };
  const [a, b] = C[kind] || C.dark;
  grad.addColorStop(0, a); grad.addColorStop(1, b);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  if (kind === 'wood') { g.globalAlpha = 0.12; for (let i = 0; i < 40; i++) { g.strokeStyle = r.chance(0.5) ? '#2b1a0e' : '#a8774c'; g.lineWidth = r.range(1, 6); g.beginPath(); const y0 = r.range(0, h); g.moveTo(0, y0); g.bezierCurveTo(w / 3, y0 + r.range(-40, 40), (2 * w) / 3, y0 + r.range(-40, 40), w, y0 + r.range(-30, 30)); g.stroke(); } g.globalAlpha = 1; }
}

/** Faded thermal paper: lighter vertical bands (worn print head) and an overall lighter ink. */
function fadeInk(src: HTMLCanvasElement, fade: number, streaks: number, r: Rng) {
  const g = src.getContext('2d')!;
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = `rgba(255,255,255,${fade * 0.55})`; g.fillRect(0, 0, src.width, src.height);
  for (let i = 0; i < streaks; i++) { const x = r.range(0, src.width), w = r.range(8, 40); g.fillStyle = `rgba(255,255,255,${r.range(0.2, 0.45)})`; g.fillRect(x, 0, w, src.height); }
  g.globalCompositeOperation = 'source-over';
}

export function photograph(receipt: HTMLCanvasElement, p: PhotoParams, r: Rng): HTMLCanvasElement {
  fadeInk(receipt, p.fade, p.streaks, r);
  // creases: soft dark/light lines across the paper
  const rg = receipt.getContext('2d')!;
  for (let i = 0; i < p.creases; i++) {
    const y = r.range(0, receipt.height), dy = r.range(-40, 40);
    rg.strokeStyle = r.chance(0.5) ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.35)'; rg.lineWidth = r.range(2, 6);
    rg.beginPath(); rg.moveTo(0, y); rg.lineTo(receipt.width, y + dy); rg.stroke();
  }
  // perspective (keystone): draw row strips narrower at the top
  const kw = receipt.width, kh = receipt.height, ks = document.createElement('canvas');
  ks.width = kw; ks.height = kh;
  const kg = ks.getContext('2d')!;
  const topNarrow = r.chance(0.5);
  for (let y = 0; y < kh; y += 2) {
    const t = y / kh, s = 1 - p.keystone * (topNarrow ? 1 - t : t), w = kw * s;
    kg.drawImage(receipt, 0, y, kw, 2, (kw - w) / 2, y, w, 2);
  }
  // compose the photo
  const aspect = 3 / 4, H = p.longSide, W = Math.round(H * aspect);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d')!;
  background(g, W, H, p.bg, r);
  const scale = Math.min((W * p.fill) / kw, (H * 0.95) / kh);
  g.save();
  g.translate(W / 2 + r.range(-0.04, 0.04) * W, H / 2 + r.range(-0.02, 0.02) * H);
  g.rotate((p.rot * Math.PI) / 180);
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 18; g.shadowOffsetY = 6;
  g.imageSmoothingQuality = 'high';
  g.drawImage(ks, (-kw * scale) / 2, (-kh * scale) / 2, kw * scale, kh * scale);
  g.restore();
  // uneven light: a soft shadow from one side + optional glare
  const sx = r.range(0, W), sy = r.range(0, H);
  const sh = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, H) * r.range(0.5, 0.9));
  sh.addColorStop(0, `rgba(0,0,0,${p.shadow})`); sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  const lin = g.createLinearGradient(0, 0, r.chance(0.5) ? W : 0, H);
  lin.addColorStop(0, `rgba(0,0,0,${p.shadow * 0.6})`); lin.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lin; g.fillRect(0, 0, W, H);
  if (p.glare) { const gx = r.range(W * 0.2, W * 0.8), gy = r.range(H * 0.2, H * 0.8), gl = g.createRadialGradient(gx, gy, 0, gx, gy, W * r.range(0.15, 0.3)); gl.addColorStop(0, 'rgba(255,255,255,0.45)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fillRect(0, 0, W, H); }
  if (p.thumb) { // a thumb holding the receipt at its side edge
    const left = r.chance(0.5), tx = left ? W / 2 - (kw * scale) / 2 - 20 : W / 2 + (kw * scale) / 2 + 20, ty = r.range(H * 0.3, H * 0.85);
    g.save(); g.translate(tx, ty); g.rotate(left ? 0.5 : -0.5); g.fillStyle = r.pick(['#c58c66', '#a8714f', '#d9a37f']);
    g.beginPath(); g.ellipse(0, 0, W * 0.07, W * 0.13, 0, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // blur, then sensor noise
  const fin = document.createElement('canvas'); fin.width = W; fin.height = H;
  const fg = fin.getContext('2d', { willReadFrequently: true })!;
  fg.filter = p.blur > 0.05 ? `blur(${p.blur.toFixed(2)}px)` : 'none';
  fg.drawImage(out, 0, 0); fg.filter = 'none';
  const img = fg.getImageData(0, 0, W, H), d = img.data, n = p.noise;
  for (let i = 0; i < d.length; i += 4) { const e = (r.next() + r.next() + r.next() - 1.5) * n; d[i] += e; d[i + 1] += e; d[i + 2] += e; }
  fg.putImageData(img, 0, 0);
  return fin;
}

export async function toJpeg(c: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', q));
}
