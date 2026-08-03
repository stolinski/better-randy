import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { frostedGlassEffectRenderer } from './index';

const FRAME_CONTEXT = {
	progress: 0.64,
	timestamp: 3.2,
	canvasWidth: 2160,
	canvasHeight: 3840,
	stageContentScale: 1
};

interface PackedVector4 {
	e0: number;
	e1: number;
	e2: number;
	e3: number;
}

describe('frosted glass Effect', () => {
	it('ships schema-valid defaults', () => {
		const defaults = frostedGlassEffectRenderer.defaults();
		const result = frostedGlassEffectRenderer.schema.safeParse({
			type: 'frosted-glass',
			id: 'frost',
			params: defaults.params
		});

		assert.equal(result.success, true);
	});

	it('rejects reversed melt timing', () => {
		const defaults = frostedGlassEffectRenderer.defaults();
		const result = frostedGlassEffectRenderer.schema.safeParse({
			type: 'frosted-glass',
			id: 'frost',
			params: {
				...defaults.params,
				melt: {
					center: { x: 0.5, y: 0.5 },
					radius: 0.28,
					softness: 0.08,
					from: 0.7,
					to: 0.4
				}
			}
		});

		assert.equal(result.success, false);
	});

	it('packs optional melt geometry as a frame-addressed mask', () => {
		const defaults = frostedGlassEffectRenderer.defaults();
		const packed = frostedGlassEffectRenderer.pass.pack(
			{
				...defaults.params,
				melt: {
					center: { x: 0.35, y: 0.6 },
					radius: 0.24,
					softness: 0.05,
					from: 0.4,
					to: 0.7
				}
			},
			FRAME_CONTEXT
		);
		const melt = packed.melt as PackedVector4;
		const timing = packed.meltTiming as PackedVector4;

		for (const [actual, expected] of [
			[melt.e0, 0.35],
			[melt.e1, 0.6],
			[melt.e2, 0.24],
			[melt.e3, 0.05],
			[timing.e0, 0.4],
			[timing.e1, 0.7],
			[timing.e2, 1],
			[timing.e3, 0]
		]) {
			assert.ok(Math.abs(actual - expected) < 0.000001);
		}
		assert.equal(packed.progress, 0.64);
		assert.equal(packed.timestamp, 3.2);
		assert.equal(packed.seed, 4107);
	});

	it('uses a dense isotropic gaussian transmission kernel', () => {
		const wgsl = frostedGlassEffectRenderer.pass.fragmentBody;

		assert.match(wgsl, /array<f32, 13>/);
		assert.match(wgsl, /blurX < 13/);
		assert.match(wgsl, /blurY < 13/);
		assert.match(wgsl, /transmission = transmission \/ 16777216\.0/);
	});

	it('keeps full-frame frost native and scopes local frost to padded pixel bounds', () => {
		const defaults = frostedGlassEffectRenderer.defaults();
		assert.deepEqual(frostedGlassEffectRenderer.pass.execution?.(defaults.params, FRAME_CONTEXT), {});
		assert.deepEqual(
			frostedGlassEffectRenderer.pass.execution?.(
				{ ...defaults.params, region: { x: 0.2, y: 0.25, width: 0.3, height: 0.2 } },
				{ ...FRAME_CONTEXT, canvasWidth: 3840, canvasHeight: 2160 }
			),
			{ region: { x: 720, y: 492, width: 1248, height: 528 } }
		);
	});
});
