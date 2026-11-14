import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deskewAngle, flatten, linePitch, paperBox, rotate, sauvola, type Gray } from '../src/imgproc.ts';

/** White page with dark text-like dashes every `pitch` px, tilted by `deg` (lines go down to the right for deg > 0). */
function page(w: number, h: number, pitch: number, deg = 0): Gray {
  const d = new Uint8ClampedArray(w * h).fill(235), t = Math.tan((deg * Math.PI) / 180);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const yy = y - x * t;
    const inLine = ((yy % pitch) + pitch) % pitch < pitch * 0.35;
    const inWord = Math.floor(x / 9) % 6 !== 5 && x > w * 0.08 && x < w * 0.92;
    if (inLine && inWord) d[y * w + x] = 30;
  }
  return { w, h, d };
}

test('deskew finds the tilt of text lines and rotate levels them', () => {
  const g = page(500, 700, 28, 5);
  const a = deskewAngle(g);
  assert.ok(Math.abs(a - 5) <= 0.6, `angle ${a}`);
  const level = rotate(g, a);
  assert.ok(Math.abs(deskewAngle(level)) <= 0.6, `after ${deskewAngle(level)}`);
  assert.ok(Math.abs(deskewAngle(page(500, 700, 28, -7)) + 7) <= 0.6);
});

test('line pitch is the distance between text lines', () => {
  const p = linePitch(page(400, 900, 32));
  assert.ok(Math.abs(p - 32) <= 1, `pitch ${p}`);
});

test('paper box finds a bright receipt on a dark table', () => {
  const w = 600, h = 800, d = new Uint8ClampedArray(w * h).fill(50);
  for (let y = 100; y < 700; y++) for (let x = 200; x < 420; x++) d[y * w + x] = (x + y) % 37 === 0 ? 40 : 230;
  const b = paperBox({ w, h, d })!;
  assert.ok(b, 'found');
  assert.ok(Math.abs(b.x - 200) < 25 && Math.abs(b.y - 100) < 25 && Math.abs(b.w - 220) < 40 && Math.abs(b.h - 600) < 40, JSON.stringify(b));
  assert.equal(paperBox(page(300, 400, 20)), null); // paper fills the frame → no crop
});

test('flatten removes a strong shadow but keeps the ink dark', () => {
  const g = page(400, 600, 30);
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) g.d[y * g.w + x] *= 0.35 + 0.65 * (x / g.w); // dark on the left
  const f = flatten(g);
  // paper on the dark left and bright right now look alike; ink stays much darker than paper
  const paperL = f.d[20 * f.w + 5], paperR = f.d[20 * f.w + 395];
  assert.ok(Math.abs(paperL - paperR) < 40, `${paperL} vs ${paperR}`);
  const ink = f.d[2 * f.w + 60];
  assert.ok(ink < paperL - 100, `ink ${ink} paper ${paperL}`);
  const b = sauvola(f);
  assert.ok(b.d.every((v) => v === 0 || v === 255));
});
