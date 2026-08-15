const CDP_PORT = Number(process.env.CDP_PORT ?? 9223);
const PAGE_URL = process.env.HOME_URL ?? 'http://localhost:7263/';
const RUNS = Number(process.env.HOME_RUNS ?? 3);
const TIMEOUT_MS = Number(process.env.HOME_TIMEOUT_MS ?? 15000);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function measureOnce() {
	const targetResponse = await fetch(
		`http://localhost:${CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`,
		{ method: 'PUT' }
	);
	if (!targetResponse.ok) throw new Error(`Could not create CDP target: ${targetResponse.status}`);
	const target = await targetResponse.json();
	const socket = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		socket.onopen = resolve;
		socket.onerror = reject;
	});

	let nextId = 1;
	let inFlight = 0;
	let lastNetworkActivity = performance.now();
	let apiRequests = 0;
	let responseBytes = 0;
	const pending = new Map();
	socket.onmessage = (event) => {
		const message = JSON.parse(event.data);
		if (message.id && pending.has(message.id)) {
			const command = pending.get(message.id);
			pending.delete(message.id);
			if (message.error) command.reject(new Error(message.error.message));
			else command.resolve(message.result);
			return;
		}
		if (message.method === 'Network.requestWillBeSent') {
			inFlight += 1;
			lastNetworkActivity = performance.now();
			if (message.params.request.url.includes('/api/user-compositions')) apiRequests += 1;
		}
		if (message.method === 'Network.loadingFinished') {
			inFlight = Math.max(0, inFlight - 1);
			lastNetworkActivity = performance.now();
			responseBytes += message.params.encodedDataLength ?? 0;
		}
		if (message.method === 'Network.loadingFailed') {
			inFlight = Math.max(0, inFlight - 1);
			lastNetworkActivity = performance.now();
		}
	};

	function send(method, params = {}) {
		const id = nextId++;
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve, reject });
			socket.send(JSON.stringify({ id, method, params }));
		});
	}

	async function evaluate(expression) {
		const result = await send('Runtime.evaluate', {
			expression,
			returnByValue: true,
			awaitPromise: true
		});
		if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
		return result.result.value;
	}

	await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Network.enable')]);
	await send('Network.setCacheDisabled', { cacheDisabled: true });
	await send('Emulation.setDeviceMetricsOverride', {
		width: 1440,
		height: 900,
		deviceScaleFactor: 1,
		mobile: false
	});
	await send('Page.addScriptToEvaluateOnNewDocument', {
		source: `window.__homeLcp = 0;
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) window.__homeLcp = entry.startTime;
		}).observe({ type: 'largest-contentful-paint', buffered: true });`
	});

	const startedAt = performance.now();
	await send('Page.navigate', { url: PAGE_URL });
	let snapshot;
	while (performance.now() - startedAt < TIMEOUT_MS) {
		try {
			snapshot = await evaluate(`(() => {
				const visibleSkeletons = Array.from(document.querySelectorAll('.poster-card__skeleton')).filter((node) => {
					const rect = node.getBoundingClientRect();
					return rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
				}).length;
				const navigation = performance.getEntriesByType('navigation')[0];
				return {
					readyState: document.readyState,
					hasHome: Boolean(document.querySelector('.home')),
					visibleSkeletons,
					cardCount: document.querySelectorAll('.poster-card').length,
					imageCount: document.images.length,
					completeImages: Array.from(document.images).filter((image) => image.complete).length,
					ttfb: navigation?.responseStart ?? 0,
					domContentLoaded: navigation?.domContentLoadedEventEnd ?? 0,
					loadEvent: navigation?.loadEventEnd ?? 0,
					lcp: window.__homeLcp ?? 0
				};
			})()`);
		} catch {
			await sleep(25);
			continue;
		}
		const networkIdle = inFlight === 0 && performance.now() - lastNetworkActivity >= 300;
		if (
			snapshot.readyState === 'complete' &&
			snapshot.hasHome &&
			snapshot.visibleSkeletons === 0 &&
			snapshot.completeImages > 0 &&
			networkIdle
		) {
			break;
		}
		await sleep(25);
	}

	const visualReadyMs = performance.now() - startedAt;
	await send('Page.close').catch(() => undefined);
	socket.close();
	if (!snapshot || snapshot.visibleSkeletons !== 0) {
		throw new Error(`Homepage did not become visually ready within ${TIMEOUT_MS}ms`);
	}
	return {
		visualReadyMs,
		...snapshot,
		apiRequests,
		responseKb: responseBytes / 1024
	};
}

function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

const results = [];
for (let run = 0; run < RUNS; run += 1) results.push(await measureOnce());
const keys = ['visualReadyMs', 'ttfb', 'domContentLoaded', 'loadEvent', 'lcp', 'apiRequests', 'responseKb'];
const medians = Object.fromEntries(keys.map((key) => [key, median(results.map((result) => result[key]))]));
console.log(JSON.stringify({ medians, results }, null, 2));
for (const [key, value] of Object.entries(medians)) console.log(`METRIC ${key}=${value.toFixed(2)}`);
