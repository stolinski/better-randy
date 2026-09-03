import { resolvePackRoleColor, resolveStageTypefaceRole } from '$lib/platform/packs/resolve';
import type { PackManifest } from '$lib/platform/packs/types';
import { buildStageTypeMesh } from '$lib/platform/pipelines/stage-type-geometry';
import type {
	OverlayStageBodyContribution,
	OverlayStageBodyInput,
	OverlayStageBodyRenderer
} from '$lib/platform/pipelines/types';
import type { StageMeshData } from '$lib/platform/stage-mesh-format';
import type { StageBodyMaterial } from '$lib/platform/stage-models';
import { hexToRgbaFloat } from '$lib/utils/color';
import { clampNumber } from '$lib/utils/math';

import type { DimensionalTypeContent } from './definition';

// The body dimensional type contributes (ADR-0062): the headline's mesh, cached
// by everything that shapes it; its materials from the Pack — the face and the
// bevel in the Pack's ink (the field ink when the Pack pairs one, since a
// headline stands on the field), the extrusion in the Pack's accent; and its
// settled-place entrance, lifted and leaning in, landing on its plane as the
// Overlay's progress reaches one.

/** Distinct headlines kept warm on the CPU; the stage's resident pool bounds the GPU side. */
const MESH_CACHE_LIMIT = 16;
const meshCache = new Map<string, StageMeshData>();

/** The face and bevel are the Pack's ink: a matte, near-satin surface. The extrusion is its accent, rougher. */
const FACE_ROUGHNESS = 0.32;
const BEVEL_ROUGHNESS = 0.38;
const SIDE_ROUGHNESS = 0.55;
/** The caps span y 0..1 in cap heights; the pivot sits at their middle. */
const BASELINE_OFFSET = -0.5;
/** A solid arrives rather than fades: presence reaches one well before the landing finishes, and holds until the last of the exit. */
const PRESENCE_LEAD = 2.5;

function styleRoleValue(pack: PackManifest, role: string): string | null {
	const claim = pack.roles[role];
	return claim?.kind === 'style' && typeof claim.value === 'string' && claim.value.length > 0
		? claim.value
		: null;
}

/** The headline's ink: the Pack's `dimensional-type.ink`, else its field ink, else its ink. */
export function resolveDimensionalTypeInk(pack: PackManifest): string {
	return (
		styleRoleValue(pack, 'dimensional-type.ink') ??
		resolvePackRoleColor(pack, 'field-ink-treatment', 'ink-treatment')
	);
}

function material(hex: string, roughness: number): StageBodyMaterial {
	const [r, g, b] = hexToRgbaFloat(hex);
	return { color: [r, g, b], roughness, metallic: 0 };
}

function meshFor(input: OverlayStageBodyInput<DimensionalTypeContent>, key: string): StageMeshData {
	const cached = meshCache.get(key);
	if (cached) return cached;
	const built = buildStageTypeMesh({
		typeface: input.typeface,
		text: input.content.text,
		form: { depth: input.content.depth, bevel: input.content.bevel }
	}).mesh;
	if (meshCache.size >= MESH_CACHE_LIMIT) {
		const oldest = meshCache.keys().next().value;
		if (oldest !== undefined) meshCache.delete(oldest);
	}
	meshCache.set(key, built);
	return built;
}

export const dimensionalTypeStageBody: OverlayStageBodyRenderer<DimensionalTypeContent> = {
	contribute(input): OverlayStageBodyContribution {
		const face = resolveStageTypefaceRole(input.pack);
		const key = `dimensional-type|${face}|${input.content.depth}|${input.content.bevel}|${input.content.text}`;
		const ink = resolveDimensionalTypeInk(input.pack);
		const accent = resolvePackRoleColor(input.pack, 'dimensional-type.accent', 'accent-treatment');
		const settled = clampNumber(input.progress, 0, 1);
		return {
			key,
			mesh: meshFor(input, key),
			materials: [
				material(ink, FACE_ROUGHNESS),
				material(ink, BEVEL_ROUGHNESS),
				material(accent, SIDE_ROUGHNESS),
				material(accent, SIDE_ROUGHNESS)
			],
			unitFraction: input.content.size,
			baselineOffset: BASELINE_OFFSET,
			lift: input.content.lift * (1 - settled),
			lean: input.content.lean * (1 - settled),
			presence: clampNumber(settled * PRESENCE_LEAD, 0, 1),
			pullsFocus: true
		};
	}
};
