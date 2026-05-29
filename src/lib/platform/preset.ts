import {
	PresetSchema,
	type Effect,
	type MarkTiming,
	type Overlay,
	type Preset,
	type SurfaceState,
	type TextAnimation
} from './engine-schema';
import { engineState, packState } from './engine-state.svelte';

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
	return {
		type: surface.type,
		content: {
			body: surface.content.body,
			title: surface.content.title,
			kicker: surface.content.kicker,
			sourceUrl: surface.content.sourceUrl,
			author: surface.content.author,
			affiliation: surface.content.affiliation,
			bodyLabel: surface.content.bodyLabel,
			source: surface.content.source,
			dateLabel: surface.content.dateLabel
		},
		enter: surface.enter
			? { start: surface.enter.start, duration: surface.enter.duration, ease: surface.enter.ease }
			: undefined,
		exit: surface.exit
			? { start: surface.exit.start, duration: surface.exit.duration, ease: surface.exit.ease }
			: undefined,
		camera: surface.camera,
		backgroundVisibility: surface.backgroundVisibility
	};
}

function cloneOverlay(overlay: Overlay): Overlay {
	return {
		type: overlay.type,
		id: overlay.id,
		content: overlay.content,
		position: {
			anchor: overlay.position.anchor,
			offset: overlay.position.offset ? { ...overlay.position.offset } : undefined,
			rect: overlay.position.rect ? { ...overlay.position.rect } : undefined
		},
		enter: overlay.enter ? { ...overlay.enter } : undefined,
		exit: overlay.exit ? { ...overlay.exit } : undefined
	};
}

function cloneEffect(effect: Effect): Effect {
	return { type: effect.type, id: effect.id, params: effect.params };
}

function cloneTextAnimation(entry: TextAnimation): TextAnimation {
	const target =
		entry.target.kind === 'surface'
			? { kind: 'surface' as const, slot: entry.target.slot }
			: {
					kind: 'overlay' as const,
					overlayId: entry.target.overlayId,
					slot: entry.target.slot
				};

	return {
		id: entry.id,
		target,
		effect: entry.effect,
		enter: { ...entry.enter },
		exit: entry.exit ? { ...entry.exit } : undefined,
		params: entry.params ? { ...entry.params } : undefined
	};
}


export function applyPreset(preset: Preset): void {
	const next = preset.state;

	packState.slug = preset.pack;

	engineState.transport.orientation = next.transport.orientation;
	engineState.transport.durationSeconds = next.transport.durationSeconds;
	engineState.transport.fps = next.transport.fps;
	engineState.transport.format = next.transport.format;

	engineState.typography.fontFamily = next.typography.fontFamily;
	engineState.typography.paperColor = next.typography.paperColor;
	engineState.typography.inkColor = next.typography.inkColor;

	for (const style of Object.keys(engineState.marks.defaults) as (keyof typeof engineState.marks.defaults)[]) {
		if (!(style in next.marks.defaults)) {
			delete engineState.marks.defaults[style];
		}
	}
	for (const [style, appearance] of Object.entries(next.marks.defaults)) {
		engineState.marks.defaults[style as keyof typeof engineState.marks.defaults] = {
			color: appearance.color,
			intensity: appearance.intensity
		};
	}

	engineState.marks.timings.length = 0;
	for (const timing of next.marks.timings) {
		engineState.marks.timings.push(cloneTiming(timing));
	}

	engineState.surface = cloneSurface(next.surface);
	engineState.overlays = next.overlays.map(cloneOverlay);
	engineState.effects = (next.effects ?? []).map(cloneEffect);
	engineState.textAnimations = (next.textAnimations ?? []).map(cloneTextAnimation);
}
