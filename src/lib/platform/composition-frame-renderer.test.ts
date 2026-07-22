import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { createDefaultEngineState, type Effect, type EngineState } from './engine-schema';
import type { GpuHost } from './gpu-host';
import { getPack } from './packs/registry';
import type { CompositionPlanes } from './pipelines/composition-planes';
import type { DepthStage } from './pipelines/depth-stage';
import type { EffectChain } from './pipelines/effect-chain';
import type { ShaderPassDispatcher } from './pipelines/shader-pass-runner';
import type { CompiledTransitionWipe } from './pipelines/transition-pass';
import type { TransitionSnapshots } from './pipelines/transition-snapshots';
import type { SurfaceRenderInputs, SurfaceRenderInstance } from './pipelines/types';
import {
	renderCompositionFrameTo,
	resolveCompositionFrameBranchOrder,
	shouldSplitCompositionPlanes,
	type CompositionFrameRenderRequest
} from './composition-frame-renderer';

const SURFACE_INPUTS: SurfaceRenderInputs = {
	animState: { markProgresses: [] },
	markColorsByIndex: [],
	markIntensityByIndex: [],
	timestamp: 0
};

function texture(label: string): GPUTexture {
	return {
		createView: () => ({ label }) as unknown as GPUTextureView
	} as unknown as GPUTexture;
}

function stageState(): EngineState {
	const state = createDefaultEngineState();
	state.stage = {
		type: 'depth',
		camera: { move: 'push', amount: 0.5, ease: 'smooth' },
		focus: { focusZ: 0, aperture: 0.6, band: 0 }
	};
	return state;
}

function dofEffect(): Effect {
	return { type: 'depth-of-field', id: 'dof', params: { focusZ: 0.7, aperture: 0.5 } };
}

describe('composition frame renderer branch policy', () => {
	it('gives cached transitions exclusive precedence over every live branch', () => {
		const state = stageState();
		state.effects.push(dofEffect());
		assert.deepEqual(resolveCompositionFrameBranchOrder(state, true), ['transition']);
	});

	it('orders stage, DOF, and flat fallback deterministically', () => {
		const state = stageState();
		state.effects.push(dofEffect());
		assert.deepEqual(resolveCompositionFrameBranchOrder(state, false), ['stage', 'dof', 'flat']);

		state.stage = undefined;
		assert.deepEqual(resolveCompositionFrameBranchOrder(state, false), ['dof', 'flat']);

		state.effects = [];
		assert.deepEqual(resolveCompositionFrameBranchOrder(state, false), ['flat']);
	});

	it('splits Composition for DOF, GPU-owned opacity, and staged overlays', () => {
		const state = createDefaultEngineState();
		assert.equal(shouldSplitCompositionPlanes(state), false);

		state.effects.push(dofEffect());
		assert.equal(shouldSplitCompositionPlanes(state), true);

		state.effects = [];
		state.surface.animation = {
			channels: {
				opacity: [
					{ atMs: 0, value: 0 },
					{ atMs: 100, value: 1 }
				]
			}
		};
		assert.equal(shouldSplitCompositionPlanes(state), true);

		const staged = stageState();
		staged.overlays.push({
			type: 'lower-third',
			id: 'credit',
			content: { title: 'Credit' },
			position: { anchor: 'bottom-left' }
		});
		assert.equal(shouldSplitCompositionPlanes(staged), true);
	});
});

describe('composition frame renderer ordering', () => {
	it('does not build inputs or upload live DOM for a cached transition', () => {
		const calls: string[] = [];
		const state = createDefaultEngineState();
		state.transport.durationSeconds = 4;
		const fromTexture = texture('from');
		const toTexture = texture('to');
		const snapshots = {
			fromTexture: () => fromTexture,
			toTexture: () => toTexture
		} as unknown as TransitionSnapshots;
		const wipe = {
			apply: ({ progress }: { progress: number }) => calls.push(`wipe:${progress}`)
		} as unknown as CompiledTransitionWipe;

		const result = renderCompositionFrameTo({
			outputView: {} as GPUTextureView,
			timestamp: 1,
			state,
			pack: getPack('syntax'),
			paperVisibility: 1,
			compositionElement: null,
			overlayRootElement: null,
			substrateTexture: null,
			resources: {
				host: null,
				pipeline: null,
				effectChain: null,
				shaderPassDispatcher: null,
				compositionPlanes: null,
				depthStage: null
			},
			cachedTransition: { snapshots, wipe },
			buildSurfaceInputs: () => {
				throw new Error('transition must not build live Surface inputs');
			}
		});

		assert.equal(result, 'transition');
		assert.deepEqual(calls, ['wipe:0.25']);
	});

	it('builds once, uploads once, then dispatches shader passes before effect/present', () => {
		const calls: string[] = [];
		const state = createDefaultEngineState();
		state.transport.durationSeconds = 8;
		state.backgroundFill = '#101010';
		const surfaceTexture = texture('surface');
		const shaderTexture = texture('shader');
		const encoder = {} as GPUCommandEncoder;
		const pipeline = {
			uploadDom: () => calls.push('upload-dom'),
			render: (inputs: SurfaceRenderInputs) => calls.push(`render:${inputs.timestamp}`),
			getOutputTexture: () => surfaceTexture
		} as unknown as SurfaceRenderInstance;
		const host = {
			canvas: { width: 3840, height: 2160 },
			device: {
				createCommandEncoder: () => {
					calls.push('create-encoder');
					return encoder;
				}
			}
		} as unknown as GpuHost;
		const shaderPassDispatcher = {
			apply: (options: { commandEncoder: GPUCommandEncoder; ctx: { progress: number } }) => {
				assert.equal(options.commandEncoder, encoder);
				calls.push(`shader:${options.ctx.progress}`);
				return shaderTexture;
			}
		} as unknown as ShaderPassDispatcher;
		const effectChain = {
			apply: (options: {
				commandEncoder: GPUCommandEncoder;
				inputTexture: GPUTexture;
				effects: readonly Effect[];
				progress: number;
				timestamp: number;
			}) => {
				assert.equal(options.commandEncoder, encoder);
				assert.equal(options.inputTexture, shaderTexture);
				assert.equal(options.progress, 0.25);
				assert.equal(options.timestamp, 2);
				assert.equal(options.effects.at(-1)?.type, 'crt-tube');
				calls.push('effects-present');
			}
		} as unknown as EffectChain;

		const request: CompositionFrameRenderRequest = {
			outputView: {} as GPUTextureView,
			timestamp: 2,
			state,
			pack: getPack('crt-terminal'),
			paperVisibility: 1,
			compositionElement: null,
			overlayRootElement: null,
			substrateTexture: null,
			resources: {
				host,
				pipeline,
				effectChain,
				shaderPassDispatcher,
				compositionPlanes: null as CompositionPlanes | null,
				depthStage: null as DepthStage | null
			},
			cachedTransition: null,
			buildSurfaceInputs: (timestamp) => {
				calls.push('build-inputs');
				return { ...SURFACE_INPUTS, timestamp };
			}
		};

		assert.equal(renderCompositionFrameTo(request), 'flat');
		assert.deepEqual(calls, [
			'build-inputs',
			'upload-dom',
			'render:2',
			'create-encoder',
			'shader:0.25',
			'effects-present'
		]);
	});
});
