import tgpu, { d } from 'typegpu';
import { mat4 } from 'wgpu-matrix';

import {
	STAGE_POSED_OVERLAY_LIMIT,
	type OverlayPose,
	type StageCamera
} from '$lib/platform/engine-schema';
import { INTERMEDIATE_FORMAT, type GpuHost } from '$lib/platform/gpu-host';
import type { LightDirection } from '$lib/platform/packs/resolve';
import type { StageMeshData } from '../stage-mesh-format';
import { STAGE_MESH_VERTEX_BYTES } from '../stage-mesh-format';
import type { StageBodyMaterial, StageModelDefinition, StageScreenOptics } from '../stage-models';
import { srgbChannelToLinear } from '$lib/utils/color';
import {
	BYTES_PER_OCCLUSION_TEXEL,
	STAGE_OCCLUSION_FORMAT,
	STAGE_OCCLUSION_INTENSITY,
	STAGE_OCCLUSION_RADIUS,
	StageOcclusionUniforms,
	stageOcclusionApplyFragmentFn,
	stageOcclusionApplyLayout,
	stageOcclusionBlurFragmentFn,
	stageOcclusionBlurLayout,
	stageOcclusionFragmentFn,
	stageOcclusionLayout
} from './depth-stage-ambient-occlusion';
import {
	STAGE_BACKDROP_DEPTH,
	STAGE_CAM_Z,
	STAGE_DEPTH_FAR,
	STAGE_DEPTH_NEAR,
	STAGE_FOV,
	createStageCameraRig,
	hasAuthoredStageCameraPose,
	stageBackdropCover,
	stageDepthEncoding
} from './depth-stage-camera';
import {
	StageBodyUniforms,
	stageBodyFragmentFn,
	stageBodyLayout,
	stageBodyVertexFn,
	stageBodyVertexLayout,
	stageResolveFragmentFn,
	stageResolveLayout,
	stageShadowDepthLayout,
	stageShadowDepthVertexFn,
	STAGE_BODY_PRESENCE_FLOOR
} from './depth-stage-body-pass';
import {
	assertStageBodyCeilings,
	createStageShadowProjection,
	resolveStageBodyFocusPull,
	resolveStageFloorBasis,
	resolveStageScreenBodyPlacement,
	stageBodyBoundingSphere,
	STAGE_BODY_CEILINGS,
	STAGE_BODY_MAX_REGIONS,
	type StageScreenGlass,
	type StageShadowProjection
} from './depth-stage-geometry';
import {
	STAGE_DEPTH_ATTACHMENT_FORMAT,
	STAGE_DEPTH_SIDECAR_FORMAT,
	STAGE_GLASS_VERTEX_COUNT,
	STAGE_PLANE_BLEND,
	StagePlaneUniforms,
	stageGlassVertexFn,
	stagePlaneLayout,
	stagePlaneOpaqueFragmentFn,
	stagePlaneSkirtFragmentFn,
	stagePlaneVertexFn
} from './depth-stage-plane-pass';
import {
	assertStagePlaneCeilings,
	createBackdropStagePlaneBasis,
	createFrontalStagePlaneBasis,
	createPosedOverlayPlaneBasis,
	selectStagePlaneCasters,
	sortStagePlanesBackToFront,
	stageOverlayPlaneDepth,
	stagePlaneHalfLengths,
	stagePlaneModelMatrix,
	stagePlaneTextureBytes,
	type StagePlaneBasis,
	type StagePlanePivot,
	type StagePlaneRole
} from './depth-stage-planes';
import {
	STAGE_MAX_CASTERS,
	STAGE_SCENE_SAMPLE_COUNT,
	STAGE_SHADOW_MAP_BYTES,
	STAGE_SHADOW_MAP_FORMAT,
	STAGE_SHADOW_MAP_SIZE
} from './depth-stage-shadow';

// Dimensional depth stage (ADR-0028, posed and depth-tested by ADR-0057,
// carrying Pipeline bodies by ADR-0051). The validated WebGPU 3D
// depth-of-field POC (src/routes/poc/dof3d) as a reusable engine renderer: the
// captured Surface composite rides a plane near the camera over an opaque
// backdrop plane at depth, an optional captured Overlay plane sits between
// them at its ADR-0021 z, a posed perspective camera makes them reproject at
// different rates (real parallax), and a mip-prefiltered gather DOF defocuses
// by per-pixel depth.
//
// Scene assembly is a two-pass depth-tested compositor over general plane
// bases (see depth-stage-plane-pass.ts): opaque texels write depth and blend
// premultiplied, soft skirts blend over what is really behind them. Per-pixel
// depth lives in an rg16float SIDECAR target the DOF reads (with an occludable
// mark in its second channel); the scene colour target carries colour only. Under an authored camera pose the receding planes
// sample mip chains through an anisotropic sampler; the frontal camera keeps
// the single-level sources, so the shipped Presets render as before.
//
// A BODY (depth-stage-body-pass.ts) joins the same scene. The first body is a
// SCREEN (ADR-0059): a registered model whose glass is the Surface plane, so
// the composition renders on the tube — domed, with the tube's own raster,
// mask, halation, and vignette — and the housing stands around it on a floor
// the model declares, lit by the key and by its own picture. While a body is
// present the scene passes render multisampled and resolve back into the
// single-sample targets (colour averaged, depth nearest), the bodies are
// rendered from the key's direction into a shadow map every receiver reads,
// the body pass draws them depth-tested between the opaque planes and the
// skirts, and an ambient-obscurance pass over the resolved sidecar grounds
// them in their creases and at contact (depth-stage-ambient-occlusion.ts).
// With no body on the stage none of that machinery allocates or runs, and
// every shipped Preset renders pixel-identical.
//
// The grain fix that made the POC ship: the DOF gather never samples the sharp
// scene buffer — it reads a prefiltered mip whose footprint spans the gap between
// sparse taps, so a handful of taps reconstruct a smooth disc instead of aliasing.

const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const SCENE_TEXTURE_USAGE = TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_RENDER_ATTACHMENT;
const BUFFER_USAGE_COPY_DST = 0x08;
const BUFFER_USAGE_INDEX = 0x10;
const BUFFER_USAGE_VERTEX = 0x20;

const BOKEH_TAPS = 96;
const MAX_LOD = 14; // textureSampleLevel clamps to the texture's real top mip
const REF_COC = 42; // max circle-of-confusion (px) per 1080px of frame short side
const SHADOW_STRENGTH = 0.75; // max shadow darkening per unit light intensity
const BYTES_PER_RGBA16F_TEXEL = 8;
const BYTES_PER_RG16F_TEXEL = 4;
const BYTES_PER_DEPTH24_TEXEL = 4;
/** Receiver bias for the body shadow map, in world units along the light. */
const SHADOW_MAP_BIAS_WORLD = 0.012;
/** How far past the bodies the shadow map's depth range reaches, so the
 *  backdrop behind a body still receives its shadow. */
const SHADOW_RECEIVER_REACH = STAGE_BACKDROP_DEPTH + 1.5;
/** Resident meshes a stage keeps warm across frames before evicting the oldest. */
const RESIDENT_MESH_LIMIT = 8;
/** Mip levels below the top that read as the glass's average colour: the top
 *  level is one texel, the level below it four — enough to average without
 *  the single texel's rounding. */
const SCREEN_AVERAGE_LOD_BELOW_TOP = 1;
/** The floor a model stands on, lifted off the Pack field so the shadow and
 *  the picture's glow have a surface to read on: a set element, not the field. */
const FLOOR_LIFT = { gain: 1.4, add: 0.04 } as const;
const MASK_MODE: Record<StageScreenOptics['mask'], number> = { slot: 0, shadow: 1, grille: 2 };

// The Pack's named key directions realized as scene geometry: unit vectors the
// light TRAVELS along (mostly frontal, into the scene — an oblique key throws
// the card's shadow far outside the frame at the backdrop depth).
const LIGHT_VECTORS: Record<LightDirection, [number, number, number]> = {
	'upper-left': [0.14, -0.16, -0.977],
	'upper-right': [-0.14, -0.16, -0.977],
	top: [0, -0.2, -0.98],
	left: [0.2, -0.05, -0.978],
	right: [-0.2, -0.05, -0.978]
};

// params = (focus depth01, aperture, maxCoc px, band). resolution = scene px.
// depths = (nearest plane depth01, _, _, _): the frontmost plane this frame —
// the compose pass uses it to keep sharp nearest-plane pixels on the sharp
// branch (nothing can bleed over the frontmost plane).
const DofUniforms = d.struct({ params: d.vec4f, resolution: d.vec2f, depths: d.vec4f });

const fullVertexFn = tgpu['~unstable'].vertexFn({
	in: { vertexIndex: d.builtin.vertexIndex },
	out: { position: d.builtin.position, uv: d.vec2f }
}) /* wgsl */ `{
	var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
	var u = array<vec2f, 3>(vec2f(0.0, 1.0), vec2f(2.0, 1.0), vec2f(0.0, -1.0));
	return Out(vec4f(p[in.vertexIndex], 0.0, 1.0), u[in.vertexIndex]);
}`;

// Level-0 copy of a plane source into a stage-owned mip chain (the source
// textures are single-level captures; only the stage needs the pyramid).
const blitLayout = tgpu.bindGroupLayout({
	src: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' }
});
const blitFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: d.vec4f
}) /* wgsl */ `{
	return textureSampleLevel(layout.$.src, layout.$.samp, in.uv, 0.0);
}`.$uses({ layout: blitLayout });

// Mip-downsample, building the prefiltered pyramid the DOF gather reads from.
// The FIRST reduction (mip 0 → 1) is CoC-WEIGHTED: each texel enters the
// pyramid premultiplied by how defocused it is (weight in alpha), so sharp
// in-focus content never contaminates the blur mips — the fix for the halo an
// in-focus subject otherwise wears against a defocused backdrop (mip texels
// near the silhouette used to average subject light into the backdrop's blur).
// Deeper levels box-filter the premultiplied data; the gather un-premultiplies.
// Depth comes from the sidecar target, never from the colour texture.
const downLayout = tgpu.bindGroupLayout({
	src: { texture: d.texture2d(d.f32) },
	depth: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	uniforms: { uniform: DofUniforms }
});
const downWeightFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: d.vec4f
}) /* wgsl */ `{
	let focus = layout.$.uniforms.params.x;
	let aperture = layout.$.uniforms.params.y;
	let maxCoc = layout.$.uniforms.params.z;
	let band = layout.$.uniforms.params.w;
	// Four POINT samples of the source texels — the weight must be computed
	// per texel, never on linearly-mixed depth: across a plane contour the
	// interpolated depth sweeps through the focal depth, and a weight taken
	// there reads "in focus" and punches excluded holes into the blur pyramid
	// along every defocused silhouette (dark contour stipple, worst when the
	// rack focus sits between the planes).
	let texel = vec2f(1.0) / layout.$.uniforms.resolution;
	var accRgb = vec3f(0.0);
	var accW = 0.0;
	for (var k: u32 = 0u; k < 4u; k = k + 1u) {
		let o = vec2f(f32(k % 2u) - 0.5, f32(k / 2u) - 0.5) * texel;
		let s = textureSampleLevel(layout.$.src, layout.$.samp, in.uv + o, 0.0);
		let sd = textureSampleLevel(layout.$.depth, layout.$.samp, in.uv + o, 0.0).x;
		let coc = aperture * max(0.0, abs(sd - focus) - band) * maxCoc;
		// Exclude only genuinely IN-FOCUS content; anything visibly defocused
		// gets full weight (a graded ramp biases boundary texels). Thin
		// small-CoC geometry the mips can't carry is covered by the compose
		// pass's wide sharp-injection band instead. The floor keeps the
		// un-premultiply stable in fully-sharp regions.
		let w = clamp(smoothstep(0.5, 3.0, coc), 0.02, 1.0);
		accRgb = accRgb + s.rgb * w;
		accW = accW + w;
	}
	return vec4f(accRgb * 0.25, accW * 0.25);
}`.$uses({ layout: downLayout });
const downsampleFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: d.vec4f
}) /* wgsl */ `{
	return textureSampleLevel(layout.$.src, layout.$.samp, in.uv, 0.0);
}`.$uses({ layout: downLayout });

// DOF gather: read colour from a prefiltered mip whose footprint spans the gap
// between our sparse golden-angle taps (the grain fix); depth always from the
// sidecar at LOD 0. scatter-as-gather weighting (a tap lights the centre only
// if the centre is within the tap's own CoC) keeps sharp foreground from
// bleeding.
//
// Runs at HALF resolution (the 4K perf gate): the gather's output is only ever
// used where the image is defocused, which tolerates a bilinear upsample. The
// sparse taps sample the FULL-res scene pyramid (UV space is resolution-
// independent), so the blur itself loses nothing. Alpha carries the blend mask
// the full-res composite needs: how blurred this pixel is, from its own CoC
// *or* from a blurred neighbour bleeding over it (max tap reach) — without the
// reach term, an in-focus plane would cut a hard edge against a defocused
// foreground, the cheap-DOF tell.
const dofLayout = tgpu.bindGroupLayout({
	scene: { texture: d.texture2d(d.f32) },
	depth: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	uniforms: { uniform: DofUniforms }
});
const dofFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: d.vec4f
}) /* wgsl */ `{
	let focus = layout.$.uniforms.params.x;
	let aperture = layout.$.uniforms.params.y;
	let maxCoc = layout.$.uniforms.params.z;
	let texel = vec2f(1.0) / layout.$.uniforms.resolution;
	let centerDepth = textureSampleLevel(layout.$.depth, layout.$.samp, in.uv, 0.0).x;
	let band = layout.$.uniforms.params.w;
	// Focus band: depths within the band of focus stay sharp (CoC 0), so a plane
	// with real foreshortening depth-spread (fronto-parallel text) is crisp
	// edge-to-edge while content outside the band still defocuses. Without it,
	// off-centre near-plane pixels drift out of focus and bright text blooms.
	//
	// The centre CoC is a small NEIGHBOURHOOD AVERAGE of per-sample CoCs: at a
	// plane contour the per-pixel depth flips between the two planes' blur
	// families (different disc radius + mip level per pixel — interleaved
	// bright/dark granules); the average gives both sides one smooth shared
	// value. CoC is averaged — never depth, whose average could cross the
	// focal plane and read "in focus". Thin small-CoC geometry the averaged
	// radius over-blurs is carried by the compose pass's wide sharp-injection
	// band (see composeFragmentFn).
	let cocOwn = aperture * max(0.0, abs(centerDepth - focus) - band) * maxCoc;
	var cocC = cocOwn;
	{
		let e = texel * 2.0;
		let dxp = textureSampleLevel(layout.$.depth, layout.$.samp, in.uv + vec2f(e.x, 0.0), 0.0).x;
		let dxn = textureSampleLevel(layout.$.depth, layout.$.samp, in.uv - vec2f(e.x, 0.0), 0.0).x;
		let dyp = textureSampleLevel(layout.$.depth, layout.$.samp, in.uv + vec2f(0.0, e.y), 0.0).x;
		let dyn = textureSampleLevel(layout.$.depth, layout.$.samp, in.uv - vec2f(0.0, e.y), 0.0).x;
		var avg = cocOwn;
		avg = avg + aperture * max(0.0, abs(dxp - focus) - band) * maxCoc;
		avg = avg + aperture * max(0.0, abs(dxn - focus) - band) * maxCoc;
		avg = avg + aperture * max(0.0, abs(dyp - focus) - band) * maxCoc;
		avg = avg + aperture * max(0.0, abs(dyn - focus) - band) * maxCoc;
		cocC = avg * 0.2;
	}
	// LOD for colour taps — CONTINUOUS, always >= 1: levels >= 1 hold the
	// CoC-WEIGHTED pyramid (premultiplied by defocus weight; see the downsample
	// passes — level 0 is the plain scene colour). The gather NEVER needs
	// level 0 colour: wherever the image is sharp, the full-res compose pass
	// re-injects the sharp scene over this result, so gating the mip path with
	// a binary step just plants a visible seam in the small-CoC band. The -1.3
	// bias (was -2.3 at full res) accounts for the HALF-res gather's doubled
	// output-pixel spacing.
	let lod = clamp(max(log2(max(cocC, 1.0)) - 1.3, 1.0), 1.0, ${MAX_LOD}.0);
	// The centre's COLOUR comes from the same prefiltered mip as the taps — a
	// defocused pixel seeded with its SHARP LOD-0 sample keeps a pixel-scale
	// residue of the original contour. Depth still reads LOD 0.
	let centerMip = textureSampleLevel(layout.$.scene, layout.$.samp, in.uv, lod);
	var acc = centerMip.rgb / max(centerMip.a, 0.02);
	var wsum = 1.0;
	var reachMax = cocC;
	// FIXED golden-angle spiral, deliberately un-jittered: the mip prefilter
	// spans the inter-tap gaps, and with the source smooth (coverage-composited
	// planes, no binary discard fringe) the fixed spiral reconstructs a clean
	// disc — a per-pixel jitter only converts residual estimator variance into
	// visible dither on thin defocused strokes.
	for (var i: u32 = 0u; i < ${BOKEH_TAPS}u; i = i + 1u) {
		let st = (f32(i) + 0.5) / ${BOKEH_TAPS}.0;
		let ang = f32(i) * 2.39996;
		let offsetPx = vec2f(cos(ang), sin(ang)) * sqrt(st) * cocC;
		let dist = length(offsetPx);
		let tapUV = in.uv + offsetPx * texel;
		let tapDepth = textureSampleLevel(layout.$.depth, layout.$.samp, tapUV, 0.0).x;
		let tapCoc = aperture * max(0.0, abs(tapDepth - focus) - band) * maxCoc;
		// DEPTH-ORDERED weighting (the halo fix). Two physical ways a tap's
		// light reaches the centre:
		//  - scatter: the TAP's own blur disc covers the centre (a defocused
		//    element bleeding outward) — any depth;
		//  - gather: a defocused CENTRE averages its depth-neighbourhood — but
		//    it must not collect light from IN-FOCUS NEARER content (a sharp
		//    subject occludes crisply; its light never spreads onto the
		//    backdrop — the halo). The refusal is scaled by how sharp the tap
		//    is: between two mutually-DEFOCUSED planes there is no refusal, or
		//    the per-tap depth classification (binary at contours) speckles the
		//    blur with weight jitter (contour stipple).
		let nearer = step(tapDepth + 0.02, centerDepth);
		let tapSharp = 1.0 - smoothstep(1.0, 4.0, tapCoc);
		let wScatter = 1.0 - smoothstep(tapCoc - 2.0, tapCoc + 2.0, dist);
		let wGather = (1.0 - smoothstep(cocC - 2.0, cocC + 2.0, dist)) * (1.0 - nearer * tapSharp);
		let w = max(wScatter, wGather);
		let tapSample = textureSampleLevel(layout.$.scene, layout.$.samp, tapUV, lod);
		// Weighted-pyramid un-premultiply (taps always read levels >= 1).
		let tapColor = tapSample.rgb / max(tapSample.a, 0.02);
		acc = acc + tapColor * w;
		wsum = wsum + w;
		// The compose blend mask counts only NEARER defocused taps — a blurred
		// foreground bleeding over this pixel. Far blurred content behind a
		// sharp centre never forces the blur branch (backgrounds don't bleed
		// over an in-focus subject).
		reachMax = max(reachMax, tapCoc * step(dist, tapCoc + 2.0) * nearer);
	}
	let blendNeed = smoothstep(0.5, 2.0, reachMax);
	return vec4f(acc / wsum, blendNeed);
}`.$uses({ layout: dofLayout });

// Full-res DOF composite: in-focus pixels read the sharp full-res scene
// directly (text stays native-crisp — the reason the scene pass is NOT
// half-res); defocused pixels read the upsampled half-res gather, blended by
// the gather's own mask. The film grade + lens vignette land here, after the
// blend, so sharp and defocused regions wear ONE grade.
const composeLayout = tgpu.bindGroupLayout({
	scene: { texture: d.texture2d(d.f32) },
	depth: { texture: d.texture2d(d.f32) },
	dofHalf: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	uniforms: { uniform: DofUniforms }
});
const composeFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: d.vec4f
}) /* wgsl */ `{
	let focus = layout.$.uniforms.params.x;
	let aperture = layout.$.uniforms.params.y;
	let maxCoc = layout.$.uniforms.params.z;
	let band = layout.$.uniforms.params.w;
	let center = textureSampleLevel(layout.$.scene, layout.$.samp, in.uv, 0.0);
	let centerDepth = textureSampleLevel(layout.$.depth, layout.$.samp, in.uv, 0.0).x;
	var col = center.rgb;
	if (aperture > 0.001) {
		let dof = textureSampleLevel(layout.$.dofHalf, layout.$.samp, in.uv, 0.0);
		let cocC = aperture * max(0.0, abs(centerDepth - focus) - band) * maxCoc;
		// Blur-branch commit ramps to CoC 6 — the scale at which the half-res
		// gather is genuinely competent for ALL geometry. Committing earlier
		// (at ~2) cliffs px-thin features: the gather under-carries a 2px line
		// at small CoC and the sharp branch has already left, so the feature
		// blinks out mid-rack and pops back when focus lands. The cost is a
		// mildly under-blurred 2–6px CoC band (focus reads as landing a touch
		// early), which is continuous and invisible against the defocused bed.
		let commit = smoothstep(1.0, 6.0, cocC);
		// A SHARP pixel on the NEAREST plane always keeps the sharp branch:
		// nothing exists in front of the frontmost plane, so no defocused
		// foreground can legitimately bleed over it. Without this, the
		// half-res bleed mask (which cannot resolve px-thin sharp features)
		// forces the blur branch and erases them.
		let onNearest = step(centerDepth, layout.$.uniforms.depths.x + 0.03);
		let blend = max(commit, dof.a * (1.0 - (1.0 - commit) * onNearest));
		col = mix(col, dof.rgb, blend);
	}
	col = col * vec3f(1.03, 1.0, 0.955); // gentle warm film grade
	let frameRad = length(in.uv - vec2f(0.5));
	col = col * (1.0 - frameRad * frameRad * 0.30); // subtle lens vignette
	return vec4f(col, 1.0);
}`.$uses({ layout: composeLayout });

// wgpu-matrix returns Float32Array(16); TypeGPU's mat4x4f takes 16 explicit args.
function toMat4(m: Float32Array) {
	// prettier-ignore
	return d.mat4x4f(
		m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7],
		m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15]
	);
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

function mipLevelCountFor(width: number, height: number): number {
	return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

export interface DepthStageOptions {
	host: GpuHost;
	width: number;
	height: number;
}

/** One Overlay riding its own posed plane (ADR-0057). */
export interface DepthStagePosedOverlayPlane {
	overlayId: string;
	/** The Overlay's premultiplied capture (its own frame-sized root). */
	planeView: GPUTextureView;
	/** Signed ADR-0021 depth: 0 the Surface plane, 1 the backdrop, negative toward the camera. */
	z: number;
	pose?: OverlayPose;
	/** The Overlay's rendered centre in composition fractions — the plane turns about it. */
	pivot: StagePlanePivot;
}

/**
 * The composition's physical screen (ADR-0059): a registered model whose
 * glass is the Surface plane. The stage scales it so its opening fits the
 * frame plane, crops the composition to that opening, draws the glass with
 * the tube's own optics, lays the floor the model declares, and lights the
 * housing with the key and with the glass itself.
 */
export interface DepthStageScreen {
	model: StageModelDefinition;
	/** The model's decoded mesh, keyed by the model slug in the resident pool. */
	mesh: StageMeshData;
}

/**
 * A body a Pipeline contributes this frame (ADR-0051, ADR-0062): its mesh in
 * its own units, the matrix that places it in stage world, its materials by
 * region, and its presence. `key` names the mesh in the resident pool, so it
 * must change whenever the mesh does and hold still while it does not.
 */
export interface DepthStageBody {
	key: string;
	mesh: StageMeshData;
	/** Column-major, body units → stage world. */
	model: Float32Array;
	materials: readonly StageBodyMaterial[];
	/** 0..1 — the Overlay's visibility; below the floor the body is not drawn. */
	presence: number;
	/** Whether the lens racks to this body while it is present (ADR-0059 §8). */
	pullsFocus: boolean;
}

export interface DepthStageInput {
	/** The Surface pipeline's premultiplied composition output (surface-only while
	 *  the Composition plane-split is on). Placed on the near plane. */
	surfacePlaneView: GPUTextureView;
	/** In-focus depth (ADR-0021 scalar): 0 ⇒ the aimed Surface point sharp, 1 ⇒ backdrop. */
	focusZ: number;
	/** Max circle-of-confusion / blur strength, 0..1. */
	aperture: number;
	/** Hyperfocal half-width in depth01: content within this depth distance of the
	 *  focal plane stays fully sharp, so a foreshortened plane (e.g. text) is crisp
	 *  edge-to-edge while the backdrop still defocuses into bokeh. 0 = pinpoint. */
	focusBand?: number;
	/** Optional Overlay plane (overlay-at-depth): the premultiplied Overlay-layer
	 *  capture placed on its own perspective plane at `overlayZ`, so overlays
	 *  parallax + defocus with the camera instead of compositing flat on top. */
	overlayPlaneView?: GPUTextureView;
	/** Overlay plane depth (ADR-0021 scalar): 0 ⇒ the Surface plane's distance,
	 *  1 ⇒ the backdrop's. Defaults to 0.7, the Overlay Layer default. */
	overlayZ?: number;
	/** Overlays riding their own posed plane (ADR-0057): each capture placed at
	 *  its signed z and turned by its pose about its rendered centre. The shared
	 *  `overlayPlaneView` carries the rest. */
	posedOverlayPlanes?: readonly DepthStagePosedOverlayPlane[];
	/** The physical screen the Surface plane is the glass of (ADR-0059). */
	screen?: DepthStageScreen;
	/** The bodies the composition's Pipelines contribute this frame (ADR-0062), after the screen. */
	bodies?: readonly DepthStageBody[];
	/** Backdrop plane colour (rgb 0..1) — used when no backdrop image is given. */
	backdropColor: [number, number, number];
	/** Optional image substrate (dex p20) for the backdrop plane: a resident GPU
	 *  texture sampled instead of `backdropColor` (the plane's `textured` branch),
	 *  so a real photo sits on the far plane and reprojects under the camera push
	 *  for parallax. Opaque — not transparency-discarded like the Surface plane. */
	backdropTextureView?: GPUTextureView;
	/** Center darkening of the backdrop image (0..1) for near-plane text contrast
	 *  — a soft opaque pool behind the (centered) Surface text. 0 = none. */
	backdropContrast?: number;
	/** The authored stage camera: the legacy push/drift move plus the optional
	 *  rest pose and travel (ADR-0057). Resolved per frame through
	 *  `createStageCameraRig` — the same math the GUI hit-test projector uses. */
	camera: StageCamera;
	/** Scene key light — the Pack's `light-treatment` Role (appearance) realized
	 *  as a real light: received rake on every plane + cast plane-to-plane
	 *  shadow. Absent ⇒ unlit, pixel-identical to the pre-light stage. */
	light?: { direction: LightDirection; intensity: number } | null;
	/** Composition-owned surface opacity (ADR-0035) for surfaces whose fade
	 *  carrier (an environment shaderPass) is skipped on the stage. The plane
	 *  blends toward what is behind it as it fades; its cast shadow fades with
	 *  it. 1 = no fade. */
	surfaceFadeAlpha?: number;
	/** Clip progress 0..1 — drives the camera move + focus. Frame-deterministic. */
	time: number;
}

/** A screen's glass as the plane pass draws it: domed, with the tube optics. */
interface StagePlaneGlass {
	/** Dome height at the centre, world units. */
	dome: number;
	/** The glass's size in capture pixels (the crop window's extent). */
	pixels: [number, number];
	optics: StageScreenOptics;
}

/** One plane as the scene passes see it this frame. */
interface StagePlaneDraw {
	role: StagePlaneRole;
	basis: StagePlaneBasis;
	/** What the plane's own fragments sample (a mip copy under a pose, else the source). */
	planeView: GPUTextureView;
	/** The level-0 alpha other planes march through when this plane casts. */
	casterView: GPUTextureView;
	textured: boolean;
	discardTransparent: boolean;
	fade: number;
	darken: number;
	castStrength: number;
	/** The capture rect the quad shows (the whole capture for every plane but a glass). */
	uvWindow: [number, number, number, number];
	glass: StagePlaneGlass | null;
	/** An untextured plane's colour; absent = the backdrop colour. */
	baseColor?: [number, number, number];
	/** Which uniform buffer of the fixed pool this plane writes. */
	bufferIndex: number;
}

interface StageMipCopy {
	texture: GPUTexture;
	views: GPUTextureView[];
}

/** The multisampled scene set allocated the first time a body is on the
 *  stage, with the resolved colour and the obscurance pair the grounding
 *  pass works through. */
interface StageMultisampleTargets {
	color: GPUTexture;
	colorView: GPUTextureView;
	sidecar: GPUTexture;
	sidecarView: GPUTextureView;
	depth: GPUTexture;
	depthView: GPUTextureView;
	resolved: GPUTexture;
	resolvedView: GPUTextureView;
	obscurance: [GPUTexture, GPUTexture];
	obscuranceViews: [GPUTextureView, GPUTextureView];
	bytes: number;
}

interface StageShadowMap {
	texture: GPUTexture;
	view: GPUTextureView;
}

/** A body mesh kept on the GPU across frames, keyed by its model. */
interface StageResidentMesh {
	vertexBuffer: GPUBuffer;
	indexBuffer: GPUBuffer;
	vertexCount: number;
	indexCount: number;
	bytes: number;
	lastUsedFrame: number;
}

/** A body placed this frame with its resident mesh. */
interface StageBodyDraw {
	mesh: StageResidentMesh;
	model: Float32Array;
	materials: readonly StageBodyMaterial[];
	center: [number, number, number];
	radius: number;
	presence: number;
	/** Whether the lens racks to this body (a screen's glass is the aimed plane already). */
	pullsFocus: boolean;
	bufferIndex: number;
}

/** The glass as an area light, written to every receiver this frame. */
interface StageScreenLightUniforms {
	screenOrigin: ReturnType<typeof d.vec4f>;
	screenU: ReturnType<typeof d.vec4f>;
	screenV: ReturnType<typeof d.vec4f>;
	screenNormal: ReturnType<typeof d.vec4f>;
}

export class DepthStage {
	#width: number;
	#height: number;
	#sceneTexture: GPUTexture;
	#depthSidecarTexture: GPUTexture;
	#depthAttachmentTexture: GPUTexture;
	#dofHalfTexture: GPUTexture;
	#outputTexture: GPUTexture;
	#idleShadowMap: GPUTexture;
	#mipCopies = new Map<StagePlaneRole, StageMipCopy>();
	#multisample: StageMultisampleTargets | null = null;
	#shadowMap: StageShadowMap | null = null;
	#meshes = new Map<string, StageResidentMesh>();
	#render: (input: DepthStageInput) => void;

	constructor({ host, width, height }: DepthStageOptions) {
		this.#width = width;
		this.#height = height;
		const { device, root } = host;
		const unstable = root['~unstable'];

		const mipLevels = mipLevelCountFor(width, height);
		const maxCoc = Math.round((REF_COC * Math.min(width, height)) / 1080);

		this.#sceneTexture = device.createTexture({
			size: [width, height, 1],
			format: INTERMEDIATE_FORMAT,
			mipLevelCount: mipLevels,
			usage: SCENE_TEXTURE_USAGE
		});
		// Per-pixel camera-space depth01 the DOF reads — written only by texels
		// that own their pixel (the opaque pass), so a soft skirt never lends its
		// depth to the plane behind it.
		this.#depthSidecarTexture = device.createTexture({
			size: [width, height, 1],
			format: STAGE_DEPTH_SIDECAR_FORMAT,
			usage: SCENE_TEXTURE_USAGE
		});
		this.#depthAttachmentTexture = device.createTexture({
			size: [width, height, 1],
			format: STAGE_DEPTH_ATTACHMENT_FORMAT,
			usage: TEXTURE_USAGE_RENDER_ATTACHMENT
		});
		// The half-res gather target (4K perf): the 96-tap DOF runs over a quarter
		// of the pixels; the full-res compose pass re-injects native sharpness
		// where the image is in focus.
		this.#dofHalfTexture = device.createTexture({
			size: [Math.max(1, Math.floor(width / 2)), Math.max(1, Math.floor(height / 2)), 1],
			format: INTERMEDIATE_FORMAT,
			usage: SCENE_TEXTURE_USAGE
		});
		this.#outputTexture = device.createTexture({
			size: [width, height, 1],
			format: INTERMEDIATE_FORMAT,
			usage: SCENE_TEXTURE_USAGE
		});
		// Bound as the shadow map whenever no body is on the stage; the shaders
		// never read it then (shadow strength 0), so it stays one texel.
		this.#idleShadowMap = device.createTexture({
			size: [1, 1, 1],
			format: STAGE_SHADOW_MAP_FORMAT,
			usage: SCENE_TEXTURE_USAGE
		});
		const idleShadowView = this.#idleShadowMap.createView();
		const sceneView = this.#sceneTexture.createView();
		const depthSidecarView = this.#depthSidecarTexture.createView();
		const depthAttachmentView = this.#depthAttachmentTexture.createView();
		const dofHalfView = this.#dofHalfTexture.createView();
		const mipViews: GPUTextureView[] = [];
		for (let i = 0; i < mipLevels; i += 1) {
			mipViews.push(
				this.#sceneTexture.createView({ baseMipLevel: i, mipLevelCount: 1, dimension: '2d' })
			);
		}
		const outputView = this.#outputTexture.createView();

		const sampler = unstable.createSampler({
			magFilter: 'linear',
			minFilter: 'linear',
			mipmapFilter: 'linear',
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge'
		});
		// Oblique-safe plane sampling under a pose: mips keep a receding page
		// from shimmering, anisotropy keeps its glyphs from smearing along the
		// foreshortened axis.
		const anisotropicSampler = device.createSampler({
			magFilter: 'linear',
			minFilter: 'linear',
			mipmapFilter: 'linear',
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge',
			maxAnisotropy: 16
		});
		// The shadow map's comparison sampler: a bilinear compare per tap.
		const shadowSampler = device.createSampler({
			compare: 'less-equal',
			magFilter: 'linear',
			minFilter: 'linear',
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge'
		});

		const casterRest = () => ({
			casterOrigin: Array.from({ length: STAGE_MAX_CASTERS }, () => d.vec4f(0, 0, 0, 0)),
			casterU: Array.from({ length: STAGE_MAX_CASTERS }, () => d.vec4f(1, 0, 0, 1)),
			casterV: Array.from({ length: STAGE_MAX_CASTERS }, () => d.vec4f(0, 1, 0, 1)),
			casterNormal: Array.from({ length: STAGE_MAX_CASTERS }, () => d.vec4f(0, 0, 1, 0))
		});
		const screenLightRest = (): StageScreenLightUniforms => ({
			screenOrigin: d.vec4f(0, 0, 0, 0),
			screenU: d.vec4f(1, 0, 0, 1),
			screenV: d.vec4f(0, 1, 0, 1),
			screenNormal: d.vec4f(0, 0, 1, 0)
		});
		const planeRest = () => ({
			mvp: d.mat4x4f(),
			viewProjection: d.mat4x4f(),
			origin: d.vec4f(0, 0, 0, 0),
			axisU: d.vec4f(1, 0, 0, 0),
			axisV: d.vec4f(0, 1, 0, 1),
			normal: d.vec4f(0, 0, 1, 0),
			misc: d.vec4f(STAGE_DEPTH_NEAR, STAGE_DEPTH_FAR, 1, 1),
			baseColor: d.vec4f(0.16, 0.14, 0.13, 1),
			light: d.vec4f(0, 0, -1, 0),
			uvWindow: d.vec4f(0, 0, 1, 1),
			glass: d.vec4f(0, 0, 1, 1),
			optics: d.vec4f(0, 0, 0, 0),
			optics2: d.vec4f(0, 0, 0, 0),
			camera: d.vec4f(0, 0, STAGE_CAM_Z, 0),
			...screenLightRest(),
			shadowViewProjection: d.mat4x4f(),
			shadow: d.vec4f(0, 1, 1, 0),
			...casterRest()
		});
		const bodyRest = () => ({
			mvp: d.mat4x4f(),
			model: d.mat4x4f(),
			normalMatrix: d.mat4x4f(),
			shadowMvp: d.mat4x4f(),
			materialColor: Array.from({ length: STAGE_BODY_MAX_REGIONS }, () =>
				d.vec4f(0.5, 0.5, 0.5, 0.6)
			),
			materialParams: Array.from({ length: STAGE_BODY_MAX_REGIONS }, () => d.vec4f(0, 0, 0, 0)),
			environment: d.vec4f(0.02, 0.02, 0.02, 0),
			light: d.vec4f(0, 0, -1, 0),
			camera: d.vec4f(0, 0, STAGE_CAM_Z, 0),
			misc: d.vec4f(STAGE_DEPTH_NEAR, STAGE_DEPTH_FAR, 0, 0),
			...screenLightRest(),
			shadowViewProjection: d.mat4x4f(),
			shadow: d.vec4f(0, 1, 1, 0),
			...casterRest()
		});
		// A fixed pool: backdrop, Surface, the shared Overlay plane, a screen's
		// floor, then one per posed Overlay up to the limit.
		const FLOOR_BUFFER_INDEX = 3;
		const POSED_BUFFER_OFFSET = 4;
		const planeBuffers = Array.from(
			{ length: POSED_BUFFER_OFFSET + STAGE_POSED_OVERLAY_LIMIT },
			() => root.createBuffer(StagePlaneUniforms, planeRest()).$usage('uniform')
		);
		// A fixed pool of body uniforms, one per body the ceilings allow.
		const bodyBuffers = Array.from({ length: STAGE_BODY_CEILINGS.maxBodies }, () =>
			root.createBuffer(StageBodyUniforms, bodyRest()).$usage('uniform')
		);
		// The obscurance passes: one buffer per blur direction, the rest shared.
		const occlusionRest = (direction: [number, number]) => ({
			projection: d.vec4f(1, 1, STAGE_DEPTH_NEAR, STAGE_DEPTH_FAR),
			params: d.vec4f(STAGE_OCCLUSION_RADIUS, STAGE_OCCLUSION_INTENSITY, width, height),
			direction: d.vec4f(direction[0], direction[1], 0, 0)
		});
		const occlusionBuffers = {
			horizontal: root.createBuffer(StageOcclusionUniforms, occlusionRest([1, 0])).$usage('uniform'),
			vertical: root.createBuffer(StageOcclusionUniforms, occlusionRest([0, 1])).$usage('uniform')
		};
		const dofUniform = root
			.createBuffer(DofUniforms, {
				params: d.vec4f(0, 0, maxCoc, 0),
				resolution: d.vec2f(width, height),
				depths: d.vec4f(0, 0, 0, 0)
			})
			.$usage('uniform');

		const opaqueTargets = {
			color: { format: INTERMEDIATE_FORMAT, blend: STAGE_PLANE_BLEND },
			depth: { format: STAGE_DEPTH_SIDECAR_FORMAT }
		} as const;
		const opaqueDepth = {
			format: STAGE_DEPTH_ATTACHMENT_FORMAT,
			depthWriteEnabled: true,
			depthCompare: 'less-equal'
		} as const;
		const opaquePipeline = unstable
			.withVertex(stagePlaneVertexFn, {})
			.withFragment(stagePlaneOpaqueFragmentFn, opaqueTargets)
			.withDepthStencil(opaqueDepth)
			.createPipeline();
		const skirtPipeline = unstable
			.withVertex(stagePlaneVertexFn, {})
			.withFragment(stagePlaneSkirtFragmentFn, {
				color: { format: INTERMEDIATE_FORMAT, blend: STAGE_PLANE_BLEND },
				depth: { format: STAGE_DEPTH_SIDECAR_FORMAT, writeMask: 0 }
			})
			.withDepthStencil({
				format: STAGE_DEPTH_ATTACHMENT_FORMAT,
				depthWriteEnabled: false,
				depthCompare: 'less-equal'
			})
			.createPipeline();
		// The same passes over the multisampled scene set the bodies switch on,
		// plus the domed glass grid in both.
		const opaquePipelineMultisampled = unstable
			.withVertex(stagePlaneVertexFn, {})
			.withFragment(stagePlaneOpaqueFragmentFn, opaqueTargets)
			.withDepthStencil(opaqueDepth)
			.withMultisample({ count: STAGE_SCENE_SAMPLE_COUNT })
			.createPipeline();
		const skirtPipelineMultisampled = unstable
			.withVertex(stagePlaneVertexFn, {})
			.withFragment(stagePlaneSkirtFragmentFn, {
				color: { format: INTERMEDIATE_FORMAT, blend: STAGE_PLANE_BLEND },
				depth: { format: STAGE_DEPTH_SIDECAR_FORMAT, writeMask: 0 }
			})
			.withDepthStencil({
				format: STAGE_DEPTH_ATTACHMENT_FORMAT,
				depthWriteEnabled: false,
				depthCompare: 'less-equal'
			})
			.withMultisample({ count: STAGE_SCENE_SAMPLE_COUNT })
			.createPipeline();
		const glassPipeline = unstable
			.withVertex(stageGlassVertexFn, {})
			.withFragment(stagePlaneOpaqueFragmentFn, opaqueTargets)
			.withDepthStencil(opaqueDepth)
			.createPipeline();
		const glassPipelineMultisampled = unstable
			.withVertex(stageGlassVertexFn, {})
			.withFragment(stagePlaneOpaqueFragmentFn, opaqueTargets)
			.withDepthStencil(opaqueDepth)
			.withMultisample({ count: STAGE_SCENE_SAMPLE_COUNT })
			.createPipeline();
		const bodyPipeline = unstable
			.withVertex(stageBodyVertexFn, {
				position: stageBodyVertexLayout.attrib.position,
				normal: stageBodyVertexLayout.attrib.normal,
				region: stageBodyVertexLayout.attrib.region
			})
			.withFragment(stageBodyFragmentFn, opaqueTargets)
			.withPrimitive({ topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' })
			.withDepthStencil(opaqueDepth)
			.withMultisample({ count: STAGE_SCENE_SAMPLE_COUNT })
			.createPipeline();
		const shadowDepthPipeline = unstable
			.withVertex(stageShadowDepthVertexFn, {
				position: stageBodyVertexLayout.attrib.position
			})
			.withPrimitive({ topology: 'triangle-list', cullMode: 'none' })
			.withDepthStencil({
				format: STAGE_SHADOW_MAP_FORMAT,
				depthWriteEnabled: true,
				depthCompare: 'less'
			})
			.createPipeline();
		const resolvePipeline = unstable
			.withVertex(fullVertexFn, {})
			.withFragment(stageResolveFragmentFn, {
				color: { format: INTERMEDIATE_FORMAT },
				depth: { format: STAGE_DEPTH_SIDECAR_FORMAT }
			})
			.createPipeline();
		const occlusionPipeline = unstable
			.withVertex(fullVertexFn, {})
			.withFragment(stageOcclusionFragmentFn, { format: STAGE_OCCLUSION_FORMAT })
			.createPipeline();
		const occlusionBlurPipeline = unstable
			.withVertex(fullVertexFn, {})
			.withFragment(stageOcclusionBlurFragmentFn, { format: STAGE_OCCLUSION_FORMAT })
			.createPipeline();
		const occlusionApplyPipeline = unstable
			.withVertex(fullVertexFn, {})
			.withFragment(stageOcclusionApplyFragmentFn, { format: INTERMEDIATE_FORMAT })
			.createPipeline();
		const blitPipeline = unstable
			.withVertex(fullVertexFn, {})
			.withFragment(blitFragmentFn, { format: INTERMEDIATE_FORMAT })
			.createPipeline();
		const downWeightPipeline = unstable
			.withVertex(fullVertexFn, {})
			.withFragment(downWeightFragmentFn, { format: INTERMEDIATE_FORMAT })
			.createPipeline();
		const downPipeline = unstable
			.withVertex(fullVertexFn, {})
			.withFragment(downsampleFragmentFn, { format: INTERMEDIATE_FORMAT })
			.createPipeline();
		const dofPipeline = unstable
			.withVertex(fullVertexFn, {})
			.withFragment(dofFragmentFn, { format: INTERMEDIATE_FORMAT })
			.createPipeline();
		const composePipeline = unstable
			.withVertex(fullVertexFn, {})
			.withFragment(composeFragmentFn, { format: INTERMEDIATE_FORMAT })
			.createPipeline();

		const downBinds = Array.from({ length: mipLevels - 1 }, (_, k) =>
			root.createBindGroup(downLayout, {
				src: mipViews[k],
				depth: depthSidecarView,
				samp: sampler,
				uniforms: dofUniform
			})
		);
		const dofBind = root.createBindGroup(dofLayout, {
			scene: sceneView,
			depth: depthSidecarView,
			samp: sampler,
			uniforms: dofUniform
		});
		const composeBind = root.createBindGroup(composeLayout, {
			scene: sceneView,
			depth: depthSidecarView,
			dofHalf: dofHalfView,
			samp: sampler,
			uniforms: dofUniform
		});

		const aspect = width / height;
		const mipCopies = this.#mipCopies;
		const ensureMipCopy = (role: StagePlaneRole): StageMipCopy => {
			const existing = mipCopies.get(role);
			if (existing) return existing;
			const texture = device.createTexture({
				size: [width, height, 1],
				format: INTERMEDIATE_FORMAT,
				mipLevelCount: mipLevels,
				usage: SCENE_TEXTURE_USAGE
			});
			const views: GPUTextureView[] = [];
			for (let i = 0; i < mipLevels; i += 1) {
				views.push(texture.createView({ baseMipLevel: i, mipLevelCount: 1, dimension: '2d' }));
			}
			const copy = { texture, views };
			mipCopies.set(role, copy);
			return copy;
		};
		// Level 0 blit + box chain into a stage-owned pyramid. Returns the pass count.
		const buildMipCopy = (role: StagePlaneRole, source: GPUTextureView): StageMipCopy => {
			const copy = ensureMipCopy(role);
			blitPipeline
				.with(root.createBindGroup(blitLayout, { src: source, samp: sampler }))
				.withColorAttachment({ view: copy.views[0], loadOp: 'clear', storeOp: 'store' })
				.draw(3);
			for (let i = 1; i < mipLevels; i += 1) {
				downPipeline
					.with(
						root.createBindGroup(downLayout, {
							src: copy.views[i - 1],
							depth: depthSidecarView,
							samp: sampler,
							uniforms: dofUniform
						})
					)
					.withColorAttachment({ view: copy.views[i], loadOp: 'clear', storeOp: 'store' })
					.draw(3);
			}
			return copy;
		};

		const frameBytes = (bytesPerTexel: number, mipped: boolean): number =>
			stagePlaneTextureBytes(width, height, bytesPerTexel, mipped);
		const residentBytes =
			frameBytes(BYTES_PER_RGBA16F_TEXEL, true) + // scene pyramid
			frameBytes(BYTES_PER_RGBA16F_TEXEL, false) + // output
			frameBytes(BYTES_PER_RGBA16F_TEXEL, false) / 4 + // half-res gather
			frameBytes(BYTES_PER_RG16F_TEXEL, false) + // depth sidecar
			frameBytes(BYTES_PER_DEPTH24_TEXEL, false); // depth attachment
		const multisampleBytes =
			(frameBytes(BYTES_PER_RGBA16F_TEXEL, false) +
				frameBytes(BYTES_PER_RG16F_TEXEL, false) +
				frameBytes(BYTES_PER_DEPTH24_TEXEL, false)) *
				STAGE_SCENE_SAMPLE_COUNT +
			frameBytes(BYTES_PER_RGBA16F_TEXEL, false) + // resolved colour
			frameBytes(BYTES_PER_OCCLUSION_TEXEL, false) * 2; // obscurance pair

		// The multisampled scene set, allocated the first time a body is on the
		// stage and kept for the stage's life (a composition that has a body has it
		// for the whole cut).
		const ensureMultisample = (): StageMultisampleTargets => {
			if (this.#multisample) return this.#multisample;
			const color = device.createTexture({
				size: [width, height, 1],
				format: INTERMEDIATE_FORMAT,
				sampleCount: STAGE_SCENE_SAMPLE_COUNT,
				usage: SCENE_TEXTURE_USAGE
			});
			const sidecar = device.createTexture({
				size: [width, height, 1],
				format: STAGE_DEPTH_SIDECAR_FORMAT,
				sampleCount: STAGE_SCENE_SAMPLE_COUNT,
				usage: SCENE_TEXTURE_USAGE
			});
			const depth = device.createTexture({
				size: [width, height, 1],
				format: STAGE_DEPTH_ATTACHMENT_FORMAT,
				sampleCount: STAGE_SCENE_SAMPLE_COUNT,
				usage: TEXTURE_USAGE_RENDER_ATTACHMENT
			});
			const resolved = device.createTexture({
				size: [width, height, 1],
				format: INTERMEDIATE_FORMAT,
				usage: SCENE_TEXTURE_USAGE
			});
			const obscurance: [GPUTexture, GPUTexture] = [
				device.createTexture({
					size: [width, height, 1],
					format: STAGE_OCCLUSION_FORMAT,
					usage: SCENE_TEXTURE_USAGE
				}),
				device.createTexture({
					size: [width, height, 1],
					format: STAGE_OCCLUSION_FORMAT,
					usage: SCENE_TEXTURE_USAGE
				})
			];
			this.#multisample = {
				color,
				colorView: color.createView(),
				sidecar,
				sidecarView: sidecar.createView(),
				depth,
				depthView: depth.createView(),
				resolved,
				resolvedView: resolved.createView(),
				obscurance,
				obscuranceViews: [obscurance[0].createView(), obscurance[1].createView()],
				bytes: multisampleBytes
			};
			return this.#multisample;
		};
		const ensureShadowMap = (): StageShadowMap => {
			if (this.#shadowMap) return this.#shadowMap;
			const texture = device.createTexture({
				size: [STAGE_SHADOW_MAP_SIZE, STAGE_SHADOW_MAP_SIZE, 1],
				format: STAGE_SHADOW_MAP_FORMAT,
				usage: SCENE_TEXTURE_USAGE
			});
			this.#shadowMap = { texture, view: texture.createView() };
			return this.#shadowMap;
		};

		// Body meshes stay resident across frames keyed by their model; a model
		// uploads once. The pool is bounded and evicts the oldest.
		const meshes = this.#meshes;
		let frameIndex = 0;
		const residentMesh = (key: string, data: StageMeshData): StageResidentMesh => {
			const existing = meshes.get(key);
			if (existing) {
				existing.lastUsedFrame = frameIndex;
				return existing;
			}
			const vertexBuffer = device.createBuffer({
				size: data.vertices.byteLength,
				usage: BUFFER_USAGE_VERTEX | BUFFER_USAGE_COPY_DST
			});
			device.queue.writeBuffer(vertexBuffer, 0, data.vertices);
			const indexBuffer = device.createBuffer({
				size: data.indices.byteLength,
				usage: BUFFER_USAGE_INDEX | BUFFER_USAGE_COPY_DST
			});
			device.queue.writeBuffer(indexBuffer, 0, data.indices);
			const mesh: StageResidentMesh = {
				vertexBuffer,
				indexBuffer,
				vertexCount: data.vertexCount,
				indexCount: data.indexCount,
				bytes: data.vertices.byteLength + data.indices.byteLength,
				lastUsedFrame: frameIndex
			};
			meshes.set(key, mesh);
			return mesh;
		};
		const evictStaleMeshes = (): void => {
			while (meshes.size > RESIDENT_MESH_LIMIT) {
				let oldestKey: string | null = null;
				let oldestFrame = Number.POSITIVE_INFINITY;
				for (const [key, mesh] of meshes) {
					if (mesh.lastUsedFrame < oldestFrame) {
						oldestFrame = mesh.lastUsedFrame;
						oldestKey = key;
					}
				}
				if (oldestKey === null) break;
				const mesh = meshes.get(oldestKey)!;
				mesh.vertexBuffer.destroy();
				mesh.indexBuffer.destroy();
				meshes.delete(oldestKey);
			}
		};

		this.#render = (input) => {
			frameIndex += 1;
			// The camera rig (ADR-0057): rest pose + travel + legacy push/drift,
			// resolved by the same function the GUI projector uses.
			const rig = createStageCameraRig({ aspect, camera: input.camera, time: input.time });
			const posed = hasAuthoredStageCameraPose(input.camera);
			const backdropCover = stageBackdropCover(input.camera, aspect);
			// The depth encoding for this camera, and the DOF rescale that keeps the
			// circle of confusion per world unit identical to the legacy pair.
			const encoding = stageDepthEncoding(input.camera, aspect);
			const encodingScale = (encoding.far - encoding.near) / (STAGE_DEPTH_FAR - STAGE_DEPTH_NEAR);
			const focusDepth01 = (dist: number): number =>
				(dist - encoding.near) / (encoding.far - encoding.near);
			const viewProjection = toMat4(rig.viewProjection);
			const cameraEye = d.vec4f(rig.eye[0], rig.eye[1], rig.eye[2], 0);

			// The scene key light (Pack light-treatment Role): a unit travel vector +
			// intensity, shared by every plane. No light ⇒ intensity 0, and the plane
			// shader skips both the rake and the shadow march entirely.
			const lightDir = input.light ? LIGHT_VECTORS[input.light.direction] : null;
			const lightIntensity = lightDir ? Math.min(1, Math.max(0, input.light?.intensity ?? 0)) : 0;
			const lightVec = d.vec4f(
				lightDir?.[0] ?? 0,
				lightDir?.[1] ?? 0,
				lightDir?.[2] ?? -1,
				lightIntensity
			);
			const lightDirection: [number, number, number] = lightDir ?? [0, 0, -1];
			const shadowStrength = lightIntensity * SHADOW_STRENGTH;
			// Composition-owned surface fade — the plane blends toward what is
			// behind it as it fades, and its cast shadow fades with it (a lingering
			// silhouette under a faded surface reads as a ghost).
			const fade = Math.min(1, Math.max(0, input.surfaceFadeAlpha ?? 1));
			const backdropTextured = input.backdropTextureView !== undefined;

			// The screen (ADR-0059): the model placed so its glass is the Surface
			// plane, which then shows the composition through its opening.
			const screen = input.screen ?? null;
			const screenPlacement = screen
				? resolveStageScreenBodyPlacement(aspect, screen.model, screen.mesh)
				: null;
			const hasBodies = screenPlacement !== null;
			const glass: StageScreenGlass | null = screenPlacement?.glass ?? null;
			const glassHalf = glass ? stagePlaneHalfLengths(glass.basis) : null;
			// The glass as an area light on every receiver (glow 0 without a screen).
			const screenLight: StageScreenLightUniforms =
				glass && glassHalf && screen
					? {
							screenOrigin: d.vec4f(
								glass.basis.origin[0],
								glass.basis.origin[1],
								glass.basis.origin[2],
								screen.model.screen.glow
							),
							screenU: d.vec4f(glass.basis.u[0], glass.basis.u[1], glass.basis.u[2], glassHalf.halfW),
							screenV: d.vec4f(glass.basis.v[0], glass.basis.v[1], glass.basis.v[2], glassHalf.halfH),
							screenNormal: d.vec4f(
								glass.basis.normal[0],
								glass.basis.normal[1],
								glass.basis.normal[2],
								Math.max(0, mipLevels - 1 - SCREEN_AVERAGE_LOD_BELOW_TOP)
							)
						}
					: screenLightRest();
			const glassOptics = screen?.model.screen.optics ?? null;
			const planeGlass: StagePlaneGlass | null =
				glass && glassHalf && glassOptics
					? {
							dome: glassOptics.dome * 2 * glassHalf.halfH,
							pixels: [glass.uvWindow[2] * width, glass.uvWindow[3] * height],
							optics: glassOptics
						}
					: null;

			// Under a pose the receding planes sample stage-owned mip chains; the
			// frontal camera keeps the single-level sources (pixel-identical). A
			// screen always builds the Surface chain: its top levels are the glass's
			// average colour, the light the housing takes from the picture.
			let mipPasses = 0;
			let mippedPlaneCount = 0;
			let textureBytes = residentBytes;
			const planeSourceView = (
				role: StagePlaneRole,
				source: GPUTextureView,
				force = false
			): GPUTextureView => {
				if (!posed && !force) return source;
				mippedPlaneCount += 1;
				mipPasses += mipLevels;
				textureBytes += frameBytes(BYTES_PER_RGBA16F_TEXEL, true);
				return buildMipCopy(role, source).views.length > 0
					? mipCopies.get(role)!.texture.createView()
					: source;
			};

			// Plane list in Layer order (backdrop, Surface, shared Overlay plane,
			// the screen's floor, posed Overlays); the passes re-sort back to
			// front, keeping this order at equal depth.
			const backdropView = input.backdropTextureView ?? input.surfacePlaneView;
			const wholeCapture: [number, number, number, number] = [0, 0, 1, 1];
			const surfaceView = planeSourceView('surface', input.surfacePlaneView, hasBodies);
			const planes: StagePlaneDraw[] = [
				{
					bufferIndex: 0,
					role: 'backdrop',
					basis: createBackdropStagePlaneBasis(aspect, backdropCover),
					planeView: backdropTextured ? planeSourceView('backdrop', backdropView) : backdropView,
					casterView: backdropView,
					textured: backdropTextured,
					discardTransparent: false,
					fade: 1,
					darken: backdropTextured ? (input.backdropContrast ?? 0) : 0,
					castStrength: 0,
					uvWindow: wholeCapture,
					glass: null
				},
				{
					bufferIndex: 1,
					role: 'surface',
					basis: glass ? glass.basis : createFrontalStagePlaneBasis(aspect, 0),
					planeView: surfaceView,
					casterView: input.surfacePlaneView,
					textured: true,
					// A glass is opaque dark where the picture has no coverage, and the
					// housing carries its shadow.
					discardTransparent: !glass,
					fade,
					darken: 0,
					castStrength: glass ? 0 : shadowStrength * fade,
					uvWindow: glass ? glass.uvWindow : wholeCapture,
					glass: planeGlass
				}
			];
			if (input.overlayPlaneView) {
				const overlayDepth = stageOverlayPlaneDepth(input.overlayZ ?? 0.7);
				planes.push({
					bufferIndex: 2,
					role: 'overlay',
					basis: createFrontalStagePlaneBasis(aspect, overlayDepth),
					planeView: input.overlayPlaneView,
					casterView: input.overlayPlaneView,
					textured: true,
					discardTransparent: true,
					fade: 1,
					darken: 0,
					castStrength: shadowStrength,
					uvWindow: wholeCapture,
					glass: null
				});
			}
			if (screenPlacement && screenPlacement.floorY !== null) {
				planes.push({
					bufferIndex: FLOOR_BUFFER_INDEX,
					role: 'floor',
					basis: resolveStageFloorBasis(aspect, screenPlacement.floorY, backdropCover),
					planeView: backdropView,
					casterView: backdropView,
					textured: false,
					discardTransparent: false,
					fade: 1,
					darken: 0,
					castStrength: 0,
					uvWindow: wholeCapture,
					glass: null,
					baseColor: [
						Math.min(1, input.backdropColor[0] * FLOOR_LIFT.gain + FLOOR_LIFT.add),
						Math.min(1, input.backdropColor[1] * FLOOR_LIFT.gain + FLOOR_LIFT.add),
						Math.min(1, input.backdropColor[2] * FLOOR_LIFT.gain + FLOOR_LIFT.add)
					]
				});
			}
			const posedOverlayPlanes = input.posedOverlayPlanes ?? [];
			posedOverlayPlanes.forEach((posedPlane, index) => {
				if (index >= STAGE_POSED_OVERLAY_LIMIT) return;
				planes.push({
					bufferIndex: POSED_BUFFER_OFFSET + index,
					role: 'overlay',
					basis: createPosedOverlayPlaneBasis({
						rig,
						aspect,
						overlayZ: posedPlane.z,
						pose: posedPlane.pose,
						pivot: posedPlane.pivot
					}),
					planeView: posedPlane.planeView,
					casterView: posedPlane.planeView,
					textured: true,
					discardTransparent: true,
					fade: 1,
					darken: 0,
					castStrength: shadowStrength,
					uvWindow: wholeCapture,
					glass: null
				});
			});
			const sceneMipPasses = input.aperture > 0.001 ? mipLevels - 1 : 0;
			assertStagePlaneCeilings({
				planeCount:
					planes.length + Math.max(0, posedOverlayPlanes.length - STAGE_POSED_OVERLAY_LIMIT),
				posedOverlayPlaneCount: posedOverlayPlanes.length,
				mippedPlaneCount,
				textureBytes,
				mipPasses: mipPasses + sceneMipPasses
			});

			// The bodies: the screen first, then every body a Pipeline contributes
			// (ADR-0062), each a resident mesh under the geometry ceilings — summed
			// over the frame — before any upload. A body below the presence floor is
			// not on the stage this frame.
			const presentBodies = (input.bodies ?? []).filter(
				(body) => body.presence >= STAGE_BODY_PRESENCE_FLOOR
			);
			const bodyMeshes = [
				...(screen && screenPlacement ? [screen.mesh] : []),
				...presentBodies.map((body) => body.mesh)
			];
			if (bodyMeshes.length > 0) {
				assertStageBodyCeilings({
					bodyCount: bodyMeshes.length,
					vertexCount: bodyMeshes.reduce((total, mesh) => total + mesh.vertexCount, 0),
					indexCount: bodyMeshes.reduce((total, mesh) => total + mesh.indexCount, 0),
					meshBytes: bodyMeshes.reduce(
						(total, mesh) => total + mesh.vertexCount * STAGE_MESH_VERTEX_BYTES + mesh.indexCount * 4,
						0
					),
					residentBytes: multisampleBytes + STAGE_SHADOW_MAP_BYTES
				});
			}
			const bodyDraws: StageBodyDraw[] = [];
			if (screen && screenPlacement) {
				bodyDraws.push({
					mesh: residentMesh(`model:${screen.model.slug}`, screen.mesh),
					model: screenPlacement.model,
					materials: screen.model.materials,
					center: screenPlacement.center,
					radius: screenPlacement.radius,
					presence: 1,
					pullsFocus: false,
					bufferIndex: bodyDraws.length
				});
			}
			for (const body of presentBodies) {
				const sphere = stageBodyBoundingSphere(body.model, body.mesh);
				bodyDraws.push({
					mesh: residentMesh(`body:${body.key}`, body.mesh),
					model: body.model,
					materials: body.materials,
					center: sphere.center,
					radius: sphere.radius,
					presence: Math.min(1, body.presence),
					pullsFocus: body.pullsFocus,
					bufferIndex: bodyDraws.length
				});
			}

			// The shadow map: the bodies from the key's direction, so every plane
			// and body can read their occlusion. Unlit scenes cast nothing.
			const shadowProjection: StageShadowProjection | null =
				bodyDraws.length > 0 && lightIntensity > 0.001
					? createStageShadowProjection(
							lightDirection,
							bodyDraws.map((draw) => ({ center: draw.center, radius: draw.radius })),
							SHADOW_RECEIVER_REACH
						)
					: null;
			const shadowMap = shadowProjection ? ensureShadowMap() : null;
			const shadowView = shadowMap?.view ?? idleShadowView;
			const shadowDepthRange = shadowProjection ? shadowProjection.far - shadowProjection.near : 1;
			const shadowMatrix = toMat4(
				shadowProjection ? shadowProjection.viewProjection : (mat4.identity() as Float32Array)
			);
			const shadowParams = d.vec4f(
				shadowProjection ? shadowStrength : 0,
				shadowDepthRange,
				shadowProjection?.extent ?? 1,
				SHADOW_MAP_BIAS_WORLD / shadowDepthRange
			);

			const planeSampler = posed ? anisotropicSampler : sampler;
			const sorted = sortStagePlanesBackToFront(planes, rig.eye, rig.forward);
			// The caster planes a receiver marches through, as uniform slots + views.
			const casterSlotsFor = (receiver: StagePlaneBasis) => {
				const casters = selectStagePlaneCasters(receiver, planes, lightDirection).filter(
					(caster) => caster.castStrength > 0.001
				);
				const slots = Array.from({ length: STAGE_MAX_CASTERS }, (_, slot) => casters[slot]);
				return {
					casterOrigin: slots.map((caster) =>
						caster
							? d.vec4f(
									caster.basis.origin[0],
									caster.basis.origin[1],
									caster.basis.origin[2],
									caster.castStrength
								)
							: d.vec4f(0, 0, 0, 0)
					),
					casterU: slots.map((caster) => {
						if (!caster) return d.vec4f(1, 0, 0, 1);
						const lengths = stagePlaneHalfLengths(caster.basis);
						const [x, y, z] = caster.basis.u;
						return d.vec4f(x / lengths.halfW, y / lengths.halfW, z / lengths.halfW, lengths.halfW);
					}),
					casterV: slots.map((caster) => {
						if (!caster) return d.vec4f(0, 1, 0, 1);
						const lengths = stagePlaneHalfLengths(caster.basis);
						const [x, y, z] = caster.basis.v;
						return d.vec4f(x / lengths.halfH, y / lengths.halfH, z / lengths.halfH, lengths.halfH);
					}),
					casterNormal: slots.map((caster) =>
						caster
							? d.vec4f(caster.basis.normal[0], caster.basis.normal[1], caster.basis.normal[2], 0)
							: d.vec4f(0, 0, 1, 0)
					),
					views: slots.map((caster) => caster?.casterView)
				};
			};
			const bindGroups = new Map<StagePlaneDraw, ReturnType<typeof root.createBindGroup>>();
			for (const plane of sorted) {
				const { halfW, halfH } = stagePlaneHalfLengths(plane.basis);
				const casters = casterSlotsFor(plane.basis);
				const buffer = planeBuffers[plane.bufferIndex];
				const optics = plane.glass?.optics ?? null;
				buffer.write({
					mvp: toMat4(
						mat4.multiply(rig.viewProjection, stagePlaneModelMatrix(plane.basis)) as Float32Array
					),
					viewProjection,
					origin: d.vec4f(
						plane.basis.origin[0],
						plane.basis.origin[1],
						plane.basis.origin[2],
						plane.textured ? 1 : 0
					),
					axisU: d.vec4f(
						plane.basis.u[0],
						plane.basis.u[1],
						plane.basis.u[2],
						plane.discardTransparent ? 1 : 0
					),
					axisV: d.vec4f(plane.basis.v[0], plane.basis.v[1], plane.basis.v[2], plane.fade),
					normal: d.vec4f(
						plane.basis.normal[0],
						plane.basis.normal[1],
						plane.basis.normal[2],
						plane.darken
					),
					misc: d.vec4f(encoding.near, encoding.far, halfW, halfH),
					baseColor: d.vec4f(
						plane.baseColor?.[0] ?? input.backdropColor[0],
						plane.baseColor?.[1] ?? input.backdropColor[1],
						plane.baseColor?.[2] ?? input.backdropColor[2],
						1
					),
					light: lightVec,
					uvWindow: d.vec4f(
						plane.uvWindow[0],
						plane.uvWindow[1],
						plane.uvWindow[2],
						plane.uvWindow[3]
					),
					glass: plane.glass
						? d.vec4f(1, plane.glass.dome, plane.glass.pixels[0], plane.glass.pixels[1])
						: d.vec4f(0, 0, 1, 1),
					optics: optics
						? d.vec4f(optics.curvature, optics.vignette, optics.maskPitchPx, optics.maskStrength)
						: d.vec4f(0, 0, 0, 0),
					optics2: optics
						? d.vec4f(optics.lines, optics.focus, optics.halation, MASK_MODE[optics.mask])
						: d.vec4f(0, 0, 0, 0),
					camera: cameraEye,
					...screenLight,
					shadowViewProjection: shadowMatrix,
					shadow: shadowParams,
					casterOrigin: casters.casterOrigin,
					casterU: casters.casterU,
					casterV: casters.casterV,
					casterNormal: casters.casterNormal
				});
				bindGroups.set(
					plane,
					root.createBindGroup(stagePlaneLayout, {
						planeTexture: plane.planeView,
						samp: planeSampler,
						plane: buffer,
						screenTexture: surfaceView,
						shadowMap: shadowView,
						shadowSampler,
						casterTexture0: casters.views[0] ?? plane.casterView,
						casterTexture1: casters.views[1] ?? plane.casterView,
						casterTexture2: casters.views[2] ?? plane.casterView,
						casterTexture3: casters.views[3] ?? plane.casterView
					})
				);
			}

			// Body uniforms + bind groups: the placement's frame, the region
			// materials, the glass as a light, and the same two shadow reads the
			// planes get.
			const bodyBindGroups = new Map<StageBodyDraw, ReturnType<typeof root.createBindGroup>>();
			for (const draw of bodyDraws) {
				const receiver: StagePlaneBasis = {
					origin: draw.center,
					u: [draw.radius, 0, 0],
					v: [0, draw.radius, 0],
					normal: [0, 0, 1]
				};
				const casters = casterSlotsFor(receiver);
				const buffer = bodyBuffers[draw.bufferIndex];
				// The inverse transpose carries a rotated, leaning body's normals with it.
				const normalMatrix = mat4.transpose(mat4.inverse(draw.model)) as Float32Array;
				buffer.write({
					mvp: toMat4(mat4.multiply(rig.viewProjection, draw.model) as Float32Array),
					model: toMat4(draw.model),
					normalMatrix: toMat4(normalMatrix),
					shadowMvp: toMat4(
						shadowProjection
							? (mat4.multiply(shadowProjection.viewProjection, draw.model) as Float32Array)
							: draw.model
					),
					// The registry speaks displayed colour; the body is lit in linear light.
					materialColor: Array.from({ length: STAGE_BODY_MAX_REGIONS }, (_, region) => {
						const material = draw.materials[region] ?? draw.materials[0];
						return d.vec4f(
							srgbChannelToLinear(material.color[0]),
							srgbChannelToLinear(material.color[1]),
							srgbChannelToLinear(material.color[2]),
							material.roughness
						);
					}),
					materialParams: Array.from({ length: STAGE_BODY_MAX_REGIONS }, (_, region) => {
						const material = draw.materials[region] ?? draw.materials[0];
						return d.vec4f(material.metallic, 0, 0, 0);
					}),
					environment: d.vec4f(
						srgbChannelToLinear(input.backdropColor[0]),
						srgbChannelToLinear(input.backdropColor[1]),
						srgbChannelToLinear(input.backdropColor[2]),
						0
					),
					light: lightVec,
					camera: cameraEye,
					misc: d.vec4f(encoding.near, encoding.far, draw.presence, 0),
					...screenLight,
					shadowViewProjection: shadowMatrix,
					shadow: shadowParams,
					casterOrigin: casters.casterOrigin,
					casterU: casters.casterU,
					casterV: casters.casterV,
					casterNormal: casters.casterNormal
				});
				bodyBindGroups.set(
					draw,
					root.createBindGroup(stageBodyLayout, {
						body: buffer,
						samp: planeSampler,
						screenTexture: surfaceView,
						shadowMap: shadowView,
						shadowSampler,
						casterTexture0: casters.views[0] ?? input.surfacePlaneView,
						casterTexture1: casters.views[1] ?? input.surfacePlaneView,
						casterTexture2: casters.views[2] ?? input.surfacePlaneView,
						casterTexture3: casters.views[3] ?? input.surfacePlaneView
					})
				);
			}

			// Live distances along the view, so focusZ 0 keeps the AIM point sharp
			// (the Surface plane under the frontal camera; the aimed page point
			// under a pose) through the whole camera move, and focusZ 1 reaches the
			// backdrop behind it.
			const aimFocus = mix(
				focusDepth01(rig.aimDistance),
				focusDepth01(rig.backdropDistance),
				input.focusZ
			);
			// A present body pulls focus to itself (ADR-0051 phase 2): the lens
			// racks from the aimed page point to the nearest body as it lands and
			// back as it leaves. A screen's glass is the aimed plane already, so it
			// never pulls; a stage without bodies keeps the aim's focus.
			const bodyFocus = resolveStageBodyFocusPull(
				bodyDraws
					.filter((draw) => draw.pullsFocus)
					.map((draw) => ({ center: draw.center, presence: draw.presence })),
				rig.eye,
				rig.forward
			);
			const focus = bodyFocus
				? mix(aimFocus, focusDepth01(bodyFocus.distance), bodyFocus.pull)
				: aimFocus;
			// One lens, moved with the camera: a thin lens blurs a subject displaced
			// from focus by an amount that grows as one over the focus distance
			// squared, so a posed camera half as far from its aim point defocuses
			// the same page four times as hard. The frontal camera keeps its lens.
			const lensScale = posed ? (STAGE_CAM_Z / rig.aimDistance) ** 2 : 1;
			dofUniform.write({
				params: d.vec4f(
					focus,
					input.aperture,
					maxCoc * encodingScale * lensScale,
					(input.focusBand ?? 0) / encodingScale
				),
				resolution: d.vec2f(width, height),
				// The frontmost plane's live depth (the Surface plane is nearest).
				depths: d.vec4f(focusDepth01(rig.aimDistance), 0, 0, 0)
			});

			// The shadow-depth pass: every body from the key's direction, before
			// any receiver reads the map. It binds the body uniforms alone — the
			// receiver bind groups hold the map as a texture, which cannot share a
			// pass with rendering into it.
			if (shadowMap) {
				bodyDraws.forEach((draw, index) => {
					shadowDepthPipeline
						.with(stageBodyVertexLayout, draw.mesh.vertexBuffer)
						.with(
							root.createBindGroup(stageShadowDepthLayout, {
								body: bodyBuffers[draw.bufferIndex]
							})
						)
						.withIndexBuffer(draw.mesh.indexBuffer, 'uint32')
						.withDepthStencilAttachment(
							index === 0
								? {
										view: shadowMap.view,
										depthClearValue: 1,
										depthLoadOp: 'clear',
										depthStoreOp: 'store'
									}
								: { view: shadowMap.view, depthLoadOp: 'load', depthStoreOp: 'store' }
						)
						.drawIndexed(draw.mesh.indexCount);
				});
			}

			// The scene targets: single-sample for a plane-only stage; the
			// multisampled set while a body is present, resolved afterwards.
			const multisample = bodyDraws.length > 0 ? ensureMultisample() : null;
			const sceneColorView = multisample ? multisample.colorView : mipViews[0];
			const sceneSidecarView = multisample ? multisample.sidecarView : depthSidecarView;
			const sceneDepthView = multisample ? multisample.depthView : depthAttachmentView;
			const planeOpaque = multisample ? opaquePipelineMultisampled : opaquePipeline;
			const planeSkirt = multisample ? skirtPipelineMultisampled : skirtPipeline;
			const glassOpaque = multisample ? glassPipelineMultisampled : glassPipeline;

			// Pass 1 — opaque texels, back to front, depth-tested and depth-written.
			// The colour target clears to the backdrop colour (the oversized
			// backdrop covers it anyway), the sidecar to the far depth. A glass
			// draws its domed grid; every other plane its quad.
			const [r, g, b] = input.backdropColor;
			sorted.forEach((plane, index) => {
				const first = index === 0;
				const pipeline = plane.glass ? glassOpaque : planeOpaque;
				pipeline
					.with(bindGroups.get(plane)!)
					.withColorAttachment({
						color: first
							? { view: sceneColorView, clearValue: [r, g, b, 1], loadOp: 'clear', storeOp: 'store' }
							: { view: sceneColorView, loadOp: 'load', storeOp: 'store' },
						depth: first
							? {
									view: sceneSidecarView,
									clearValue: [1, 0, 0, 1],
									loadOp: 'clear',
									storeOp: 'store'
								}
							: { view: sceneSidecarView, loadOp: 'load', storeOp: 'store' }
					})
					.withDepthStencilAttachment(
						first
							? {
									view: sceneDepthView,
									depthClearValue: 1,
									depthLoadOp: 'clear',
									depthStoreOp: 'store'
								}
							: { view: sceneDepthView, depthLoadOp: 'load', depthStoreOp: 'store' }
					)
					.draw(plane.glass ? STAGE_GLASS_VERTEX_COUNT : 6);
			});
			// Pass 1b — the bodies, depth-tested against the opaque planes both
			// ways (the housing occludes the glass's edges from an oblique camera;
			// the glass occludes the tube behind it), writing depth and the sidecar
			// like any opaque texel.
			for (const draw of bodyDraws) {
				bodyPipeline
					.with(stageBodyVertexLayout, draw.mesh.vertexBuffer)
					.with(bodyBindGroups.get(draw)!)
					.withIndexBuffer(draw.mesh.indexBuffer, 'uint32')
					.withColorAttachment({
						color: { view: sceneColorView, loadOp: 'load', storeOp: 'store' },
						depth: { view: sceneSidecarView, loadOp: 'load', storeOp: 'store' }
					})
					.withDepthStencilAttachment({
						view: sceneDepthView,
						depthLoadOp: 'load',
						depthStoreOp: 'store'
					})
					.drawIndexed(draw.mesh.indexCount);
			}
			// Pass 2 — the soft skirts of the captured planes, depth-tested against
			// pass 1 but never written, blended over what is really behind them.
			for (const plane of sorted) {
				if (!plane.discardTransparent) continue;
				planeSkirt
					.with(bindGroups.get(plane)!)
					.withColorAttachment({
						color: { view: sceneColorView, loadOp: 'load', storeOp: 'store' },
						depth: { view: sceneSidecarView, loadOp: 'load', storeOp: 'store' }
					})
					.withDepthStencilAttachment({
						view: sceneDepthView,
						depthLoadOp: 'load',
						depthStoreOp: 'store'
					})
					.draw(6);
			}
			// Resolve the multisampled scene into the single-sample targets the
			// pyramid, gather, and compose read: colour averaged, depth nearest.
			// Then ground the scene: the obscurance estimated from the resolved
			// sidecar, blurred once each way, darkens the resolved colour into the
			// scene's level 0 wherever the sidecar marks a texel occludable.
			if (multisample) {
				resolvePipeline
					.with(
						root.createBindGroup(stageResolveLayout, {
							sceneSamples: multisample.colorView,
							depthSamples: multisample.sidecarView
						})
					)
					.withColorAttachment({
						color: { view: multisample.resolvedView, loadOp: 'clear', storeOp: 'store' },
						depth: { view: depthSidecarView, loadOp: 'clear', storeOp: 'store' }
					})
					.draw(3);
				const tanHalfFov = Math.tan(STAGE_FOV / 2);
				const occlusionProjection = d.vec4f(
					tanHalfFov * aspect,
					tanHalfFov,
					encoding.near,
					encoding.far
				);
				for (const [direction, buffer] of [
					[[1, 0], occlusionBuffers.horizontal],
					[[0, 1], occlusionBuffers.vertical]
				] as const) {
					buffer.write({
						projection: occlusionProjection,
						params: d.vec4f(STAGE_OCCLUSION_RADIUS, STAGE_OCCLUSION_INTENSITY, width, height),
						direction: d.vec4f(direction[0], direction[1], 0, 0)
					});
				}
				occlusionPipeline
					.with(
						root.createBindGroup(stageOcclusionLayout, {
							depth: depthSidecarView,
							occlusion: occlusionBuffers.horizontal
						})
					)
					.withColorAttachment({
						view: multisample.obscuranceViews[0],
						loadOp: 'clear',
						storeOp: 'store'
					})
					.draw(3);
				occlusionBlurPipeline
					.with(
						root.createBindGroup(stageOcclusionBlurLayout, {
							obscurance: multisample.obscuranceViews[0],
							depth: depthSidecarView,
							occlusion: occlusionBuffers.horizontal
						})
					)
					.withColorAttachment({
						view: multisample.obscuranceViews[1],
						loadOp: 'clear',
						storeOp: 'store'
					})
					.draw(3);
				occlusionApplyPipeline
					.with(
						root.createBindGroup(stageOcclusionApplyLayout, {
							scene: multisample.resolvedView,
							obscurance: multisample.obscuranceViews[1],
							depth: depthSidecarView,
							occlusion: occlusionBuffers.vertical
						})
					)
					.withColorAttachment({ view: mipViews[0], loadOp: 'clear', storeOp: 'store' })
					.draw(3);
			}
			evictStaleMeshes();

			// Prefiltered pyramid + half-res gather — only when there's defocus to
			// gather. With aperture ~0 the compose pass passes the sharp scene
			// through untouched (it never reads the gather), so skipping both is
			// free correctness AND the perf gate that keeps flat/degenerate-stage
			// pieces (the unify case) from paying the pyramid + gather cost.
			if (input.aperture > 0.001) {
				for (let i = 1; i < mipLevels; i += 1) {
					// Level 1 applies the CoC weighting (reads depth from the sidecar);
					// deeper levels box-filter the premultiplied data.
					const pipelineForLevel = i === 1 ? downWeightPipeline : downPipeline;
					pipelineForLevel
						.with(downBinds[i - 1])
						.withColorAttachment({
							view: mipViews[i],
							clearValue: [0, 0, 0, 1],
							loadOp: 'clear',
							storeOp: 'store'
						})
						.draw(3);
				}
				dofPipeline
					.with(dofBind)
					.withColorAttachment({
						view: dofHalfView,
						clearValue: [0, 0, 0, 0],
						loadOp: 'clear',
						storeOp: 'store'
					})
					.draw(3);
			}
			composePipeline
				.with(composeBind)
				.withColorAttachment({
					view: outputView,
					clearValue: [0, 0, 0, 1],
					loadOp: 'clear',
					storeOp: 'store'
				})
				.draw(3);
		};
	}

	/** Render the depth-staged frame. Output is the graded, defocused composite. */
	render(input: DepthStageInput): void {
		this.#render(input);
	}

	/** The depth-staged result (premultiplied/opaque rgba16float) — fed to the
	 *  effect chain, which presents + dithers it to the canvas. */
	outputTexture(): GPUTexture {
		return this.#outputTexture;
	}

	get width(): number {
		return this.#width;
	}
	get height(): number {
		return this.#height;
	}

	dispose(): void {
		this.#sceneTexture.destroy();
		this.#depthSidecarTexture.destroy();
		this.#depthAttachmentTexture.destroy();
		this.#dofHalfTexture.destroy();
		this.#outputTexture.destroy();
		this.#idleShadowMap.destroy();
		for (const copy of this.#mipCopies.values()) copy.texture.destroy();
		this.#mipCopies.clear();
		if (this.#multisample) {
			this.#multisample.color.destroy();
			this.#multisample.sidecar.destroy();
			this.#multisample.depth.destroy();
			this.#multisample.resolved.destroy();
			this.#multisample.obscurance[0].destroy();
			this.#multisample.obscurance[1].destroy();
			this.#multisample = null;
		}
		if (this.#shadowMap) {
			this.#shadowMap.texture.destroy();
			this.#shadowMap = null;
		}
		for (const mesh of this.#meshes.values()) {
			mesh.vertexBuffer.destroy();
			mesh.indexBuffer.destroy();
		}
		this.#meshes.clear();
	}
}
