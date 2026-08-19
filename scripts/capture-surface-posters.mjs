// Surface-poster defaults. Drives the flag-enabled Chrome (CanvasDrawElement) on
// CDP port 9223 to one representative composition per surface type, lets the
// app's capture-on-view write the (transparent) poster into `.posters/`, then
// copies it to the committed default at `static/surface-posters/<type>.webp`.
// These are the instant fallback every picker card shows before (or instead of)
// its own composition poster. Re-run when a representative or surface changes.
import { copyFileSync, mkdirSync } from 'node:fs';

const PORT = Number(process.env.CDP_PORT ?? 9223);
const BASE = process.env.CDP_URL ?? 'http://localhost:7263';
const OUT_DIR = 'static/surface-posters';
const POSTERS_DIR = '.posters';

// One representative composition per surface type — picked to read clearly as
// that surface. Cards on high-variance surfaces (web-document, plain) override
// this with their own composition poster once viewed.
const REPS = {
	paper: 'research-paper-attention',
	plain: 'counter-milestone',
	newspaper: 'title-card-newspaper',
	'pullquote-on-photo': 'pullquote-on-photo',
	'chapter-card': 'chapter-card-descent',
	'title-sequence': 'title-sequence-drop',
	'type-hero': 'type-hero-vantage',
	'web-document': 'web-document-wikipedia',
	imessage: 'imessage-friday-deploy',
	checklist: 'checklist-show-rundown',
	'website-screenshot': 'website-showcase'
};

mkdirSync(OUT_DIR, { recursive: true });

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
	if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
	return r.result.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Page.enable');
await send('Runtime.enable');

let ok = 0;
const failed = [];
for (const [type, slug] of Object.entries(REPS)) {
	try {
		await send('Page.navigate', { url: `${BASE}/p/${slug}` });
		// Wait for the canvas + timeline, then for capture-on-view to store the poster.
		let key = null;
		for (let i = 0; i < 60; i++) {
			await sleep(400);
			key = await evaluate('window.__supersPosterKey ?? null');
			if (key) break;
		}
		if (!key) {
			failed.push(`${type} (no key)`);
			console.log(`SKIP ${type} <- ${slug} (no poster key)`);
			continue;
		}
		// Give capture-on-view time to render the settled frame and PUT the poster.
		let stored = false;
		for (let i = 0; i < 30; i++) {
			await sleep(400);
			const res = await fetch(`${BASE}/api/posters/${key}`, { method: 'HEAD' });
			if (res.ok) {
				stored = true;
				break;
			}
		}
		if (!stored) {
			failed.push(`${type} (not stored)`);
			console.log(`SKIP ${type} <- ${slug} (poster not stored)`);
			continue;
		}
		copyFileSync(`${POSTERS_DIR}/${key}.webp`, `${OUT_DIR}/${type}.webp`);
		ok += 1;
		console.log(`ok  ${type} <- ${slug}  (${key})`);
	} catch (err) {
		failed.push(`${type} (${err.message})`);
		console.log(`FAIL ${type} <- ${slug}: ${err.message}`);
	}
}

ws.close();
console.log(`DONE — ${ok}/${Object.keys(REPS).length} surface posters; failed: ${failed.join(', ') || 'none'}`);
process.exit(0);
