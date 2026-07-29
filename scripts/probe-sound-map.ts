import { existsSync } from 'node:fs';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

// Same $lib / extensionless / css-stub hooks as verify-presets.ts — the sound
// modules live under the SvelteKit alias and import extensionless.
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
	},
	load(url, context, nextLoad) {
		if (url.endsWith('.css')) {
			return { format: 'module', source: '', shortCircuit: true };
		}
		return nextLoad(url, context);
	}
});

interface ProbeCue {
	id: string;
	event: string;
	start: number;
	sample: string | null;
}

interface PresetSoundReport {
	file: string;
	kind: string | undefined;
	cues: ProbeCue[];
	mutedCueIds: string[];
	manualCues: { id: string; assetSlug: string; kind?: string }[];
}

const ingressModulePath = resolve(repoRoot, 'src/lib/platform/preset-ingress.ts');
const cuesModulePath = resolve(repoRoot, 'src/lib/platform/sound-cues.ts');

const { PresetIngressSchema } = (await import(pathToFileURL(ingressModulePath).href)) as {
	PresetIngressSchema: {
		safeParse: (value: unknown) => { success: boolean; data?: unknown; error?: unknown };
	};
};
const { deriveSoundCues, resolveCueSample } = (await import(
	pathToFileURL(cuesModulePath).href
)) as {
	deriveSoundCues: (state: unknown) => {
		id: string;
		event: string;
		start: number;
		muted: boolean;
		sample?: string;
	}[];
	resolveCueSample: (cue: unknown) => string | null;
};

const presetDir = resolve(repoRoot, 'src/lib/presets');
const files = (await readdir(presetDir)).filter((file) => file.endsWith('.json'));

const reports: PresetSoundReport[] = [];
const sampleUse = new Map<string, { cueCount: number; presets: Set<string> }>();
const eventUse = new Map<string, { cueCount: number; presets: Set<string> }>();
let parseFailures = 0;

for (const file of files) {
	const raw = await readFile(resolve(presetDir, file), 'utf8');
	const parsed = PresetIngressSchema.safeParse(JSON.parse(raw));
	if (!parsed.success) {
		parseFailures += 1;
		console.error(`✗ ${file} — schema parse failed, skipped`);
		continue;
	}
	const preset = parsed.data as {
		kind?: string;
		state: { audioCues?: { id: string; assetSlug: string; kind?: string }[] };
	};

	const derived = deriveSoundCues(preset.state);
	const audible = derived.filter((cue) => !cue.muted);
	const report: PresetSoundReport = {
		file,
		kind: preset.kind,
		cues: audible.map((cue) => ({
			id: cue.id,
			event: cue.event,
			start: Number(cue.start.toFixed(3)),
			sample: resolveCueSample(cue)
		})),
		mutedCueIds: derived.filter((cue) => cue.muted).map((cue) => cue.id),
		manualCues: (preset.state.audioCues ?? []).map((cue) => ({
			id: cue.id,
			assetSlug: cue.assetSlug,
			kind: cue.kind
		}))
	};
	reports.push(report);

	for (const cue of report.cues) {
		if (cue.sample === null) {
			continue;
		}
		const bySample = sampleUse.get(cue.sample) ?? { cueCount: 0, presets: new Set<string>() };
		bySample.cueCount += 1;
		bySample.presets.add(file);
		sampleUse.set(cue.sample, bySample);

		const byEvent = eventUse.get(cue.event) ?? { cueCount: 0, presets: new Set<string>() };
		byEvent.cueCount += 1;
		byEvent.presets.add(file);
		eventUse.set(cue.event, byEvent);
	}
	for (const manual of report.manualCues) {
		const bySample = sampleUse.get(manual.assetSlug) ?? {
			cueCount: 0,
			presets: new Set<string>()
		};
		bySample.cueCount += 1;
		bySample.presets.add(file);
		sampleUse.set(manual.assetSlug, bySample);
	}
}

const sortedSamples = [...sampleUse.entries()].sort((a, b) => b[1].cueCount - a[1].cueCount);
const sortedEvents = [...eventUse.entries()].sort((a, b) => b[1].cueCount - a[1].cueCount);

console.log(`\n${files.length} presets, ${parseFailures} schema failures\n`);
console.log('AUDIBLE CUES BY SAMPLE (cues / presets):');
for (const [sample, use] of sortedSamples) {
	console.log(`  ${sample.padEnd(24)} ${String(use.cueCount).padStart(4)} / ${use.presets.size}`);
}
console.log('\nAUDIBLE CUES BY EVENT (cues / presets):');
for (const [event, use] of sortedEvents) {
	console.log(`  ${event.padEnd(24)} ${String(use.cueCount).padStart(4)} / ${use.presets.size}`);
}

const totalAudible = reports.reduce((sum, report) => sum + report.cues.length, 0);
const totalMuted = reports.reduce((sum, report) => sum + report.mutedCueIds.length, 0);
const silent = reports.filter(
	(report) => report.cues.length === 0 && report.manualCues.length === 0
);
console.log(
	`\n${totalAudible} audible cues, ${totalMuted} muted, ${silent.length} fully silent presets`
);

const outPath = process.argv[2];
if (outPath) {
	await writeFile(
		outPath,
		JSON.stringify(
			{
				presets: reports,
				samples: sortedSamples.map(([sample, use]) => ({
					sample,
					cueCount: use.cueCount,
					presets: [...use.presets].sort()
				}))
			},
			null,
			'\t'
		)
	);
	console.log(`\nDetail written to ${outPath}`);
}
