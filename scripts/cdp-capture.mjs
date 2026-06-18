// Real-canvas capture over CDP — drives a flag-enabled Chrome (launched with
// --enable-blink-features=CanvasDrawElement) on a debug port, seeks the Hiviz
// timeline via window.__hivizTimeline.seekProgress, and saves clipped canvas
// screenshots. This is the documented workaround for the chrome-devtools MCP
// browser lacking the html-in-canvas flag. Node 22+ (built-in fetch/WebSocket).
import { writeFileSync, mkdirSync } from 'node:fs';

const PORT = Number(process.env.CDP_PORT ?? 9223);
const SLUG = process.argv[2] ?? 'lower-third-cinematic';
const URL = process.env.CDP_URL ?? `http://localhost:7263/p/${SLUG}`;
const OUTDIR = `.tmp-baselines/${SLUG}`;
const SAMPLES = (process.env.CDP_SAMPLES ?? '0,0.25,0.5,0.75,1').split(',').map(Number);

mkdirSync(OUTDIR, { recursive: true });

async function getTarget() {
	for (let i = 0; i < 60; i++) {
		try {
			const res = await fetch(`http://localhost:${PORT}/json`);
			const targets = await res.json();
			const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
			if (page) return page;
		} catch {}
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
	const r = await send('Runtime.evaluate', {
		expression,
		returnByValue: true,
		awaitPromise: true
	});
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
	return r.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(1800);

let ready = false;
let flag = false;
for (let i = 0; i < 60; i++) {
	try {
		const s = await evaluate(`(() => ({
			canvas: !!document.querySelector('canvas'),
			timeline: !!(window.__hivizTimeline),
			flag: (typeof GPUQueue !== 'undefined') && ('copyElementImageToTexture' in GPUQueue.prototype)
		}))()`);
		flag = s.flag;
		if (s.canvas && s.timeline) {
			ready = true;
			break;
		}
	} catch {}
	await sleep(500);
}
console.log(`READY=${ready}  FLAG(copyElementImageToTexture in GPUQueue)=${flag}`);
if (!ready) {
	console.log('App did not become ready; aborting.');
	process.exit(1);
}

await sleep(900);
const rect = await evaluate(`(() => {
	const c = document.querySelector('canvas');
	const r = c.getBoundingClientRect();
	return { x: r.x, y: r.y, w: r.width, h: r.height, bw: c.width, bh: c.height };
})()`);
console.log(`canvas displayed=${Math.round(rect.w)}x${Math.round(rect.h)} backing=${rect.bw}x${rect.bh}`);

const saved = [];
for (const p of SAMPLES) {
	// Seek, then confirm the playhead actually landed before capturing. A bare
	// seekProgress sometimes races the first render after navigate.
	let landedTime = -1;
	for (let i = 0; i < 20; i++) {
		await evaluate(`window.__hivizTimeline.seekProgress(${p})`);
		await sleep(120);
		landedTime = await evaluate(`window.__hivizTimeline.time`);
		const expected = p * (await evaluate(`window.__hivizTimeline.durationSeconds`));
		if (Math.abs(landedTime - expected) < 0.05) break;
	}
	// Settle one more paint at the landed frame.
	await sleep(350);
	// On-surface capture (NO captureBeyondViewport — that re-rasters without the
	// accelerated WebGPU layer and yields a blank canvas). Clip to the canvas.
	const shot = await send('Page.captureScreenshot', {
		format: 'png',
		fromSurface: true,
		clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 }
	});
	const file = `${OUTDIR}/p${p.toFixed(2)}.png`;
	writeFileSync(file, Buffer.from(shot.data, 'base64'));
	saved.push(file);
	console.log(`saved ${file}  (t=${landedTime.toFixed(2)}s)`);
}

ws.close();
console.log(`DONE — ${saved.length} frames`);
process.exit(0);
