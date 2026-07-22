import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import type { RenderAnimState } from './anim-state.svelte.ts';
import { buildCompositionAnimationManifest } from './composition-animation-manifest.ts';
import type { AnimationTweenSpec } from './animation-manager.ts';
import type { EngineState, TextAnimation } from './engine-schema.ts';

function makeRuntime(): RenderAnimState {
	return {
		bodyVisibility: 0,
		markProgresses: [],
		overlayProgresses: [],
		overlayChannels: [],
		blockProgresses: {},
		blockAlphas: {},
		blockChannels: {},
		paperVisibility: 0,
		globalProgress: 0
	};
}

function makeManifestState(): EngineState {
	return {
		transport: { orientation: 'horizontal', durationSeconds: 10, fps: 30, format: 'webm' },
		typography: { fontFamily: 'serif' },
		marks: {
			defaults: { highlight: { color: '#ffee00', intensity: 0.6 } },
			timings: [
				{
					start: 0.8,
					duration: 0.1,
					ease: 'smooth',
					cascade: { anchor: { overlay: 'motion' }, event: 'end', offsetMs: 100 }
				}
			]
		},
		surface: {
			type: 'plain',
			content: {
				title: 'Manifest',
				body: [
					{
						type: 'paragraph',
						segments: [{ text: 'Marked', markStyles: ['highlight'] }]
					}
				]
			},
			animation: {
				channels: {
					opacity: [
						{ atMs: 0, value: 0 },
						{ atMs: 400, value: 1, ease: 'smooth' }
					]
				}
			},
			// Diagram primitive Block exercises the id-keyed animation records.
			diagram: [
				{
					type: 'node',
					id: 'node-a',
					position: { x: 0.5, y: 0.5 },
					form: 'box',
					enter: { start: 0.3, duration: 0.05, ease: 'settled' }
				}
			]
		},
		textAnimations: [
			{
				id: 'title',
				target: { kind: 'surface', slot: 'title' },
				effect: 'soft-blur-in',
				enter: { start: 0.9, duration: 0.05, ease: 'smooth' },
				cascade: { anchor: { mark: 0 }, event: 'end', offsetMs: 0 }
			}
		],
		overlays: [
			{
				id: 'motion',
				type: 'lower-third',
				content: {},
				position: { anchor: 'center', scale: 0.9 },
				enter: { start: 0.1, duration: 0.05, ease: 'smooth' },
				animation: {
					channels: {
						y: [
							{ atMs: 0, value: 0.1 },
							{ atMs: 500, value: 0, ease: 'settled' }
						]
					}
				}
			}
		],
		effects: [],
		audioCues: []
	} as unknown as EngineState;
}

describe('composition animation manifest', () => {
	it('derives ordered surface, mark, text, overlay, and Block tweens with Cascade starts', () => {
		const state = makeManifestState();
		const runtime = makeRuntime();
		let compiledEntries: readonly TextAnimation[] = [];
		const textTween: AnimationTweenSpec = {
			key: 'text-probe',
			start: 0,
			duration: 0.1,
			ease: 'none',
			onUpdate: () => undefined
		};
		const manifest = buildCompositionAnimationManifest({
			state,
			runtime,
			textAnimationRoot: null,
			textAnimationCompiler: {
				rebuild: (_root, entries) => {
					compiledEntries = entries;
					return [textTween];
				}
			},
			resolveMarkColor: () => '#ffee00'
		});

		assert.deepEqual(
			manifest.tweens.map((tween) => tween.key),
			[
				'paper-opacity-1',
				'mark-0',
				'text-probe',
				'overlay-motion-y-1',
				'block-node-a-enter'
			]
		);
		assert.ok(Math.abs((manifest.tweens.find((tween) => tween.key === 'mark-0')?.start ?? 0) - 0.16) < 1e-9);
		assert.equal(compiledEntries[0].enter.start, 0.26);
		assert.equal(state.textAnimations[0].enter.start, 0.9, 'Cascade resolution does not mutate authored text timing');
	});

	it('seeds and writes composition-owned runtime channels deterministically', () => {
		const runtime = makeRuntime();
		const manifest = buildCompositionAnimationManifest({
			state: makeManifestState(),
			runtime,
			textAnimationRoot: null,
			textAnimationCompiler: { rebuild: () => [] },
			resolveMarkColor: () => '#ffee00'
		});

		assert.equal(runtime.overlayChannels[0]?.scale, 0.9);
		assert.equal(runtime.overlayChannels[0]?.y, 0.1);
		assert.equal(runtime.overlayProgresses[0], 1);
		assert.equal(runtime.blockChannels['node-a'], null);

		manifest.tweens.find((tween) => tween.key === 'paper-opacity-1')?.onUpdate(0.75);
		manifest.tweens.find((tween) => tween.key === 'overlay-motion-y-1')?.onUpdate(0.025);
		manifest.tweens.find((tween) => tween.key === 'block-node-a-enter')?.onUpdate(0.6);
		assert.equal(runtime.paperVisibility, 0.75);
		assert.equal(runtime.overlayChannels[0]?.y, 0.025);
		assert.equal(runtime.blockProgresses['node-a'], 0.6);
	});
});
