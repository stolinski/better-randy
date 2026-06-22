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
const sunX = W * 0.72, sunY = H * 0.30;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const ny = y / H, nx = x / W;
    // vertical grade: warm-dark ground -> soft hazy warm-grey sky
    let r = 0.10 + (1 - ny) * 0.42, g = 0.08 + (1 - ny) * 0.40, b = 0.07 + (1 - ny) * 0.36;
    // atmospheric haze (low-freq)
    const haze = smooth(nx * 3, ny * 3) * 0.12;
    r += haze; g += haze; b += haze * 0.9;
    // warm sun bloom (off-centre, upper-right)
    const sd = Math.hypot(x - sunX, y - sunY) / (W * 0.55);
    const sun = Math.max(0, 1 - sd) ** 2;
    r += sun * 0.45; g += sun * 0.33; b += sun * 0.16;
    // soft bokeh discs (each a smooth radial pop)
    for (const d of discs) {
      const dd = Math.hypot(x - d.cx, y - d.cy) / d.r;
      if (dd < 1) { const k = (1 - dd) ** 2 * d.b; r += k; g += k * 0.95; b += k * 0.8; }
    }
    // fine grain
    const grain = (hash(x * 1.3, y * 1.7) - 0.5) * 0.04;
    r += grain; g += grain; b += grain;
    // vignette
    const vig = 1 - 0.42 * (Math.hypot(nx - 0.5, ny - 0.5) / 0.7) ** 2;
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
