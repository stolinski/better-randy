import type { AnimationTweenSpec } from '$lib/platform/animation-manager';

import type { TextAnimationCompileResult, TextEffectStrategyInputs } from '../compile';
import { textAnimationGsapEaseFromCss } from '../gsap-ease';
import {
	applyTextAnimationUnitFade,
	materializeTextAnimationUnitFilter
} from '../unit-style';

/**
 * Kinetic Top Build. Vertical counterpart to `kinetic-center-build`. The
 * phrase splits into per-word units (`target: per-word`) and stacks
 * centrally; each new word drops from above the stack and pushes prior
 * words to their new centered y positions. Used by `short-slide-down`.
 *
 * Supers v1 ships single-pass (one phrase, no loop). The renderer mirrors
 * the upstream `kinetic-top-build` algorithm: each incoming word fires a
 * reflow tween for every word already placed plus an entry tween for
 * itself, all sharing the same per-push window.
 */
function readParam(spec: TextEffectStrategyInputs['spec'], key: string, fallback: number): number {
	const value = spec.rendererParams[key];
	return typeof value === 'number' ? value : fallback;
}

function mix(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

export function compileKineticTopBuild(
	inputs: TextEffectStrategyInputs
): TextAnimationCompileResult {
	const { entry, spec, units, writeUnitAlpha } = inputs;
	const tweens: AnimationTweenSpec[] = [];

	if (units.length === 0) {
		return { tweens };
	}

	const lineGapPx = readParam(spec, 'line_gap_px', 12);
	const firstWordDurationMs = readParam(spec, 'first_word_duration_ms', 360);
	const pushDurationMs = readParam(spec, 'push_duration_ms', 500);
	const entryOffsetYpx = readParam(spec, 'entry_offset_y_px', -28);
	const firstWordYpx = readParam(spec, 'first_word_y_px', -14);
	const entryScale = readParam(spec, 'entry_scale', 0.992);
	const entryBlurPx = readParam(spec, 'entry_blur_px', 2.4);
	const reflowBlurPx = readParam(spec, 'reflow_blur_px', 0.7);
	const exitYpx = readParam(spec, 'exit_y_px', 10);
	const exitBlurPx = readParam(spec, 'exit_blur_px', 1.2);

	for (const unit of units) {
		unit.element.style.position = 'absolute';
		unit.element.style.left = '50%';
		unit.element.style.top = '50%';
		unit.element.style.whiteSpace = 'nowrap';
		// Do NOT set `will-change` — it triggers layer promotion that excludes
		// the article from WICG `copyElementImageToTexture` capture (ADR-0017).
		unit.element.style.display = 'block';
	}

	// Measure heights after layout.
	const heights = units.map((unit) => unit.element.getBoundingClientRect().height);

	function centeredY(wordIndex: number, upTo: number): number {
		const visibleHeights = heights.slice(0, upTo + 1);
		const totalHeight =
			visibleHeights.reduce((sum, h) => sum + h, 0) +
			Math.max(0, visibleHeights.length - 1) * lineGapPx;
		let cursor = -totalHeight / 2;
		for (let i = 0; i < wordIndex; i += 1) {
			cursor += visibleHeights[i] + lineGapPx;
		}
		return cursor + visibleHeights[wordIndex] / 2;
	}

	const totalSourceMs = firstWordDurationMs + Math.max(0, units.length - 1) * pushDurationMs;
	const windowStart = entry.enter.start;
	const windowDuration = entry.enter.duration;
	const sourceToWindow = totalSourceMs > 0 ? windowDuration / totalSourceMs : 0;

	const firstWordDurationFraction = firstWordDurationMs * sourceToWindow;
	const pushDurationFraction = pushDurationMs * sourceToWindow;

	// FROM-frame initialization is handled by AnimationManager's init loop;
	// writing here would clobber the live tween value when reactive $effects
	// re-run compileTextAnimation() between scrubs.

	// First word enter — at y=0 (alone in the stack).
	tweens.push({
		key: `${entry.id}:kt:first`,
		start: windowStart,
		duration: firstWordDurationFraction,
		ease: textAnimationGsapEaseFromCss(spec.enter.easing),
		from: 0,
		to: 1,
		onUpdate: (value) => {
			const unit = units[0];
			const opacity = value;
			const y = mix(firstWordYpx, 0, value);
			const scale = mix(entryScale, 1, value);
			const blur = mix(entryBlurPx, 0, value);
			unit.element.style.transform = `translate(-50%, -50%) translate3d(0px, ${y}px, 0) scale(${scale})`;
			unit.element.style.filter = materializeTextAnimationUnitFilter(blur);
			applyTextAnimationUnitFade(unit.element, opacity);
			writeUnitAlpha(unit.index, opacity);
		}
	});

	for (let incoming = 1; incoming < units.length; incoming += 1) {
		const pushWindowStart =
			windowStart + firstWordDurationFraction + (incoming - 1) * pushDurationFraction;

		for (let existing = 0; existing < incoming; existing += 1) {
			const currentY = centeredY(existing, incoming - 1);
			const nextY = centeredY(existing, incoming);
			const reflowedUnit = units[existing];

			tweens.push({
				key: `${entry.id}:kt:reflow:${incoming}:${existing}`,
				start: pushWindowStart,
				duration: pushDurationFraction,
				ease: textAnimationGsapEaseFromCss(spec.enter.easing),
				from: 0,
				to: 1,
				onUpdate: (value) => {
					const y = mix(currentY, nextY, value);
					const blur =
						value < 0.5 ? mix(0, reflowBlurPx, value * 2) : mix(reflowBlurPx, 0, (value - 0.5) * 2);
					reflowedUnit.element.style.transform = `translate(-50%, -50%) translate3d(0px, ${y}px, 0) scale(1)`;
					reflowedUnit.element.style.filter = materializeTextAnimationUnitFilter(blur);
					applyTextAnimationUnitFade(reflowedUnit.element, 1);
					writeUnitAlpha(reflowedUnit.index, 1);
				}
			});
		}

		const targetY = centeredY(incoming, incoming);
		const startY = targetY + entryOffsetYpx;
		const incomingUnit = units[incoming];

		tweens.push({
			key: `${entry.id}:kt:in:${incoming}`,
			start: pushWindowStart,
			duration: pushDurationFraction,
			ease: textAnimationGsapEaseFromCss(spec.enter.easing),
			from: 0,
			to: 1,
			onUpdate: (value) => {
				const y = mix(startY, targetY, value);
				const opacity = value;
				const scale = mix(entryScale, 1, value);
				const blur = mix(entryBlurPx, 0, value);
				incomingUnit.element.style.transform = `translate(-50%, -50%) translate3d(0px, ${y}px, 0) scale(${scale})`;
				incomingUnit.element.style.filter = materializeTextAnimationUnitFilter(blur);
				applyTextAnimationUnitFade(incomingUnit.element, opacity);
				writeUnitAlpha(incomingUnit.index, opacity);
			}
		});
	}

	if (entry.exit && spec.exit) {
		for (let i = 0; i < units.length; i += 1) {
			const finalY = centeredY(i, units.length - 1);
			const exitUnit = units[i];

			tweens.push({
				key: `${entry.id}:kt:exit:${i}`,
				start: entry.exit.start,
				duration: entry.exit.duration,
				ease: textAnimationGsapEaseFromCss(spec.exit.easing),
				from: 0,
				to: 1,
				onUpdate: (value) => {
					const y = mix(finalY, finalY + exitYpx, value);
					const blur = mix(0, exitBlurPx, value);
					const opacity = 1 - value;
					exitUnit.element.style.transform = `translate(-50%, -50%) translate3d(0px, ${y}px, 0) scale(1)`;
					exitUnit.element.style.filter = materializeTextAnimationUnitFilter(blur);
					applyTextAnimationUnitFade(exitUnit.element, opacity);
					writeUnitAlpha(exitUnit.index, opacity);
				}
			});
		}
	}

	return { tweens };
}
