import type { z } from 'zod';

import type { Preset } from './engine-schema';
import { PACK_REGISTRY } from './packs/registry';
import { PIPELINE_REGISTRY, getSurfaceRenderer } from './pipelines';
import { getCompositionEffectRegistration } from './pipelines/composition-effect-registry';
import { getStageRegistration } from './pipelines/stage-registry';
import { isTransitionEffectType } from './pipelines/transition-registry';
import { isSubstrateAsset } from './substrate-textures';
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

export function validatePresetSemantics(
	preset: Preset,
	options: PresetSemanticValidationOptions = {}
): readonly PresetSemanticIssue[] {
	const issues: PresetSemanticIssue[] = [];

	if (!(preset.pack in PACK_REGISTRY)) {
		issues.push({
			path: ['pack'],
			message: `Unknown Pack "${preset.pack}". Registered Packs: ${Object.keys(PACK_REGISTRY).join(', ')}`
		});
	}

	const surfaceRenderer = getSurfaceRenderer(preset.state.surface.type);
	if (!surfaceRenderer) {
		issues.push({
			path: ['state', 'surface', 'type'],
			message: `Unknown Surface type "${preset.state.surface.type}"`
		});
	} else if (preset.state.surface.variant !== undefined) {
		if (!surfaceRenderer.variantIds) {
			issues.push({
				path: ['state', 'surface', 'variant'],
				message: `Surface "${surfaceRenderer.type}" does not support variants`
			});
		} else if (!surfaceRenderer.variantIds.includes(preset.state.surface.variant)) {
			issues.push({
				path: ['state', 'surface', 'variant'],
				message: `Unknown variant "${preset.state.surface.variant}" for Surface "${surfaceRenderer.type}". Registered variants: ${surfaceRenderer.variantIds.join(', ')}`
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

	validateUniqueIds(preset.state.overlays, 'overlays', issues);
	const overlayIds = new Set<string>();
	for (const [index, overlay] of preset.state.overlays.entries()) {
		overlayIds.add(overlay.id);
		const renderer = Object.values(PIPELINE_REGISTRY.overlays).find(
			(candidate) => candidate.type === overlay.type
		);
		if (!renderer) {
			issues.push({
				path: ['state', 'overlays', index, 'type'],
				message: `Unknown Overlay type "${overlay.type}"`
			});
			continue;
		}
		const result = renderer.schema.safeParse(overlay.content);
		if (!result.success) {
			appendSchemaIssues(issues, ['state', 'overlays', index, 'content'], result.error);
		}
	}

	validateUniqueIds(preset.state.effects, 'effects', issues);
	for (const [index, effect] of preset.state.effects.entries()) {
		if (isTransitionEffectType(effect.type)) {
			issues.push({
				path: ['state', 'effects', index, 'type'],
				message: `Transition Effect "${effect.type}" belongs in the top-level transition block, not effects[]`
			});
			continue;
		}

		const renderer = Object.values(PIPELINE_REGISTRY.effects).find(
			(candidate) => candidate.type === effect.type
		);
		const compositionRegistration = getCompositionEffectRegistration(effect.type);
		const schema = renderer?.schema ?? compositionRegistration?.schema;
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

	if (preset.state.stage) {
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

	for (const [index, animation] of preset.state.textAnimations.entries()) {
		if (animation.target.kind === 'overlay' && !overlayIds.has(animation.target.overlayId)) {
			issues.push({
				path: ['state', 'textAnimations', index, 'target', 'overlayId'],
				message: `Overlay target "${animation.target.overlayId}" does not match any overlays[].id`
			});
		}
	}

	if (preset.transition) {
		if (!isTransitionEffectType(preset.transition.effect)) {
			issues.push({
				path: ['transition', 'effect'],
				message: `Unknown transition Effect "${preset.transition.effect}"`
			});
		}
		if (options.resolvePreset) {
			if (!options.resolvePreset(preset.transition.from)) {
				issues.push({
					path: ['transition', 'from'],
					message: `Preset "${preset.transition.from}" does not resolve`
				});
			}
			if (!options.resolvePreset(preset.transition.to)) {
				issues.push({
					path: ['transition', 'to'],
					message: `Preset "${preset.transition.to}" does not resolve`
				});
			}
		}
	}

	return issues;
}

export function formatPresetSemanticIssues(issues: readonly PresetSemanticIssue[]): string {
	return issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('\n');
}
