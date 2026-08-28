// High-DPR detail probe for the DOF bokeh quality core (ADR-0027 task 3). The
// canvas display caps at ~76rem wide, so a normal screenshot can't resolve the
// 4K bokeh. Emulation.setDeviceMetricsOverride bumps deviceScaleFactor so the
// displayed canvas rasterizes at high DPR; we then clip to the defocused lower-
// third corner (or CLIP=full for the whole frame) to inspect disc shape,
// highlight bloom, and the defocused-edge profile (disc vs gaussian).
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = Number(process.env.CDP_PORT ?? 9223);
const BASE = process.env.CDP_URL ?? 'http://localhost:7263';
const SLUG = process.env.SLUG ?? 'dof-multiplane-check';
const DSF = Number(process.env.DSF ?? 3);
const OUTDIR = 'docs/critic-captures/dof';
mkdirSync(OUTDIR, { recursive: true });

const target = (await (await fetch(`http://localhost:${PORT}/json`)).json()).find(
	(t) => t.type === 'page' && t.webSocketDebuggerUrl
);
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
	ws.onopen = res;
	ws.onerror = rej;
});
let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => {
	const m = JSON.parse(ev.data);
	if (m.id && pending.has(m.id)) {
		const { resolve, reject } = pending.get(m.id);
		pending.delete(m.id);
		if (m.error) reject(new Error(JSON.stringify(m.error)));
		else resolve(m.result);
	}
};
const send = (method, params = {}) =>
	new Promise((resolve, reject) => {
		const id = nextId++;
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params }));
	});
const ev = async (x) => {
	const r = await send('Runtime.evaluate', {
		expression: x,
		returnByValue: true,
		awaitPromise: true
	});
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
	return r.result.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
	width: 1600,
	height: 900,
	deviceScaleFactor: DSF,
	mobile: false
});
await send('Page.navigate', { url: `${BASE}/p/${SLUG}` });
await sleep(2200);
for (let i = 0; i < 40; i++) {
	const ok = await ev(`!!(window.__gfxTimeline && document.querySelector('canvas'))`);
	if (ok) break;
	await sleep(300);
}
await ev(`window.__gfxDofPreviewPlane = undefined; window.__gfxTimeline.seekProgress(0.5);`);
await sleep(800);
await ev(`document.querySelector('canvas').requestPaint?.();`);
await sleep(600);
const rect = await ev(
	`(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`
);
// CLIP=full → whole canvas (e.g. to read a defocused card edge); else the
// bottom-left lower-third corner.
const full = process.env.CLIP === 'full';
const clip = full
	? { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 }
	: { x: rect.x, y: rect.y + rect.h * 0.58, width: rect.w * 0.5, height: rect.h * 0.42, scale: 1 };
const out = full ? 'detail-full.png' : 'detail-lowerthird.png';
const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip });
writeFileSync(`${OUTDIR}/${out}`, Buffer.from(shot.data, 'base64'));
console.log(`saved ${out} (DSF=${DSF})`);
ws.close();
process.exit(0);
