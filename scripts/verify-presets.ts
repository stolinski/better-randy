import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// The engine modules use SvelteKit's `$lib` alias, which plain Node cannot
// resolve — map it to `src/lib` (probing `.ts` / `/index.ts` for the
// extensionless import convention). The Pack manifests also transitively
// import @fontsource side-effect stylesheets (`packs/syntax/fonts.ts`), which
// Node/tsx cannot load — stub `.css` modules so the registry is importable
// outside Vite.
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
			// The codebase's relative imports are extensionless (Vite convention);
			// plain-Node ESM requires extensions — probe .ts / /index.ts.
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
	},
	load(url, context, nextLoad) {
		if (url.endsWith('.css')) {
			return { format: 'module', source: '', shortCircuit: true };
		}
		return nextLoad(url, context);
	}
});
const schemaModulePath = resolve(repoRoot, 'src/lib/platform/engine-schema.ts');
const rubricModulePath = resolve(repoRoot, 'src/lib/platform/preset-rubric.ts');
const packRegistryModulePath = resolve(repoRoot, 'src/lib/platform/packs/registry.ts');
const identityRegistryModulePath = resolve(
	repoRoot,
	'src/lib/platform/pipelines/identity-registry.ts'
);

interface ParseResult {
	success: boolean;
	data?: unknown;
	error?: unknown;
}

interface RubricIssue {
	rule: string;
	severity: 'error' | 'warn';
	path: string;
	message: string;
}

const { PresetSchema } = (await import(pathToFileURL(schemaModulePath).href)) as {
	PresetSchema: { safeParse: (value: unknown) => ParseResult };
};

const { lintPreset } = (await import(pathToFileURL(rubricModulePath).href)) as {
	lintPreset: (preset: unknown) => RubricIssue[];
};

const presetDir = resolve(repoRoot, 'src/lib/presets');
const files = (await readdir(presetDir)).filter((file) => file.endsWith('.json'));

let failed = 0;
let warned = 0;
let fixtureCount = 0;

for (const file of files) {
	const raw = await readFile(resolve(presetDir, file), 'utf8');
	const json = JSON.parse(raw);
	const result = PresetSchema.safeParse(json);

	if (!result.success) {
		console.error(`✗ ${file} (schema)`);
		console.error(result.error);
		failed += 1;
		continue;
	}

	// Fixtures (demos / showcases / tests / motion-primitive verifiers) are
	// schema-checked but exempt from the deliverable R/Q/G rubric floors.
	if ((result.data as { kind?: string }).kind === 'fixture') {
		fixtureCount += 1;
		console.log(`✓ ${file} (fixture — schema only)`);
		continue;
	}

	const issues = lintPreset(result.data);
	const errors = issues.filter((issue) => issue.severity === 'error');
	const warnings = issues.filter((issue) => issue.severity === 'warn');

	if (errors.length === 0 && warnings.length === 0) {
		console.log(`✓ ${file}`);
		continue;
	}

	if (errors.length > 0) {
		failed += 1;
		console.error(`✗ ${file} (rubric)`);
	} else {
		console.log(`⚠ ${file} (rubric warnings)`);
	}

	warned += warnings.length;

	for (const issue of issues) {
		const tag = issue.severity === 'error' ? 'ERR' : 'WRN';
		console[issue.severity === 'error' ? 'error' : 'log'](
			`    ${tag} ${issue.rule} ${issue.path} — ${issue.message}`
		);
	}
}

interface Fixture {
	name: string;
	preset: unknown;
}

const baseMarks = {
	defaults: {
		highlight: { color: '#ffd642', intensity: 0.62 },
		underline: { color: '#1f5aff', intensity: 0.62 },
		strike: { color: '#de263a', intensity: 0.62 },
		circle: { color: '#de263a', intensity: 0.62 }
	},
	timings: []
};
const emptyEffects: never[] = [];

const fixtures: Fixture[] = [
	{
		name: 'Cross-surface remix (paper → plain content carry-over)',
		preset: {
			schema: "supers@1",
			pack: "syntax",
			name: 'Cross-surface remix',
			state: {
				transport: { orientation: 'horizontal', durationSeconds: 5, fps: 30, format: 'webm' },
				typography: { fontFamily: 'serif', paperColor: '#ffffff', inkColor: '#0a0a0a' },
				marks: baseMarks,
				surface: {
					type: 'plain',
					content: {
						body: 'Plain background body with one [highlight]bright phrase[/highlight].'
					}
				},
				overlays: [],
				effects: emptyEffects
			}
		}
	},
	{
		name: 'Decorative fixture (every decorative style on its own line)',
		preset: {
			schema: "supers@1",
			pack: "syntax",
			name: 'Decorative coverage',
			state: {
				transport: { orientation: 'horizontal', durationSeconds: 5, fps: 30, format: 'webm' },
				typography: { fontFamily: 'serif', paperColor: '#ffffff', inkColor: '#0a0a0a' },
				marks: baseMarks,
				surface: {
					type: 'paper',
					content: {
						title: 'Decorative coverage',
						body: '[highlight]highlight[/highlight] [underline]underline[/underline] [strike]strike[/strike] [circle]circle[/circle] [box]box[/box] [side-note]side-note[/side-note]'
					},
					enter: { start: 0, duration: 0.18, ease: 'settled' },
					exit: { start: 0.82, duration: 0.18, ease: 'smooth' }
				},
				overlays: [],
				effects: emptyEffects
			}
		}
	},
	{
		name: 'Focal fixture (every focal style on its own line)',
		preset: {
			schema: "supers@1",
			pack: "syntax",
			name: 'Focal coverage',
			state: {
				transport: { orientation: 'horizontal', durationSeconds: 5, fps: 30, format: 'webm' },
				typography: { fontFamily: 'serif', paperColor: '#ffffff', inkColor: '#0a0a0a' },
				marks: baseMarks,
				surface: {
					type: 'paper',
					content: {
						title: 'Focal coverage',
						body: '[magnify]magnify[/magnify] [lift-out]lift-out[/lift-out] [tear-out]tear-out[/tear-out] [isolate]isolate[/isolate]'
					}
				},
				overlays: [],
				effects: emptyEffects
			}
		}
	},
	{
		name: 'Lower-third overlay fixture',
		preset: {
			schema: "supers@1",
			pack: "syntax",
			name: 'Lower-third overlay',
			state: {
				transport: { orientation: 'horizontal', durationSeconds: 5, fps: 30, format: 'webm' },
				typography: { fontFamily: 'sans', paperColor: '#ffffff', inkColor: '#0a0a0a' },
				marks: baseMarks,
				surface: {
					type: 'plain',
					content: { body: 'Body text in the background.' }
				},
				overlays: [
					{
						type: 'lower-third',
						id: 'main',
						content: { kicker: 'CHAPTER 01', title: 'Origins', subtitle: 'How it began' },
						position: { anchor: 'bottom-left', offset: { x: 0.0625, y: 0.0625 } },
						enter: { start: 0.1, duration: 0.18, ease: 'settled' },
						exit: { start: 0.82, duration: 0.16, ease: 'smooth' }
					}
				],
				effects: emptyEffects
			}
		}
	},
	{
		name: 'Two paper-grain effects stacked in the frame chain',
		preset: {
			schema: "supers@1",
			pack: "syntax",
			name: 'Paper grain stacked',
			state: {
				transport: { orientation: 'horizontal', durationSeconds: 5, fps: 30, format: 'webm' },
				typography: { fontFamily: 'serif', paperColor: '#ffffff', inkColor: '#0a0a0a' },
				marks: baseMarks,
				surface: {
					type: 'paper',
					content: { title: 'Grain test', body: 'Body content.' }
				},
				overlays: [],
				effects: [
					{ type: 'paper-grain', id: 'warm', params: { warmth: 0.6, density: 0.4 } },
					{ type: 'paper-grain', id: 'cool', params: { warmth: 0.3, density: 0.2 } }
				]
			}
		}
	},
	{
		name: 'AI-authored from schema + brief (no source code access)',
		preset: {
			schema: "supers@1",
			pack: "syntax",
			name: 'AI fixture',
			description: 'Goal: a quick research-paper preset that highlights one keyword.',
			state: {
				transport: { orientation: 'horizontal', durationSeconds: 5, fps: 30, format: 'webm' },
				typography: { fontFamily: 'serif', paperColor: '#ffffff', inkColor: '#0a0a0a' },
				marks: baseMarks,
				surface: {
					type: 'paper',
					content: {
						title: 'Test paper',
						sourceUrl: 'https://example.com/paper',
						body: 'Plain paragraph with [highlight]one highlight[/highlight] in it.'
					},
					enter: { start: 0, duration: 0.18, ease: 'settled' },
					exit: { start: 0.82, duration: 0.18, ease: 'smooth' }
				},
				overlays: [],
				effects: emptyEffects
			}
		}
	}
];

for (const fixture of fixtures) {
	const result = PresetSchema.safeParse(fixture.preset);

	if (!result.success) {
		console.error(`✗ ${fixture.name}`);
		console.error(result.error);
		failed += 1;
	} else {
		console.log(`✓ ${fixture.name}`);
	}
}

// Pack core vocabulary (ADR-0024): every registered Pack must supply the six
// mandatory core Roles (fill/ink/accent/edge/depth/light treatments) with
// resolver-recognised values — the same gate the engine enforces at boot.
interface PackCoreVocabularyError {
	pack: string;
	role: string;
	kind: string;
	message: string;
}

const { PACK_REGISTRY } = (await import(pathToFileURL(packRegistryModulePath).href)) as {
	PACK_REGISTRY: Readonly<Record<string, { slug: string }>>;
};
const { validatePackCoreVocabulary } = (await import(
	pathToFileURL(identityRegistryModulePath).href
)) as {
	validatePackCoreVocabulary: (manifest: unknown) => readonly PackCoreVocabularyError[];
};

for (const [slug, manifest] of Object.entries(PACK_REGISTRY)) {
	const errors = validatePackCoreVocabulary(manifest);

	if (errors.length === 0) {
		console.log(`✓ pack:${slug} (core vocabulary)`);
		continue;
	}

	failed += 1;
	console.error(`✗ pack:${slug} (core vocabulary)`);
	for (const error of errors) {
		console.error(`    ERR ${error.kind} ${error.role} — ${error.message}`);
	}
}

if (failed > 0) {
	console.error(`\n${failed} validation check(s) failed.`);
	process.exit(1);
}

const fixtureNote =
	fixtureCount > 0
		? ` ${fixtureCount} fixture(s) schema-checked only (rubric floors apply to deliverables).`
		: '';
if (warned > 0) {
	console.log(`\nAll preset validation checks passed (${warned} rubric warning(s)).${fixtureNote}`);
} else {
	console.log(`\nAll preset validation checks passed.${fixtureNote}`);
}
