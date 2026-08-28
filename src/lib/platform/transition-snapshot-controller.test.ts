import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { createDefaultEngineState, type Preset } from './engine-schema';
import type { ResolvedTransition } from './engine-state.svelte';
import type { GpuHost } from './gpu-host';
import type { CompiledTransitionWipe } from './pipelines/transition-pass';
import type {
	TransitionSnapshotFrameTextures,
	TransitionSnapshotsOptions
} from './pipelines/transition-snapshots';
import type { TransitionEffectRenderer } from './pipelines/types';
import {
	TransitionSnapshotController,
	type TransitionSnapshotControllerDependencies,
	type TransitionSnapshotControllerFactories
} from './transition-snapshot-controller';

function makePreset(name: string, pack: string, durationSeconds: number): Preset {
	const state = createDefaultEngineState();
	state.transport.durationSeconds = durationSeconds;
	state.surface.content.title = `${name} title`;
	return {
		schema: 'gfx@1',
		name,
		pack,
		kind: 'fixture',
		state
	};
}

function makeTransition(from: Preset, to: Preset): ResolvedTransition {
	return {
		fromSlug: 'from',
		toSlug: 'to',
		from,
		to,
		effect: 'mask-wipe',
		durationMs: 1_000,
		params: {}
	};
}

function clonePreset(preset: Preset): Preset {
	return structuredClone(preset);
}

interface TransitionControllerHarness {
	controller: TransitionSnapshotController;
	dependencies: TransitionSnapshotControllerDependencies;
	createdSizes: Array<{ width: number; height: number }>;
	disposedCaches: string[];
	renders: string[];
	renderedOrientations: Array<Preset['state']['transport']['orientation']>;
	/** Every capture step in order, so a snapshot rendered without an acknowledged
	 *  paint of the swapped-in endpoint is a test failure, not a stale frame. */
	captureSteps: string[];
	settledProgresses: number[];
	seekTimes: number[];
	capturingWrites: boolean[];
	getCurrentPreset(): Preset;
	setCurrentTransition(transition: ResolvedTransition | null): void;
	setRenderFailure(name: string | null): void;
}

function createHarness(source: Preset, initialCapturing = false): TransitionControllerHarness {
	const host = { format: 'bgra8unorm' } as unknown as GpuHost;
	const createdSizes: Array<{ width: number; height: number }> = [];
	const disposedCaches: string[] = [];
	const renders: string[] = [];
	const renderedOrientations: Array<Preset['state']['transport']['orientation']> = [];
	const captureSteps: string[] = [];
	const settledProgresses: number[] = [];
	const seekTimes: number[] = [];
	const capturingWrites: boolean[] = [];
	let currentPreset = clonePreset(source);
	let currentTransition: ResolvedTransition | null = null;
	let isCapturing = initialCapturing;
	let renderFailure: string | null = null;
	let cacheIndex = 0;

	const factories: TransitionSnapshotControllerFactories = {
		createSnapshots: ({ width, height }: TransitionSnapshotsOptions) => {
			const id = `cache-${cacheIndex++}`;
			createdSizes.push({ width, height });
			const fromView = { label: `${id}:from` } as unknown as GPUTextureView;
			const toView = { label: `${id}:to` } as unknown as GPUTextureView;
			return {
				fromTarget: () => fromView,
				toTarget: () => toView,
				fromTexture: () => ({ createView: () => fromView }) as unknown as GPUTexture,
				toTexture: () => ({ createView: () => toView }) as unknown as GPUTexture,
				dispose: () => disposedCaches.push(id)
			} satisfies TransitionSnapshotFrameTextures;
		},
		getTransitionEffectRenderer: () =>
			({ type: 'mask-wipe' }) as unknown as TransitionEffectRenderer<unknown>,
		compileEffect: () => ({ apply: () => undefined }) as CompiledTransitionWipe
	};

	const dependencies: TransitionSnapshotControllerDependencies = {
		host,
		width: 3840,
		height: 2160,
		captureCompositionState: () => clonePreset(currentPreset),
		applyCompositionState: (preset) => {
			currentPreset = clonePreset(preset);
			captureSteps.push(`apply:${preset.name}`);
		},
		readCapturing: () => isCapturing,
		writeCapturing: (value) => {
			isCapturing = value;
			capturingWrites.push(value);
		},
		flushDom: async () => undefined,
		waitForFonts: async () => undefined,
		waitForLayout: async () => undefined,
		settlePaint: async () => {
			captureSteps.push(`settle-paint:${currentPreset.name}`);
		},
		settleAnimation: (progress) => settledProgresses.push(progress),
		renderFrame: (outputView, timestamp) => {
			if (currentPreset.name === renderFailure) {
				throw new Error(`${currentPreset.name} render failed`);
			}
			const label = (outputView as unknown as { label: string }).label;
			renderedOrientations.push(currentPreset.state.transport.orientation);
			renders.push(`${currentPreset.name}:${label}:${timestamp}`);
			captureSteps.push(`render:${currentPreset.name}`);
			return 'flat';
		},
		isActiveTransition: (transition) => currentTransition === transition,
		seekTimeline: (timestamp) => seekTimes.push(timestamp)
	};

	return {
		controller: new TransitionSnapshotController(factories),
		dependencies,
		createdSizes,
		disposedCaches,
		renders,
		renderedOrientations,
		captureSteps,
		settledProgresses,
		seekTimes,
		capturingWrites,
		getCurrentPreset: () => clonePreset(currentPreset),
		setCurrentTransition: (transition) => {
			currentTransition = transition;
		},
		setRenderFailure: (name) => {
			renderFailure = name;
		}
	};
}

describe('transition snapshot controller', () => {
	it('captures deterministic from/to frames and restores the exact source composition', async () => {
		const source = makePreset('Transition source', 'crt-terminal', 1);
		source.state.transport.orientation = 'vertical';
		const from = makePreset('From', 'syntax', 4);
		const to = makePreset('To', 'editorial-mono', 6);
		const transition = makeTransition(from, to);
		const harness = createHarness(source);
		harness.setCurrentTransition(transition);

		await harness.controller.update(transition, harness.dependencies);

		assert.deepEqual(harness.renders, ['From:cache-0:from:2', 'To:cache-0:to:3']);
		assert.deepEqual(harness.renderedOrientations, ['vertical', 'vertical']);
		assert.deepEqual(harness.settledProgresses, [0.5, 0.5]);
		assert.deepEqual(harness.getCurrentPreset(), source);
		assert.deepEqual(harness.capturingWrites, [true, false]);
		assert.deepEqual(harness.seekTimes, [0]);
		assert.ok(harness.controller.cachedFrame());
	});

	it('acknowledges a paint of each swapped-in endpoint before rendering its snapshot', async () => {
		const source = makePreset('Transition source', 'syntax', 1);
		const from = makePreset('From', 'syntax', 4);
		const to = makePreset('To', 'editorial-mono', 6);
		const transition = makeTransition(from, to);
		const harness = createHarness(source);
		harness.setCurrentTransition(transition);

		await harness.controller.update(transition, harness.dependencies);

		assert.deepEqual(harness.captureSteps, [
			'apply:From',
			'settle-paint:From',
			'render:From',
			'apply:To',
			'settle-paint:To',
			'render:To',
			'apply:Transition source'
		]);
	});

	it('restores the source composition when an endpoint paint never settles', async () => {
		const source = makePreset('Transition source', 'syntax', 1);
		const transition = makeTransition(
			makePreset('From', 'syntax', 4),
			makePreset('To', 'syntax', 4)
		);
		const harness = createHarness(source);
		harness.dependencies.settlePaint = async () => {
			throw new Error('composition paint failed');
		};
		harness.setCurrentTransition(transition);

		await assert.rejects(
			harness.controller.update(transition, harness.dependencies),
			/composition paint failed/
		);

		assert.deepEqual(harness.renders, []);
		assert.deepEqual(harness.getCurrentPreset(), source);
		assert.deepEqual(harness.disposedCaches, ['cache-0']);
		assert.equal(harness.controller.cachedFrame(), null);
	});

	it('restores prior state and releases partial textures when the second capture fails', async () => {
		const source = makePreset('Transition source', 'crt-terminal', 1);
		const transition = makeTransition(
			makePreset('From', 'syntax', 4),
			makePreset('To', 'editorial-mono', 6)
		);
		const harness = createHarness(source, true);
		harness.setCurrentTransition(transition);
		harness.setRenderFailure('To');

		await assert.rejects(
			harness.controller.update(transition, harness.dependencies),
			/To render failed/
		);

		assert.deepEqual(harness.getCurrentPreset(), source);
		assert.deepEqual(harness.capturingWrites, [true, true]);
		assert.deepEqual(harness.disposedCaches, ['cache-0']);
		assert.equal(harness.controller.cachedFrame(), null);
		assert.deepEqual(harness.seekTimes, []);
	});

	it('invalidates and disposes a prepared cache exactly once', async () => {
		const source = makePreset('Transition source', 'syntax', 1);
		const transition = makeTransition(
			makePreset('From', 'syntax', 4),
			makePreset('To', 'syntax', 4)
		);
		const harness = createHarness(source);
		harness.setCurrentTransition(transition);
		await harness.controller.update(transition, harness.dependencies);

		harness.controller.invalidate();
		harness.controller.invalidate();
		harness.controller.dispose();

		assert.deepEqual(harness.disposedCaches, ['cache-0']);
		assert.equal(harness.controller.cachedFrame(), null);
	});

	it('recreates offscreen textures when output dimensions change', async () => {
		const source = makePreset('Transition source', 'syntax', 1);
		const transition = makeTransition(
			makePreset('From', 'syntax', 4),
			makePreset('To', 'syntax', 4)
		);
		const harness = createHarness(source);
		harness.setCurrentTransition(transition);
		await harness.controller.update(transition, harness.dependencies);

		await harness.controller.update(transition, {
			...harness.dependencies,
			width: 2160,
			height: 3840
		});

		assert.deepEqual(harness.createdSizes, [
			{ width: 3840, height: 2160 },
			{ width: 2160, height: 3840 }
		]);
		assert.deepEqual(harness.disposedCaches, ['cache-0']);
		assert.equal(harness.renders.length, 4);
	});

	it('invalidates an in-flight capture and prepares again when the transition returns', async () => {
		const source = makePreset('Transition source', 'syntax', 1);
		const transition = makeTransition(
			makePreset('From', 'syntax', 4),
			makePreset('To', 'syntax', 4)
		);
		const harness = createHarness(source);
		let releaseFirstFlush = (): void => {
			throw new Error('The first flush was not started.');
		};
		let shouldBlock = true;
		harness.dependencies.flushDom = () => {
			if (!shouldBlock) {
				return Promise.resolve();
			}
			shouldBlock = false;
			return new Promise<void>((resolve) => {
				releaseFirstFlush = resolve;
			});
		};
		harness.setCurrentTransition(transition);
		const firstPreparation = harness.controller.update(transition, harness.dependencies);
		await Promise.resolve();

		harness.setCurrentTransition(null);
		await harness.controller.update(null);
		harness.setCurrentTransition(transition);
		const returnedPreparation = harness.controller.update(transition, harness.dependencies);
		releaseFirstFlush();
		await Promise.all([firstPreparation, returnedPreparation]);

		assert.deepEqual(harness.createdSizes, [
			{ width: 3840, height: 2160 },
			{ width: 3840, height: 2160 }
		]);
		assert.deepEqual(harness.disposedCaches, ['cache-0']);
		assert.equal(harness.renders.length, 2);
		assert.ok(harness.controller.cachedFrame());
		assert.deepEqual(harness.getCurrentPreset(), source);
	});

	it('does not allocate or mutate composition state without a transition', async () => {
		const source = makePreset('Ordinary preset', 'syntax', 4);
		const harness = createHarness(source);

		await harness.controller.update(null);

		assert.deepEqual(harness.createdSizes, []);
		assert.deepEqual(harness.renders, []);
		assert.deepEqual(harness.capturingWrites, []);
		assert.deepEqual(harness.getCurrentPreset(), source);
		assert.equal(harness.controller.cachedFrame(), null);
	});
});
