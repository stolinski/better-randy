import type { AnimationTweenSpec } from '$lib/platform/animation-manager';

import type { KeyframeShape } from '../catalog';
import type { CompileOutputs, StrategyInputs } from '../compile';
import { gsapEaseFromCss } from '../gsap-ease';
import { applyUnitFade, materializeUnitFilter } from '../unit-style';

/**
 * Shared Slide Opacity Stage. Used by `short-slide-right`. The whole phrase
 * (the slot root) animates a single transform pass while individual word
 * units fade opacity in a stagger. The slot element receives the title-level
 * tween; the per-word units only animate opacity. Both phases start in the
 * same tick, exactly as the upstream recipe specifies.
 */
function readParam(spec: StrategyInputs['spec'], key: string, fallback: number): number {
	const value = spec.rendererParams[key];
	return typeof value === 'number' ? value : fallback;
}

function materializeTitleTransform(keyframe: KeyframeShape, yTravel: number, isVertical: boolean): string {
	const kx = keyframe.x_px ?? 0;
	const ky = keyframe.y_px ?? 0;
	const x = isVertical ? 0 : kx;
	const y = (isVertical ? ky + kx : ky) * yTravel;
	const scale = keyframe.scale ?? 1;
	return `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
}

function materializeFilter(keyframe: KeyframeShape): string {
	return materializeUnitFilter(keyframe.blur_px ?? 0);
}

function interpolate(from: KeyframeShape, to: KeyframeShape, p: number): KeyframeShape {
	const keys = new Set<keyof KeyframeShape>();
	for (const k of Object.keys(from) as (keyof KeyframeShape)[]) keys.add(k);
	for (const k of Object.keys(to) as (keyof KeyframeShape)[]) keys.add(k);
	const out: KeyframeShape = {};
	for (const key of keys) {
		const a = typeof from[key] === 'number' ? (from[key] as number) : key === 'opacity' || key === 'scale' ? 1 : 0;
		const b = typeof to[key] === 'number' ? (to[key] as number) : key === 'opacity' || key === 'scale' ? 1 : 0;
		out[key] = a + (b - a) * p;
	}
	return out;
}

export function compileSharedSlideOpacityStage(inputs: StrategyInputs): CompileOutputs {
	const { entry, spec, units, transport, writeUnitAlpha } = inputs;
	const isVertical = transport.orientation === 'vertical';
	const tweens: AnimationTweenSpec[] = [];

	if (units.length === 0) {
		return { tweens };
	}

	// The slot root is the element ALL units share as a parent. For this
	// renderer family the title-level transform is the slot root; the manager
	// has tagged it via `data-text-anim-slot` (units are descendants).
	const slotRoot = units[0].element.closest('[data-text-anim-slot]');
	const title = slotRoot instanceof HTMLElement ? slotRoot : units[0].element.parentElement;

	if (!title) {
		// Defensive: no title host means we can't run this renderer.
		return { tweens };
	}

	const wordOpacityFrom = readParam(spec, 'word_opacity_from', 0);
	const wordOpacityTo = readParam(spec, 'word_opacity_to', 1);
	const wordOpacityDurationMs = readParam(spec, 'word_opacity_duration_ms', 210);
	const titleDurationMs = spec.enter.duration_ms;
	const titleStaggerMs = spec.enter.stagger_ms;

	const yTravel = spec.runtime.y_travel_multiplier ?? 1;

	// The user-declared window encloses BOTH the title transform AND the
	// per-word opacity cascade. Scale the source ms to the window using the
	// longer of the two source spans.
	const opacityTotalMs = wordOpacityDurationMs + Math.max(0, units.length - 1) * titleStaggerMs;
	const sourceTotal = Math.max(titleDurationMs, opacityTotalMs);
	const sourceToWindow = sourceTotal > 0 ? entry.enter.duration / sourceTotal : 0;

	const titleDurationFraction = titleDurationMs * sourceToWindow;
	const wordOpacityDurationFraction = wordOpacityDurationMs * sourceToWindow;
	const wordOpacityStaggerFraction = titleStaggerMs * sourceToWindow;

	// FROM-frame initialization is handled by AnimationManager's init loop (it
	// calls every tween's onUpdate with `from` after scheduling). Writing it
	// here would clobber the live tween value when reactive $effects re-run
	// compile() between scrubs.

	// Title transform tween (one).
	tweens.push({
		key: `${entry.id}:ss:title-enter`,
		start: entry.enter.start,
		duration: titleDurationFraction,
		ease: gsapEaseFromCss(spec.enter.easing),
		from: 0,
		to: 1,
		onUpdate: (value) => {
			const frame = interpolate(spec.enter.from, spec.enter.to, value);
			title.style.transform = materializeTitleTransform(frame, yTravel, isVertical);
			title.style.filter = materializeFilter(frame);
			// The slot root is transformed, so its property-opacity is capture-
			// quantized exactly like a unit span — fade via colour alpha instead
			// (units clear their own colour at full alpha, so this cascades).
			applyUnitFade(title, frame.opacity ?? 1);
		}
	});

	// Per-word opacity tweens, staggered.
	for (let i = 0; i < units.length; i += 1) {
		const unit = units[i];
		tweens.push({
			key: `${entry.id}:ss:word:${i}`,
			start: entry.enter.start + i * wordOpacityStaggerFraction,
			duration: wordOpacityDurationFraction,
			ease: gsapEaseFromCss(spec.enter.easing),
			from: 0,
			to: 1,
			onUpdate: (value) => {
				const opacity = wordOpacityFrom + (wordOpacityTo - wordOpacityFrom) * value;
				applyUnitFade(unit.element, opacity);
				writeUnitAlpha(unit.index, opacity);
			}
		});
	}

	// Exit: title-only transform out per upstream recipe (words ride along).
	if (entry.exit && spec.exit) {
		const exitFrom = spec.exit.from;
		const exitTo = spec.exit.to;
		tweens.push({
			key: `${entry.id}:ss:title-exit`,
			start: entry.exit.start,
			duration: entry.exit.duration,
			ease: gsapEaseFromCss(spec.exit.easing),
			from: 0,
			to: 1,
			onUpdate: (value) => {
				const frame = interpolate(exitFrom, exitTo, value);
				title.style.transform = materializeTitleTransform(frame, yTravel, isVertical);
				title.style.filter = materializeFilter(frame);
				// Colour-alpha fade for the same capture-quantization reason as
				// the enter (transformed root).
				applyUnitFade(title, frame.opacity ?? 1);
				// Propagate title opacity into the per-unit alpha map so marks
				// coupling fades alongside the exit, even though word spans
				// themselves stay at wordOpacityTo.
				for (const unit of units) {
					writeUnitAlpha(unit.index, frame.opacity ?? 0);
				}
			}
		});
	}

	return { tweens };
}
