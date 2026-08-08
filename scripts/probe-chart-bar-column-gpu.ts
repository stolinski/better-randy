import { chromium } from 'playwright';

interface ProbeResult {
	errors: string[];
	packs: {
		pack: string;
		leftAlpha: number;
		rightAlpha: number;
		outsideAlpha: number;
		labelHoleAlpha: number;
		maxAlpha: number;
		partialAlphaPixels: number;
		extent: [number, number, number, number];
	}[];
	clearedAlpha: number;
}

async function main(): Promise<void> {
	const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
	try {
		const context = browser.contexts()[0];
		const page = context.pages()[0] ?? (await context.newPage());
		await page.goto('http://localhost:7263', { waitUntil: 'domcontentloaded', timeout: 30_000 });
		const result = await page.evaluate(async (): Promise<ProbeResult> => {
			if (!navigator.gpu) throw new Error('Bar/column GPU probe requires navigator.gpu.');
			const adapter = await navigator.gpu.requestAdapter();
			if (!adapter) throw new Error('Bar/column GPU probe found no WebGPU adapter.');
			const device = await adapter.requestDevice();
			const {
				createChartMarkRenderer,
				createChartMarkRendererWgsl,
				countChartMarkRendererInstances,
				packChartMarkRendererInstances
			} = await import('/src/lib/pipelines/shader-passes/chart-mark-renderer.ts');
			const { PACK_REGISTRY } = await import('/src/lib/platform/packs/registry.ts');
			const { resolveChartMarkFillTreatment } = await import('/src/lib/platform/packs/resolve.ts');
			const width = 256;
			const height = 128;
			const bytesPerRow = width * 4;
			const readPixel = (bytes: Uint8Array, x: number, y: number): readonly number[] => {
				const offset = y * bytesPerRow + x * 4;
				return Array.from(bytes.slice(offset, offset + 4));
			};
			const readTexture = async (texture: GPUTexture): Promise<Uint8Array> => {
				const readback = device.createBuffer({
					size: bytesPerRow * height,
					usage: 0x01 | 0x08
				});
				const encoder = device.createCommandEncoder();
				encoder.copyTextureToBuffer(
					{ texture },
					{ buffer: readback, bytesPerRow, rowsPerImage: height },
					[width, height, 1]
				);
				device.queue.submit([encoder.finish()]);
				await readback.mapAsync(0x01);
				const bytes = new Uint8Array(readback.getMappedRange().slice(0));
				readback.unmap();
				readback.destroy();
				return bytes;
			};
			const block = {
				id: 'probe',
				type: 'bar-chart' as const,
				title: 'Probe',
				data: {
					categories: [{ id: 'a', label: 'A' }],
					series: [
						{ id: 'one', label: 'One', values: [{ categoryId: 'a', value: 1 }] },
						{ id: 'two', label: 'Two', values: [{ categoryId: 'a', value: 2 }] }
					]
				},
				layout: { mode: 'grouped' as const },
				labels: { values: false, legend: false },
				fill: { role: 'series' as const },
				motion: {
					entry: { start: 0, duration: 0.1 },
					reveal: { start: 0.1, duration: 0.1 },
					emphasis: { start: 0.2, duration: 0.1 },
					annotation: { start: 0.3, duration: 0.1 },
					exit: { start: 0.8, duration: 0.1 }
				}
			};
			const mark = (
				id: string,
				seriesId: string,
				seriesIndex: number,
				x: number,
				highlighted: boolean
			) => ({
				id,
				identity: { seriesId, categoryId: 'a' },
				seriesId,
				categoryId: 'a',
				seriesIndex,
				fillVoiceIndex: seriesIndex,
				categoryIndex: 0,
				value: seriesIndex + 1,
				stackStart: 0,
				stackEnd: seriesIndex + 1,
				bounds: { x, y: 24, width: 80, height: 64 },
				calloutAnchor: { x: x + 80, y: 56 },
				valueEndpoint: { x: x + 80, y: 56 },
				isZero: false,
				cornerRadius: 12,
				isHighlighted: highlighted
			});
			const geometry = {
				marks: [mark('one:a', 'one', 0, 16, false), mark('two:a', 'two', 1, 144, true)],
				legendSwatches: [],
				valueLabels: [
					{
						markId: 'one:a',
						text: '1',
						origin: { x: 50, y: 40 },
						measurement: { width: 20, height: 10 },
						anchor: 'inside' as const
					}
				],
				annotations: [],
				overflow: []
			};
			const compilationModule = device.createShaderModule({
				code: createChartMarkRendererWgsl(width, height)
			});
			const compilationInfo = await compilationModule.getCompilationInfo();
			const compilationErrors = compilationInfo.messages
				.filter((message) => message.type === 'error')
				.map((message) => `${message.lineNum}:${message.linePos} ${message.message}`);
			device.pushErrorScope('validation');
			const renderer = createChartMarkRenderer(device, width, height);
			const creationError = await device.popErrorScope();
			const packs: ProbeResult['packs'] = [];
			const errors: string[] = [
				...compilationErrors.map((message) => `shader: ${message}`),
				...(creationError ? [`pipeline: ${creationError.message}`] : [])
			];
			for (const [pack, manifest] of Object.entries(PACK_REGISTRY)) {
				device.pushErrorScope('validation');
				const renderInputs = {
					block,
					marks: geometry.marks.map((mark) => ({
						bounds: mark.bounds,
						cornerRadius: mark.cornerRadius,
						fillVoiceIndex: mark.fillVoiceIndex,
						isHighlighted: mark.isHighlighted,
						labelPlateBounds: mark.id === 'one:a' ? { x: 40, y: 34, width: 40, height: 22 } : null
					})),
					swatches: [],
					baseFillByVoice: block.data.series.map((_, index) =>
						resolveChartMarkFillTreatment(manifest, 'series', index)
					),
					emphasisFillByVoice: block.data.series.map((_, index) =>
						resolveChartMarkFillTreatment(manifest, 'emphasis', index)
					),
					alpha: 0.5
				};
				if (countChartMarkRendererInstances(renderInputs) !== 2)
					errors.push(`${pack}: wrong instance count`);
				const packedDebug = new DataView(
					packChartMarkRendererInstances(renderInputs, width, height)
				);
				if (packedDebug.getFloat32(0, true) !== 16) errors.push(`${pack}: wrong packed x`);
				renderer.render(renderInputs);
				await device.queue.onSubmittedWorkDone();
				const validationError = await device.popErrorScope();
				if (validationError) errors.push(`${pack}: ${validationError.message}`);
				const bytes = await readTexture(renderer.getOutputTexture());
				let nonzeroAlpha = 0;
				let minX = width;
				let minY = height;
				let maxX = -1;
				let maxY = -1;
				let maxAlpha = 0;
				let partialAlphaPixels = 0;
				for (let y = 0; y < height; y += 1) {
					for (let x = 0; x < width; x += 1) {
						const pixel = readPixel(bytes, x, y);
						if (pixel[3] > 0) {
							nonzeroAlpha += 1;
							minX = Math.min(minX, x);
							minY = Math.min(minY, y);
							maxX = Math.max(maxX, x);
							maxY = Math.max(maxY, y);
							maxAlpha = Math.max(maxAlpha, pixel[3]);
							if (pixel[3] < 126) partialAlphaPixels += 1;
							const insideAuthoredMark =
								y >= 24 && y < 88 && ((x >= 16 && x < 96) || (x >= 144 && x < 224));
							if (!insideAuthoredMark)
								errors.push(`${pack}: nonzero pixel escaped mark union at ${x},${y}`);
							if (pixel[0] > pixel[3] || pixel[1] > pixel[3] || pixel[2] > pixel[3]) {
								errors.push(`${pack}: non-premultiplied pixel at ${x},${y}`);
							}
						}
					}
				}
				if (nonzeroAlpha === 0) errors.push(`${pack}: renderer produced no nonzero alpha pixels`);
				if (minX !== 16 || minY !== 24 || maxX !== 223 || maxY !== 87) {
					errors.push(`${pack}: analytic extent was ${minX},${minY}-${maxX},${maxY}`);
				}
				if (maxAlpha < 126 || maxAlpha > 129)
					errors.push(`${pack}: fractional alpha max was ${maxAlpha}`);
				if (partialAlphaPixels === 0)
					errors.push(`${pack}: rounded mask produced no partial-alpha edge pixels`);
				const left = readPixel(bytes, 28, 56);
				const labelHole = readPixel(bytes, 60, 45);
				const right = readPixel(bytes, 184, 56);
				const outside = readPixel(bytes, 120, 56);
				for (const [name, pixel] of [
					['left', left],
					['right', right]
				] as const) {
					if (pixel[3] === 0)
						errors.push(
							`${pack}: ${name} mark is transparent; alphaBounds=${minX},${minY}-${maxX},${maxY}; pixels=${nonzeroAlpha}`
						);
					if (pixel[0] > pixel[3] || pixel[1] > pixel[3] || pixel[2] > pixel[3]) {
						errors.push(`${pack}: ${name} mark is not premultiplied`);
					}
				}
				if (labelHole.some((channel) => channel !== 0)) {
					errors.push(`${pack}: mark fill textured an inside value-label plate`);
				}
				const outerSamples = [
					outside,
					readPixel(bytes, 15, 56),
					readPixel(bytes, 96, 56),
					readPixel(bytes, 143, 56),
					readPixel(bytes, 224, 56),
					readPixel(bytes, 56, 23),
					readPixel(bytes, 56, 88)
				];
				if (outerSamples.some((pixel) => pixel.some((channel) => channel !== 0))) {
					errors.push(`${pack}: chart mark leaked outside analytic masks`);
				}
				packs.push({
					pack,
					leftAlpha: left[3],
					rightAlpha: right[3],
					outsideAlpha: outside[3],
					labelHoleAlpha: labelHole[3],
					maxAlpha,
					partialAlphaPixels,
					extent: [minX, minY, maxX, maxY]
				});
			}
			renderer.render(undefined);
			await device.queue.onSubmittedWorkDone();
			const cleared = await readTexture(renderer.getOutputTexture());
			const clearedAlpha = readPixel(cleared, 56, 56)[3];
			if (clearedAlpha !== 0) errors.push('Renderer clear left stale mark pixels.');
			renderer.dispose();
			device.destroy();
			return { errors, packs, clearedAlpha };
		});
		if (result.errors.length > 0) {
			throw new Error(`Bar/column GPU probe failed:\n${result.errors.join('\n')}`);
		}
		console.log(
			JSON.stringify({ probe: 'chart-bar-column-gpu', status: 'passed', ...result }, null, 2)
		);
	} finally {
		await browser.close();
	}
}

await main();
