// Preview frame-rate probe over CDP — drives the flag-enabled Chrome (see
// cdp-capture.mjs), plays the Supers timeline from 0 and counts rAF-driven
// render ticks for a fixed window, reporting effective preview fps. Built for
// the ADR-0028 depth-stage perf work (half-res DOF): run before/after at
// 3840×2160 and 2160×3840. Node 22+ (built-in fetch/WebSocket).
const PORT = Number(process.env.CDP_PORT ?? 9223);
const SLUG = process.argv[2] ?? 'depth-stage-demo';
const URL = process.env.CDP_URL ?? `http://localhost:7263/p/${SLUG}`;
const WINDOW_MS = Number(process.env.FPS_WINDOW_MS ?? 5000);

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
	const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
	if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
	return r.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL });

let ready = false;
for (let i = 0; i < 60; i++) {
	try {
		const s = await evaluate(
			`(() => ({ canvas: !!document.querySelector('canvas'), timeline: !!window.__gfxTimeline }))()`
		);
		if (s.canvas && s.timeline) {
			ready = true;
			break;
		}
	} catch {}
	await sleep(500);
}
if (!ready) {
	console.log('App did not become ready; aborting.');
	process.exit(1);
}
await sleep(1200); // let fonts/substrate settle so the measured window is steady-state

const backing = await evaluate(
	`(() => { const c = document.querySelector('canvas'); return c.width + 'x' + c.height; })()`
);
const fps = await evaluate(`(async () => {
	const t = window.__gfxTimeline;
	t.seek(0);
	t.play();
	await new Promise((r) => setTimeout(r, 400)); // skip the spin-up frames
	const frames = await new Promise((resolve) => {
		let count = 0;
		let start;
		const tick = (ts) => {
			if (start === undefined) start = ts;
			count += 1;
			if (ts - start < ${WINDOW_MS}) requestAnimationFrame(tick);
			else resolve(count);
		};
		requestAnimationFrame(tick);
	});
	t.pause();
	return frames / (${WINDOW_MS} / 1000);
})()`);

console.log(`${SLUG}  backing=${backing}  preview=${fps.toFixed(1)} fps (${WINDOW_MS}ms window)`);
ws.close();
process.exit(0);
