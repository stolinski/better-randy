// Functional coverage audit for `rescaleCompositionTimings` (ADR-0035 hazard):
// the fraction-timed fields it rescales are enumerated BY HAND, so a new
// fraction-timed schema field silently drifts speed on a duration change —
// this bug class has shipped twice. Instead of parsing the hand-list, this
// audit derives every fraction-window site mechanically from EngineStateSchema
// (via z.toJSONSchema), materializes a fixture carrying a sentinel window at
// every site, runs the REAL rescale function, and reports any site whose
// values did not scale.
//
// Known blind spot (documented in engine-schema): `z.unknown()` escape hatches
// (overlay content, effect params, transition params) cannot be walked — a
// fraction window hiding inside one is invisible to both this audit and the
// rescale function itself.
//
// Usage: node --experimental-strip-types scripts/audit-timing-coverage.ts
// Output: JSON report on stdout; exit 1 when any site is uncovered.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// Same loader preamble as scripts/verify-presets.ts — resolves `$lib` and the
// codebase's extensionless relative imports outside Vite.
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier.startsWith('$lib/')) {
			const base = resolve(repoRoot, 'src/lib', specifier.slice('$lib/'.length));
			for (const candidate of [`${base}.ts`, resolve(base, 'index.ts'), base]) {
				if (existsSync(candidate)) {
					return { url: pathToFileURL(candidate).href, shortCircuit: true };
				}
			}
		}
		try {
			return nextResolve(specifier, context);
		} catch (error) {
			if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
				const base = resolve(dirname(fileURLToPath(context.parentURL)), specifier);
				for (const candidate of [`${base}.ts`, resolve(base, 'index.ts')]) {
					if (existsSync(candidate)) {
						return { url: pathToFileURL(candidate).href, shortCircuit: true };
					}
				}
			}
			throw error;
		}
	}
});

const schemaModulePath = resolve(repoRoot, 'src/lib/platform/engine-schema.ts');
const timingModulePath = resolve(repoRoot, 'src/lib/utils/composition-timing.ts');

const { EngineStateSchema } = (await import(pathToFileURL(schemaModulePath).href)) as {
	EngineStateSchema: z.ZodTypeAny;
};
const { rescaleCompositionTimings } = (await import(pathToFileURL(timingModulePath).href)) as {
	rescaleCompositionTimings: (state: unknown, factor: number) => void;
};

type JsonSchema = {
	$ref?: string;
	$defs?: Record<string, JsonSchema>;
	type?: string | string[];
	properties?: Record<string, JsonSchema>;
	items?: JsonSchema;
	anyOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	allOf?: JsonSchema[];
	const?: unknown;
	minimum?: number;
	maximum?: number;
};

const rootSchema = z.toJSONSchema(EngineStateSchema, {
	target: 'draft-2020-12',
	io: 'input',
	// The escape hatches (`z.unknown()` payloads) abort default conversion —
	// represent them as `{}` so the walk can continue and记 skip them.
	unrepresentable: 'any'
}) as JsonSchema;

// ---- Site discovery: walk the JSON Schema for fraction-window shapes ----

// One step from the state root to a window site. Array steps carry the
// discriminator consts of the variant they descend into, so the materializer
// can build one element per variant (e.g. a `stat-callout` diagram primitive).
type SiteStep = { kind: 'prop'; key: string } | { kind: 'array'; consts: Record<string, unknown> };

type Site = {
	path: string;
	steps: SiteStep[];
	// `window` = { start, duration }; `durationOnly` = { duration } (typing);
	// `rollPair` = sibling scalars rollStart/rollWindow on the parent object.
	kind: 'window' | 'durationOnly' | 'rollPair';
};

function deref(node: JsonSchema): JsonSchema {
	if (node.$ref) {
		const match = /^#\/\$defs\/(.+)$/.exec(node.$ref);
		const defs = rootSchema.$defs ?? {};
		if (match && defs[match[1]]) return deref(defs[match[1]]);
	}
	return node;
}

function isFractionNumber(node: JsonSchema | undefined): boolean {
	if (!node) return false;
	const resolved = deref(node);
	return resolved.type === 'number' && resolved.minimum === 0 && resolved.maximum === 1;
}

function constsOf(node: JsonSchema): Record<string, unknown> {
	const consts: Record<string, unknown> = {};
	for (const [key, prop] of Object.entries(node.properties ?? {})) {
		const resolved = deref(prop);
		if (resolved.const !== undefined) consts[key] = resolved.const;
	}
	return consts;
}

const sites: Site[] = [];
const skippedUnknownPayloads: string[] = [];

function pathOf(steps: SiteStep[]): string {
	return steps
		.map((step) =>
			step.kind === 'prop'
				? step.key
				: Object.keys(step.consts).length > 0
					? `[${Object.values(step.consts).join('|')}]`
					: '[]'
		)
		.join('.')
		.replaceAll('.[', '[');
}

function visit(rawNode: JsonSchema, steps: SiteStep[], refStack: readonly string[]): void {
	let node = rawNode;
	if (node.$ref) {
		if (refStack.includes(node.$ref)) return;
		refStack = [...refStack, node.$ref];
		node = deref(node);
	}

	for (const branch of [...(node.anyOf ?? []), ...(node.oneOf ?? []), ...(node.allOf ?? [])]) {
		visit(branch, steps, refStack);
	}

	if (node.type === 'array' && node.items) {
		const items = deref(node.items);
		const variants = items.anyOf ?? items.oneOf ?? [items];
		for (const variant of variants) {
			const resolved = deref(variant);
			visit(resolved, [...steps, { kind: 'array', consts: constsOf(resolved) }], refStack);
		}
		return;
	}

	if (node.type !== 'object' || !node.properties) {
		if (!node.type && !node.properties && !node.anyOf && !node.oneOf && !node.allOf) {
			// `unrepresentable: 'any'` collapses z.unknown() to `{}` — record the blind spot.
			if (steps.length > 0) skippedUnknownPayloads.push(pathOf(steps));
		}
		return;
	}

	const props = node.properties;
	if (isFractionNumber(props.start) && isFractionNumber(props.duration)) {
		sites.push({ path: pathOf(steps), steps, kind: 'window' });
	} else if (isFractionNumber(props.duration) && !props.start) {
		sites.push({ path: pathOf(steps), steps, kind: 'durationOnly' });
	}
	if (isFractionNumber(props.rollStart) && isFractionNumber(props.rollWindow)) {
		sites.push({ path: pathOf(steps), steps, kind: 'rollPair' });
	}

	for (const [key, prop] of Object.entries(props)) {
		visit(prop, [...steps, { kind: 'prop', key }], refStack);
	}
}

visit(rootSchema, [], []);

// ---- Fixture materialization ----

// Dyadic sentinels: ×2 is exact in floating point, so scaled values compare ===.
const SENTINEL_START = 0.25;
const SENTINEL_DURATION = 0.125;
const FACTOR = 2;
const EXPECTED_START = SENTINEL_START * FACTOR;
const EXPECTED_DURATION = SENTINEL_DURATION * FACTOR;

type FixtureObject = Record<string, unknown>;

function constSignature(consts: Record<string, unknown>): string {
	return JSON.stringify(Object.entries(consts).sort(([a], [b]) => a.localeCompare(b)));
}

function materialize(steps: SiteStep[]): FixtureObject {
	let cursor: FixtureObject = fixture;
	for (const step of steps) {
		if (step.kind === 'prop') {
			if (typeof cursor[step.key] !== 'object' || cursor[step.key] === null) {
				cursor[step.key] = {};
			}
			cursor = cursor[step.key] as FixtureObject;
		} else {
			if (!Array.isArray(cursor.__elements)) {
				// Arrays are keyed by variant signature during build, flattened after.
				cursor.__elements = [];
				cursor.__signatures = [];
			}
			const elements = cursor.__elements as FixtureObject[];
			const signatures = cursor.__signatures as string[];
			const signature = constSignature(step.consts);
			let index = signatures.indexOf(signature);
			if (index === -1) {
				const element: FixtureObject = { ...step.consts };
				elements.push(element);
				signatures.push(signature);
				index = elements.length - 1;
			}
			cursor = elements[index];
		}
	}
	return cursor;
}

const fixture: FixtureObject = {};
for (const site of sites) {
	const target = materialize(site.steps);
	if (site.kind === 'window') {
		target.start = SENTINEL_START;
		target.duration = SENTINEL_DURATION;
	} else if (site.kind === 'durationOnly') {
		target.duration = SENTINEL_DURATION;
	} else {
		target.rollStart = SENTINEL_START;
		target.rollWindow = SENTINEL_DURATION;
	}
}

// Flatten the variant-keyed array builders into real arrays, in place.
function flattenArrays(node: unknown): unknown {
	if (Array.isArray(node)) return node.map(flattenArrays);
	if (typeof node !== 'object' || node === null) return node;
	const record = node as FixtureObject;
	if (Array.isArray(record.__elements)) {
		return (record.__elements as FixtureObject[]).map(flattenArrays);
	}
	for (const [key, value] of Object.entries(record)) {
		record[key] = flattenArrays(value);
	}
	return record;
}
const state = flattenArrays(fixture) as FixtureObject;

// ---- Run the real rescale and verify every site scaled ----

let crash: string | null = null;
try {
	rescaleCompositionTimings(state, FACTOR);
} catch (error) {
	crash = error instanceof Error ? error.message : String(error);
}

function locate(steps: SiteStep[]): FixtureObject | null {
	let cursor: unknown = state;
	for (const step of steps) {
		if (typeof cursor !== 'object' || cursor === null) return null;
		if (step.kind === 'prop') {
			cursor = (cursor as FixtureObject)[step.key];
		} else {
			if (!Array.isArray(cursor)) return null;
			const signature = constSignature(step.consts);
			cursor = cursor.find(
				(element: FixtureObject) =>
					constSignature(
						Object.fromEntries(
							Object.keys(step.consts).map((key) => [key, element[key]])
						)
					) === signature
			);
		}
	}
	return typeof cursor === 'object' && cursor !== null ? (cursor as FixtureObject) : null;
}

type SiteResult = { path: string; kind: Site['kind']; covered: boolean };
const results: SiteResult[] = [];
for (const site of sites) {
	const target = locate(site.steps);
	let covered = false;
	if (target) {
		if (site.kind === 'window') {
			covered = target.start === EXPECTED_START && target.duration === EXPECTED_DURATION;
		} else if (site.kind === 'durationOnly') {
			covered = target.duration === EXPECTED_DURATION;
		} else {
			covered = target.rollStart === EXPECTED_START && target.rollWindow === EXPECTED_DURATION;
		}
	}
	results.push({ path: site.path, kind: site.kind, covered });
}

const uncovered = results.filter((result) => !result.covered);
const report = {
	audit: 'timing-rescale-coverage',
	generatedAt: new Date().toISOString(),
	totalSites: results.length,
	coveredSites: results.length - uncovered.length,
	uncovered,
	sites: results,
	crash,
	unknownPayloadBlindSpots: [...new Set(skippedUnknownPayloads)].sort()
};

console.log(JSON.stringify(report, null, 2));
console.error(
	crash
		? `audit-timing-coverage: CRASH — ${crash}`
		: uncovered.length > 0
			? `audit-timing-coverage: ${uncovered.length}/${results.length} fraction-window sites NOT rescaled`
			: `audit-timing-coverage: all ${results.length} fraction-window sites rescaled`
);
if (crash || uncovered.length > 0) process.exit(1);
