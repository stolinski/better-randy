// Coverage audit for `trackCompositionAuthoringDependencies` (the Workspace
// manifest-rebuild $effect's hand-enumerated dependency reads). The tracker
// must read every authored value that changes the animation manifest or the
// rendered pixels — a schema content field it does not read goes stale on
// edit: the timeline bar moves but the pixels don't (this bug class shipped
// twice, for content.items and content.messages).
//
// Method: build a real EngineState from a corpus preset, overwrite every
// `surface.content` property declared by the schema with a sentinel, wrap
// `content` in a recording Proxy, run the REAL tracker, and diff the recorded
// reads against the schema's property set. Also asserts every DOCUMENT_SLOT
// is tracked, since slots are rendered DOM by definition.
//
// Usage: node --experimental-strip-types scripts/audit-tracking-coverage.ts
// Output: JSON report on stdout; exit 1 when any schema content field is untracked.
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
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

const { EngineStateSchema } = (await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/engine-schema.ts')).href
)) as { EngineStateSchema: z.ZodTypeAny };
const { PresetIngressSchema } = (await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/preset-ingress.ts')).href
)) as { PresetIngressSchema: z.ZodTypeAny };
const { trackCompositionAuthoringDependencies } = (await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/composition-authoring-dependencies.ts')).href
)) as { trackCompositionAuthoringDependencies: (state: unknown, packSlug: string) => void };
const { DOCUMENT_SLOTS } = (await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/utils/surface-document-slots.ts')).href
)) as { DOCUMENT_SLOTS: readonly string[] };

// ---- The schema's authoritative surface.content property set ----

type JsonSchema = {
	$ref?: string;
	$defs?: Record<string, JsonSchema>;
	type?: string | string[];
	properties?: Record<string, JsonSchema>;
};

const stateJsonSchema = z.toJSONSchema(EngineStateSchema, {
	target: 'draft-2020-12',
	io: 'input',
	unrepresentable: 'any'
}) as JsonSchema;

function deref(node: JsonSchema): JsonSchema {
	if (node.$ref) {
		const match = /^#\/\$defs\/(.+)$/.exec(node.$ref);
		const defs = stateJsonSchema.$defs ?? {};
		if (match && defs[match[1]]) return deref(defs[match[1]]);
	}
	return node;
}

const surfaceNode = deref(deref(stateJsonSchema).properties?.surface ?? {});
const contentNode = deref(surfaceNode.properties?.content ?? {});
const schemaContentProps = Object.keys(contentNode.properties ?? {}).sort();
if (schemaContentProps.length === 0) {
	throw new Error('audit-tracking-coverage: could not resolve surface.content properties');
}

// ---- Fixture: a real corpus preset with every content prop set ----

const presetsDir = resolve(repoRoot, 'src/lib/presets');
const presetFiles = (await readdir(presetsDir)).filter((file) => file.endsWith('.json')).sort();

type FixtureState = {
	surface: { content: Record<string, unknown> };
};

let baseState: FixtureState | null = null;
let basePresetFile: string | null = null;
for (const file of presetFiles) {
	const raw: unknown = JSON.parse(await readFile(resolve(presetsDir, file), 'utf8'));
	const parsed = PresetIngressSchema.safeParse(raw);
	if (parsed.success) {
		baseState = (parsed.data as { state: FixtureState }).state;
		basePresetFile = file;
		break;
	}
}
if (!baseState || !basePresetFile) {
	throw new Error('audit-tracking-coverage: no corpus preset parsed cleanly');
}

const sentinelContent: Record<string, unknown> = { ...baseState.surface.content };
for (const [key, propNode] of Object.entries(contentNode.properties ?? {})) {
	const resolved = deref(propNode);
	const type = Array.isArray(resolved.type) ? resolved.type[0] : resolved.type;
	if (type === 'array') sentinelContent[key] = [{ sentinel: true }];
	else if (type === 'object') sentinelContent[key] = { sentinel: true };
	else if (type === 'number' || type === 'integer') sentinelContent[key] = 0.5;
	else if (type === 'boolean') sentinelContent[key] = true;
	else sentinelContent[key] = `sentinel-${key}`;
}

const trackedReads = new Set<string>();
baseState.surface.content = new Proxy(sentinelContent, {
	get(target, property, receiver) {
		if (typeof property === 'string') trackedReads.add(property);
		return Reflect.get(target, property, receiver);
	}
});

// ---- Run the real tracker and diff ----

let crash: string | null = null;
try {
	trackCompositionAuthoringDependencies(baseState, 'syntax');
} catch (error) {
	crash = error instanceof Error ? error.message : String(error);
}

const tracked = [...trackedReads].sort();
const untracked = schemaContentProps.filter((prop) => !trackedReads.has(prop));
const documentSlotGaps = DOCUMENT_SLOTS.filter((slot) => !trackedReads.has(slot));

const report = {
	audit: 'authoring-tracking-coverage',
	generatedAt: new Date().toISOString(),
	basePreset: basePresetFile,
	schemaContentProps,
	trackedContentReads: tracked,
	untracked,
	documentSlotGaps,
	crash
};

console.log(JSON.stringify(report, null, 2));
console.error(
	crash
		? `audit-tracking-coverage: CRASH — ${crash}`
		: untracked.length > 0
			? `audit-tracking-coverage: ${untracked.length}/${schemaContentProps.length} schema content fields NOT tracked: ${untracked.join(', ')}`
			: `audit-tracking-coverage: all ${schemaContentProps.length} schema content fields tracked`
);
if (crash || untracked.length > 0) process.exit(1);
