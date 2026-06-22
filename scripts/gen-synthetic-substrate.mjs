// Authors a deterministic, license-clean synthetic SUBSTRATE image: a defocused,
// atmospheric warm scene that reads as a real out-of-focus photograph behind a
// pullquote (the depth stage rack-focuses the backdrop, so soft is right).
// Stand-in for a real photo — swap the PNG with zero code change. Regenerate:
//   node scripts/gen-synthetic-substrate.mjs
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';

const W = 2048, H = 1152;
const png = new PNG({ width: W, height: H });
// deterministic value noise
const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
const smooth = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), dd = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + dd) * u * v;
};
// soft out-of-focus bokeh discs (seeded)
const discs = Array.from({ length: 9 }, (_, i) => ({
  cx: hash(i * 3.1, 1.2) * W, cy: hash(i * 1.7, 5.3) * H * 0.7,
  r: (0.05 + hash(i, 9) * 0.10) * W, b: 0.10 + hash(i, 4) * 0.18
}));
// Composed FOR a centred pullquote: a moody low-key frame whose CENTRE (where the
// two text lines sit) stays dark for legibility, with the warm light + bokeh kept
// to the TOP and edges so the photographic interest reads around the quote, not
// behind it.
const sunX = W * 0.5, sunY = H * 0.05;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const ny = y / H, nx = x / W;
    // vertical grade: warm light up top -> deep moody warm-black through the middle
    const topLight = Math.max(0, 1 - ny * 1.7);
    let r = 0.05 + topLight * 0.40, g = 0.04 + topLight * 0.34, b = 0.035 + topLight * 0.26;
    // atmospheric haze (low-freq), gentle, only near the lit top
    const haze = smooth(nx * 3, ny * 3) * 0.10 * topLight;
    r += haze; g += haze; b += haze * 0.9;
    // warm key bloom along the TOP (off the text centre)
    const sd = Math.hypot(x - sunX, y - sunY) / (W * 0.6);
    const sun = Math.max(0, 1 - sd) ** 2;
    r += sun * 0.5; g += sun * 0.37; b += sun * 0.18;
    // soft bokeh discs (seeded in the upper ~70%, so they sit around/above the quote)
    for (const d of discs) {
      const dd = Math.hypot(x - d.cx, y - d.cy) / d.r;
      if (dd < 1) { const k = (1 - dd) ** 2 * d.b; r += k; g += k * 0.95; b += k * 0.8; }
    }
    // central darkening trough: keep the middle band (text zone) deep for legibility
    const trough = Math.max(0, 1 - (Math.abs(ny - 0.52) / 0.3) ** 2) * 0.5;
    r *= 1 - trough; g *= 1 - trough; b *= 1 - trough;
    // fine grain
    const grain = (hash(x * 1.3, y * 1.7) - 0.5) * 0.035;
    r += grain; g += grain; b += grain;
    // vignette (corners down)
    const vig = 1 - 0.4 * (Math.hypot(nx - 0.5, ny - 0.5) / 0.7) ** 2;
    r *= vig; g *= vig; b *= vig;
    // filmic toe + clamp
    const toe = (c) => Math.max(0, Math.min(1, c)) ** 0.92;
    const i = (y * W + x) * 4;
    png.data[i] = Math.round(toe(r) * 255);
    png.data[i + 1] = Math.round(toe(g) * 255);
    png.data[i + 2] = Math.round(toe(b) * 255);
    png.data[i + 3] = 255;
  }
}
const out = 'src/lib/assets/substrates/atmosphere-warm.png';
writeFileSync(out, PNG.sync.write(png));
console.log('wrote', out, W + 'x' + H);
