import assert from 'node:assert/strict';

import { describe, it } from 'vitest';

import {
	getPipelineRendererRuntime,
	PipelineRendererRuntime,
	setPipelineRendererRuntime
} from './runtime-context.svelte';
import { PipelineRendererController, type PipelineRuntimeLoaderRegistry } from './runtime-loader';

const EMPTY_LOADERS: PipelineRuntimeLoaderRegistry = {
	surfaces: {},
	blocks: {},
	annotations: {},
	overlays: {},
	effects: {},
	transitions: {}
};

describe('PipelineRendererRuntime', () => {
	it('keeps the named context accessors available to renderer consumers', () => {
		assert.equal(typeof getPipelineRendererRuntime, 'function');
		assert.equal(typeof setPipelineRendererRuntime, 'function');
	});

	it('advances its reactive revision for activation-only bundle changes', () => {
		const controller = new PipelineRendererController(EMPTY_LOADERS);
		const runtime = new PipelineRendererRuntime(controller);
		const before = runtime.activationRevision();
		controller.activate({
			surfaces: new Map(),
			blocks: new Map(),
			annotations: new Map(),
			overlays: new Map(),
			effects: new Map(),
			transitions: new Map()
		});

		assert.equal(runtime.activationRevision(), before + 1);
	});
});
