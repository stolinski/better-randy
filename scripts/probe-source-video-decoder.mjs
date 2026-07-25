const CDP_PORT = Number(process.env.CDP_PORT ?? 9223);
const assetUrl = process.argv[2];
const compositionDurationSeconds = Number(process.argv[3] ?? 2);
const timestamps = process.argv.slice(4).map(Number);

if (!assetUrl || timestamps.length === 0 || timestamps.some((value) => !Number.isFinite(value))) {
	console.error(
		'usage: probe-source-video-decoder.mjs <asset-url> <composition-duration> <timestamp...>'
	);
	process.exit(2);
}

const response = await fetch(`http://localhost:${CDP_PORT}/json`);
const targets = await response.json();
const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
if (!page) throw new Error(`Source video decoder probe found no page target on CDP ${CDP_PORT}.`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
	socket.onopen = resolve;
	socket.onerror = reject;
});

let nextId = 1;
const pending = new Map();
socket.onmessage = (event) => {
	const message = JSON.parse(event.data);
	if (!message.id || !pending.has(message.id)) return;
	pending.get(message.id).resolve(message.result ?? message.error);
	pending.delete(message.id);
};
const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = nextId++;
		pending.set(id, { resolve });
		socket.send(JSON.stringify({ id, method, params }));
	});

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: 'http://localhost:7263/p/blank' });
await new Promise((resolve) => setTimeout(resolve, 1200));

const expression = `(async () => {
	const { SourceVideoDecoder } = await import('/src/lib/platform/source-video-decoder.ts');
	const decoder = new SourceVideoDecoder({
		assetUrl: ${JSON.stringify(assetUrl)},
		sourceOffsetSeconds: 0,
		includeAudio: true,
		volume: 1
	});
	try {
		const metadata = await decoder.initialize(${compositionDurationSeconds});
		const frames = [];
		for (const timestamp of ${JSON.stringify(timestamps)}) {
			const frame = await decoder.frameAt(timestamp);
			frames.push({
				compositionTimestamp: frame.compositionTimestamp,
				requestedSourceTimestamp: frame.requestedSourceTimestamp,
				presentationTimestamp: frame.presentationTimestamp,
				duration: frame.duration,
				displayWidth: frame.displayWidth,
				displayHeight: frame.displayHeight,
				rotation: frame.rotation
			});
			frame.close();
		}
		return { metadata, frames };
	} finally {
		decoder.dispose();
	}
})()`;
const result = await send('Runtime.evaluate', {
	expression,
	returnByValue: true,
	awaitPromise: true
});
socket.close();

if (result.exceptionDetails) {
	throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
}
console.log(JSON.stringify(result.result?.value, null, 2));
