import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const schemaModulePath = resolve(repoRoot, 'src/lib/platform/engine-schema.ts');

const { PresetSchema } = (await import(pathToFileURL(schemaModulePath).href)) as {
	PresetSchema: { safeParse: (value: unknown) => { success: boolean; error?: unknown } };
};

const presetDir = resolve(repoRoot, 'src/lib/presets');
const files = (await readdir(presetDir)).filter((file) => file.endsWith('.json'));

let failed = 0;

for (const file of files) {
	const raw = await readFile(resolve(presetDir, file), 'utf8');
	const json = JSON.parse(raw);
	const result = PresetSchema.safeParse(json);

	if (!result.success) {
		console.error(`✗ ${file}`);
		console.error(result.error);
		failed += 1;
	} else {
		console.log(`✓ ${file}`);
	}
}

// Cross-surface remix test: take a research-paper preset and swap its surface to quote-focus.
const sourceRaw = await readFile(resolve(presetDir, 'research-paper-critique.json'), 'utf8');
const sourceJson = JSON.parse(sourceRaw) as Record<string, unknown>;
const state = sourceJson.state as { surface: unknown; marks: unknown };

state.surface = {
	type: 'quote-focus',
	content: {
		body: 'Filler body referencing the [highlight]canonical quote[/highlight] we want to lift.',
		author: 'Anonymous',
		source: 'Test fixture',
		dateLabel: '2026'
	},
	focus: { start: 0.2, duration: 0.3, ease: 'smooth', style: 'lift-out' },
	mark: { start: 0.45, duration: 0.25, ease: 'smooth', style: 'underline' },
	camera: 'none',
	backgroundVisibility: 0.2,
	showSourceMetadata: true
};

const remixed = {
	schema: 'hiviz@1',
	name: 'Cross-surface remix',
	state: sourceJson.state
};
const remixResult = PresetSchema.safeParse(remixed);

if (!remixResult.success) {
	console.error('✗ Cross-surface remix failed:');
	console.error(remixResult.error);
	failed += 1;
} else {
	console.log('✓ Cross-surface remix (research-paper → quote-focus)');
}

// AI-authoring fixture: a fresh preset constructed using only the schema/brief.
const aiAuthored = {
	schema: 'hiviz@1',
	name: 'AI fixture',
	description: 'Goal: a quick research-paper preset that highlights one keyword.',
	state: {
		transport: { orientation: 'horizontal', durationSeconds: 5, fps: 30, format: 'webm' },
		typography: { fontFamily: 'serif', paperColor: '#ffffff', inkColor: '#0a0a0a' },
		marks: {
			defaults: {
				highlight: { color: '#ffd642', intensity: 0.6 },
				underline: { color: '#1f5aff', intensity: 0.6 },
				strike: { color: '#de263a', intensity: 0.6 },
				circle: { color: '#de263a', intensity: 0.6 }
			},
			timings: [{ start: 0.35, duration: 0.22, ease: 'smooth' }]
		},
		surface: {
			type: 'research-paper',
			content: {
				title: 'Test paper',
				sourceUrl: 'https://example.com/paper',
				body: 'Plain paragraph with [highlight]one highlight[/highlight] in it.'
			},
			enter: { start: 0, duration: 0.18, ease: 'settled' },
			exit: { start: 0.82, duration: 0.18, ease: 'smooth' }
		}
	}
};
const aiResult = PresetSchema.safeParse(aiAuthored);

if (!aiResult.success) {
	console.error('✗ AI fixture failed:');
	console.error(aiResult.error);
	failed += 1;
} else {
	console.log('✓ AI authoring fixture (schema + brief sufficient to produce valid preset)');
}

if (failed > 0) {
	console.error(`\n${failed} preset(s) failed validation.`);
	process.exit(1);
}

console.log('\nAll preset validation checks passed.');
