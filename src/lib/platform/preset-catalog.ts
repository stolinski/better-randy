import type { Preset } from './engine-schema';
import { PresetIngressSchema } from './preset-ingress';
import { formatPresetSemanticIssues, validatePresetSemantics } from './preset-validation';

export interface CataloguedPreset {
	slug: string;
	preset: Preset;
}

const presetModules = import.meta.glob<{ default: unknown }>('$lib/presets/*.json', {
	eager: true
});

const SCHEMA_VALID_CATALOG: CataloguedPreset[] = Object.entries(presetModules)
	.map<CataloguedPreset | null>(([path, module]) => {
		const slug = path
			.split('/')
			.pop()
			?.replace(/\.json$/, '');

		if (!slug) return null;
		const result = PresetIngressSchema.safeParse(module.default);
		if (!result.success) {
			console.error(`Invalid built-in preset at ${path}.`, result.error);
			return null;
		}
		const semanticIssues = validatePresetSemantics(result.data);
		if (semanticIssues.length > 0) {
			console.error(
				`Invalid built-in preset at ${path}:\n${formatPresetSemanticIssues(semanticIssues)}`
			);
			return null;
		}
		return { slug, preset: result.data };
	})
	.filter((entry): entry is CataloguedPreset => entry !== null)
	.sort((a, b) => a.preset.name.localeCompare(b.preset.name));

const SCHEMA_VALID_BY_SLUG = new Map(
	SCHEMA_VALID_CATALOG.map((entry) => [entry.slug, entry.preset])
);

const PRESET_CATALOG: CataloguedPreset[] = SCHEMA_VALID_CATALOG.filter((entry) => {
	const semanticIssues = validatePresetSemantics(entry.preset, {
		resolvePreset: (slug) => SCHEMA_VALID_BY_SLUG.get(slug) ?? null
	});
	if (semanticIssues.length > 0) {
		console.error(
			`Invalid built-in preset "${entry.slug}":\n${formatPresetSemanticIssues(semanticIssues)}`
		);
		return false;
	}
	return true;
});

const PRESET_BY_SLUG = new Map(PRESET_CATALOG.map((entry) => [entry.slug, entry.preset]));
const DELIVERABLE_CATALOG = PRESET_CATALOG.filter((entry) => entry.preset.kind !== 'fixture');
const FIXTURE_CATALOG = PRESET_CATALOG.filter((entry) => entry.preset.kind === 'fixture');

export function listPresets(): readonly CataloguedPreset[] {
	return DELIVERABLE_CATALOG;
}

export function listFixtures(): readonly CataloguedPreset[] {
	return FIXTURE_CATALOG;
}

export function getPresetBySlug(slug: string): Preset | null {
	return PRESET_BY_SLUG.get(slug) ?? null;
}
