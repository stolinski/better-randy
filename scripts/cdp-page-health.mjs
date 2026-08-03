const CDP_PORT = Number(process.env.CDP_PORT ?? 9223);
const PAGE_URL = process.argv[2] ?? 'http://localhost:7263/p/blank';
const WAIT_MS = Number(process.env.CDP_HEALTH_WAIT_MS ?? 10000);

const targetResponse = await fetch(
	`http://localhost:${CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`,
	{ method: 'PUT' }
);
if (!targetResponse.ok)
	throw new Error(`Could not create CDP health target: ${targetResponse.status}.`);
const target = await targetResponse.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
	socket.onopen = resolve;
	socket.onerror = reject;
});

let nextId = 1;
const pending = new Map();
const consoleErrors = [];
const consoleWarnings = [];
const networkErrors = [];
let responseCount = 0;
socket.onmessage = (event) => {
	const message = JSON.parse(event.data);
	if (message.id && pending.has(message.id)) {
		const command = pending.get(message.id);
		pending.delete(message.id);
		if (message.error) command.reject(new Error(message.error.message));
		else command.resolve(message.result);
		return;
	}
	if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
		consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description).join(' '));
	}
	if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'warning') {
		const warning = message.params.args.map((arg) => arg.value ?? arg.description).join(' ');
		if (/WGSL|ShaderModule|RenderPipeline|CommandBuffer|WebGPU/i.test(warning)) {
			consoleWarnings.push(warning);
		}
	}
	if (message.method === 'Runtime.exceptionThrown') {
		consoleErrors.push(
			message.params.exceptionDetails?.exception?.description ?? 'Uncaught exception'
		);
	}
	if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
		consoleErrors.push(message.params.entry.text);
	}
	if (message.method === 'Network.responseReceived') {
		responseCount += 1;
		if (message.params.response.status >= 400) {
			networkErrors.push(`${message.params.response.status} ${message.params.response.url}`);
		}
	}
	if (message.method === 'Network.loadingFailed' && !message.params.canceled) {
		networkErrors.push(`${message.params.errorText} ${message.params.requestId}`);
	}
};

function send(method, params = {}) {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		socket.send(JSON.stringify({ id, method, params }));
	});
}

await Promise.all([
	send('Page.enable'),
	send('Runtime.enable'),
	send('Network.enable'),
	send('Log.enable')
]);
await send('Page.navigate', { url: PAGE_URL });
const evaluateHealth = () =>
	send('Runtime.evaluate', {
		expression: `(() => {
		const canvas = document.querySelector('canvas');
		return {
			url: location.href,
			readyState: document.readyState,
			canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
			timeline: Boolean(window.__supersTimeline),
			exportSeam: typeof window.__supersExport === 'function',
			canvasDrawElement: typeof GPUQueue !== 'undefined' && 'copyElementImageToTexture' in GPUQueue.prototype,
			mediaStatuses: Array.from(document.querySelectorAll('.media-status'), (node) => node.textContent?.trim()),
			mediaErrors: Array.from(document.querySelectorAll('.media-error'), (node) => node.textContent?.trim())
		};
	})()`,
		returnByValue: true
	});
const deadline = Date.now() + WAIT_MS;
let evaluated = await evaluateHealth();
while (Date.now() < deadline) {
	const value = evaluated.result?.value;
	if (
		value?.readyState === 'complete' &&
		value.canvas &&
		value.timeline &&
		value.exportSeam &&
		value.canvasDrawElement
	) {
		break;
	}
	await new Promise((resolve) => setTimeout(resolve, 250));
	evaluated = await evaluateHealth();
}
const page = evaluated.result?.value;
await send('Page.close').catch(() => undefined);
socket.close();

const failures = [];
if (page?.readyState !== 'complete') failures.push(`readyState=${page?.readyState}`);
if (!page?.canvas || !page.timeline || !page.exportSeam || !page.canvasDrawElement) {
	failures.push('required canvas/timeline/export/CanvasDrawElement seam missing');
}
failures.push(...(page?.mediaErrors ?? []).map((error) => `media: ${error}`));
failures.push(...consoleErrors.map((error) => `console: ${error}`));
failures.push(...consoleWarnings.map((warning) => `console warning: ${warning}`));
failures.push(...networkErrors.map((error) => `network: ${error}`));
console.log(
	JSON.stringify(
		{
			page,
			responseCount,
			consoleErrors,
			consoleWarnings,
			networkErrors,
			verdict: failures.length === 0 ? 'pass' : 'fail',
			failures
		},
		null,
		2
	)
);
if (failures.length > 0) process.exitCode = 1;
