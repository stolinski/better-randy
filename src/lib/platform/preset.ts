import {
	PresetSchema,
	type MarkTiming,
	type Preset,
	type SurfaceState
} from './engine-schema';
import { engineState } from './engine-state.svelte';

export interface CataloguedPreset {
	slug: string;
	preset: Preset;
}

const presetModules = import.meta.glob<{ default: unknown }>('$lib/presets/*.json', {
	eager: true
});

const PRESET_CATALOG: CataloguedPreset[] = Object.entries(presetModules)
	.map<CataloguedPreset | null>(([path, module]) => {
		const slug = path.split('/').pop()?.replace(/\.json$/, '');

		if (!slug) {
			return null;
		}

		const result = PresetSchema.safeParse(module.default);

		if (!result.success) {
			console.error(`Invalid built-in preset at ${path}.`, result.error);
			return null;
		}

		return { slug, preset: result.data };
	})
	.filter((entry): entry is CataloguedPreset => entry !== null)
	.sort((a, b) => a.preset.name.localeCompare(b.preset.name));

const PRESET_BY_SLUG = new Map(PRESET_CATALOG.map((entry) => [entry.slug, entry.preset]));

export function listPresets(): readonly CataloguedPreset[] {
	return PRESET_CATALOG;
}

export function getPresetBySlug(slug: string): Preset | null {
	return PRESET_BY_SLUG.get(slug) ?? null;
}

export function parsePreset(json: unknown): Preset {
	const result = PresetSchema.safeParse(json);

	if (!result.success) {
		const issues = result.error.issues
			.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
			.join('\n');

		throw new Error(`Invalid Hiviz preset:\n${issues}`);
	}

	return result.data;
}

function cloneTiming(timing: MarkTiming): MarkTiming {
	const next: MarkTiming = {
		start: timing.start,
		duration: timing.duration,
		ease: timing.ease
	};

	if (timing.color !== undefined) {
		next.color = timing.color;
	}

	if (timing.intensity !== undefined) {
		next.intensity = timing.intensity;
	}

	return next;
}

function cloneSurface(surface: SurfaceState): SurfaceState {
	if (surface.type === 'research-paper') {
		return {
			type: 'research-paper',
			content: {
				title: surface.content.title,
				sourceUrl: surface.content.sourceUrl,
				body: surface.content.body
			},
			enter: { start: surface.enter.start, duration: surface.enter.duration, ease: surface.enter.ease },
			exit: { start: surface.exit.start, duration: surface.exit.duration, ease: surface.exit.ease }
		};
	}

	return {
		type: 'quote-focus',
		content: {
			body: surface.content.body,
			author: surface.content.author,
			source: surface.content.source,
			dateLabel: surface.content.dateLabel
		},
		focus: {
			start: surface.focus.start,
			duration: surface.focus.duration,
			ease: surface.focus.ease,
			style: surface.focus.style
		},
		mark: {
			start: surface.mark.start,
			duration: surface.mark.duration,
			ease: surface.mark.ease,
			style: surface.mark.style
		},
		camera: surface.camera,
		backgroundVisibility: surface.backgroundVisibility,
		showSourceMetadata: surface.showSourceMetadata
	};
}

export function applyPreset(preset: Preset): void {
	const next = preset.state;

	engineState.transport.orientation = next.transport.orientation;
	engineState.transport.durationSeconds = next.transport.durationSeconds;
	engineState.transport.fps = next.transport.fps;
	engineState.transport.format = next.transport.format;

	engineState.typography.fontFamily = next.typography.fontFamily;
	engineState.typography.paperColor = next.typography.paperColor;
	engineState.typography.inkColor = next.typography.inkColor;

	engineState.marks.defaults.highlight.color = next.marks.defaults.highlight.color;
	engineState.marks.defaults.highlight.intensity = next.marks.defaults.highlight.intensity;
	engineState.marks.defaults.underline.color = next.marks.defaults.underline.color;
	engineState.marks.defaults.underline.intensity = next.marks.defaults.underline.intensity;
	engineState.marks.defaults.strike.color = next.marks.defaults.strike.color;
	engineState.marks.defaults.strike.intensity = next.marks.defaults.strike.intensity;
	engineState.marks.defaults.circle.color = next.marks.defaults.circle.color;
	engineState.marks.defaults.circle.intensity = next.marks.defaults.circle.intensity;

	engineState.marks.timings.length = 0;
	for (const timing of next.marks.timings) {
		engineState.marks.timings.push(cloneTiming(timing));
	}

	engineState.surface = cloneSurface(next.surface);
}
