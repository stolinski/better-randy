import assert from 'node:assert/strict';
import { describe, it, vi } from 'vitest';

import { createDefaultEngineState, type EngineState, type Preset } from './engine-schema';
import type { TransparentVideoExportOptions } from './export-video';
import {
	buildCompositionExportPlan,
	compositionExportFrameAt,
	CompositionExportController,
	type CompositionExportControllerDependencies,
	type CompositionExportControllerServices,
	type CompositionExportUiState
} from './composition-export-controller';

function makePreset(name: string, opaque: boolean): Preset {
	const state = createDefaultEngineState();
	if (opaque) state.backgroundFill = '#000000';
	return { schema: 'supers@1', name, pack: 'syntax', kind: 'fixture', state };
}

function makeState(options?: {
	format?: 'webm' | 'prores';
	orientation?: 'horizontal' | 'vertical';
	durationSeconds?: number;
	fps?: number;
	opaque?: boolean;
}): EngineState {
	const state = createDefaultEngineState();
	state.transport.format = options?.format ?? 'webm';
	state.transport.orientation = options?.orientation ?? 'horizontal';
	state.transport.durationSeconds = options?.durationSeconds ?? 4;
	state.transport.fps = options?.fps ?? 30;
	if (options?.opaque) state.backgroundFill = '#101010';
	return state;
}

describe('composition export plan', () => {
	it('classifies transparent WebM and preserves exact rational frame timing', () => {
		const plan = buildCompositionExportPlan({
			state: makeState({ durationSeconds: 10.01, fps: 29.97 }),
			transition: null
		});

		assert.equal(plan.output, 'transparent');
		assert.equal(plan.codec, 'vp9-alpha');
		assert.deepEqual(plan.size, { width: 3840, height: 2160 });
		assert.deepEqual(plan.frameRate, { fps: 29.97, num: 30000, den: 1001 });
		assert.equal(plan.frameCount, 300);
		assert.equal(plan.videoFilename, 'supers-overlay.webm');
		assert.equal(plan.wavFilename, 'supers-overlay.wav');
	});

	it('keeps opaque ProRes on the existing 4444 lane at native vertical dimensions', () => {
		const plan = buildCompositionExportPlan({
			state: makeState({ format: 'prores', orientation: 'vertical', opaque: true }),
			transition: null,
			request: { startTimecode: '01:00:08:00', filename: 'synced-piece.mov' }
		});

		assert.equal(plan.output, 'opaque');
		assert.equal(plan.codec, 'prores-4444');
		assert.deepEqual(plan.size, { width: 2160, height: 3840 });
		assert.equal(plan.basename, 'supers-bumper');
		assert.equal(plan.videoFilename, 'synced-piece.mov');
		assert.equal(plan.wavFilename, 'supers-bumper.wav');
	});

	it('classifies a transition as opaque only when both endpoint Presets are opaque', () => {
		const state = makeState({ opaque: true });
		const opaque = makePreset('Opaque', true);
		const transparent = makePreset('Transparent', false);

		assert.equal(
			buildCompositionExportPlan({ state, transition: { from: opaque, to: opaque } }).output,
			'opaque'
		);
		assert.equal(
			buildCompositionExportPlan({ state, transition: { from: opaque, to: transparent } })
				.output,
			'transparent'
		);
	});

	it('rejects a start timecode on the WebM lane', () => {
		assert.throws(
			() =>
				buildCompositionExportPlan({
					state: makeState(),
					transition: null,
					request: { startTimecode: '01:00:08:00' }
				}),
			/A start timecode requires the ProRes format/
		);
	});
});

describe('composition export frame sequence', () => {
	it('maps every frame index to the exact rational timestamp', () => {
		const plan = buildCompositionExportPlan({
			state: makeState({ durationSeconds: 10.01, fps: 29.97 }),
			transition: null
		});

		assert.deepEqual(compositionExportFrameAt(plan, 0), { frame: 0, timestamp: 0 });
		assert.deepEqual(compositionExportFrameAt(plan, 299), {
			frame: 299,
			timestamp: (299 * 1001) / 30000
		});
		assert.throws(() => compositionExportFrameAt(plan, 300), RangeError);
	});
});

interface ExportControllerHarness {
	controller: CompositionExportController;
	dependencies: CompositionExportControllerDependencies;
	uiStates: CompositionExportUiState[];
	downloads: string[];
	renderedTimestamps: number[];
	animationProgresses: number[];
	getDisposedManagerCount(): number;
	getFailureCount(): number;
}

function createHarness(options?: {
	state?: EngineState;
	audio?: AudioBuffer | null;
	separateWav?: boolean;
	exportWebM?: (options: TransparentVideoExportOptions) => Promise<Blob>;
}): ExportControllerHarness {
	const state = options?.state ?? makeState({ durationSeconds: 2, fps: 2 });
	const uiStates: CompositionExportUiState[] = [];
	const downloads: string[] = [];
	const renderedTimestamps: number[] = [];
	const animationProgresses: number[] = [];
	let disposedManagerCount = 0;
	let failureCount = 0;

	const defaultExport = async (exportOptions: TransparentVideoExportOptions): Promise<Blob> => {
		const frameCount = exportOptions.frameCount ?? 0;
		for (let frame = 0; frame < frameCount; frame += 1) {
			const timestamp = exportOptions.timestampForFrame?.(frame) ?? -1;
			await exportOptions.renderFrame(frame, timestamp);
			exportOptions.onProgress?.((frame + 1) / frameCount);
		}
		return new Blob(['video']);
	};

	const services: CompositionExportControllerServices = {
		createAnimationManager: () => ({
			rebuild: () => undefined,
			progress: (fraction) => animationProgresses.push(fraction),
			dispose: () => {
				disposedManagerCount += 1;
			}
		}),
		renderAudio: async () => options?.audio ?? null,
		exportWebM: options?.exportWebM ?? defaultExport,
		exportProRes: defaultExport,
		download: (_blob, filename) => downloads.push(filename),
		encodeWav: () => new Uint8Array([1, 2, 3]),
		reportFailure: () => {
			failureCount += 1;
		}
	};

	const dependencies: CompositionExportControllerDependencies = {
		readState: () => state,
		readTransition: () => null,
		readCanvas: () => ({ width: 3840, height: 2160 }) as OffscreenCanvas,
		isFrameRendererReady: () => true,
		readSeparateWav: () => options?.separateWav ?? false,
		pauseTimeline: vi.fn(),
		buildAnimationManifest: () => ({ tweens: [] }),
		writeGlobalProgress: () => undefined,
		flushDom: async () => undefined,
		renderCompositionFrame: (timestamp) => {
			renderedTimestamps.push(timestamp);
			return 'flat';
		},
		writeExportUiState: (next) => uiStates.push(next)
	};

	return {
		controller: new CompositionExportController(services),
		dependencies,
		uiStates,
		downloads,
		renderedTimestamps,
		animationProgresses,
		getDisposedManagerCount: () => disposedManagerCount,
		getFailureCount: () => failureCount
	};
}

describe('composition export controller lifecycle', () => {
	it('steps shared frames, reports progress, downloads video plus separate WAV, and cleans up', async () => {
		const audio = {} as AudioBuffer;
		const harness = createHarness({ audio, separateWav: true });

		await harness.controller.export(harness.dependencies);

		assert.deepEqual(harness.renderedTimestamps, [0, 0.5, 1, 1.5]);
		assert.deepEqual(harness.animationProgresses, [0, 0.25, 0.5, 0.75]);
		assert.deepEqual(harness.downloads, ['supers-overlay.webm', 'supers-overlay.wav']);
		assert.deepEqual(harness.uiStates[0], { isExporting: true, progress: 0, status: '' });
		assert.deepEqual(
			harness.uiStates.filter((entry) => entry.isExporting).map((entry) => entry.progress),
			[0, 0.25, 0.5, 0.75, 1]
		);
		assert.equal(harness.uiStates.at(-1)?.isExporting, false);
		assert.equal(harness.getDisposedManagerCount(), 1);
		assert.equal(harness.getFailureCount(), 0);
	});

	it('publishes an encoder failure and releases the animation manager', async () => {
		const harness = createHarness({
			exportWebM: async () => {
				throw new Error('encoder failed');
			}
		});

		await harness.controller.export(harness.dependencies);

		assert.deepEqual(harness.downloads, []);
		assert.equal(harness.uiStates.at(-1)?.isExporting, false);
		assert.equal(harness.uiStates.at(-1)?.status, 'encoder failed');
		assert.equal(harness.getDisposedManagerCount(), 1);
		assert.equal(harness.getFailureCount(), 1);
	});

	it('aborts an active encoder without reporting failure or downloading partial output', async () => {
		let markStarted = (): void => undefined;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const harness = createHarness({
			exportWebM: async ({ signal }) => {
				markStarted();
				return new Promise<Blob>((_resolve, reject) => {
					signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
				});
			}
		});

		const pending = harness.controller.export(harness.dependencies);
		await started;
		harness.controller.cancel();
		await pending;

		assert.deepEqual(harness.downloads, []);
		assert.equal(harness.uiStates.at(-1)?.isExporting, false);
		assert.equal(harness.uiStates.at(-1)?.status, '');
		assert.equal(harness.getDisposedManagerCount(), 1);
		assert.equal(harness.getFailureCount(), 0);
	});

	it('fails before allocation when the canvas is not at the orientation native size', async () => {
		const harness = createHarness();
		harness.dependencies.readCanvas = () => ({ width: 1920, height: 1080 }) as OffscreenCanvas;

		await harness.controller.export(harness.dependencies);

		assert.match(harness.uiStates.at(-1)?.status ?? '', /must be 3840x2160/);
		assert.equal(harness.getDisposedManagerCount(), 0);
	});
});
