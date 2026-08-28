import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { readGfxEnvironmentValue } from '../src/lib/utils/legacy-supers-compatibility.ts';

const CDP_PORT = Number(process.env.CDP_PORT ?? 9223);
const DEV_SERVER_URL = readGfxEnvironmentValue(process.env, 'GFX_URL') ?? 'http://localhost:7263';
const OUTPUT_DIRECTORY = resolve('src/lib/assets/sounds/foley');

const FOLEY_CUES = [
	'tick',
	'hover',
	'glide',
	'pop',
	'press',
	'release',
	'tap',
	'thock',
	'on',
	'off',
	'switch',
	'latch',
	'success',
	'error',
	'warning',
	'denied',
	'chime',
	'ping',
	'bell',
	'bubble',
	'swoosh',
	'whoosh',
	'drop',
	'rise',
	'loading',
	'ready',
	'complete',
	'sparkle'
];

const targetResponse = await fetch(
	`http://localhost:${CDP_PORT}/json/new?${encodeURIComponent('about:blank')}`,
	{ method: 'PUT' }
);
if (!targetResponse.ok) {
	throw new Error(`Could not create Foley render target: ${targetResponse.status}.`);
}

const target = await targetResponse.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolveConnection, rejectConnection) => {
	socket.addEventListener('open', resolveConnection, { once: true });
	socket.addEventListener('error', rejectConnection, { once: true });
});

let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
	const message = JSON.parse(event.data);
	if (!message.id || !pending.has(message.id)) return;
	const command = pending.get(message.id);
	pending.delete(message.id);
	if (message.error) command.reject(new Error(message.error.message));
	else command.resolve(message.result);
});

function send(method, params = {}) {
	const id = nextId++;
	return new Promise((resolveCommand, rejectCommand) => {
		pending.set(id, { resolve: resolveCommand, reject: rejectCommand });
		socket.send(JSON.stringify({ id, method, params }));
	});
}

async function evaluate(expression) {
	const result = await send('Runtime.evaluate', {
		expression,
		returnByValue: true,
		awaitPromise: true
	});
	if (result.exceptionDetails) {
		const details = result.exceptionDetails;
		throw new Error(details.exception ? details.exception.description : details.text);
	}
	return result.result ? result.result.value : undefined;
}

try {
	await Promise.all([send('Page.enable'), send('Runtime.enable')]);
	await send('Page.navigate', { url: `${DEV_SERVER_URL}/p/blank` });
	for (let attempt = 0; attempt < 80; attempt += 1) {
		if ((await evaluate('document.readyState')) === 'complete') break;
		await new Promise((resolveWait) => setTimeout(resolveWait, 100));
	}

	await mkdir(OUTPUT_DIRECTORY, { recursive: true });
	for (const cue of FOLEY_CUES) {
		const base64 = await evaluate(`(async () => {
			const { set, toWav } = await import('/@id/@foleyjs/core');
			set({ theme: 'default', transpose: 0, space: 0.22 });
			let seed = ${JSON.stringify(`supers-foley-${cue}`)}
				.split('')
				.reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0;
			const originalRandom = Math.random;
			Math.random = () => {
				seed += 0x6d2b79f5;
				let value = seed;
				value = Math.imul(value ^ (value >>> 15), value | 1);
				value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
				return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
			};
			try {
				const blob = await toWav(${JSON.stringify(cue)});
				const bytes = new Uint8Array(await blob.arrayBuffer());
				let binary = '';
				for (let index = 0; index < bytes.length; index += 1) {
					binary += String.fromCharCode(bytes[index]);
				}
				return btoa(binary);
			} finally {
				Math.random = originalRandom;
			}
		})()`);
		await writeFile(resolve(OUTPUT_DIRECTORY, `${cue}.wav`), Buffer.from(base64, 'base64'));
		console.log(`Generated Foley cue: ${cue}`);
	}
} finally {
	await send('Page.close').catch(() => undefined);
	socket.close();
}
