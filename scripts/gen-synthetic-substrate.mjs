// Authors deterministic, license-clean synthetic SUBSTRATE images: defocused,
// atmospheric scenes that read as real out-of-focus photographs behind staged
// type (the depth stage rack-focuses the backdrop, so soft is right). Three
// variants share one recipe with a palette table — `atmosphere-warm` keeps its
// original constants byte-for-byte; `atmosphere-slate` / `atmosphere-violet`
// are the cool and dusk beds for the depth-stage showcase set (ADR-0028).
// Stand-ins for real photos — swap a PNG with zero code change. Regenerate:
//   node scripts/gen-synthetic-substrate.mjs
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';

const W = 2048, H = 1152;
// deterministic value noise
const hash = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
const smooth = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), dd = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + dd) * u * v;
};

// Per-variant palette: base floor, top-light gain, key-bloom tint + position,
// bokeh tint, haze blue-lean. `warm` is the original pullquote bed unchanged.
const VARIANTS = {
  'atmosphere-warm': {
    base: [0.05, 0.04, 0.035], top: [0.40, 0.34, 0.26],
    sun: [0.5, 0.37, 0.18], sunX: 0.5, sunY: 0.05,
    bokeh: [1, 0.95, 0.8], hazeB: 0.9
  },
  // Cool slate for the chapter-card depth piece: blue-grey grade, key kept to
  // the upper-LEFT so the bloom agrees with the Pack's upper-left scene light.
  'atmosphere-slate': {
    base: [0.035, 0.042, 0.055], top: [0.20, 0.26, 0.36],
    sun: [0.16, 0.27, 0.40], sunX: 0.3, sunY: 0.08,
    bokeh: [0.8, 0.92, 1], hazeB: 1.1
  },
  // Violet dusk for the type-hero depth piece: deep purple grade, magenta-lean
  // key upper-left, cooler bokeh.
  'atmosphere-violet': {
    base: [0.045, 0.034, 0.06], top: [0.24, 0.18, 0.36],
    sun: [0.36, 0.20, 0.42], sunX: 0.3, sunY: 0.08,
    bokeh: [0.95, 0.8, 1], hazeB: 1.0
  }
};

for (const [slug, P] of Object.entries(VARIANTS)) {
  const png = new PNG({ width: W, height: H });
  // soft out-of-focus bokeh discs (seeded; same field across variants)
  const discs = Array.from({ length: 9 }, (_, i) => ({
    cx: hash(i * 3.1, 1.2) * W, cy: hash(i * 1.7, 5.3) * H * 0.7,
    r: (0.05 + hash(i, 9) * 0.10) * W, b: 0.10 + hash(i, 4) * 0.18
  }));
  // Composed FOR centred staged type: a moody low-key frame whose CENTRE (where
  // the text sits) stays dark for legibility, with the key light + bokeh kept
  // to the TOP and edges so the photographic interest reads around the type,
  // not behind it.
  const sunX = W * P.sunX, sunY = H * P.sunY;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ny = y / H, nx = x / W;
      // vertical grade: lit top -> deep moody near-black through the middle
      const topLight = Math.max(0, 1 - ny * 1.7);
      let r = P.base[0] + topLight * P.top[0], g = P.base[1] + topLight * P.top[1], b = P.base[2] + topLight * P.top[2];
      // atmospheric haze (low-freq), gentle, only near the lit top
      const haze = smooth(nx * 3, ny * 3) * 0.10 * topLight;
      r += haze; g += haze; b += haze * P.hazeB;
      // key bloom along the TOP (off the text centre)
      const sd = Math.hypot(x - sunX, y - sunY) / (W * 0.6);
      const sun = Math.max(0, 1 - sd) ** 2;
      r += sun * P.sun[0]; g += sun * P.sun[1]; b += sun * P.sun[2];
      // soft bokeh discs (seeded in the upper ~70%, so they sit around/above the type)
      for (const d of discs) {
        const dd = Math.hypot(x - d.cx, y - d.cy) / d.r;
        if (dd < 1) { const k = (1 - dd) ** 2 * d.b; r += k * P.bokeh[0]; g += k * P.bokeh[1]; b += k * P.bokeh[2]; }
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
  const out = `src/lib/assets/substrates/${slug}.png`;
  writeFileSync(out, PNG.sync.write(png));
  console.log('wrote', out, W + 'x' + H);
}
