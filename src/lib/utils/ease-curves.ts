import { easeOutBack } from './math.ts';

/**
 * The engine's four named ease curves. `ENGINE_EASES` in `engine-schema.ts`
 * maps each to the GSAP string the DOM animation manifest tweens with;
 * `evaluateNamedEase` below is the numeric twin for GPU-side motion (the stage
 * camera travel) that must evaluate from an explicit progress value with no
 * tween runtime, so preview and export agree at every frame.
 */
export const NAMED_EASE_CURVES = ['smooth', 'settled', 'sharp', 'bouncy'] as const;

export type NamedEaseCurve = (typeof NAMED_EASE_CURVES)[number];

const ELASTIC_PERIOD = 0.5;

/**
 * Evaluate one named ease at `progress` (clamped to 0..1). Each branch is the
 * closed form of its GSAP counterpart: `power3.out`, `back.out(1.2)`,
 * `expo.out`, and `elastic.out(1, 0.5)`. `settled` and `bouncy` overshoot 1 on
 * purpose, exactly as their tweens do.
 */
export function evaluateNamedEase(ease: NamedEaseCurve, progress: number): number {
	const t = Math.min(1, Math.max(0, progress));
	// Pin the endpoints exactly: the closed forms land within an ulp of 0 and 1,
	// and a camera resting on a travel endpoint must equal its authored pose.
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	switch (ease) {
		case 'smooth':
			return 1 - (1 - t) ** 3;
		case 'settled':
			return easeOutBack(t, 1.2);
		case 'sharp':
			return 1 - 2 ** (-10 * t);
		case 'bouncy': {
			return (
				2 ** (-10 * t) * Math.sin(((t - ELASTIC_PERIOD / 4) * (2 * Math.PI)) / ELASTIC_PERIOD) + 1
			);
		}
	}
}
