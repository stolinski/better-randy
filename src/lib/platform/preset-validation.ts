import type { z } from 'zod';

import { validateChartGroupSemantics } from './chart-validation';
import type { Preset } from './engine-schema';
import { PACK_REGISTRY } from './packs/registry';
import {
	getEffectDefinition,
	getOverlayDefinition,
	getSurfaceDefinition
} from './pipelines/definition-registry';
import { getCompositionEffectRegistration } from './pipelines/composition-effect-registry';
import { getStageRegistration } from './pipelines/stage-registry';
import {
	getTransitionEffectDefinition,
	isTransitionEffectType
} from './pipelines/transition-definition-registry';
import { isSubstrateAsset } from './substrate-textures';
import { resolveFrameRate, secondsToFrames } from '../utils/composition-timing';
import { normalizeWebsiteCaptureUrl } from '../utils/website-showcase';

export interface PresetSemanticIssue {
	path: (string | number)[];
	message: string;
}

export interface PresetSemanticValidationOptions {
	resolvePreset?: (slug: string) => Preset | null;
}

function appendSchemaIssues(
	issues: PresetSemanticIssue[],
	prefix: (string | number)[],
	error: z.ZodError
): void {
	for (const issue of error.issues) {
		issues.push({
			path: [
				...prefix,
				...issue.path.map((part) =>
					typeof part === 'symbol' ? (part.description ?? part.toString()) : part
				)
			],
			message: issue.message
		});
	}
}

function validateUniqueIds(
	items: readonly { id: string }[],
	path: 'overlays' | 'effects',
	issues: PresetSemanticIssue[]
): void {
	const seen = new Set<string>();
	for (const [index, item] of items.entries()) {
		if (item.id.length === 0) {
			issues.push({ path: ['state', path, index, 'id'], message: 'ID must not be empty' });
		} else if (seen.has(item.id)) {
			issues.push({
				path: ['state', path, index, 'id'],
				message: `Duplicate ${path === 'overlays' ? 'overlay' : 'effect'} ID "${item.id}"`
			});
		}
		seen.add(item.id);
	}
}

function validateMediaSemantics(preset: Preset, issues: PresetSemanticIssue[]): void {
	const assetIds = new Set<string>();
	for (const [index, asset] of preset.state.media.assets.entries()) {
		if (assetIds.has(asset.id)) {
			issues.push({
				path: ['state', 'media', 'assets', index, 'id'],
				message: `Duplicate Video asset ID "${asset.id}"`
			});
		}
		assetIds.add(asset.id);
	}

	const clipIds = new Set<string>();
	const clips = preset.state.media.videoTrack.clips;
	const compositionFrameCount = Math.max(
		1,
		secondsToFrames(
			preset.state.transport.durationSeconds,
			resolveFrameRate(preset.state.transport.fps)
		)
	);
	for (const [index, clip] of clips.entries()) {
		if (clipIds.has(clip.id)) {
			issues.push({
				path: ['state', 'media', 'videoTrack', 'clips', index, 'id'],
				message: `Duplicate Video clip ID "${clip.id}"`
			});
		}
		clipIds.add(clip.id);

		if (!assetIds.has(clip.assetId)) {
			issues.push({
				path: ['state', 'media', 'videoTrack', 'clips', index, 'assetId'],
				message: `Video clip "${clip.id}" references missing asset "${clip.assetId}"`
			});
		}

		const clipEndFrame = clip.timelineStartFrame + clip.durationFrames;
		if (clipEndFrame > compositionFrameCount) {
			issues.push({
				path: ['state', 'media', 'videoTrack', 'clips', index, 'durationFrames'],
				message: `Video clip "${clip.id}" ends at frame ${clipEndFrame}, beyond the composition's ${compositionFrameCount} frames`
			});
		}

		const previous = clips[index - 1];
		if (
			previous &&
			previous.timelineStartFrame + previous.durationFrames > clip.timelineStartFrame
		) {
			issues.push({
				path: ['state', 'media', 'videoTrack', 'clips', index, 'timelineStartFrame'],
				message: `Video clips must be ordered and non-overlapping; "${clip.id}" starts before "${previous.id}" ends`
			});
		}
	}
}

function validatePackSemantics(preset: Preset, issues: PresetSemanticIssue[]): void {
	if (!(preset.pack in PACK_REGISTRY)) {
		issues.push({
			path: ['pack'],
			message: `Unknown Pack "${preset.pack}". Registered Packs: ${Object.keys(PACK_REGISTRY).join(', ')}`
		});
	}
}

function validateSurfaceSemantics(preset: Preset, issues: PresetSemanticIssue[]): void {
	const surfaceDefinition = getSurfaceDefinition(preset.state.surface.type);
	if (!surfaceDefinition) {
		issues.push({
			path: ['state', 'surface', 'type'],
			message: `Unknown Surface type "${preset.state.surface.type}"`
		});
	} else if (preset.state.surface.variant !== undefined) {
		if (!surfaceDefinition.variantIds) {
			issues.push({
				path: ['state', 'surface', 'variant'],
				message: `Surface "${surfaceDefinition.type}" does not support variants`
			});
		} else if (!surfaceDefinition.variantIds.includes(preset.state.surface.variant)) {
			issues.push({
				path: ['state', 'surface', 'variant'],
				message: `Unknown variant "${preset.state.surface.variant}" for Surface "${surfaceDefinition.type}". Registered variants: ${surfaceDefinition.variantIds.join(', ')}`
			});
		}
	}

	if (preset.state.surface.type === 'website-screenshot') {
		const imageUrl = preset.state.surface.content.imageUrl;
		if (!imageUrl || !/^\/api\/user-assets\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(imageUrl)) {
			issues.push({
				path: ['state', 'surface', 'content', 'imageUrl'],
				message: 'website-screenshot requires a content-addressed /api/user-assets imageUrl'
			});
		}
		try {
			normalizeWebsiteCaptureUrl(preset.state.surface.content.sourceUrl ?? '');
		} catch (errorValue) {
			issues.push({
				path: ['state', 'surface', 'content', 'sourceUrl'],
				message: errorValue instanceof Error ? errorValue.message : 'Website capture URL is invalid'
			});
		}
	}

	for (const issue of validateChartGroupSemantics(
		preset.state.surface.chart,
		preset.state.surface.diagram ?? [],
		preset.state.surface.type
	)) {
		issues.push({
			path: ['state', 'surface', ...issue.path],
			message: issue.message
		});
	}
}

/** Returns the overlay ID set for text-animation target checks. */
function validateOverlaySemantics(preset: Preset, issues: PresetSemanticIssue[]): Set<string> {
	validateUniqueIds(preset.state.overlays, 'overlays', issues);
	const overlayIds = new Set<string>();
	for (const [index, overlay] of preset.state.overlays.entries()) {
		overlayIds.add(overlay.id);
		const definition = getOverlayDefinition(overlay.type);
		if (!definition) {
			issues.push({
				path: ['state', 'overlays', index, 'type'],
				message: `Unknown Overlay type "${overlay.type}"`
			});
			continue;
		}
		const result = definition.schema.safeParse(overlay.content);
		if (!result.success) {
			appendSchemaIssues(issues, ['state', 'overlays', index, 'content'], result.error);
		}
	}
	return overlayIds;
}

function validateEffectSemantics(preset: Preset, issues: PresetSemanticIssue[]): void {
	validateUniqueIds(preset.state.effects, 'effects', issues);
	for (const [index, effect] of preset.state.effects.entries()) {
		if (isTransitionEffectType(effect.type)) {
			issues.push({
				path: ['state', 'effects', index, 'type'],
				message: `Transition Effect "${effect.type}" belongs in the top-level transition block, not effects[]`
			});
			continue;
		}

		const definition = getEffectDefinition(effect.type);
		const compositionRegistration = getCompositionEffectRegistration(effect.type);
		const schema = definition?.schema ?? compositionRegistration?.schema;
		if (!schema) {
			issues.push({
				path: ['state', 'effects', index, 'type'],
				message: `Unknown Effect type "${effect.type}"`
			});
			continue;
		}
		const result = schema.safeParse(effect);
		if (!result.success) {
			appendSchemaIssues(issues, ['state', 'effects', index], result.error);
		}
	}
}

function validateStageSemantics(preset: Preset, issues: PresetSemanticIssue[]): void {
	if (!preset.state.stage) return;
	if (!getStageRegistration(preset.state.stage.type)) {
		issues.push({
			path: ['state', 'stage', 'type'],
			message: `Unknown Stage type "${preset.state.stage.type}"`
		});
	}
	const asset = preset.state.stage.backdrop?.image?.asset;
	if (asset && !isSubstrateAsset(asset)) {
		issues.push({
			path: ['state', 'stage', 'backdrop', 'image', 'asset'],
			message: `Unknown substrate asset "${asset}"`
		});
	}
}

function validateTextAnimationTargets(
	preset: Preset,
	overlayIds: ReadonlySet<string>,
	issues: PresetSemanticIssue[]
): void {
	for (const [index, animation] of preset.state.textAnimations.entries()) {
		if (animation.target.kind === 'overlay' && !overlayIds.has(animation.target.overlayId)) {
			issues.push({
				path: ['state', 'textAnimations', index, 'target', 'overlayId'],
				message: `Overlay target "${animation.target.overlayId}" does not match any overlays[].id`
			});
		}
	}
}

function validateTransitionSemantics(
	preset: Preset,
	options: PresetSemanticValidationOptions,
	issues: PresetSemanticIssue[]
): void {
	if (!preset.transition) return;
	if (preset.state.media.videoTrack.clips.length > 0) {
		issues.push({
			path: ['state', 'media', 'videoTrack', 'clips'],
			message: 'Active Video clips are not supported on transition Presets in v1'
		});
	}
	const definition = getTransitionEffectDefinition(preset.transition.effect);
	if (!definition) {
		issues.push({
			path: ['transition', 'effect'],
			message: `Unknown transition Effect "${preset.transition.effect}"`
		});
	} else {
		const result = definition.paramsSchema.safeParse(preset.transition.params);
		if (!result.success) {
			appendSchemaIssues(issues, ['transition', 'params'], result.error);
		}
	}
	if (!options.resolvePreset) return;
	for (const endpoint of ['from', 'to'] as const) {
		const slug = preset.transition[endpoint];
		const resolved = options.resolvePreset(slug);
		if (!resolved) {
			issues.push({
				path: ['transition', endpoint],
				message: `Preset "${slug}" does not resolve`
			});
		} else if (resolved.state.media.videoTrack.clips.length > 0) {
			issues.push({
				path: ['transition', endpoint],
				message: `Preset "${slug}" uses active Video clips, which transition snapshots do not support in v1`
			});
		}
	}
}

export function validatePresetSemantics(
	preset: Preset,
	options: PresetSemanticValidationOptions = {}
): readonly PresetSemanticIssue[] {
	const issues: PresetSemanticIssue[] = [];

	validatePackSemantics(preset, issues);
	validateMediaSemantics(preset, issues);
	validateSurfaceSemantics(preset, issues);
	const overlayIds = validateOverlaySemantics(preset, issues);
	validateEffectSemantics(preset, issues);
	validateStageSemantics(preset, issues);
	validateTextAnimationTargets(preset, overlayIds, issues);
	validateTransitionSemantics(preset, options, issues);

	return issues;
}

export function formatPresetSemanticIssues(issues: readonly PresetSemanticIssue[]): string {
	return issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('\n');
}
