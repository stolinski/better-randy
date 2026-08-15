import { readdir } from 'node:fs/promises';

const BASE_URL = process.env.SUPERS_BASE_URL ?? 'http://localhost:7263';
const CDP_PORT = Number(process.env.CDP_PORT ?? 9223);
const ROUTE_TIMEOUT_MS = Number(process.env.PRESET_ROUTE_TIMEOUT_MS ?? 8000);
const FAILURE_COST_MS = 60_000;
const MIRANDA_SLUG = 'lower-third-miranda-heath';

const presetFiles = (await readdir(new URL('../src/lib/presets/', import.meta.url)))
	.filter((name) => name.endsWith('.json'))
	.map((name) => name.slice(0, -'.json'.length))
	.sort();
const slugs = [MIRANDA_SLUG, ...presetFiles.filter((slug) => slug !== MIRANDA_SLUG)];

const targetResponse = await fetch(
	`http://localhost:${CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`,
	{ method: 'PUT' }
);
if (!targetResponse.ok) {
	throw new Error(`Could not create CDP target: ${targetResponse.status}`);
}
const target = await targetResponse.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
	socket.onopen = resolve;
	socket.onerror = reject;
});

let nextId = 1;
const pending = new Map();
let activeRoute = null;

socket.onmessage = (event) => {
	const message = JSON.parse(event.data);
	if (message.id && pending.has(message.id)) {
		const command = pending.get(message.id);
		pending.delete(message.id);
		if (message.error) command.reject(new Error(message.error.message));
		else command.resolve(message.result);
		return;
	}
	if (!activeRoute) return;
	if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
		activeRoute.consoleErrors.push(
			message.params.args.map((argument) => argument.value ?? argument.description).join(' ')
		);
	}
	if (message.method === 'Runtime.exceptionThrown') {
		activeRoute.consoleErrors.push(
			message.params.exceptionDetails?.exception?.description ?? 'Uncaught exception'
		);
	}
	if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
		activeRoute.consoleErrors.push(message.params.entry.text);
	}
	if (message.method === 'Network.responseReceived') {
		const { response, type } = message.params;
		if (type === 'Document') activeRoute.documentStatus = response.status;
		if (response.status >= 500) {
			activeRoute.http5xx.push(`${response.status} ${response.url}`);
		}
	}
	if (message.method === 'Network.loadingFailed' && !message.params.canceled) {
		activeRoute.networkFailures.push(message.params.errorText ?? 'Network loading failed');
	}
};

function send(method, params = {}) {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		socket.send(JSON.stringify({ id, method, params }));
	});
}

function percentile(values, fraction) {
	if (values.length === 0) return ROUTE_TIMEOUT_MS;
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.ceil(sorted.length * fraction) - 1];
}

async function evaluateReadiness() {
	const evaluation = await send('Runtime.evaluate', {
		expression: `(() => {
			const canvas = document.querySelector('canvas');
			return {
				readyState: document.readyState,
				canvas: Boolean(canvas && canvas.width > 0 && canvas.height > 0),
				timeline: Boolean(window.__supersTimeline),
				exportSeam: typeof window.__supersExport === 'function',
				canvasDrawElement: typeof GPUQueue !== 'undefined' && 'copyElementImageToTexture' in GPUQueue.prototype,
				bodyText: document.body?.innerText.slice(0, 160) ?? ''
			};
		})()`,
		returnByValue: true
	});
	return evaluation.result?.value;
}

async function measureRoute(slug) {
	activeRoute = {
		slug,
		documentStatus: 0,
		consoleErrors: [],
		http5xx: [],
		networkFailures: []
	};
	await send('Network.clearBrowserCache');
	const startedAt = performance.now();
	let readiness = null;
	let navigationError = null;
	try {
		const navigation = await send('Page.navigate', {
			url: `${BASE_URL}/p/${encodeURIComponent(slug)}`
		});
		if (navigation.errorText) navigationError = navigation.errorText;
		const deadline = startedAt + ROUTE_TIMEOUT_MS;
		while (performance.now() < deadline) {
			readiness = await evaluateReadiness().catch(() => null);
			if (
				readiness?.readyState === 'complete' &&
				readiness.canvas &&
				readiness.timeline &&
				readiness.exportSeam &&
				readiness.canvasDrawElement
			) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		await new Promise((resolve) => setTimeout(resolve, 75));
	} catch (cause) {
		navigationError = cause instanceof Error ? cause.message : String(cause);
	}
	const readyMs = Math.min(performance.now() - startedAt, ROUTE_TIMEOUT_MS);
	const route = activeRoute;
	activeRoute = null;
	const ready =
		readiness?.readyState === 'complete' &&
		readiness.canvas &&
		readiness.timeline &&
		readiness.exportSeam &&
		readiness.canvasDrawElement;
	const failed =
		!ready ||
		Boolean(navigationError) ||
		route.documentStatus >= 500 ||
		route.http5xx.length > 0 ||
		route.consoleErrors.length > 0 ||
		route.networkFailures.length > 0;
	return { ...route, readyMs, readiness, navigationError, failed };
}

await Promise.all([
	send('Page.enable'),
	send('Runtime.enable'),
	send('Network.enable'),
	send('Log.enable')
]);
await send('Network.setCacheDisabled', { cacheDisabled: true });

const results = [];
try {
	for (const slug of slugs) {
		results.push(await measureRoute(slug));
	}
} finally {
	await send('Page.close').catch(() => undefined);
	socket.close();
}

const readyTimes = results.map((result) => result.readyMs);
const failures = results.filter((result) => result.failed);
const routeLoadP50Ms = percentile(readyTimes, 0.5);
const routeLoadP95Ms = percentile(readyTimes, 0.95);
const routeLoadMaxMs = Math.max(...readyTimes);
const http5xx = results.reduce((sum, result) => sum + result.http5xx.length, 0);
const consoleErrors = results.reduce((sum, result) => sum + result.consoleErrors.length, 0);
const routeSuiteCostMs = routeLoadP95Ms + failures.length * FAILURE_COST_MS;
const mirandaReadyMs = results.find((result) => result.slug === MIRANDA_SLUG)?.readyMs ?? 0;

for (const failure of failures.slice(0, 12)) {
	console.log(
		`FAIL ${failure.slug} status=${failure.documentStatus} readyMs=${failure.readyMs.toFixed(2)} ` +
			JSON.stringify({
				navigationError: failure.navigationError,
				http5xx: failure.http5xx,
				consoleErrors: failure.consoleErrors.slice(0, 2),
				networkFailures: failure.networkFailures.slice(0, 2),
				readiness: failure.readiness
			})
	);
}
console.log(`METRIC routeSuiteCostMs=${routeSuiteCostMs.toFixed(2)}`);
console.log(`METRIC routeLoadP50Ms=${routeLoadP50Ms.toFixed(2)}`);
console.log(`METRIC routeLoadP95Ms=${routeLoadP95Ms.toFixed(2)}`);
console.log(`METRIC routeLoadMaxMs=${routeLoadMaxMs.toFixed(2)}`);
console.log(`METRIC failedRoutes=${failures.length}`);
console.log(`METRIC http5xx=${http5xx}`);
console.log(`METRIC consoleErrors=${consoleErrors}`);
console.log(`METRIC routeCount=${results.length}`);
console.log(`METRIC mirandaReadyMs=${mirandaReadyMs.toFixed(2)}`);
