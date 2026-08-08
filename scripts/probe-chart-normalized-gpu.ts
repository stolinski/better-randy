import { chromium } from 'playwright';

interface ProbeCaseResult {
	pack: string;
	variant: 'unit-grid-chart' | 'dot-field-chart';
	orientation: 'horizontal' | 'vertical';
	unitCount: number;
	packedBytes: number;
	firstAlpha: number;
	lastAlpha: number;
	cornerAlpha: number;
	gapAlpha: number;
	outsideAlpha: number;
	partialAlphaPixels: number;
	zeroRevealAlpha: number;
	midFirstAlpha: number;
	midLastAlpha: number;
}
interface ProbeResult {
	errors: string[];
	cases: ProbeCaseResult[];
	clearedAlpha: number;
}

async function main(): Promise<void> {
	const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
	try {
		const context = browser.contexts()[0];
		const page = context.pages()[0] ?? (await context.newPage());
		await page.goto('http://localhost:7263', { waitUntil: 'domcontentloaded', timeout: 30_000 });
		const result = await page.evaluate(async (): Promise<ProbeResult> => {
			if (!navigator.gpu) throw new Error('Normalized chart GPU probe requires navigator.gpu.');
			const adapter = await navigator.gpu.requestAdapter();
			if (!adapter) throw new Error('Normalized chart GPU probe found no WebGPU adapter.');
			const device = await adapter.requestDevice();
			const {
				createChartMarkRenderer,
				createChartMarkRendererWgsl,
				countChartMarkRendererInstances,
				packChartMarkRendererInstances
			} = await import('/src/lib/pipelines/shader-passes/chart-mark-renderer.ts');
			const { PACK_REGISTRY } = await import('/src/lib/platform/packs/registry.ts');
			const { resolveChartMarkFillTreatment } = await import('/src/lib/platform/packs/resolve.ts');
			const { resolveChartOrderedRevealProgress } = await import('/src/lib/utils/chart-motion.ts');
			const width = 512;
			const height = 320;
			const bytesPerRow = width * 4;
			const readPixel = (bytes: Uint8Array, x: number, y: number): readonly number[] => {
				const offset = y * bytesPerRow + x * 4;
				return Array.from(bytes.slice(offset, offset + 4));
			};
			const readTexture = async (texture: GPUTexture): Promise<Uint8Array> => {
				const readback = device.createBuffer({ size: bytesPerRow * height, usage: 0x01 | 0x08 });
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
			const compilationModule = device.createShaderModule({
				code: createChartMarkRendererWgsl(width, height)
			});
			const compilationInfo = await compilationModule.getCompilationInfo();
			const errors = compilationInfo.messages
				.filter((message) => message.type === 'error')
				.map((message) => `shader ${message.lineNum}:${message.linePos} ${message.message}`);
			device.pushErrorScope('validation');
			const renderer = createChartMarkRenderer(device, width, height);
			const creationError = await device.popErrorScope();
			if (creationError) errors.push(`pipeline: ${creationError.message}`);
			const cases: ProbeCaseResult[] = [];
			for (const [pack, manifest] of Object.entries(PACK_REGISTRY)) {
				for (const variant of ['unit-grid-chart', 'dot-field-chart'] as const) {
					for (const orientation of ['horizontal', 'vertical'] as const) {
						for (const unitCount of [10, 100, 1000]) {
							const columns =
								orientation === 'horizontal'
									? Math.min(40, unitCount)
									: Math.ceil(unitCount / Math.min(25, unitCount));
							const rows = Math.ceil(unitCount / columns);
							const categoryZeroCount = Math.round(unitCount * 0.674);
							const marks = Array.from({ length: unitCount }, (_, unitIndex) => {
								const column =
									orientation === 'horizontal' ? unitIndex % columns : Math.floor(unitIndex / rows);
								const row =
									orientation === 'horizontal' ? Math.floor(unitIndex / columns) : unitIndex % rows;
								const categoryIndex = unitIndex < categoryZeroCount ? 0 : 1;
								const categoryId = categoryIndex === 0 ? 'multiple' : 'one';
								const x = 10 + column * 10;
								const y = 10 + row * 10;
								return {
									id: `probe:${unitIndex}`,
									identity: { seriesId: 'respondents', categoryId },
									seriesId: 'respondents',
									categoryId,
									categoryIndex,
									unitIndex,
									categoryUnitIndex: unitIndex,
									fillVoiceIndex: categoryIndex,
									bounds: { x, y, width: 8, height: 8 },
									cornerRadius: variant === 'dot-field-chart' ? 4 : 1,
									isHighlighted: categoryIndex === 0,
									allocationKind: 'base' as const,
									labelPlateBounds: null,
									labelPlateProgress: 0,
									revealProgress: 1,
									revealAxis: 'coverage' as const,
									revealDirection: 'forward' as const,
									emphasisProgress: categoryIndex === 0 ? 1 : 0,
									calloutAnchor: { x: x + 4, y: y + 4 }
								};
							});
							const block = {
								id: 'probe',
								type: variant,
								title: 'Probe',
								data: {
									categories: [
										{ id: 'multiple', label: 'Multiple' },
										{ id: 'one', label: 'One' }
									],
									series: [
										{
											id: 'respondents',
											label: 'Respondents',
											values: [
												{ categoryId: 'multiple', value: 67.4 },
												{ categoryId: 'one', value: 32.6 }
											]
										}
									]
								},
								normalization: { total: 100, unitCount },
								labels: { categories: true, values: true, legend: false },
								fill: { role: 'series' as const },
								motion: {
									entry: { start: 0, duration: 0.1 },
									reveal: { start: 0.1, duration: 0.1 },
									emphasis: { start: 0.2, duration: 0.1 },
									annotation: { start: 0.3, duration: 0.1 },
									exit: { start: 0.8, duration: 0.1 }
								}
							};
							const renderInputs = {
								block,
								marks,
								swatches: [],
								baseFillByVoice: [0, 1].map((index) =>
									resolveChartMarkFillTreatment(manifest, 'series', index)
								),
								emphasisFillByVoice: [0, 1].map((index) =>
									resolveChartMarkFillTreatment(manifest, 'emphasis', index)
								),
								alpha: 0.5
							};
							if (countChartMarkRendererInstances(renderInputs) !== unitCount)
								errors.push(`${pack}/${variant}/${orientation}/${unitCount}: wrong instance count`);
							const packed = packChartMarkRendererInstances(renderInputs, width, height);
							const packedView = new DataView(packed);
							if (packed.byteLength !== unitCount * 176)
								errors.push(
									`${pack}/${variant}/${orientation}/${unitCount}: wrong packed byte size`
								);
							if (
								packedView.getUint32(96, true) !== 0 ||
								packedView.getUint32((unitCount - 1) * 176 + 96, true) !== 1
							)
								errors.push(
									`${pack}/${variant}/${orientation}/${unitCount}: category voices were not packed`
								);
							if (
								packedView.getFloat32(148, true) !== 1 ||
								packedView.getFloat32((unitCount - 1) * 176 + 148, true) !== 0
							)
								errors.push(
									`${pack}/${variant}/${orientation}/${unitCount}: highlight flags were not packed`
								);
							const revealInputsAt = (compositionProgress: number) => ({
								...renderInputs,
								marks: renderInputs.marks.map((mark, declarationIndex) => ({
									...mark,
									revealProgress: resolveChartOrderedRevealProgress(
										block.motion,
										compositionProgress,
										declarationIndex,
										unitCount
									)
								}))
							});
							renderer.render(revealInputsAt(0.1));
							await device.queue.onSubmittedWorkDone();
							const zeroRevealBytes = await readTexture(renderer.getOutputTexture());
							const zeroRevealAlpha = readPixel(
								zeroRevealBytes,
								marks[0].bounds.x + 4,
								marks[0].bounds.y + 4
							)[3];
							if (zeroRevealAlpha !== 0)
								errors.push(
									`${pack}/${variant}/${orientation}/${unitCount}: zero reveal painted a unit`
								);
							renderer.render(revealInputsAt(0.15));
							await device.queue.onSubmittedWorkDone();
							const midRevealBytes = await readTexture(renderer.getOutputTexture());
							const midFirstAlpha = readPixel(
								midRevealBytes,
								marks[0].bounds.x + 4,
								marks[0].bounds.y + 4
							)[3];
							const midLastAlpha = readPixel(
								midRevealBytes,
								marks.at(-1)!.bounds.x + 4,
								marks.at(-1)!.bounds.y + 4
							)[3];
							if (midFirstAlpha === 0 || midLastAlpha !== 0)
								errors.push(
									`${pack}/${variant}/${orientation}/${unitCount}: midpoint reveal violated declaration order`
								);
							device.pushErrorScope('validation');
							renderer.render(renderInputs);
							await device.queue.onSubmittedWorkDone();
							const validationError = await device.popErrorScope();
							if (validationError)
								errors.push(
									`${pack}/${variant}/${orientation}/${unitCount}: ${validationError.message}`
								);
							const bytes = await readTexture(renderer.getOutputTexture());
							const first = marks[0];
							const last = marks.at(-1)!;
							const firstAlpha = readPixel(bytes, first.bounds.x + 4, first.bounds.y + 4)[3];
							const lastAlpha = readPixel(bytes, last.bounds.x + 4, last.bounds.y + 4)[3];
							const cornerAlpha = readPixel(bytes, first.bounds.x, first.bounds.y)[3];
							const gapAlpha = readPixel(bytes, first.bounds.x + 9, first.bounds.y + 4)[3];
							const outsideAlpha = readPixel(bytes, 0, 0)[3];
							if (firstAlpha === 0 || lastAlpha === 0)
								errors.push(
									`${pack}/${variant}/${orientation}/${unitCount}: mark center was transparent`
								);
							if (variant === 'unit-grid-chart' && cornerAlpha === 0)
								errors.push(
									`${pack}/${variant}/${orientation}/${unitCount}: square corner was transparent`
								);
							if (variant === 'dot-field-chart' && cornerAlpha !== 0)
								errors.push(
									`${pack}/${variant}/${orientation}/${unitCount}: circular corner was filled`
								);
							if (gapAlpha !== 0 || outsideAlpha !== 0)
								errors.push(
									`${pack}/${variant}/${orientation}/${unitCount}: alpha escaped analytic masks`
								);
							let partialAlphaPixels = 0;
							for (let offset = 0; offset < bytes.length; offset += 4) {
								const alpha = bytes[offset + 3];
								if (alpha > 0 && alpha < 126) partialAlphaPixels += 1;
								if (
									bytes[offset] > alpha ||
									bytes[offset + 1] > alpha ||
									bytes[offset + 2] > alpha
								) {
									errors.push(
										`${pack}/${variant}/${orientation}/${unitCount}: non-premultiplied output`
									);
									break;
								}
							}
							if (partialAlphaPixels === 0)
								errors.push(
									`${pack}/${variant}/${orientation}/${unitCount}: no analytic antialiasing edge`
								);
							cases.push({
								pack,
								variant,
								orientation,
								unitCount,
								packedBytes: packed.byteLength,
								firstAlpha,
								lastAlpha,
								cornerAlpha,
								gapAlpha,
								outsideAlpha,
								partialAlphaPixels,
								zeroRevealAlpha,
								midFirstAlpha,
								midLastAlpha
							});
						}
					}
				}
			}
			renderer.render(undefined);
			await device.queue.onSubmittedWorkDone();
			const cleared = await readTexture(renderer.getOutputTexture());
			const clearedAlpha = readPixel(cleared, 14, 14)[3];
			if (clearedAlpha !== 0) errors.push('Renderer clear left stale normalized marks.');
			renderer.dispose();
			device.destroy();
			return { errors, cases, clearedAlpha };
		});
		if (result.errors.length > 0)
			throw new Error(`Normalized chart GPU probe failed:\n${result.errors.join('\n')}`);
		console.log(
			JSON.stringify({ probe: 'chart-normalized-gpu', status: 'passed', ...result }, null, 2)
		);
	} finally {
		await browser.close();
	}
}

await main();
