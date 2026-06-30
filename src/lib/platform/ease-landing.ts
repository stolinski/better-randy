import gsap from 'gsap';

/**
 * Where an ease perceptibly "lands" — the fraction of its duration at which the
 * eased progress first reaches within 2% of its target.
 *
 * The timeline draws a clip's ramp to this point rather than to the raw schema
 * `enter.duration` / `exit.duration` (ADR-0034 §2a). Decelerate (`*.out`) and
 * spring (`back.out`, `elastic.out`) eases front-load: the motion visibly
 * completes well before the duration ends, so a ramp drawn to the full duration
 * over-states how long the eye sees movement. Drawing to the landing point makes
 * the ramp honest for any ease without touching the motion itself.
 *
 * Direction-independent: a 1→0 exit tween lands when its ease reaches 1 just as a
 * 0→1 enter does, so callers pass the resolved gsap ease string for either.
 */
const LANDED = 0.98;
const cache = new Map<string, number>();

/**
 * Progress at which a CSS `cubic-bezier(x1,y1,x2,y2)` first reaches the landed
 * value. The curve is parametric in `s`; sampling `s` gives (x = progress,
 * y = eased value), and `x` is monotonic, so the first `y ≥ 0.98` yields the
 * landing in progress terms.
 */
function cubicBezierLanding(x1: number, y1: number, x2: number, y2: number): number {
	for (let s = 0; s <= 1; s += 0.002) {
		const mt = 1 - s;
		const y = 3 * mt * mt * s * y1 + 3 * mt * s * s * y2 + s * s * s;
		if (y >= LANDED) {
			return 3 * mt * mt * s * x1 + 3 * mt * s * s * x2 + s * s * s;
		}
	}
	return 1;
}

export function easeLandingFraction(ease: string): number {
	const cached = cache.get(ease);
	if (cached !== undefined) {
		return cached;
	}

	let fraction = 1;
	try {
		if (ease.startsWith('cubic-bezier')) {
			const [x1, y1, x2, y2] = ease
				.slice(ease.indexOf('(') + 1, ease.indexOf(')'))
				.split(',')
				.map((n) => Number.parseFloat(n));
			fraction = cubicBezierLanding(x1, y1, x2, y2);
		} else if (ease.startsWith('steps')) {
			// A stepped ease holds then snaps — it "lands" at the window end.
			fraction = 1;
		} else {
			const fn = gsap.parseEase(ease);
			for (let t = 0.05; t <= 1; t += 0.005) {
				if (fn(t) >= LANDED) {
					fraction = t;
					break;
				}
			}
		}
	} catch {
		// Unknown ease string (or no GSAP at SSR time): fall back to the full ramp.
		fraction = 1;
	}

	cache.set(ease, fraction);
	return fraction;
}
