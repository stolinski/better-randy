const CDP_PORT = Number(process.env.CDP_PORT ?? 9223);
const assetUrl = process.argv[2];
const sourceDurationSeconds = Number(process.argv[3] ?? 2);
const timestamps = process.argv.slice(4).map(Number);

if (
	!assetUrl ||
	!Number.isFinite(sourceDurationSeconds) ||
	sourceDurationSeconds <= 0 ||
	timestamps.length === 0 ||
	timestamps.some((value) => !Number.isFinite(value))
) {
	console.error(
		'usage: probe-video-asset-decoder.mjs <asset-url> <source-duration> <timestamp...>'
	);
	process.exit(2);
}

const response = await fetch(`http://localhost:${CDP_PORT}/json`);
const targets = await response.json();
const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
if (!page) throw new Error(`Video asset decoder probe found no page target on CDP ${CDP_PORT}.`);

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
	const { VideoAssetDecoder } = await import('/src/lib/platform/video-asset-decoder.ts');
	const { VideoAssetAudioDecoder } = await import('/src/lib/platform/video-asset-audio-decoder.ts');
	const decoder = new VideoAssetDecoder({ assetUrl: ${JSON.stringify(assetUrl)} });
	try {
		const metadata = await decoder.initialize();
		const frames = [];
		for (const timestamp of ${JSON.stringify(timestamps)}) {
			const frame = await decoder.frameAt(timestamp);
			const imageSource = frame.sample.toCanvasImageSource();
			const rgba = new Uint8Array(
				imageSource.allocationSize({ format: 'RGBA', rect: imageSource.visibleRect })
			);
			await imageSource.copyTo(rgba, { format: 'RGBA', rect: imageSource.visibleRect });
			const centerOffset =
				(Math.floor(imageSource.displayHeight / 2) * imageSource.displayWidth +
					Math.floor(imageSource.displayWidth / 2)) *
				4;
			const adapter = await navigator.gpu.requestAdapter();
			const device = await adapter.requestDevice();
			const texture = device.createTexture({
				size: [imageSource.displayWidth, imageSource.displayHeight],
				format: 'rgba8unorm',
				usage:
					GPUTextureUsage.COPY_DST |
					GPUTextureUsage.COPY_SRC |
					GPUTextureUsage.RENDER_ATTACHMENT
			});
			device.queue.copyExternalImageToTexture(
				{ source: imageSource },
				{ texture },
				[imageSource.displayWidth, imageSource.displayHeight]
			);
			const bytesPerRow = imageSource.displayWidth * 4;
			const readback = device.createBuffer({
				size: bytesPerRow * imageSource.displayHeight,
				usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
			});
			const encoder = device.createCommandEncoder();
			encoder.copyTextureToBuffer(
				{ texture },
				{ buffer: readback, bytesPerRow, rowsPerImage: imageSource.displayHeight },
				[imageSource.displayWidth, imageSource.displayHeight]
			);
			device.queue.submit([encoder.finish()]);
			await readback.mapAsync(GPUMapMode.READ);
			const gpuRgba = new Uint8Array(readback.getMappedRange());
			frames.push({
				sourceTimeSeconds: frame.sourceTimeSeconds,
				requestedSourceTimestamp: frame.requestedSourceTimestamp,
				presentationTimestamp: frame.presentationTimestamp,
				duration: frame.duration,
				displayWidth: frame.displayWidth,
				displayHeight: frame.displayHeight,
				rotation: frame.rotation,
				imageSourceType: imageSource.constructor.name,
				imageSourceWidth: imageSource.displayWidth ?? imageSource.width,
				imageSourceHeight: imageSource.displayHeight ?? imageSource.height,
				centerRgba: [...rgba.slice(centerOffset, centerOffset + 4)],
				gpuCenterRgba: [...gpuRgba.slice(centerOffset, centerOffset + 4)]
			});
			readback.unmap();
			readback.destroy();
			texture.destroy();
			device.destroy();
			frame.close();
		}
		const audio = await new VideoAssetAudioDecoder(${JSON.stringify(assetUrl)}).decode({
			sourceStartSeconds: 0,
			sourceEndSeconds: ${sourceDurationSeconds},
			outputSampleCount: Math.round(${sourceDurationSeconds} * 48000)
		});
		let audioPeak = 0;
		let firstAudibleSample = -1;
		if (audio) {
			for (let index = 0; index < audio.channels[0].length; index += 1) {
				const amplitude = Math.max(
					Math.abs(audio.channels[0][index]),
					Math.abs(audio.channels[1][index])
				);
				audioPeak = Math.max(audioPeak, amplitude);
				if (firstAudibleSample === -1 && amplitude > 1e-6) firstAudibleSample = index;
			}
		}
		return {
			metadata,
			frames,
			audio: audio
				? { sampleRate: audio.sampleRate, sampleCount: audio.channels[0].length, audioPeak, firstAudibleSample }
				: null
		};
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
