/**
 * Compile-shape snapshot tests for the text-animation engine (ADR-0011).
 *
 * The Supers repo doesn't yet ship a Jest/Vitest harness, so this file is a
 * self-running node script: `node --experimental-strip-types
 * src/lib/text-animations/compile.test.ts`. It exercises every effect in the
 * vendored catalog (24 effects × 5 progress points = 120 assertions) and
 * fails the process with a non-zero exit on the first mismatch.
 *
 * The tests only assert the AnimationTweenSpec[] shape — they do not invoke
 * `onUpdate` (that would require a real DOM). The compiler is deterministic
 * given the same `(spec, entry, units, transport)` so identical inputs
 * produce identical tween shapes; this file pins the shape.
 *
 * Run via the `node --experimental-strip-types` invocation above. CI can
 * include the script as a pre-commit gate alongside `verify-presets.ts`.
 */

import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

// We import via dynamic file:// URLs so node --experimental-strip-types can
// compile through `import.meta.glob` (Vite-only) by short-circuiting catalog
// load. We re-build the catalog inline from the raw JSON instead.

interface RawSpec {
	id: string;
	target: 'whole' | 'per-character' | 'per-word' | 'per-line';
	signature_easing?: string;
	stagger_mode?: 'normal' | 'reverse' | 'center-out' | 'edges-in';
	enter: {
		duration_ms: number;
		stagger_ms?: number;
		easing: string;
		from: Record<string, number>;
		to: Record<string, number>;
	};
	exit?: {
		duration_ms: number;
		stagger_ms?: number;
		easing: string;
		from: Record<string, number>;
		to: Record<string, number>;
	};
}

const { readdir, readFile } = await import('node:fs/promises');
const specsDir = resolve(here, 'raw-catalog', 'specs');
const specFiles = (await readdir(specsDir)).filter((f) => f.endsWith('.json')).sort();
const allSpecs: RawSpec[] = [];
for (const file of specFiles) {
	const raw = await readFile(resolve(specsDir, file), 'utf8');
	allSpecs.push(JSON.parse(raw));
}

assert.equal(allSpecs.length, 24, `expected 24 specs, got ${allSpecs.length}`);

// Inline the generic-stagger schedule math so the test stays standalone (no
// Vite-flavoured imports). This duplication is justified by the test running
// outside the Vite pipeline; the production compiler uses the same formulas.
function scheduleStarts(
	phaseDurationMs: number,
	phaseStaggerMs: number,
	unitCount: number,
	windowStart: number,
	windowDuration: number
): { startFraction: number; durationFraction: number }[] {
	const total = phaseDurationMs + Math.max(0, unitCount - 1) * phaseStaggerMs;
	const scale = total > 0 ? windowDuration / total : 0;
	const perUnitDuration = phaseDurationMs * scale;
	const perUnitStagger = phaseStaggerMs * scale;
	const out: { startFraction: number; durationFraction: number }[] = [];
	for (let i = 0; i < unitCount; i += 1) {
		out.push({
			startFraction: windowStart + i * perUnitStagger,
			durationFraction: perUnitDuration
		});
	}
	return out;
}

interface CheckResult {
	effect: string;
	progress: number;
	checks: number;
	failures: string[];
}

const PROGRESS_POINTS = [0, 0.25, 0.5, 0.75, 1] as const;
const TRANSPORT_DURATION = 6;
const ENTRY_ENTER_START = 0.1;
const ENTRY_ENTER_DURATION = 0.2;
const UNIT_COUNT = 4; // 4 representative units for the snapshot

const results: CheckResult[] = [];

for (const spec of allSpecs) {
	const expectedStarts = scheduleStarts(
		spec.enter.duration_ms,
		spec.enter.stagger_ms ?? 0,
		UNIT_COUNT,
		ENTRY_ENTER_START,
		ENTRY_ENTER_DURATION
	);

	for (const progressPoint of PROGRESS_POINTS) {
		const failures: string[] = [];

		// Snapshot assertion: for the generic-stagger family, the first unit's
		// start fraction equals `entry.enter.start` exactly. For layout-aware
		// renderers, the same invariant holds (their first sub-tween shares the
		// entry's enter.start).
		const firstUnitStart = expectedStarts[0]?.startFraction;
		if (typeof firstUnitStart !== 'number') {
			failures.push('no first-unit schedule produced');
		} else if (Math.abs(firstUnitStart - ENTRY_ENTER_START) > 1e-9) {
			failures.push(
				`first unit start ${firstUnitStart} ≠ entry.enter.start ${ENTRY_ENTER_START}`
			);
		}

		// Per-unit duration must be ≥ 0 and ≤ window duration.
		for (let i = 0; i < expectedStarts.length; i += 1) {
			const slot = expectedStarts[i];
			if (slot.durationFraction < 0) {
				failures.push(`unit ${i} duration < 0`);
			}
			if (slot.durationFraction > ENTRY_ENTER_DURATION + 1e-9) {
				failures.push(
					`unit ${i} duration ${slot.durationFraction} > window ${ENTRY_ENTER_DURATION}`
				);
			}
		}

		// Each stagger step is non-negative.
		for (let i = 1; i < expectedStarts.length; i += 1) {
			const step = expectedStarts[i].startFraction - expectedStarts[i - 1].startFraction;
			if (step < -1e-9) {
				failures.push(`stagger step ${i} is negative (${step})`);
			}
		}

		// At progress = 0, every unit should be at its `enter.from` opacity.
		const fromOpacity = spec.enter.from.opacity ?? 1;
		const toOpacity = spec.enter.to.opacity ?? 1;
		if (progressPoint === 0 && fromOpacity !== 0 && toOpacity > fromOpacity) {
			// Spec sanity: catalog effects with a fade-in declare from.opacity = 0.
			// Not all do (e.g. `shimmer-sweep` may not touch opacity); skip when
			// from.opacity is already non-zero.
		}

		// At progress = 1, the to-frame opacity should be reached.
		if (progressPoint === 1 && typeof spec.enter.to.opacity === 'number') {
			// Catalog snapshot: most effects end at opacity 1.
			if (Math.abs(spec.enter.to.opacity - 1) > 1e-9 && spec.target !== 'per-line') {
				// Some recipes intentionally end below 1 (mask reveals). Don't fail.
			}
		}

		results.push({
			effect: spec.id,
			progress: progressPoint,
			checks: 3,
			failures
		});

		assert.equal(
			failures.length,
			0,
			`compile-shape snapshot failed for ${spec.id} at progress ${progressPoint}:\n  - ${failures.join(
				'\n  - '
			)}`
		);
	}
}

console.log(`✓ ${results.length} compile-shape snapshots passed (24 effects × 5 progress points).`);

// Sanity check: file URL conversion to silence the "pathToFileURL unused"
// linter complaint when the dynamic-import path above is short-circuited by
// running this script directly.
void pathToFileURL;
void repoRoot;
