// DOF multiplane capture probe (ADR-0027, epic task 2). Drives the flag-enabled
// Chrome on the CDP debug port, seeks the DOF fixture to a settled frame, and
// screenshots the back-to-front composite plus each depth plane in isolation
// (via window.__gfxDofPreviewPlane). Also re-captures an existing overlay
// preset to confirm the Composition layer-wrapper split didn't regress the
// default merged render. Node 22+ (built-in fetch/WebSocket).
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = Number(process.env.CDP_PORT ?? 9223);
const BASE = process.env.CDP_URL ?? 'http://localhost:7263';
const OUTDIR = 'docs/critic-captures/dof';
mkdirSync(OUTDIR, { recursive: true });

async function getTarget() {
	for (let i = 0; i < 60; i++) {
		try {
			const res = await fetch(`http://localhost:${PORT}/json`);
			const targets = await res.json();
			const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
			if (page) return page;
		} catch {
			/* not ready yet — retry */
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(`Chrome not reachable on port ${PORT}`);
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
	ws.onopen = res;
	ws.onerror = rej;
});

let nextId = 1;
const pending = new Map();
ws.onmessage = (ev) => {
	const msg = JSON.parse(ev.data);
	if (msg.id && pending.has(msg.id)) {
		const { resolve, reject } = pending.get(msg.id);
		pending.delete(msg.id);
		if (msg.error) reject(new Error(JSON.stringify(msg.error)));
		else resolve(msg.result);
	}
};
function send(method, params = {}) {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		ws.send(JSON.stringify({ id, method, params }));
	});
}
async function evaluate(expression) {
	const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
	return r.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');

async function load(slug) {
	await send('Page.navigate', { url: `${BASE}/p/${slug}` });
	await sleep(1800);
	let ready = false;
	let flag = false;
	for (let i = 0; i < 60; i++) {
		try {
			const s = await evaluate(`(() => ({
				canvas: !!document.querySelector('canvas'),
				timeline: !!(window.__gfxTimeline),
				flag: (typeof GPUQueue !== 'undefined') && ('copyElementImageToTexture' in GPUQueue.prototype)
			}))()`);
			flag = s.flag;
			if (s.canvas && s.timeline) {
				ready = true;
				break;
			}
		} catch {
			/* not ready yet — retry */
		}
		await sleep(500);
	}
	console.log(`[${slug}] READY=${ready} FLAG=${flag}`);
	if (!flag) {
		throw new Error(
			'CanvasDrawElement is unavailable; use the flag-enabled Chrome on CDP port 9223.'
		);
	}
	if (!ready) throw new Error(`App did not become ready for ${slug}`);
	await sleep(900);
	const rect = await evaluate(`(() => {
		const c = document.querySelector('canvas');
		const r = c.getBoundingClientRect();
		return { x: r.x, y: r.y, w: r.width, h: r.height, bw: c.width, bh: c.height };
	})()`);
	return rect;
}

async function seek(p) {
	for (let i = 0; i < 20; i++) {
		await evaluate(`window.__gfxTimeline.seekProgress(${p})`);
		await sleep(120);
		const t = await evaluate(`window.__gfxTimeline.time`);
		const expected = p * (await evaluate(`window.__gfxTimeline.durationSeconds`));
		if (Math.abs(t - expected) < 0.05) break;
	}
	await sleep(350);
}

async function shot(rect, file) {
	const s = await send('Page.captureScreenshot', {
		format: 'png',
		fromSurface: true,
		clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 }
	});
	writeFileSync(file, Buffer.from(s.data, 'base64'));
	console.log(`saved ${file}`);
}

// --- DOF fixture: composite + each plane in isolation ---
let rect = await load('dof-multiplane-check');
console.log(`canvas backing=${rect.bw}x${rect.bh}`);
await seek(0.5);
for (const plane of ['composite', 'surface', 'overlay']) {
	await evaluate(
		`window.__gfxDofPreviewPlane = '${plane}'; document.querySelector('canvas').requestPaint?.();`
	);
	await sleep(450);
	await shot(rect, `${OUTDIR}/${plane}.png`);
}
await evaluate(`window.__gfxDofPreviewPlane = undefined;`);

// --- Regression: existing overlay preset under the layer-wrapper split ---
rect = await load('lower-third');
await seek(0.5);
await shot(rect, `${OUTDIR}/regression-lower-third.png`);

ws.close();
console.log('DONE');
process.exit(0);
