import { z } from 'zod';

import {
	PRESET_SCHEMA_ID,
	PresetSchema,
	SourceVideoSchema,
	type Media,
	type Preset,
	type SourceVideo
} from './engine-schema.ts';
import {
	NTSC_FRACTIONAL_FPS,
	resolveFrameRate,
	secondsToFrames
} from '../utils/composition-timing.ts';
import { isAcceptedCompositionSchemaId } from '../utils/legacy-supers-compatibility.ts';

export const LEGACY_SOURCE_VIDEO_ASSET_ID = 'legacy-source-video-asset';
export const LEGACY_SOURCE_VIDEO_CLIP_ID = 'legacy-source-video-clip';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

function addPrefixedIssues(
	ctx: z.RefinementCtx,
	prefix: PropertyKey[],
	error: z.ZodError
): void {
	for (const issue of error.issues) {
		ctx.addIssue({
			code: 'custom',
			path: [...prefix, ...issue.path],
			message: issue.message
		});
	}
}

interface LegacyTransportFramePlan {
	durationSeconds: number;
	fps: number;
}

function legacySourceVideoMedia(
	sourceVideo: SourceVideo,
	transport: LegacyTransportFramePlan
): Media {
	const durationFrames = Math.max(
		1,
		secondsToFrames(transport.durationSeconds, resolveFrameRate(transport.fps))
	);
	return {
		assets: [
			{
				id: LEGACY_SOURCE_VIDEO_ASSET_ID,
				kind: 'video',
				name: 'Source video',
				assetUrl: sourceVideo.assetUrl
			}
		],
		videoTrack: {
			clips: [
				{
					id: LEGACY_SOURCE_VIDEO_CLIP_ID,
					assetId: LEGACY_SOURCE_VIDEO_ASSET_ID,
					timelineStartFrame: 0,
					durationFrames,
					sourceStartSeconds: sourceVideo.sourceOffsetSeconds,
					audio: {
						enabled: sourceVideo.includeAudio,
						gain: sourceVideo.volume
					}
				}
			]
		}
	};
}

const LegacyTransportSchema = z.object({
	durationSeconds: z.number().min(0.1).max(600),
	fps: z.union([
		z.number().int().min(1).max(120),
		z.literal([...NTSC_FRACTIONAL_FPS])
	])
});

/**
 * Fold a Legacy Supers composition schema id onto the id writers emit
 * (ADR-0053, `accept-old / write-new`). `gfx@1` and `supers@1` name the same
 * document shape, so this is a spelling normalization and never a migration:
 * the folded document is identical apart from the id, and renders to the same
 * pixels. An unrecognized id passes through untouched so `PresetSchema` reports
 * it as the validation failure it is.
 */
function normalizeCompositionSchemaId(value: Record<string, unknown>): Record<string, unknown> {
	const declared = value['schema'];
	if (declared === PRESET_SCHEMA_ID || !isAcceptedCompositionSchemaId(declared)) {
		return value;
	}
	return { ...value, schema: PRESET_SCHEMA_ID };
}

function migrateLegacyPresetInput(input: unknown, ctx: z.RefinementCtx): unknown {
	if (!isRecord(input)) {
		return input;
	}
	const value = normalizeCompositionSchemaId(input);
	if (!isRecord(value['state'])) {
		return value;
	}

	const state = value['state'];
	const hasLegacySourceVideo = hasOwn(state, 'sourceVideo');
	if (!hasLegacySourceVideo) {
		return value;
	}
	if (hasOwn(state, 'media')) {
		ctx.addIssue({
			code: 'custom',
			path: ['state'],
			message: 'Preset state cannot contain both legacy sourceVideo and canonical media.'
		});
		return z.NEVER;
	}

	const sourceVideoResult = SourceVideoSchema.safeParse(state['sourceVideo']);
	const transportResult = LegacyTransportSchema.safeParse(state['transport']);
	if (!sourceVideoResult.success) {
		addPrefixedIssues(ctx, ['state', 'sourceVideo'], sourceVideoResult.error);
	}
	if (!transportResult.success) {
		addPrefixedIssues(ctx, ['state', 'transport'], transportResult.error);
	}
	if (!sourceVideoResult.success || !transportResult.success) {
		return z.NEVER;
	}

	const migratedState = { ...state };
	delete migratedState['sourceVideo'];
	migratedState['media'] = legacySourceVideoMedia(
		sourceVideoResult.data,
		transportResult.data
	);
	return { ...value, state: migratedState };
}

/**
 * The one structural boundary for Preset artifacts entering the engine.
 * PresetSchema remains canonical for JSON Schema generation; this boundary
 * accepts either namespace's composition schema id (ADR-0053) and temporarily
 * accepts legacy `state.sourceVideo`, normalizes both, then delegates every
 * canonical constraint and transform to PresetSchema.
 */
export const PresetIngressSchema = z
	.unknown()
	.transform(migrateLegacyPresetInput)
	.pipe(PresetSchema);

export function parsePresetIngress(value: unknown): Preset {
	return PresetIngressSchema.parse(value);
}
