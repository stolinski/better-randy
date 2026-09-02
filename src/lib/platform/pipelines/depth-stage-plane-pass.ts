import tgpu, { d } from 'typegpu';

import { STAGE_PLANE_CEILINGS } from './depth-stage-planes';

// The depth stage's scene pass (ADR-0057 phase 1): every captured plane is a
// quad on a general basis (origin, half-width vector, half-height vector,
// normal), lit by the Pack's key light with a received rake and a marched
// cast shadow from up to `maxCasters` other planes, and composited through a
// real depth test in two passes:
//
//   1. OPAQUE — texels whose presence (coverage × composition fade) reaches
//      `STAGE_PLANE_OPAQUE_PRESENCE` own their pixel: they write the depth
//      attachment and the depth01 sidecar the DOF reads, and blend
//      premultiplied over what is already there.
//   2. SKIRT — the soft remainder (antialiased contours, baked semi-transparent
//      ink) is depth-TESTED but never depth-written, blended premultiplied over
//      whatever plane is actually behind it. A transparent texel therefore
//      never occludes, and a thin sharp feature keeps its own plane's depth.
//
// The frontal planes of the shipped stage are the axis-aligned special case of
// this basis; posed Overlay planes (the next leaf) and Pipeline geometry
// (phase 2) join the same passes.

export const STAGE_DEPTH_SIDECAR_FORMAT: GPUTextureFormat = 'r16float';
export const STAGE_DEPTH_ATTACHMENT_FORMAT: GPUTextureFormat = 'depth24plus';
/** Presence at or above which a texel owns its pixel (writes depth). Sits low
 *  so px-thin geometry at partial coverage (a 2px rule ≈ 0.3) keeps its own
 *  plane's depth instead of taking the backdrop's and blurring away. */
export const STAGE_PLANE_OPAQUE_PRESENCE = 0.3;
const SKIRT_PRESENCE_FLOOR = 0.003;
const SHADOW_TAPS = 8; // caster-alpha disc taps per shadow (penumbra)
const SHADOW_PENUMBRA = 0.1; // penumbra radius (world units) per unit plane gap
export const STAGE_MAX_CASTERS = STAGE_PLANE_CEILINGS.maxCasters;

/**
 * One plane's uniforms. `origin.w` = textured (1) or solid colour (0);
 * `axisU.w` = discard-transparent (a captured Layer with a transparent
 * surround) or opaque (the backdrop); `axisV.w` = the composition-owned fade
 * that multiplies presence; `normal.w` = centre-darken strength for a textured
 * backdrop; `misc` = (depthNear, depthFar, halfW, halfH); `light` = the key's
 * unit travel vector + intensity. Caster k: origin.w = shadow strength (0 =
 * empty slot), U/V carry the UNIT axes with the half-lengths in w.
 */
export const StagePlaneUniforms = d.struct({
	mvp: d.mat4x4f,
	origin: d.vec4f,
	axisU: d.vec4f,
	axisV: d.vec4f,
	normal: d.vec4f,
	misc: d.vec4f,
	baseColor: d.vec4f,
	light: d.vec4f,
	casterOrigin: d.arrayOf(d.vec4f, STAGE_MAX_CASTERS),
	casterU: d.arrayOf(d.vec4f, STAGE_MAX_CASTERS),
	casterV: d.arrayOf(d.vec4f, STAGE_MAX_CASTERS),
	casterNormal: d.arrayOf(d.vec4f, STAGE_MAX_CASTERS)
});

export const stagePlaneLayout = tgpu.bindGroupLayout({
	planeTexture: { texture: d.texture2d(d.f32) },
	casterTexture0: { texture: d.texture2d(d.f32) },
	casterTexture1: { texture: d.texture2d(d.f32) },
	casterTexture2: { texture: d.texture2d(d.f32) },
	casterTexture3: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	plane: { uniform: StagePlaneUniforms }
});

// The unit quad on its basis: clip position, capture uv, camera-space distance
// (clip.w, the depth01 source), the fragment's world position (for the shadow
// march), and its plane-local position in world units (for the rake).
export const stagePlaneVertexFn = tgpu['~unstable'].vertexFn({
	in: { vertexIndex: d.builtin.vertexIndex },
	out: {
		position: d.builtin.position,
		uv: d.vec2f,
		dist: d.f32,
		world: d.vec3f,
		local: d.vec2f
	}
}) /* wgsl */ `{
	var pos = array<vec3f, 6>(
		vec3f(-1.0, -1.0, 0.0), vec3f(1.0, -1.0, 0.0), vec3f(1.0, 1.0, 0.0),
		vec3f(-1.0, -1.0, 0.0), vec3f(1.0, 1.0, 0.0), vec3f(-1.0, 1.0, 0.0)
	);
	var uv = array<vec2f, 6>(
		vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
		vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
	);
	let p = pos[in.vertexIndex];
	let plane = layout.$.plane;
	let clip = plane.mvp * vec4f(p, 1.0);
	let world = plane.origin.xyz + p.x * plane.axisU.xyz + p.y * plane.axisV.xyz;
	let local = p.xy * plane.misc.zw;
	return Out(clip, uv[in.vertexIndex], clip.w, world, local);
}`.$uses({ layout: stagePlaneLayout });

function shadowFromCaster(slot: number): string {
	return /* wgsl */ `
	{
		let co = plane.casterOrigin[${slot}];
		if (co.w > 0.001) {
			let cn = plane.casterNormal[${slot}].xyz;
			let denom = dot(light.xyz, cn);
			if (abs(denom) > 1e-4) {
				// March back along the light to the caster plane; s > 0 means the
				// caster lies between this fragment and the key.
				let s = dot(in.world - co.xyz, cn) / denom;
				if (s > 0.001) {
					let hit = in.world - light.xyz * s;
					let cu = plane.casterU[${slot}];
					let cv = plane.casterV[${slot}];
					let lu = dot(hit - co.xyz, cu.xyz) / max(cu.w, 1e-4);
					let lv = dot(hit - co.xyz, cv.xyz) / max(cv.w, 1e-4);
					let cuv = vec2f((lu + 1.0) * 0.5, 1.0 - (lv + 1.0) * 0.5);
					let rad = ${SHADOW_PENUMBRA} * s;
					var occ = 0.0;
					for (var i: u32 = 0u; i < ${SHADOW_TAPS}u; i = i + 1u) {
						let st = (f32(i) + 0.5) / ${SHADOW_TAPS}.0;
						let ang = f32(i) * 2.39996;
						let o = vec2f(cos(ang), sin(ang)) * sqrt(st) * rad;
						let tuv = cuv + vec2f(o.x / cu.w, -o.y / cv.w) * 0.5;
						if (all(tuv >= vec2f(0.0)) && all(tuv <= vec2f(1.0))) {
							occ = occ + textureSampleLevel(layout.$.casterTexture${slot}, layout.$.samp, tuv, 0.0).a;
						}
					}
					shade = max(shade, (occ / ${SHADOW_TAPS}.0) * co.w);
				}
			}
		}
	}`;
}

type StagePlanePassMode = 'opaque' | 'skirt';

const DISCARD_RULE: Record<StagePlanePassMode, string> = {
	// A captured plane's soft texels wait for the skirt pass; the opaque
	// backdrop never discards.
	opaque: `if (plane.axisU.w > 0.5 && presence < ${STAGE_PLANE_OPAQUE_PRESENCE}) { discard; }`,
	skirt: `if (plane.axisU.w < 0.5 || presence >= ${STAGE_PLANE_OPAQUE_PRESENCE} || presence < ${SKIRT_PRESENCE_FLOOR}) { discard; }`
};

function planeFragmentBody(mode: StagePlanePassMode): string {
	return /* wgsl */ `{
	let plane = layout.$.plane;
	var color = plane.baseColor.rgb;
	var coverage = 1.0;
	if (plane.origin.w > 0.5) {
		let s = textureSample(layout.$.planeTexture, layout.$.samp, in.uv); // premultiplied
		if (plane.axisU.w > 0.5) { coverage = min(s.a, 1.0); }
		color = s.rgb / max(s.a, 0.001); // un-premultiply: the plane's own colour
		// Backdrop-only: a soft central darken of the photo for near-plane text
		// legibility (normal.w carries the strength). Opaque, so it composites
		// cleanly and keeps the floating-text look — a scrim can't ride the
		// near plane.
		if (plane.axisU.w < 0.5) {
			let dv = (in.uv - vec2f(0.5)) * vec2f(1.0, 1.7);
			let darken = (1.0 - smoothstep(0.3, 1.15, length(dv))) * plane.normal.w;
			color = color * (1.0 - darken);
		}
	}
	// PRESENCE = coverage × composition fade (ADR-0035).
	let presence = coverage * plane.axisV.w;
	${DISCARD_RULE[mode]}
	// Scene key light (Pack light-treatment Role), in shared world space so
	// every plane inhabits ONE light:
	//  - received rake: a soft gradient across the plane, brighter toward the
	//    key's origin — expressed in the plane's own basis so a tilted plane
	//    rakes along its surface, not across the screen;
	//  - facing: a plane turned away from the key receives less of it
	//    (frontal planes get exactly 1, so the shipped look is untouched);
	//  - cast shadow: march back along the light to each caster plane,
	//    sample its alpha in a small disc (penumbra grows with the gap), darken.
	// intensity 0 skips everything — pixel-identical to the unlit stage.
	let light = plane.light;
	if (light.w > 0.001) {
		let uHat = plane.axisU.xyz / max(plane.misc.z, 1e-4);
		let vHat = plane.axisV.xyz / max(plane.misc.w, 1e-4);
		let lx = dot(light.xyz, uHat);
		let ly = dot(light.xyz, vHat);
		let towards = normalize(vec2f(-lx, -ly + 1e-4));
		let extent = max(plane.misc.z, plane.misc.w);
		let rake = dot(in.local / max(extent, 1e-4), towards);
		color = color * (1.0 + rake * light.w * 0.22);
		let facing = max(dot(plane.normal.xyz, -light.xyz), 0.0) / max(-light.z, 1e-4);
		color = color * (1.0 + (facing - 1.0) * light.w * 0.6);
		var shade = 0.0;
		${Array.from({ length: STAGE_MAX_CASTERS }, (_, slot) => shadowFromCaster(slot)).join('\n')}
		color = color * (1.0 - min(shade, 1.0));
	}
	let depth01 = clamp((in.dist - plane.misc.x) / (plane.misc.y - plane.misc.x), 0.0, 1.0);
	return Out(vec4f(color * presence, presence), vec4f(depth01, 0.0, 0.0, 1.0));
}`;
}

const planeFragmentIn = { uv: d.vec2f, dist: d.f32, world: d.vec3f, local: d.vec2f };
const planeFragmentOut = { color: d.location(0, d.vec4f), depth: d.location(1, d.vec4f) };

/** The opaque pass: presence ≥ the floor writes depth and the depth01 sidecar. */
export const stagePlaneOpaqueFragmentFn = tgpu['~unstable']
	.fragmentFn({ in: planeFragmentIn, out: planeFragmentOut })(planeFragmentBody('opaque'))
	.$uses({ layout: stagePlaneLayout });

/** The skirt pass: soft texels blend over what is behind, depth-tested, never written. */
export const stagePlaneSkirtFragmentFn = tgpu['~unstable']
	.fragmentFn({ in: planeFragmentIn, out: planeFragmentOut })(planeFragmentBody('skirt'))
	.$uses({ layout: stagePlaneLayout });

/** Premultiplied "over": the pass output is `color × presence` with presence in alpha. */
export const STAGE_PLANE_BLEND: GPUBlendState = {
	color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
	alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
};
