// CDP diagnostic — connect to the flagged Chrome, seek to a progress, and dump
// console errors + the overlay DOM + live animState so we can see whether the
// engine is actually driving the composition (vs. a screenshot-capture issue).
const PORT = Number(process.env.CDP_PORT ?? 9223);
const SEEK = Number(process.argv[2] ?? 0.5);

const res = await fetch(`http://localhost:${PORT}/json`);
const targets = await res.json();
const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => {
	ws.onopen = r;
	ws.onerror = j;
});
let id = 1;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
	const m = JSON.parse(ev.data);
	if (m.id && pending.has(m.id)) {
		pending.get(m.id).resolve(m.result ?? m.error);
		pending.delete(m.id);
	} else if (m.method === 'Runtime.consoleAPICalled') {
		logs.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160));
	} else if (m.method === 'Runtime.exceptionThrown') {
		logs.push(`[exception] ` + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 200));
	}
};
const send = (method, params = {}) =>
	new Promise((resolve) => {
		const i = id++;
		pending.set(i, { resolve });
		ws.send(JSON.stringify({ id: i, method, params }));
	});
const evaluate = async (expr) => {
	const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
	return r.exceptionDetails ? { __error: r.exceptionDetails.text } : r.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Runtime.enable');
await sleep(500);
logs.length = 0; // only collect logs from here on

await evaluate(`window.__hivizTimeline && window.__hivizTimeline.seekProgress(${SEEK})`);
await sleep(700);

const dump = await evaluate(`(() => {
	const out = {};
	const c = document.querySelector('canvas');
	out.canvas = c ? { w: c.width, h: c.height, dispW: Math.round(c.getBoundingClientRect().width), dispH: Math.round(c.getBoundingClientRect().height) } : null;
	const tl = window.__hivizTimeline;
	out.timeline = tl ? { time: +tl.time.toFixed(3), dur: tl.durationSeconds, playing: tl.isPlaying } : null;
	// animState is module-scoped; reach it via the overlay DOM + computed styles instead.
	const lt = document.querySelector('[data-overlay="lower-third"]');
	if (lt) {
		const r = lt.getBoundingClientRect();
		const cs = getComputedStyle(lt);
		out.overlay = {
			tag: lt.tagName,
			variant: lt.getAttribute('data-variant'),
			text: lt.innerText.replace(/\\s+/g,' ').trim().slice(0,80),
			rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
			opacity: cs.opacity,
			transform: cs.transform,
			visibility: cs.visibility,
			display: cs.display
		};
		// climb to the mount wrapper to see the entry transform/opacity
		let el = lt.parentElement, hops = 0;
		while (el && hops < 4) {
			const ecs = getComputedStyle(el);
			if (ecs.opacity !== '1' || ecs.transform !== 'none') {
				out.mountChain = out.mountChain || [];
				out.mountChain.push({ cls: el.className.toString().slice(0,40), opacity: ecs.opacity, transform: ecs.transform.slice(0,40) });
			}
			el = el.parentElement; hops++;
		}
	} else {
		out.overlay = 'NO [data-overlay=lower-third] ELEMENT FOUND';
		out.overlayCount = document.querySelectorAll('[data-overlay]').length;
		out.compositionHtml = (document.querySelector('.composition')?.innerHTML || document.body.innerHTML).slice(0, 400);
	}
	return out;
})()`);

console.log('SEEK =', SEEK);
console.log(JSON.stringify(dump, null, 2));
console.log('--- console since seek ---');
console.log(logs.slice(-15).join('\n') || '(no console output — loop error gone?)');
ws.close();
process.exit(0);
