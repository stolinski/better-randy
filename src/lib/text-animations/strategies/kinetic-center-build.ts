import type { AnimationTweenSpec } from '$lib/platform/animation-manager';

import type { CompileOutputs, StrategyInputs } from '../compile';
import { gsapEaseFromCss } from '../gsap-ease';
import { applyUnitFade, materializeUnitFilter } from '../unit-style';

/**
 * Read a numeric param from the catalog's `showcase.renderer.params` block,
 * falling back to a per-key default. The defaults mirror the upstream
 * `kinetic-center-build.json` showcase.renderer.params block so the renderer
 * produces the canonical look out-of-the-box on any catalog effect tagged
 * `renderer: kinetic-center-build`.
 */
function readParam(spec: StrategyInputs['spec'], key: string, fallback: number): number {
	const value = spec.rendererParams[key];
	return typeof value === 'number' ? value : fallback;
}

function mix(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/**
 * Width in CSS pixels of one natural word-space character (a non-breaking space is used
 * because plain space collapses inside an absolute-positioned span). Measured
 * from a hidden probe span inserted at the same DOM position as the units so
 * it inherits the active typeface, weight, and size. The probe is removed
 * synchronously before the function returns.
 */
function measureNaturalSpaceWidth(referenceUnit: HTMLElement): number {
	const host = referenceUnit.parentElement;
	if (!host) {
		return 0;
	}
	const probe = document.createElement('span');
	probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;white-space:pre';
	probe.textContent = ' ';
	host.appendChild(probe);
	const width = probe.getBoundingClientRect().width;
	probe.remove();
	return width;
}

/**
 * Kinetic Center Build. The phrase splits into per-word units (catalog
 * declares `target: per-word`). The first word lives at x=0 and fades in; each
 * subsequent word enters from the right and pushes every prior word to its new
 * centered position so the line stays balanced.
 *
 * Supers v1 ships a single-pass enter (one phrase, no loop). All N words enter
 * back-to-back within the user-declared `enter` window; per-word slices share
 * the window evenly, with each later word's entry triggering reflow tweens on
 * the words already placed.
 */
export function compileKineticCenterBuild(inputs: StrategyInputs): CompileOutputs {
	const { entry, spec, units, writeUnitAlpha } = inputs;
	const tweens: AnimationTweenSpec[] = [];

	if (units.length === 0) {
		return { tweens };
	}

	// Read renderer params (with the catalog defaults baked in).
	const wordGapPx = readParam(spec, 'word_gap_px', 10);
	const firstWordDurationMs = readParam(spec, 'first_word_duration_ms', 340);
	const pushDurationMs = readParam(spec, 'push_duration_ms', 430);
	const entryOffsetPx = readParam(spec, 'entry_offset_px', 88);
	const firstWordYpx = readParam(spec, 'first_word_y_px', 6);
	const entryScale = readParam(spec, 'entry_scale', 0.992);
	const entryBlurPx = readParam(spec, 'entry_blur_px', 3.5);
	const reflowBlurPx = readParam(spec, 'reflow_blur_px', 0.8);
	const exitYpx = readParam(spec, 'exit_y_px', -6);
	const exitBlurPx = readParam(spec, 'exit_blur_px', 2.5);

	// Container is absolute-centered: each word is `position:absolute; left:50%;
	// top:50%; translate(-50%, -50%) translate3d(x, y, 0)`. The manager has
	// already applied the kinetic-line-host stage preset to the slot root before
	// the compiler runs.
	// Do NOT set `will-change` on captured-DOM elements; it triggers
	// layer promotion that excludes the article from WICG
	// `copyElementImageToTexture` capture (see ADR-0017 Consequences).
	for (const unit of units) {
		unit.element.style.position = 'absolute';
		unit.element.style.left = '50%';
		unit.element.style.top = '50%';
		unit.element.style.whiteSpace = 'nowrap';
	}

	// Measure word widths after layout. The manager calls compile() after the
	// DOM is in place, so getBoundingClientRect() returns real sizes.
	const widths = units.map((unit) => unit.element.getBoundingClientRect().width);

	// Measure the natural word-space width at the active typeface and size.
	// The catalog's `word_gap_px` was calibrated for the showcase site at
	// modest font sizes; at 4K title scale a 10 px gap reads as no gap (~0.094 em
	// vs the natural ~0.27 em word space). Treat catalog `word_gap_px` as an
	// additive *bonus* on top of the metric-aware natural space.
	const naturalSpaceWidth = measureNaturalSpaceWidth(units[0].element);
	const totalGapPx = naturalSpaceWidth + wordGapPx;

	/** Centered x for word `wordIndex` when the line includes words [0..upTo]. */
	function centeredX(wordIndex: number, upTo: number): number {
		const visibleWidths = widths.slice(0, upTo + 1);
		const totalWidth =
			visibleWidths.reduce((sum, w) => sum + w, 0) +
			Math.max(0, visibleWidths.length - 1) * totalGapPx;
		let cursor = -totalWidth / 2;
		for (let i = 0; i < wordIndex; i += 1) {
			cursor += visibleWidths[i] + totalGapPx;
		}
		return cursor + visibleWidths[wordIndex] / 2;
	}

	/**
	 * The total source-ms span for the build phase: one first-word fade plus
	 * (N - 1) pushes. The user-declared `entry.duration` window scales this.
	 */
	const totalSourceMs = firstWordDurationMs + Math.max(0, units.length - 1) * pushDurationMs;
	const windowStart = entry.enter.start;
	const windowDuration = entry.enter.duration;
	const sourceToWindow = totalSourceMs > 0 ? windowDuration / totalSourceMs : 0;

	const firstWordDurationFraction = firstWordDurationMs * sourceToWindow;
	const pushDurationFraction = pushDurationMs * sourceToWindow;

	// FROM-frame initialization is handled by AnimationManager's init loop (it
	// calls every tween's onUpdate with `from` after scheduling). Writing here
	// would clobber the live tween value when reactive $effects re-run compile()
	// between scrubs.

	// First word enter — at x=0 (it owns the center alone).
	tweens.push({
		key: `${entry.id}:kc:first`,
		start: windowStart,
		duration: firstWordDurationFraction,
		ease: gsapEaseFromCss(spec.enter.easing),
		from: 0,
		to: 1,
		onUpdate: (value) => {
			const unit = units[0];
			const opacity = value;
			const y = mix(firstWordYpx, 0, value);
			const scale = mix(entryScale, 1, value);
			const blur = mix(entryBlurPx, 0, value);
			unit.element.style.transform = `translate(-50%, -50%) translate3d(0px, ${y}px, 0) scale(${scale})`;
			unit.element.style.filter = materializeUnitFilter(blur);
			applyUnitFade(unit.element, opacity);
			writeUnitAlpha(unit.index, opacity);
		}
	});

	// For each subsequent word, two tweens:
	//   1. existing words reflow from their previous centered x to the next x.
	//   2. the incoming word enters from (targetX + entryOffsetPx) to targetX.
	for (let incoming = 1; incoming < units.length; incoming += 1) {
		const pushWindowStart =
			windowStart + firstWordDurationFraction + (incoming - 1) * pushDurationFraction;

		// Reflow tweens for words [0..incoming-1].
		for (let existing = 0; existing < incoming; existing += 1) {
			const currentX = centeredX(existing, incoming - 1);
			const nextX = centeredX(existing, incoming);
			const reflowedUnit = units[existing];

			tweens.push({
				key: `${entry.id}:kc:reflow:${incoming}:${existing}`,
				start: pushWindowStart,
				duration: pushDurationFraction,
				ease: gsapEaseFromCss(spec.enter.easing),
				from: 0,
				to: 1,
				onUpdate: (value) => {
					const x = mix(currentX, nextX, value);
					const blur =
						value < 0.5 ? mix(0, reflowBlurPx, value * 2) : mix(reflowBlurPx, 0, (value - 0.5) * 2);
					reflowedUnit.element.style.transform = `translate(-50%, -50%) translate3d(${x}px, 0px, 0) scale(1)`;
					reflowedUnit.element.style.filter = materializeUnitFilter(blur);
					applyUnitFade(reflowedUnit.element, 1);
					writeUnitAlpha(reflowedUnit.index, 1);
				}
			});
		}

		// Incoming word tween.
		const targetX = centeredX(incoming, incoming);
		const startX = targetX + entryOffsetPx;
		const incomingUnit = units[incoming];

		tweens.push({
			key: `${entry.id}:kc:in:${incoming}`,
			start: pushWindowStart,
			duration: pushDurationFraction,
			ease: gsapEaseFromCss(spec.enter.easing),
			from: 0,
			to: 1,
			onUpdate: (value) => {
				const x = mix(startX, targetX, value);
				const opacity = value;
				const scale = mix(entryScale, 1, value);
				const blur = mix(entryBlurPx, 0, value);
				incomingUnit.element.style.transform = `translate(-50%, -50%) translate3d(${x}px, 0px, 0) scale(${scale})`;
				incomingUnit.element.style.filter = materializeUnitFilter(blur);
				applyUnitFade(incomingUnit.element, opacity);
				writeUnitAlpha(incomingUnit.index, opacity);
			}
		});
	}

	// Optional exit phase: all words exit together from their final centered x.
	if (entry.exit && spec.exit) {
		for (let i = 0; i < units.length; i += 1) {
			const finalX = centeredX(i, units.length - 1);
			const exitUnit = units[i];

			tweens.push({
				key: `${entry.id}:kc:exit:${i}`,
				start: entry.exit.start,
				duration: entry.exit.duration,
				ease: gsapEaseFromCss(spec.exit.easing),
				from: 0,
				to: 1,
				onUpdate: (value) => {
					const y = mix(0, exitYpx, value);
					const blur = mix(0, exitBlurPx, value);
					const opacity = 1 - value;
					exitUnit.element.style.transform = `translate(-50%, -50%) translate3d(${finalX}px, ${y}px, 0) scale(1)`;
					exitUnit.element.style.filter = materializeUnitFilter(blur);
					applyUnitFade(exitUnit.element, opacity);
					writeUnitAlpha(exitUnit.index, opacity);
				}
			});
		}
	}

	return { tweens };
}
