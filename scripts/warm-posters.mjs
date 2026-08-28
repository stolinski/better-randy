// Warm the poster cache. Drives the flag-enabled Chrome (CanvasDrawElement) on
// CDP port 9223 through every composition so the app's capture-on-view renders
// and stores each one's poster in `.posters/`. This is an optional local prewarm
// for a fully-sharp gallery (each card its own render), not a build/deploy step;
// cold cards use the committed surface-type defaults. Idempotent — existing
// content-hash entries are skipped by capture-on-view.
import { readdirSync } from 'node:fs';

const PORT = Number(process.env.CDP_PORT ?? 9223);
const BASE = process.env.CDP_URL ?? 'http://localhost:7263';

const slugs = readdirSync('src/lib/presets')
	.filter((f) => f.endsWith('.json'))
	.map((f) => f.slice(0, -5))
	.filter((s) => s !== 'blank');

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
for (const slug of slugs) {
	try {
		await send('Page.navigate', { url: `${BASE}/p/${slug}` });
		let key = null;
		for (let i = 0; i < 50; i++) {
			await sleep(400);
			key = await evaluate('window.__gfxPosterKey ?? null');
			if (key) break;
		}
		if (!key) {
			failed.push(slug);
			console.log(`SKIP ${slug} (no key)`);
			continue;
		}
		let stored = false;
		for (let i = 0; i < 30; i++) {
			await sleep(400);
			const res = await fetch(`${BASE}/api/posters/${key}`, { method: 'HEAD' });
			if (res.ok) {
				stored = true;
				break;
			}
		}
		if (stored) {
			ok += 1;
			console.log(`ok  ${slug}  (${key})`);
		} else {
			failed.push(slug);
			console.log(`SKIP ${slug} (not stored)`);
		}
	} catch (err) {
		failed.push(slug);
		console.log(`FAIL ${slug}: ${err.message}`);
	}
}

ws.close();
console.log(`DONE — ${ok}/${slugs.length} warmed; failed: ${failed.join(', ') || 'none'}`);
process.exit(0);
