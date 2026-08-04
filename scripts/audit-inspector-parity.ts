// GUI↔agent parity audit (ADR-0032): no Preset schema field may be editable
// only by agents — every authored field needs a GUI editor path. The 2026-07-02
// audit found 15 gaps by hand; this script makes the two mechanical slices of
// that rule continuously checkable:
//
//  1. Surface content parity — every `surface.content` property the schema
//     declares must be editable somewhere: either a DOCUMENT_SLOT (the document
//     editor's slot loop) or a direct `content.<key>` binding in a platform
//     inspector / pipeline editor component.
//  2. Effect editor parity — every Effect pipeline that declares a params
//     schema must ship an Editor component (overlays are compile-enforced by
//     `OverlayRenderer.Editor` being required; effects' `Editor?` is optional,
//     so only a runtime check catches a missing one).
//
// Bindings are discovered by source scan (`content.<key>` over inspector and
// editor Svelte sources) — a heuristic, recorded as such in the report.
//
// Usage: node --experimental-strip-types scripts/audit-inspector-parity.ts
// Output: JSON report on stdout; exit 1 when any parity gap is found.
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
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
const { DOCUMENT_SLOTS } = (await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/utils/surface-document-slots.ts')).href
)) as { DOCUMENT_SLOTS: readonly string[] };

// ---- Slice 1: surface.content parity ----

type JsonSchema = {
	$ref?: string;
	$defs?: Record<string, JsonSchema>;
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
	throw new Error('audit-inspector-parity: could not resolve surface.content properties');
}

async function listSvelteSources(root: string): Promise<string[]> {
	const found: string[] = [];
	const entries = await readdir(root, { withFileTypes: true, recursive: true });
	for (const entry of entries) {
		if (entry.isFile() && entry.name.endsWith('.svelte')) {
			found.push(join(entry.parentPath, entry.name));
		}
	}
	return found;
}

// Only platform inspector components count as EDITING a field — a
// `content.<key>` read inside `src/lib/pipelines` is a render site, and a
// field that renders without an editor is exactly the gap this audit exists
// to catch.
const editorSources = await listSvelteSources(resolve(repoRoot, 'src/lib/platform'));

const boundContentKeys = new Set<string>();
const bindingSites: Record<string, string[]> = {};
for (const sourcePath of editorSources) {
	const source = await readFile(sourcePath, 'utf8');
	for (const match of source.matchAll(/\bcontent\.([a-zA-Z][a-zA-Z0-9]*)/g)) {
		const key = match[1];
		boundContentKeys.add(key);
		const relative = sourcePath.slice(repoRoot.length + 1);
		(bindingSites[key] ??= []).push(relative);
	}
}
for (const key of Object.keys(bindingSites)) {
	bindingSites[key] = [...new Set(bindingSites[key])].sort();
}

const slotSet = new Set<string>(DOCUMENT_SLOTS);
const contentFindings = schemaContentProps.map((prop) => {
	const viaSlot = slotSet.has(prop);
	const viaBinding = boundContentKeys.has(prop);
	return {
		prop,
		editableViaDocumentSlot: viaSlot,
		editableViaBinding: viaBinding,
		bindingSites: viaBinding ? (bindingSites[prop] ?? []) : [],
		gap: !viaSlot && !viaBinding
	};
});
const contentGaps = contentFindings.filter((finding) => finding.gap).map((finding) => finding.prop);

// ---- Slice 2: effect Editor parity ----

const effectsDir = resolve(repoRoot, 'src/lib/pipelines/effects');
const effectFolders = (await readdir(effectsDir, { withFileTypes: true }))
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name)
	.sort();

type EffectFinding = {
	slug: string;
	declaresParamsSchema: boolean;
	referencesEditor: boolean;
	editorFileExists: boolean;
	gap: boolean;
};

const effectFindings: EffectFinding[] = [];
for (const slug of effectFolders) {
	const indexPath = resolve(effectsDir, slug, 'index.ts');
	if (!existsSync(indexPath)) continue;
	const indexSource = await readFile(indexPath, 'utf8');
	const declaresParamsSchema =
		/\b(?:schema|paramsSchema)\s*:/.test(indexSource) &&
		!/\b(?:schema|paramsSchema)\s*:\s*z\.object\(\{\}\)/.test(indexSource);
	const referencesEditor = /\bEditor\b/.test(indexSource);
	const editorFileExists = existsSync(resolve(effectsDir, slug, 'Editor.svelte'));
	effectFindings.push({
		slug,
		declaresParamsSchema,
		referencesEditor,
		editorFileExists,
		gap: declaresParamsSchema && !(referencesEditor && editorFileExists)
	});
}
const effectGaps = effectFindings.filter((finding) => finding.gap).map((finding) => finding.slug);

// ---- Report ----

const report = {
	audit: 'inspector-parity',
	generatedAt: new Date().toISOString(),
	method:
		'schema property walk + DOCUMENT_SLOTS + `content.<key>` source scan over src/lib/platform Svelte components (pipeline sources are render sites, not editors); effect folders scanned for params schema and Editor component',
	content: {
		schemaProps: schemaContentProps,
		documentSlots: [...DOCUMENT_SLOTS],
		findings: contentFindings,
		gaps: contentGaps
	},
	effects: {
		findings: effectFindings,
		gaps: effectGaps
	}
};

const gapCount = contentGaps.length + effectGaps.length;
console.log(JSON.stringify(report, null, 2));
console.error(
	gapCount > 0
		? `audit-inspector-parity: ${gapCount} parity gap(s) — content: [${contentGaps.join(', ')}], effects: [${effectGaps.join(', ')}]`
		: `audit-inspector-parity: no parity gaps (${schemaContentProps.length} content props, ${effectFindings.length} effects)`
);
if (gapCount > 0) process.exit(1);
