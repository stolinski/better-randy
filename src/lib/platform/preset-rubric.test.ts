import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { describe, it } from 'vitest';

// The rubric resolves absent typography colours through the Pack registry
// (ADR-0038), whose manifests transitively import @fontsource side-effect
// stylesheets — stub `.css` modules so the chain loads outside Vite (same
// hook as scripts/verify-presets.ts).
registerHooks({
	load(url, context, nextLoad) {
		if (url.endsWith('.css')) {
			return { format: 'module', source: '', shortCircuit: true };
		}
		return nextLoad(url, context);
	}
});

// Dynamic import: a static one is hoisted above `registerHooks`, so the css
// chain would load before the stub exists.
const { lintPreset, lintPresetVisual } = await import('./preset-rubric.ts');
type RubricIssue = import('./preset-rubric.ts').RubricIssue;
type Preset = import('./engine-schema.ts').Preset;

const MARKED_BODY = [
	{
		type: 'paragraph',
		segments: [{ text: 'the marked phrase', markStyles: ['highlight'] }]
	}
];

function makePreset(partial: {
	surface?: Record<string, unknown>;
	overlays?: unknown[];
	timings?: unknown[];
}): Preset {
	return {
		schema: 'supers@1',
		name: 'rubric fixture',
		pack: 'syntax',
		kind: 'fixture',
		state: {
			transport: { orientation: 'horizontal', durationSeconds: 6, fps: 30, format: 'webm' },
			typography: { fontFamily: 'sans', paperColor: '#ffffff', inkColor: '#111111' },
			marks: { defaults: {}, timings: partial.timings ?? [] },
			surface: {
				type: 'plain',
				content: { body: MARKED_BODY },
				...partial.surface
			},
			textAnimations: [],
			overlays: partial.overlays ?? [],
			effects: [],
			audioCues: []
		}
	} as unknown as Preset;
}

function rules(issues: RubricIssue[]): string[] {
	return issues.map((issue) => issue.rule);
}

describe('preset rubric', () => {
	it('validates exact orientation rects without clamping authored geometry', () => {
		const preset = makePreset({
			overlays: [
				{
					type: 'instagram-follow',
					id: 'follow',
					content: {},
					position: {
						anchor: 'bottom-left',
						offset: { x: 0.06, y: 0.08 },
						orientationOverrides: {
							vertical: {
								anchor: 'normalized-rect',
								rect: { x: 0.1, y: 0.82, width: 0.5, height: 0.1 }
							}
						}
					}
				}
			]
		});
		preset.state.transport.orientation = 'vertical';

		const issues = lintPreset(preset).filter((issue) => issue.rule === 'G2');

		assert.equal(issues.length, 1);
		assert.equal(issues[0].path, 'overlays[0].position.orientationOverrides.vertical.rect');
		assert.equal(
			preset.state.overlays[0].position.orientationOverrides?.vertical?.rect?.y,
			0.82,
			'validation never clamps authored placement'
		);
	});

	it('does not invent lower-third failures from a container anchor offset', () => {
		const preset = makePreset({
			overlays: [
				{
					type: 'lower-third',
					id: 'main',
					content: { title: 'Readable title', subtitle: 'Readable subtitle' },
					position: {
						anchor: 'bottom-left',
						offset: { x: 0.06, y: 0.13880917445208948 }
					}
				}
			]
		});
		preset.state.transport.orientation = 'vertical';

		const placementIssues = lintPreset(preset).filter(
			(issue) => issue.rule === 'G2' || issue.rule === 'L1'
		);
		assert.deepEqual(placementIssues, []);
	});

	it('validates resolved Diagram geometry without clamping authored points', () => {
		const preset = makePreset({
			surface: {
				diagram: [
					{
						type: 'label',
						id: 'headline',
						position: { x: 0.5, y: 0.2 },
						text: 'Headline',
						orientationOverrides: {
							vertical: { position: { x: 0.5, y: 0.02 }, scale: 1.5 }
						}
					}
				]
			}
		});
		preset.state.transport.orientation = 'vertical';

		const issues = lintPreset(preset).filter((issue) => issue.rule === 'G2');

		assert.equal(issues.length, 1);
		assert.equal(
			issues[0].path,
			'surface.diagram[0].orientationOverrides.vertical.position'
		);
		const label = preset.state.surface.diagram?.[0];
		assert.equal(
			label?.type === 'label' ? label.orientationOverrides?.vertical?.position.y : undefined,
			0.02,
			'validation never clamps authored Diagram geometry'
		);
	});

	it('accepts the website showcase top-edge plate relationship', () => {
		const preset = makePreset({
			surface: {
				type: 'website-screenshot',
				content: {
					body: [],
					sourceUrl: 'https://example.com',
					imageUrl: `/api/user-assets/${'a'.repeat(64)}.png`
				},
				enter: { start: 0, duration: 0.07, ease: 'settled' },
				exit: { start: 0.9, duration: 0.1, ease: 'smooth' }
			},
			overlays: [
				{
					type: 'source-url',
					id: 'source',
					content: { url: 'example.com' },
					position: { anchor: 'center' },
					enter: { start: 0.09, duration: 0.0467, ease: 'sharp' },
					exit: { start: 0.8833, duration: 0.05, ease: 'sharp' },
					animation: {
						cascade: { anchor: 'surface', event: 'end', offsetMs: 120 }
					}
				}
			]
		});

		const websiteIssues = lintPreset(preset).filter((issue) => issue.rule.startsWith('WS'));
		assert.deepEqual(websiteIssues, []);
	});

	it('enforces timing guardrails and reports cascade cycles', () => {
		// ── L4 against the authored opacity envelope ──────────────────────────────

		{
			// BROKEN: plateau 300 → 1300 ms = 1.0 s hold — under the 2.5 s read floor.
			const broken = makePreset({
				overlays: [
					{
						type: 'lower-third',
						id: 'main',
						content: { kicker: 'K', title: 'T' },
						position: { anchor: 'bottom-left', offset: { x: 0.06, y: 0.115 } },
						animation: {
							channels: {
								opacity: [
									{ atMs: 0, value: 0 },
									{ atMs: 300, value: 1, ease: 'smooth' },
									{ atMs: 1300, value: 1, ease: 'smooth' },
									{ atMs: 1600, value: 0, ease: 'smooth' }
								]
							}
						}
					}
				]
			});
			const issues = lintPreset(broken).filter((issue) => issue.rule === 'L4');
			assert.equal(issues.length, 1, `broken envelope fires L4: ${rules(lintPreset(broken))}`);
			assert.ok(issues[0].message.includes('opacity envelope'));

			// FIXED: plateau 300 → 5100 ms = 4.8 s.
			const good = makePreset({
				overlays: [
					{
						type: 'lower-third',
						id: 'main',
						content: { kicker: 'K', title: 'T' },
						position: { anchor: 'bottom-left', offset: { x: 0.06, y: 0.115 } },
						animation: {
							channels: {
								opacity: [
									{ atMs: 0, value: 0 },
									{ atMs: 300, value: 1, ease: 'smooth' },
									{ atMs: 5100, value: 1, ease: 'smooth' },
									{ atMs: 5460, value: 0, ease: 'smooth' }
								]
							}
						}
					}
				]
			});
			assert.equal(lintPreset(good).filter((issue) => issue.rule === 'L4').length, 0);
		}

		// ── A1 against cascade-resolved mark starts ────────────────────────────────

		{
			// Surface settles at 0.05 + 0.1 = 0.15. The mark's STORED start (0.5) is
			// fine, but its weld resolves to the surface's enter START (0.05) — early.
			const broken = makePreset({
				surface: {
					enter: { start: 0.05, duration: 0.1, ease: 'smooth' }
				},
				timings: [
					{
						start: 0.5,
						duration: 0.2,
						ease: 'smooth',
						cascade: { anchor: 'surface', event: 'start', offsetMs: 0 }
					}
				]
			});
			assert.equal(
				lintPreset(broken).filter((issue) => issue.rule === 'A1').length,
				1,
				'welded-early mark fires A1 at its RESOLVED start'
			);

			// Welded to the surface END +200 ms → clear of the buffer, no A1.
			const good = makePreset({
				surface: { enter: { start: 0.05, duration: 0.1, ease: 'smooth' } },
				timings: [
					{
						start: 0.5,
						duration: 0.2,
						ease: 'smooth',
						cascade: { anchor: 'surface', event: 'end', offsetMs: 200 }
					}
				]
			});
			assert.equal(lintPreset(good).filter((issue) => issue.rule === 'A1').length, 0);
		}

		// ── A1 against a channel-owned surface's envelope settle ──────────────────

		{
			// Surface opacity lands at 400 ms (= 0.0667); a mark at 0.05 is early.
			const broken = makePreset({
				surface: {
					animation: {
						channels: {
							opacity: [
								{ atMs: 0, value: 0 },
								{ atMs: 400, value: 1, ease: 'smooth' }
							]
						}
					}
				},
				timings: [{ start: 0.05, duration: 0.2, ease: 'smooth' }]
			});
			assert.equal(
				lintPreset(broken).filter((issue) => issue.rule === 'A1').length,
				1,
				'mark before the envelope settle fires A1'
			);
		}

		// ── Cascade cycles degrade to an issue, never a crash ──────────────────────

		{
			const cyclic = makePreset({
				overlays: [
					{
						type: 'lower-third',
						id: 'a',
						content: { kicker: 'K', title: 'T' },
						position: { anchor: 'bottom-left', offset: { x: 0.06, y: 0.115 } },
						enter: { start: 0.1, duration: 0.05, ease: 'smooth' },
						exit: { start: 0.9, duration: 0.04, ease: 'smooth' },
						animation: { cascade: { anchor: { overlay: 'a' }, event: 'start', offsetMs: 0 } }
					}
				]
			});
			const issues = lintPreset(cyclic);
			assert.equal(issues.filter((issue) => issue.rule === 'A4').length, 1, 'cycle surfaces as A4');
		}
	});

	it('excludes Diagram title and label bands from body density checks', () => {
		const preset = makePreset({});
		const issues = lintPresetVisual({
			preset,
			surface: {
				cardRect: { x: 0, y: 0, width: 3840, height: 2160 },
				visibleCardRect: { x: 0, y: 0, width: 3840, height: 2160 },
				textBounds: { x: 400, y: 300, width: 900, height: 300 },
				texts: [
					{
						role: 'title',
						bandKey: 'surface-title',
						capHeight: 60,
						fontFamily: 'mono',
						lineHeight: 1,
						charsPerLine: 12,
						lineCount: 1,
						label: 'Diagram headline'
					},
					{
						role: 'caption',
						bandKey: 'surface-label',
						capHeight: 24,
						fontFamily: 'mono',
						lineHeight: 1,
						charsPerLine: 10,
						lineCount: 1,
						label: 'Diagram caption'
					}
				],
				bleeds: false,
				bleedLength: 0
			}
		});

		assert.deepEqual(
			issues.filter((issue) => issue.rule === 'G4-density'),
			[]
		);
	});

	it("lints the backgroundFill 'pack' sentinel against the resolved field, not the literal", () => {
		// syntax field-treatment is #0e0e0d — paper matching it must trip the
		// G12 invisible-surface warn only because the sentinel resolved.
		const collides = makePreset({});
		collides.state.backgroundFill = 'pack';
		collides.state.typography.paperColor = '#0e0e0d';
		assert.ok(rules(lintPreset(collides)).includes('G12'));

		const distinct = makePreset({});
		distinct.state.backgroundFill = 'pack';
		assert.ok(!rules(lintPreset(distinct)).includes('G12'));
	});

	it('lints full-frame Diagram contrast through each Pack field/ink pair', () => {
		for (const pack of ['syntax', 'editorial-mono', 'crt-terminal', 'clean-light']) {
			const preset = makePreset({
				surface: {
					diagram: [
						{
							type: 'label',
							id: 'field-label',
							position: { x: 0.5, y: 0.5 },
							text: 'Field label'
						}
					]
				}
			});
			preset.pack = pack;
			preset.state.backgroundFill = 'pack';
			delete preset.state.typography.inkColor;

			const diagramIssues = lintPreset(preset).filter(
				(issue) => issue.rule === 'G5' && issue.path === 'surface.diagram'
			);
			assert.deepEqual(diagramIssues, [], pack);
		}
	});

	it('keeps authored Diagram ink as an explicit field-pair override', () => {
		const preset = makePreset({
			surface: {
				diagram: [
					{
						type: 'label',
						id: 'field-label',
						position: { x: 0.5, y: 0.5 },
						text: 'Field label'
					}
				]
			}
		});
		preset.state.backgroundFill = 'pack';
		preset.state.typography.inkColor = '#0e0e0d';

		assert.ok(
			lintPreset(preset).some(
				(issue) => issue.rule === 'G5' && issue.path === 'surface.diagram'
			)
		);
	});
});
