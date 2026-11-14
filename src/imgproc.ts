// Image clean-up for receipt photos, on plain greyscale arrays (no DOM), so it runs in the browser and in tests.
// Steps used by the scanner: find the paper, straighten it, even out the light, scale the text to the size
// Tesseract reads best, and optionally binarise.

export interface Gray { w: number; h: number; d: Uint8ClampedArray }
export interface Box { x: number; y: number; w: number; h: number }

export function fromRGBA(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const d = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; p < d.length; i += 4, p++) d[p] = (rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8;
  return { w, h, d };
}
/**
 * How paper-like each pixel is: bright and colourless. Receipt paper is white/grey even in shade, while tables,
 * fabric, pink placemats and fingers have colour, so this separates paper from background better than brightness.
 */
export function paperness(rgba: Uint8ClampedArray, w: number, h: number): Gray {
  const d = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; p < d.length; i += 4, p++) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    d[p] = ((r * 77 + g * 150 + b * 29) >> 8) - 1.6 * (mx - mn);
  }
  return { w, h, d };
}
/** Share of the dark (ink) pixels of `g` that lie outside `mask`: high means the mask would erase text. */
export function inkOutside(g: Gray, mask: Gray): number {
  let ink = 0, out = 0;
  for (let i = 0; i < g.d.length; i += 3) if (g.d[i] < 110) { ink++; if (!mask.d[i]) out++; }
  return ink ? out / ink : 0;
}
export function toRGBA(g: Gray): Uint8ClampedArray<ArrayBuffer> {
  const o = new Uint8ClampedArray(g.w * g.h * 4);
  for (let p = 0, i = 0; p < g.d.length; p++, i += 4) { o[i] = o[i + 1] = o[i + 2] = g.d[p]; o[i + 3] = 255; }
  return o;
}

/** Bilinear resize; when shrinking a lot, box-blur first so thin strokes are averaged, not skipped. */
export function resize(g: Gray, nw: number, nh: number): Gray {
  nw = Math.max(1, Math.round(nw)); nh = Math.max(1, Math.round(nh));
  const f = Math.min(g.w / nw, g.h / nh);
  const src = f > 2 ? boxBlur(g, Math.floor(f / 2)) : g;
  const d = new Uint8ClampedArray(nw * nh), sx = src.w / nw, sy = src.h / nh;
  for (let y = 0; y < nh; y++) {
    const fy = Math.min(src.h - 1, Math.max(0, (y + 0.5) * sy - 0.5)), y0 = Math.floor(fy), y1 = Math.min(src.h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < nw; x++) {
      const fx = Math.min(src.w - 1, Math.max(0, (x + 0.5) * sx - 0.5)), x0 = Math.floor(fx), x1 = Math.min(src.w - 1, x0 + 1), tx = fx - x0;
      const a = src.d[y0 * src.w + x0], b = src.d[y0 * src.w + x1], c = src.d[y1 * src.w + x0], e = src.d[y1 * src.w + x1];
      d[y * nw + x] = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + e * tx) * ty;
    }
  }
  return { w: nw, h: nh, d };
}

/** Separable box blur of radius r (running sums, O(n)). */
export function boxBlur(g: Gray, r: number): Gray {
  if (r < 1) return g;
  const { w, h } = g, tmp = new Float32Array(w * h), out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    let s = 0; const row = y * w;
    for (let x = -r; x <= r; x++) s += g.d[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = s / (2 * r + 1);
      s += g.d[row + Math.min(w - 1, x + r + 1)] - g.d[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / (2 * r + 1);
      s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return { w, h, d: out };
}

/** Grey-level max filter (dilation of the bright paper over the dark ink), separable square of radius r. */
export function maxFilter(g: Gray, r: number): Gray {
  const { w, h } = g, tmp = new Uint8ClampedArray(w * h), out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) if (g.d[y * w + k] > m) m = g.d[y * w + k]; tmp[y * w + x] = m; }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let m = 0; for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) if (tmp[k * w + x] > m) m = tmp[k * w + x]; out[y * w + x] = m; }
  return { w, h, d: out };
}

export function histogram(g: Gray): Uint32Array { const h = new Uint32Array(256); for (const v of g.d) h[v]++; return h; }
export function percentile(hist: Uint32Array, p: number): number {
  let total = 0; for (const c of hist) total += c;
  let acc = 0, target = total * p;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= target) return i; }
  return 255;
}
export function otsu(hist: Uint32Array): number {
  let total = 0, sum = 0;
  for (let i = 0; i < 256; i++) { total += hist[i]; sum += i * hist[i]; }
  let sumB = 0, wB = 0, best = 0, t = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

export function crop(g: Gray, b: Box): Gray {
  const x0 = Math.max(0, Math.round(b.x)), y0 = Math.max(0, Math.round(b.y));
  const w = Math.min(g.w - x0, Math.round(b.w)), h = Math.min(g.h - y0, Math.round(b.h));
  const d = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) d.set(g.d.subarray((y0 + y) * g.w + x0, (y0 + y) * g.w + x0 + w), y * w);
  return { w, h, d };
}

/**
 * The receipt is the largest bright region of the photo. Returns its bounding box (with a small margin) in
 * full-size pixels, or null when the paper fills the frame or cannot be told apart from the background.
 */
export function paperBox(g: Gray): Box | null {
  const s = Math.min(1, 220 / Math.max(g.w, g.h));
  const sm = boxBlur(resize(g, g.w * s, g.h * s), 2), { w, h } = sm;
  const t = otsu(histogram(sm));
  const lab = new Int32Array(w * h).fill(-1), stack: number[] = [];
  let best = { n: 0, x0: 0, y0: 0, x1: 0, y1: 0 };
  for (let p = 0; p < w * h; p++) {
    if (lab[p] !== -1 || sm.d[p] <= t) continue;
    let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    stack.push(p); lab[p] = p;
    while (stack.length) {
      const q = stack.pop()!, x = q % w, y = (q / w) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const nb = [x > 0 ? q - 1 : -1, x < w - 1 ? q + 1 : -1, y > 0 ? q - w : -1, y < h - 1 ? q + w : -1];
      for (const r of nb) if (r >= 0 && lab[r] === -1 && sm.d[r] > t) { lab[r] = p; stack.push(r); }
    }
    if (n > best.n) best = { n, x0, y0, x1, y1 };
  }
  const bw = best.x1 - best.x0 + 1, bh = best.y1 - best.y0 + 1;
  if (best.n < w * h * 0.06) return null;                 // nothing paper-like
  if (bw > w * 0.96 && bh > h * 0.96) return null;         // paper fills the frame (or background as bright as paper)
  const mx = Math.round(bw * 0.03) + 2, my = Math.round(bh * 0.015) + 2;
  const x0 = Math.max(0, best.x0 - mx), y0 = Math.max(0, best.y0 - my), x1 = Math.min(w - 1, best.x1 + mx), y1 = Math.min(h - 1, best.y1 + my);
  return { x: x0 / s, y: y0 / s, w: (x1 - x0 + 1) / s, h: (y1 - y0 + 1) / s };
}

/**
 * Where the paper is (255) and where it is not (0): table, fingers, the dark band at the paper edge. Found on a small
 * blurred copy (bright = paper), shrunk by `erode` (fraction of the short side) so the edge band is excluded.
 */
export function paperMask(g: Gray, erode = 0.012): Gray {
  const s = Math.min(1, 240 / Math.max(g.w, g.h));
  const sm = boxBlur(resize(g, g.w * s, g.h * s), 2), t = otsu(histogram(sm));
  let m: Gray = { w: sm.w, h: sm.h, d: sm.d.map((v) => (v > t ? 255 : 0)) as Uint8ClampedArray };
  // fill holes (dense text blocks can read darker than the threshold): close = dilate then erode
  const r = Math.max(1, Math.round(Math.min(sm.w, sm.h) * 0.02));
  m = maxFilter(m, r);
  const inv: Gray = { w: m.w, h: m.h, d: m.d.map((v) => 255 - v) as Uint8ClampedArray };
  const er = Math.max(0, r + Math.round(Math.min(sm.w, sm.h) * erode)); // erode < 0 grows the mask
  const shrunk = maxFilter(inv, er);
  const d = new Uint8ClampedArray(g.w * g.h);
  for (let y = 0; y < g.h; y++) {
    const sy = Math.min(sm.h - 1, Math.floor(y * s));
    for (let x = 0; x < g.w; x++) d[y * g.w + x] = 255 - shrunk.d[sy * sm.w + Math.min(sm.w - 1, Math.floor(x * s))];
  }
  return { w: g.w, h: g.h, d };
}
/** Paint everything outside the mask with the paper's own brightness, so shadow correction sees no dark border. */
export function fillOutside(g: Gray, mask: Gray): Gray {
  const h = new Uint32Array(256);
  for (let i = 0; i < g.d.length; i++) if (mask.d[i]) h[g.d[i]]++;
  const paper = percentile(h, 0.9), d = g.d.slice();
  for (let i = 0; i < d.length; i++) if (!mask.d[i]) d[i] = paper;
  return { w: g.w, h: g.h, d };
}
export function whitenOutside(g: Gray, mask: Gray): Gray {
  const d = g.d.slice();
  for (let i = 0; i < d.length; i++) if (!mask.d[i]) d[i] = 255;
  return { w: g.w, h: g.h, d };
}

/**
 * Even out shadows and gradients: estimate the paper brightness everywhere (max filter on a small copy, then blur)
 * and divide by it, so paper becomes white and ink stays dark wherever the light falls.
 */
export function flatten(g: Gray): Gray {
  const s = Math.min(1, 160 / Math.min(g.w, g.h)), sm = resize(g, g.w * s, g.h * s);
  const bgSmall = boxBlur(maxFilter(sm, Math.max(2, Math.round(Math.min(sm.w, sm.h) / 40))), 3);
  const bg = resize(bgSmall, g.w, g.h), d = new Uint8ClampedArray(g.w * g.h);
  for (let i = 0; i < d.length; i++) d[i] = Math.min(255, (g.d[i] * 245) / Math.max(24, bg.d[i]));
  const out = { w: g.w, h: g.h, d }, hist = histogram(out);
  const lo = percentile(hist, 0.005), hi = Math.max(lo + 40, percentile(hist, 0.6)); // most pixels are paper
  for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / (hi - lo)));
  return out;
}

/** Skew of the text lines in degrees (positive = lines go down to the right), from projection-profile sharpness. */
export function deskewAngle(g: Gray, maxDeg = 15): number {
  const s = Math.min(1, 700 / g.w), sm = resize(g, g.w * s, g.h * s), t = otsu(histogram(sm)); // ink = values <= t
  const xs: number[] = [], ys: number[] = [];
  // sample every row (skipping rows aliases with the 1-px bins and makes 0° look sharpest); thin out columns only
  const step = Math.max(1, Math.round((sm.w * sm.h) / 250000));
  for (let y = 0; y < sm.h; y++) for (let x = y % step; x < sm.w; x += step) if (sm.d[y * sm.w + x] <= t) { xs.push(x); ys.push(y); }
  if (xs.length < 200) return 0;
  const H = sm.h + sm.w, hist = new Float64Array(H * 2);
  const sharp = (deg: number) => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    hist.fill(0);
    for (let i = 0; i < xs.length; i++) hist[Math.round(ys[i] * c - xs[i] * sn) + H]++;
    let v = 0; for (const n of hist) v += n * n; return v;
  };
  let best = 0, bv = -1;
  for (let d = -maxDeg; d <= maxDeg; d += 0.5) { const v = sharp(d); if (v > bv) { bv = v; best = d; } }
  let fine = best;
  for (let d = best - 0.5; d <= best + 0.5; d += 0.1) { const v = sharp(d); if (v > bv) { bv = v; fine = d; } }
  return Math.round(fine * 10) / 10;
}

/** Rotate by `deg` degrees (counter-clockwise positive in image coordinates), enlarging the canvas; corners filled white. */
export function rotate(g: Gray, deg: number): Gray {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const nw = Math.round(Math.abs(g.w * c) + Math.abs(g.h * s)), nh = Math.round(Math.abs(g.w * s) + Math.abs(g.h * c));
  const d = new Uint8ClampedArray(nw * nh), cx = g.w / 2, cy = g.h / 2, ncx = nw / 2, ncy = nh / 2;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const dx = x - ncx, dy = y - ncy, sx = c * dx - s * dy + cx, sy = s * dx + c * dy + cy;
    const x0 = Math.floor(sx), y0 = Math.floor(sy);
    if (x0 < 0 || y0 < 0 || x0 >= g.w - 1 || y0 >= g.h - 1) { d[y * nw + x] = 255; continue; }
    const tx = sx - x0, ty = sy - y0, i = y0 * g.w + x0;
    d[y * nw + x] = (g.d[i] * (1 - tx) + g.d[i + 1] * tx) * (1 - ty) + (g.d[i + g.w] * (1 - tx) + g.d[i + g.w + 1] * tx) * ty;
  }
  return { w: nw, h: nh, d };
}

/** Typical distance between text lines in pixels (autocorrelation of the row ink profile), or 0 if unclear. */
export function linePitch(g: Gray): number {
  const t = otsu(histogram(g)), prof = new Float64Array(g.h);
  for (let y = 0; y < g.h; y++) { let n = 0; for (let x = 0; x < g.w; x++) if (g.d[y * g.w + x] <= t) n++; prof[y] = n; }
  let mean = 0; for (const v of prof) mean += v; mean /= g.h;
  for (let y = 0; y < g.h; y++) prof[y] -= mean;
  let best = 0, bv = 0;
  const maxLag = Math.min(400, Math.floor(g.h / 3));
  const ac = new Float64Array(maxLag + 1);
  for (let lag = 6; lag <= maxLag; lag++) { let s = 0; for (let y = 0; y + lag < g.h; y++) s += prof[y] * prof[y + lag]; ac[lag] = s / (g.h - lag); }
  // first strong local maximum = one line pitch (later maxima are multiples)
  let peak = 0; for (let lag = 6; lag <= maxLag; lag++) if (ac[lag] > peak) peak = ac[lag];
  for (let lag = 7; lag < maxLag; lag++) if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1] && ac[lag] > peak * 0.55) { best = lag; bv = ac[lag]; break; }
  return bv > 0 ? best : 0;
}

/** Sauvola adaptive threshold (window radius r, sensitivity k): clean black text on white, robust to fading. */
export function sauvola(g: Gray, r = 15, k = 0.2): Gray {
  const { w, h } = g, W = w + 1;
  const I = new Float64Array(W * (h + 1)), I2 = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) { let s = 0, s2 = 0; for (let x = 0; x < w; x++) { const v = g.d[y * w + x]; s += v; s2 += v * v; I[(y + 1) * W + x + 1] = I[y * W + x + 1] + s; I2[(y + 1) * W + x + 1] = I2[y * W + x + 1] + s2; } }
  const d = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), n = (x1 - x0) * (y1 - y0);
      const s = I[y1 * W + x1] - I[y0 * W + x1] - I[y1 * W + x0] + I[y0 * W + x0];
      const s2 = I2[y1 * W + x1] - I2[y0 * W + x1] - I2[y1 * W + x0] + I2[y0 * W + x0];
      const m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m));
      d[y * w + x] = g.d[y * w + x] > m * (1 + k * (sd / 128 - 1)) ? 255 : 0;
    }
  }
  return { w, h, d };
}
