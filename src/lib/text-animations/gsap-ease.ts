import gsap from 'gsap';
import { CustomEase } from 'gsap/CustomEase';

let registered = false;
const cache = new Map<string, string>();

function ensureRegistered(): void {
	if (registered) {
		return;
	}
	gsap.registerPlugin(CustomEase);
	registered = true;
}

/**
 * Translate a CSS easing string (as it appears in the animate-text catalog) into
 * an ease identifier GSAP can resolve.
 *
 *  - `linear`              → `'none'`
 *  - `cubic-bezier(a,b,c,d)` → a registered `CustomEase` whose name encodes the curve
 *  - `steps(n, end|start)` → `'steps(n)'` (GSAP supports the single-arg form)
 *
 * The catalog ships raw CSS easing strings per its library_adapters guidance
 * ("Convert cubic-bezier(a,b,c,d) with CustomEase.create(...)"); GSAP 3.x does
 * not natively parse `cubic-bezier(...)` without `CustomEase` registered, so
 * tweens with raw catalog strings silently fail to interpolate. This translator
 * registers CustomEase once and caches per-curve.
 */
export function gsapEaseFromCss(css: string): string {
	const trimmed = css.trim();

	const cached = cache.get(trimmed);
	if (cached) {
		return cached;
	}

	if (trimmed === 'linear') {
		cache.set(trimmed, 'none');
		return 'none';
	}

	const stepMatch = trimmed.match(/^steps\(\s*(\d+)\s*(?:,\s*(start|end))?\s*\)$/);
	if (stepMatch) {
		const name = `steps(${stepMatch[1]})`;
		cache.set(trimmed, name);
		return name;
	}

	const bezierMatch = trimmed.match(
		/^cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)$/
	);
	if (bezierMatch) {
		ensureRegistered();
		const [, a, b, c, d] = bezierMatch;
		const name = `hiviz-ease-${a}-${b}-${c}-${d}`;
		if (!CustomEase.get(name)) {
			CustomEase.create(name, `M0,0 C${a},${b} ${c},${d} 1,1`);
		}
		cache.set(trimmed, name);
		return name;
	}

	cache.set(trimmed, trimmed);
	return trimmed;
}
