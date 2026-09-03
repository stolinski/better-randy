import { d } from 'typegpu';

import { STAGE_PLANE_CEILINGS } from './depth-stage-planes';

// The depth stage's two shadow mechanisms, shared by the plane pass and the
// body pass so every receiver — a captured plane or a Pipeline body — reads
// one lit scene (ADR-0057 phase 1, ADR-0051 phase 2):
//
//   - the CASTER MARCH: march back along the Pack key to each upstream
//     captured plane and sample its alpha in a small disc (penumbra grows with
//     the gap) — planes throwing shadow onto planes and bodies;
//   - the SHADOW MAP: a depth map rendered from the key's direction over the
//     bodies, read with a blocker search and a contact-hardening disc filter —
//     bodies throwing shadow onto planes, other bodies, and themselves.
//
// Both are fixed golden-angle patterns, never jittered, so preview and export
// agree pixel for pixel.

/** The shadow march samples at most this many occluding planes per receiver. */
export const STAGE_MAX_CASTERS = STAGE_PLANE_CEILINGS.maxCasters;

export const STAGE_SHADOW_MAP_SIZE = 2048;
export const STAGE_SHADOW_MAP_FORMAT: GPUTextureFormat = 'depth32float';
export const STAGE_SHADOW_MAP_BYTES = STAGE_SHADOW_MAP_SIZE * STAGE_SHADOW_MAP_SIZE * 4;
/** The scene passes multisample at this rate while a body is on the stage. */
export const STAGE_SCENE_SAMPLE_COUNT = 4;

const CASTER_SHADOW_TAPS = 8;
/** Caster-march penumbra radius (world units) per unit plane gap. */
const CASTER_SHADOW_PENUMBRA = 0.1;
const SHADOW_MAP_BLOCKER_TAPS = 16;
const SHADOW_MAP_FILTER_TAPS = 24;
/** Widest blocker search and penumbra the map filter reaches, in world units. */
const SHADOW_MAP_SEARCH_WORLD = 0.16;
/** Penumbra width per world unit of caster–receiver gap (the key's softness). */
const SHADOW_MAP_PENUMBRA_SLOPE = 0.14;
/** Receiver offset along its normal, in shadow-map texels, for a receiver square to the key. */
const SHADOW_MAP_NORMAL_OFFSET_TEXELS = 1.5;
/**
 * A receiver turned away from the key spans more map depth per texel, so its
 * own stored depth reads as a blocker — the striping a thin body's sides and a
 * leaning face showed (ADR-0062). The offset and the depth bias grow with the
 * slope, capped so a grazing face never floats free of its shadow.
 */
const SHADOW_MAP_SLOPE_LIMIT = 3;

/**
 * Caster k of the march: `origin.w` = shadow strength (0 = empty slot), U/V
 * carry the UNIT axes with the half-lengths in w. Spread into a receiver's
 * uniform struct.
 */
export const STAGE_CASTER_UNIFORM_FIELDS = {
	casterOrigin: d.arrayOf(d.vec4f, STAGE_MAX_CASTERS),
	casterU: d.arrayOf(d.vec4f, STAGE_MAX_CASTERS),
	casterV: d.arrayOf(d.vec4f, STAGE_MAX_CASTERS),
	casterNormal: d.arrayOf(d.vec4f, STAGE_MAX_CASTERS)
} as const;

/** The caster planes' level-0 alpha, one texture per slot. */
export const STAGE_CASTER_LAYOUT_ENTRIES = {
	casterTexture0: { texture: d.texture2d(d.f32) },
	casterTexture1: { texture: d.texture2d(d.f32) },
	casterTexture2: { texture: d.texture2d(d.f32) },
	casterTexture3: { texture: d.texture2d(d.f32) }
} as const;

/**
 * The shadow map and its comparison sampler. A receiver's uniforms carry
 * `shadowViewProjection` (world → light clip) and `shadow` = (strength — 0
 * disables the read entirely —, world units per clip depth unit, world units
 * one map span covers, receiver bias in clip depth).
 */
export const STAGE_SHADOW_MAP_LAYOUT_ENTRIES = {
	shadowMap: { texture: d.textureDepth2d() },
	shadowSampler: { sampler: 'comparison' }
} as const;

export const STAGE_SHADOW_MAP_UNIFORM_FIELDS = {
	shadowViewProjection: d.mat4x4f,
	shadow: d.vec4f
} as const;

/**
 * WGSL: darken `shade` by caster plane `slot`'s occlusion of the fragment.
 * Expects `in.world`, a `light` vec4 (unit travel + intensity), a `var shade`,
 * the receiver's uniforms as `${uniforms}`, and the caster textures + `samp`
 * on `layout`.
 */
export function casterShadowWgsl(slot: number, uniforms: string): string {
	return /* wgsl */ `
	{
		let co = ${uniforms}.casterOrigin[${slot}];
		if (co.w > 0.001) {
			let cn = ${uniforms}.casterNormal[${slot}].xyz;
			let denom = dot(light.xyz, cn);
			if (abs(denom) > 1e-4) {
				// March back along the light to the caster plane; s > 0 means the
				// caster lies between this fragment and the key.
				let s = dot(in.world - co.xyz, cn) / denom;
				if (s > 0.001) {
					let hit = in.world - light.xyz * s;
					let cu = ${uniforms}.casterU[${slot}];
					let cv = ${uniforms}.casterV[${slot}];
					let lu = dot(hit - co.xyz, cu.xyz) / max(cu.w, 1e-4);
					let lv = dot(hit - co.xyz, cv.xyz) / max(cv.w, 1e-4);
					let cuv = vec2f((lu + 1.0) * 0.5, 1.0 - (lv + 1.0) * 0.5);
					let rad = ${CASTER_SHADOW_PENUMBRA} * s;
					var occ = 0.0;
					for (var i: u32 = 0u; i < ${CASTER_SHADOW_TAPS}u; i = i + 1u) {
						let st = (f32(i) + 0.5) / ${CASTER_SHADOW_TAPS}.0;
						let ang = f32(i) * 2.39996;
						let o = vec2f(cos(ang), sin(ang)) * sqrt(st) * rad;
						let tuv = cuv + vec2f(o.x / cu.w, -o.y / cv.w) * 0.5;
						if (all(tuv >= vec2f(0.0)) && all(tuv <= vec2f(1.0))) {
							occ = occ + textureSampleLevel(layout.$.casterTexture${slot}, layout.$.samp, tuv, 0.0).a;
						}
					}
					shade = max(shade, (occ / ${CASTER_SHADOW_TAPS}.0) * co.w);
				}
			}
		}
	}`;
}

/** Every caster slot's march, in order. */
export function allCasterShadowsWgsl(uniforms: string): string {
	return Array.from({ length: STAGE_MAX_CASTERS }, (_, slot) => casterShadowWgsl(slot, uniforms)).join(
		'\n'
	);
}

/**
 * WGSL: darken `shade` by the shadow map's occlusion of the fragment — a
 * blocker search sets the penumbra from the caster–receiver gap (contact
 * hardening), then a disc of comparison taps filters it. Expects `in.world`,
 * a unit `N`, the key `light` (unit travel in xyz), the receiver's uniforms
 * as `${uniforms}`, a `var shade`, and `shadowMap` / `shadowSampler` on
 * `layout`.
 */
export function shadowMapOcclusionWgsl(uniforms: string): string {
	return /* wgsl */ `
	if (${uniforms}.shadow.x > 0.001) {
		let texelWorld = ${uniforms}.shadow.z / ${STAGE_SHADOW_MAP_SIZE}.0;
		let facing = clamp(abs(dot(N, light.xyz)), 0.05, 1.0);
		let slope = min(sqrt(1.0 - facing * facing) / facing, ${SHADOW_MAP_SLOPE_LIMIT}.0);
		let offsetWorld = in.world + N * texelWorld * ${SHADOW_MAP_NORMAL_OFFSET_TEXELS} * (1.0 + slope);
		let sc = ${uniforms}.shadowViewProjection * vec4f(offsetWorld, 1.0);
		let suv = vec2f(sc.x * 0.5 + 0.5, 0.5 - sc.y * 0.5);
		if (all(suv >= vec2f(0.0)) && all(suv <= vec2f(1.0)) && sc.z <= 1.0) {
			let receiver = sc.z - ${uniforms}.shadow.w * (1.0 + slope);
			let searchUv = ${SHADOW_MAP_SEARCH_WORLD} / max(${uniforms}.shadow.z, 1e-4);
			// The blocker search reads stored depths directly (a depth texture
			// cannot go through the filtering sampler); the filter below compares.
			let mapSize = vec2f(textureDimensions(layout.$.shadowMap));
			var blockerSum = 0.0;
			var blockerCount = 0.0;
			for (var i: u32 = 0u; i < ${SHADOW_MAP_BLOCKER_TAPS}u; i = i + 1u) {
				let st = (f32(i) + 0.5) / ${SHADOW_MAP_BLOCKER_TAPS}.0;
				let ang = f32(i) * 2.39996;
				let o = vec2f(cos(ang), sin(ang)) * sqrt(st) * searchUv;
				let texel = vec2i(clamp((suv + o) * mapSize, vec2f(0.0), mapSize - vec2f(1.0)));
				let stored = textureLoad(layout.$.shadowMap, texel, 0);
				if (stored < receiver) {
					blockerSum = blockerSum + stored;
					blockerCount = blockerCount + 1.0;
				}
			}
			if (blockerCount > 0.5) {
				let gapWorld = max(0.0, receiver - blockerSum / blockerCount) * ${uniforms}.shadow.y;
				let penumbraWorld = clamp(
					gapWorld * ${SHADOW_MAP_PENUMBRA_SLOPE},
					texelWorld * ${SHADOW_MAP_NORMAL_OFFSET_TEXELS},
					${SHADOW_MAP_SEARCH_WORLD}
				);
				let radiusUv = penumbraWorld / max(${uniforms}.shadow.z, 1e-4);
				var lit = 0.0;
				for (var i: u32 = 0u; i < ${SHADOW_MAP_FILTER_TAPS}u; i = i + 1u) {
					let st = (f32(i) + 0.5) / ${SHADOW_MAP_FILTER_TAPS}.0;
					let ang = f32(i) * 2.39996;
					let o = vec2f(cos(ang), sin(ang)) * sqrt(st) * radiusUv;
					lit = lit + textureSampleCompareLevel(layout.$.shadowMap, layout.$.shadowSampler, suv + o, receiver);
				}
				shade = max(shade, (1.0 - lit / ${SHADOW_MAP_FILTER_TAPS}.0) * ${uniforms}.shadow.x);
			}
		}
	}`;
}
