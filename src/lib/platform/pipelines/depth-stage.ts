import tgpu, { d } from 'typegpu';
import { mat4 } from 'wgpu-matrix';

import { INTERMEDIATE_FORMAT, type GpuHost } from '$lib/platform/gpu-host';
import type { LightDirection } from '$lib/platform/packs/resolve';

// Dimensional depth stage (ADR-0028). The validated WebGPU 3D depth-of-field POC
// (src/routes/poc/dof3d) as a reusable engine renderer: the Surface composite is
// placed on a fronto-parallel plane near the camera, over an opaque backdrop plane
// at depth; a perspective camera move makes the two reproject at different rates
// (real parallax), and a mip-prefiltered gather DOF defocuses by per-pixel depth.
//
// Scope (per ADR-0028): Surface plane + backdrop + an optional Overlay plane at
// its ADR-0021 z, depth-in-alpha with painter's order (each textured plane's
// transparent surround is discarded so the planes behind show around the content).
// Real scene lighting/shadow is the remaining documented forward hook. The flat
// multiplane path (ADR-0027) stays the default; this renders only when a Preset
// declares `state.stage`.
//
// The grain fix that made the POC ship: the DOF gather never samples the sharp
// scene buffer — it reads a prefiltered mip whose footprint spans the gap between
// sparse taps, so a handful of taps reconstruct a smooth disc instead of aliasing.

const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const SCENE_TEXTURE_USAGE = TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_RENDER_ATTACHMENT;

const FOV = (42 * Math.PI) / 180;
const CAM_Z = 3.4; // camera distance; the Surface plane sits at the framing distance
const BACKDROP_DEPTH = 2.2; // world units the backdrop sits behind the Surface plane
const D_NEAR = 2.5; // camera-space distance encoded as depth 0
const D_FAR = 6.0; // …as depth 1
const BOKEH_TAPS = 96;
const MAX_LOD = 14; // textureSampleLevel clamps to the texture's real top mip
const REF_COC = 42; // max circle-of-confusion (px) per 1080px of frame short side
const SHADOW_TAPS = 8; // caster-alpha disc taps per shadow (penumbra)
const SHADOW_PENUMBRA = 0.1; // penumbra radius (world units) per unit plane gap
const SHADOW_STRENGTH = 0.75; // max shadow darkening per unit light intensity

// The Pack's named key directions realized as scene geometry: unit vectors the
// light TRAVELS along (mostly frontal, into the scene — an oblique key throws
// the card's shadow far outside the frame at BACKDROP_DEPTH).
const LIGHT_VECTORS: Record<LightDirection, [number, number, number]> = {
	'upper-left': [0.14, -0.16, -0.977],
	'upper-right': [-0.14, -0.16, -0.977],
	top: [0, -0.2, -0.98],
	left: [0.2, -0.05, -0.978],
	right: [-0.2, -0.05, -0.978]
};

// misc = (depthNear, depthFar, textured, discardTransparent). baseColor = solid
// plane albedo (the backdrop; on discard-transparent planes it carries the
// BACKDROP's colour + darken for the fade reconstruction below).
// world = (halfW, halfH, worldZ, _): the plane's world extents + depth, for the
// scene light. light = (dir.xyz, intensity): the Pack's key light travelling
// along dir; intensity 0 ⇒ unlit (pixel-identical to the pre-light stage).
// casterA/B = (halfW, halfH, worldZ, strength): planes that cast shadow onto
// this one, sampled via casterTexA/B; strength 0 ⇒ no caster in that slot.
// eye = (eyeX, eyeY, eyeZ, fade): the camera position + the plane's
// composition-owned opacity (ADR-0035). Planes composite by OVERWRITE (alpha
// carries depth), so a fading plane can't alpha-blend — instead it
// reconstructs the backdrop along the view ray (bgPlane = halfW, halfH, z,
// textured; sampled via bgTex) and mixes toward it.
const PlaneUniforms = d.struct({
	mvp: d.mat4x4f,
	misc: d.vec4f,
	baseColor: d.vec4f,
	world: d.vec4f,
	light: d.vec4f,
	casterA: d.vec4f,
	casterB: d.vec4f,
	eye: d.vec4f,
	bgPlane: d.vec4f
});
// params = (focus depth01, aperture, maxCoc px, band). resolution = scene px.
// depths = (nearest plane depth01, _, _, _): the frontmost plane this frame —
// the compose pass uses it to keep sharp nearest-plane pixels on the sharp
// branch (nothing can bleed over the frontmost plane).
const DofUniforms = d.struct({ params: d.vec4f, resolution: d.vec2f, depths: d.vec4f });

const planeLayout = tgpu.bindGroupLayout({
	surfaceTexture: { texture: d.texture2d(d.f32) },
	casterTexA: { texture: d.texture2d(d.f32) },
	casterTexB: { texture: d.texture2d(d.f32) },
	bgTex: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	plane: { uniform: PlaneUniforms }
});

// A plane quad transformed by its MVP; carries uv, camera-space distance
// (clip.w), and the fragment's world-space xy (planes are axis-aligned scaled
// quads, so world xy = corner xy × the plane's half-extents) for the light.
const planeVertexFn = tgpu['~unstable'].vertexFn({
	in: { vertexIndex: d.builtin.vertexIndex },
	out: { position: d.builtin.position, uv: d.vec2f, dist: d.f32, world: d.vec2f }
}) /* wgsl */ `{
	var pos = array<vec3f, 6>(
		vec3f(-1.0, -1.0, 0.0), vec3f(1.0, -1.0, 0.0), vec3f(1.0, 1.0, 0.0),
		vec3f(-1.0, -1.0, 0.0), vec3f(1.0, 1.0, 0.0), vec3f(-1.0, 1.0, 0.0)
	);
	var uv = array<vec2f, 6>(
		vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
		vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
	);
	let clip = layout.$.plane.mvp * vec4f(pos[in.vertexIndex], 1.0);
	let wxy = pos[in.vertexIndex].xy * layout.$.plane.world.xy;
	return Out(clip, uv[in.vertexIndex], clip.w, wxy);
}`.$uses({ layout: planeLayout });

// Opaque planes in painter's order: the scene target stores STRAIGHT colour + the
// camera-space depth in alpha. The Surface composite is premultiplied; transparent
// surround is discarded so the backdrop (drawn first) shows around the card.
const planeFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f, dist: d.f32, world: d.vec2f },
	out: d.vec4f
}) /* wgsl */ `{
	let misc = layout.$.plane.misc;
	var color = layout.$.plane.baseColor.rgb;
	// Partial-alpha COVERAGE of a discard-transparent plane (AA edges, baked
	// semi-transparent ink like text-shadows). Folded into the same backdrop
	// reconstruction as the composition fade below — a binary 0.5 discard
	// quantizes soft ink into a dotted dark fringe that survives the DOF blur.
	var coverage = 1.0;
	if (misc.z > 0.5) {
		let s = textureSample(layout.$.surfaceTexture, layout.$.samp, in.uv); // premultiplied
		if (misc.w > 0.5 && s.a < 0.02) { discard; }
		if (misc.w > 0.5) { coverage = min(s.a, 1.0); }
		color = s.rgb / max(s.a, 0.001); // un-premultiply: the plane's own colour
		// Backdrop-only (misc.w < 0.5 = not discard-transparent): a soft central
		// darken of the photo for near-plane text legibility. baseColor.a carries
		// the strength. Opaque, so it composites cleanly (no alpha discard) and
		// keeps the floating-text look — a scrim can't ride the near plane.
		if (misc.w < 0.5) {
			// Wide elliptical pool with an INNER PLATEAU: full strength out to ~0.34
			// (covers the centred text block, so glyphs never sit on the brighter
			// falloff zone), then fades 0.34→0.9. Keeps text contrast uniform across
			// the whole quote while the photo still breathes past the pool.
			let dv = (in.uv - vec2f(0.5)) * vec2f(1.0, 1.7);
			let darken = (1.0 - smoothstep(0.3, 1.15, length(dv))) * layout.$.plane.baseColor.a;
			color = color * (1.0 - darken);
		}
	}
	// Scene key light (Pack light-treatment Role). Two contributions, both in
	// shared world space so every plane inhabits ONE light:
	//  - received rake: a soft directional gradient, brighter toward the key's
	//    origin, dimmer away — the raking-key cue of a lit space;
	//  - cast shadow: march back along the light to each caster plane, sample
	//    its alpha in a small disc (penumbra grows with the plane gap), darken.
	// intensity 0 skips everything — pixel-identical to the unlit stage.
	let light = layout.$.plane.light;
	if (light.w > 0.001) {
		let towards = normalize(vec2f(-light.x, -light.y + 1e-4));
		let extent = max(layout.$.plane.world.x, layout.$.plane.world.y);
		let rake = dot(in.world / max(extent, 1e-4), towards);
		color = color * (1.0 + rake * light.w * 0.22);

		let wz = layout.$.plane.world.z;
		var shade = 0.0;
		let ca = layout.$.plane.casterA;
		if (ca.w > 0.001) {
			let s = (ca.z - wz) / max(-light.z, 1e-4);
			if (s > 0.001) {
				let cxy = in.world - light.xy * s;
				let cuv = vec2f((cxy.x / ca.x + 1.0) * 0.5, 1.0 - (cxy.y / ca.y + 1.0) * 0.5);
				let rad = ${SHADOW_PENUMBRA} * s;
				var occ = 0.0;
				for (var i: u32 = 0u; i < ${SHADOW_TAPS}u; i = i + 1u) {
					let st = (f32(i) + 0.5) / ${SHADOW_TAPS}.0;
					let ang = f32(i) * 2.39996;
					let o = vec2f(cos(ang), sin(ang)) * sqrt(st) * rad;
					let tuv = cuv + vec2f(o.x / ca.x, -o.y / ca.y) * 0.5;
					if (all(tuv >= vec2f(0.0)) && all(tuv <= vec2f(1.0))) {
						occ = occ + textureSampleLevel(layout.$.casterTexA, layout.$.samp, tuv, 0.0).a;
					}
				}
				shade = max(shade, (occ / ${SHADOW_TAPS}.0) * ca.w);
			}
		}
		let cb = layout.$.plane.casterB;
		if (cb.w > 0.001) {
			let s = (cb.z - wz) / max(-light.z, 1e-4);
			if (s > 0.001) {
				let cxy = in.world - light.xy * s;
				let cuv = vec2f((cxy.x / cb.x + 1.0) * 0.5, 1.0 - (cxy.y / cb.y + 1.0) * 0.5);
				let rad = ${SHADOW_PENUMBRA} * s;
				var occ = 0.0;
				for (var i: u32 = 0u; i < ${SHADOW_TAPS}u; i = i + 1u) {
					let st = (f32(i) + 0.5) / ${SHADOW_TAPS}.0;
					let ang = f32(i) * 2.39996;
					let o = vec2f(cos(ang), sin(ang)) * sqrt(st) * rad;
					let tuv = cuv + vec2f(o.x / cb.x, -o.y / cb.y) * 0.5;
					if (all(tuv >= vec2f(0.0)) && all(tuv <= vec2f(1.0))) {
						occ = occ + textureSampleLevel(layout.$.casterTexB, layout.$.samp, tuv, 0.0).a;
					}
				}
				shade = max(shade, (occ / ${SHADOW_TAPS}.0) * cb.w);
			}
		}
		color = color * (1.0 - min(shade, 1.0));
	}
	var depth01 = clamp((in.dist - misc.x) / (misc.y - misc.x), 0.0, 1.0);
	// PRESENCE = coverage × composition fade (ADR-0035). Planes overwrite
	// (alpha = depth), so a partially-present pixel synthesizes what's behind
	// it: intersect the view ray with the backdrop plane, sample/shade it the
	// way the backdrop pass would, and mix colour AND depth toward it — the
	// DOF then blurs the revealed content at its true depth. presence 0
	// discards to the real backdrop.
	let fade = layout.$.plane.eye.w;
	let presence = coverage * fade;
	if (misc.w > 0.5 && presence < 0.999) {
		if (presence < 0.003) { discard; }
		let eyePos = layout.$.plane.eye.xyz;
		let frag = vec3f(in.world, layout.$.plane.world.z);
		let dir = frag - eyePos;
		let bg = layout.$.plane.bgPlane;
		let t = (bg.z - eyePos.z) / min(dir.z, -1e-4);
		let hit = eyePos + dir * t;
		let bgUv = vec2f((hit.x / bg.x + 1.0) * 0.5, 1.0 - (hit.y / bg.y + 1.0) * 0.5);
		var bgColor = layout.$.plane.baseColor.rgb;
		if (bg.w > 0.5) {
			bgColor = textureSampleLevel(
				layout.$.bgTex, layout.$.samp, clamp(bgUv, vec2f(0.0), vec2f(1.0)), 0.0
			).rgb;
			// the same centre darken the backdrop plane applies (baseColor.a)
			let dvF = (bgUv - vec2f(0.5)) * vec2f(1.0, 1.7);
			let darkenF = (1.0 - smoothstep(0.3, 1.15, length(dvF))) * layout.$.plane.baseColor.a;
			bgColor = bgColor * (1.0 - darkenF);
		}
		// carry the scene rake onto the reconstruction so the reveal matches
		// the real backdrop behind it
		let lightF = layout.$.plane.light;
		if (lightF.w > 0.001) {
			let towardsF = normalize(vec2f(-lightF.x, -lightF.y + 1e-4));
			let rakeF = dot(hit.xy / max(max(bg.x, bg.y), 1e-4), towardsF);
			bgColor = bgColor * (1.0 + rakeF * lightF.w * 0.22);
		}
		let bgDepth01 = clamp((length(hit - eyePos) - misc.x) / (misc.y - misc.x), 0.0, 1.0);
		color = mix(bgColor, color, presence);
		// Depth takes the DOMINANT contributor, not the colour mix: a
		// presence-interpolated depth lands fictitious values between the
		// planes, and wherever that crosses the focal depth the pixel reads
		// "in focus" — the compose then re-injects SHARP pixels along the
		// contour inside an otherwise defocused glyph (dark contour dots).
		// The window sits LOW (0.05–0.3): thin sub-pixel-coverage geometry (a
		// 2px accent rule ≈ 0.3 coverage) must keep ITS OWN plane's depth, or
		// the DOF blurs it at the backdrop's focal state and smears it away.
		depth01 = mix(bgDepth01, depth01, smoothstep(0.05, 0.3, presence));
	}
	return vec4f(color, depth01);
}`.$uses({ layout: planeLayout });

const fullVertexFn = tgpu['~unstable'].vertexFn({
	in: { vertexIndex: d.builtin.vertexIndex },
	out: { position: d.builtin.position, uv: d.vec2f }
}) /* wgsl */ `{
	var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
	var u = array<vec2f, 3>(vec2f(0.0, 1.0), vec2f(2.0, 1.0), vec2f(0.0, -1.0));
	return Out(vec4f(p[in.vertexIndex], 0.0, 1.0), u[in.vertexIndex]);
}`;

// Mip-downsample, building the prefiltered pyramid the DOF gather reads from.
// The FIRST reduction (mip 0 → 1) is CoC-WEIGHTED: each texel enters the
// pyramid premultiplied by how defocused it is (weight in alpha), so sharp
// in-focus content never contaminates the blur mips — the fix for the halo an
// in-focus subject otherwise wears against a defocused backdrop (mip texels
// near the silhouette used to average subject light into the backdrop's blur).
// Deeper levels box-filter the premultiplied data; the gather un-premultiplies.
const downLayout = tgpu.bindGroupLayout({
	src: { texture: d.texture2d(d.f32) },
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
		let coc = aperture * max(0.0, abs(s.a - focus) - band) * maxCoc;
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
// between our sparse golden-angle taps (the grain fix); depth always at LOD 0.
// scatter-as-gather weighting (a tap lights the centre only if the centre is
// within the tap's own CoC) keeps sharp foreground from bleeding.
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
	let center = textureSampleLevel(layout.$.scene, layout.$.samp, in.uv, 0.0);
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
	let cocOwn = aperture * max(0.0, abs(center.a - focus) - band) * maxCoc;
	var cocC = cocOwn;
	{
		let e = texel * 2.0;
		let dxp = textureSampleLevel(layout.$.scene, layout.$.samp, in.uv + vec2f(e.x, 0.0), 0.0).a;
		let dxn = textureSampleLevel(layout.$.scene, layout.$.samp, in.uv - vec2f(e.x, 0.0), 0.0).a;
		let dyp = textureSampleLevel(layout.$.scene, layout.$.samp, in.uv + vec2f(0.0, e.y), 0.0).a;
		let dyn = textureSampleLevel(layout.$.scene, layout.$.samp, in.uv - vec2f(0.0, e.y), 0.0).a;
		var avg = cocOwn;
		avg = avg + aperture * max(0.0, abs(dxp - focus) - band) * maxCoc;
		avg = avg + aperture * max(0.0, abs(dxn - focus) - band) * maxCoc;
		avg = avg + aperture * max(0.0, abs(dyp - focus) - band) * maxCoc;
		avg = avg + aperture * max(0.0, abs(dyn - focus) - band) * maxCoc;
		cocC = avg * 0.2;
	}
	// LOD for colour taps — CONTINUOUS, always >= 1: levels >= 1 hold the
	// CoC-WEIGHTED pyramid (premultiplied by defocus weight; see the downsample
	// passes — level 0's alpha is DEPTH, not weight). The gather NEVER needs
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
		let tapDepth = textureSampleLevel(layout.$.scene, layout.$.samp, tapUV, 0.0).a;
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
		let nearer = step(tapDepth + 0.02, center.a);
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
	var col = center.rgb;
	if (aperture > 0.001) {
		let dof = textureSampleLevel(layout.$.dofHalf, layout.$.samp, in.uv, 0.0);
		let cocC = aperture * max(0.0, abs(center.a - focus) - band) * maxCoc;
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
		let onNearest = step(center.a, layout.$.uniforms.depths.x + 0.03);
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

const smootherstep = (t: number): number => {
	const x = Math.min(1, Math.max(0, t));
	return x * x * x * (x * (x * 6 - 15) + 10);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface DepthStageOptions {
	host: GpuHost;
	width: number;
	height: number;
}

export interface DepthStageInput {
	/** The Surface pipeline's premultiplied composition output (surface-only while
	 *  the Composition plane-split is on). Placed on the near plane. */
	surfacePlaneView: GPUTextureView;
	/** In-focus depth (ADR-0021 scalar): 0 ⇒ the Surface plane sharp, 1 ⇒ backdrop. */
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
	cameraMove: 'static' | 'push' | 'drift';
	/** Camera move strength, 0..1. */
	cameraAmount: number;
	/** Scene key light — the Pack's `light-treatment` Role (appearance) realized
	 *  as a real light: received rake on every plane + cast plane-to-plane
	 *  shadow. Absent ⇒ unlit, pixel-identical to the pre-light stage. */
	light?: { direction: LightDirection; intensity: number } | null;
	/** Composition-owned surface opacity (ADR-0035) for surfaces whose fade
	 *  carrier (an environment shaderPass) is skipped on the stage. The plane
	 *  fades by reconstructing the backdrop along the view ray; its cast
	 *  shadow fades with it. 1 = no fade. */
	surfaceFadeAlpha?: number;
	/** Clip progress 0..1 — drives the camera move + focus. Frame-deterministic. */
	time: number;
}

export class DepthStage {
	#width: number;
	#height: number;
	#sceneTexture: GPUTexture;
	#dofHalfTexture: GPUTexture;
	#outputTexture: GPUTexture;
	#render: (input: DepthStageInput) => void;

	constructor({ host, width, height }: DepthStageOptions) {
		this.#width = width;
		this.#height = height;
		const { device, root } = host;
		const unstable = root['~unstable'];

		const mipLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;
		const maxCoc = Math.round((REF_COC * Math.min(width, height)) / 1080);

		this.#sceneTexture = device.createTexture({
			size: [width, height, 1],
			format: INTERMEDIATE_FORMAT,
			mipLevelCount: mipLevels,
			usage: SCENE_TEXTURE_USAGE
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
		const sceneView = this.#sceneTexture.createView();
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

		const PLANE_REST = {
			world: d.vec4f(1, 1, 0, 0),
			light: d.vec4f(0, 0, -1, 0),
			casterA: d.vec4f(1, 1, 0, 0),
			casterB: d.vec4f(1, 1, 0, 0),
			eye: d.vec4f(0, 0, CAM_Z, 1),
			bgPlane: d.vec4f(1, 1, 0, 0)
		};
		const backdropPlane = root
			.createBuffer(PlaneUniforms, {
				mvp: d.mat4x4f(),
				misc: d.vec4f(D_NEAR, D_FAR, 0, 0),
				baseColor: d.vec4f(0.16, 0.14, 0.13, 1),
				...PLANE_REST
			})
			.$usage('uniform');
		const surfacePlane = root
			.createBuffer(PlaneUniforms, {
				mvp: d.mat4x4f(),
				misc: d.vec4f(D_NEAR, D_FAR, 1, 1),
				baseColor: d.vec4f(0, 0, 0, 1),
				...PLANE_REST
			})
			.$usage('uniform');
		const overlayPlane = root
			.createBuffer(PlaneUniforms, {
				mvp: d.mat4x4f(),
				misc: d.vec4f(D_NEAR, D_FAR, 1, 1),
				baseColor: d.vec4f(0, 0, 0, 1),
				...PLANE_REST
			})
			.$usage('uniform');
		const dofUniform = root
			.createBuffer(DofUniforms, {
				params: d.vec4f(0, 0, maxCoc, 0),
				resolution: d.vec2f(width, height),
				depths: d.vec4f(0, 0, 0, 0)
			})
			.$usage('uniform');

		const planePipeline = unstable
			.withVertex(planeVertexFn, {})
			.withFragment(planeFragmentFn, { format: INTERMEDIATE_FORMAT })
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
			root.createBindGroup(downLayout, { src: mipViews[k], samp: sampler, uniforms: dofUniform })
		);
		const dofBind = root.createBindGroup(dofLayout, {
			scene: sceneView,
			samp: sampler,
			uniforms: dofUniform
		});
		const composeBind = root.createBindGroup(composeLayout, {
			scene: sceneView,
			dofHalf: dofHalfView,
			samp: sampler,
			uniforms: dofUniform
		});

		const aspect = width / height;
		const projection = mat4.perspective(FOV, aspect, 0.1, 100);
		// Each plane fills the frame at its own distance: half-height = the frustum
		// half-height there, half-width = that × aspect. Authored content lands at its
		// composed size; the camera move shifts near/far planes at different rates.
		const fillScale = (dist: number): [number, number, number] => {
			const halfH = Math.tan(FOV / 2) * dist;
			return [halfH * aspect, halfH, 1];
		};
		const surfaceFill = fillScale(CAM_Z);
		const surfaceModel = mat4.scale(mat4.identity(), surfaceFill);
		// Oversize the backdrop (cover): a camera move changes each plane's framing,
		// and a backdrop sized to EXACTLY fill at the construction distance reveals
		// black edges when the camera pulls back. 1.2× keeps the photo full-bleed
		// across the move (we just see slightly less of its edges — background-cover).
		const BACKDROP_COVER = 1.2;
		const backdropFill = fillScale(CAM_Z + BACKDROP_DEPTH);
		const backdropModel = mat4.scale(mat4.translate(mat4.identity(), [0, 0, -BACKDROP_DEPTH]), [
			backdropFill[0] * BACKDROP_COVER,
			backdropFill[1] * BACKDROP_COVER,
			1
		]);
		// Plane depths used for the focus target. They MUST be computed per frame
		// from the live eye position: the camera move changes each plane's
		// camera-space distance, so a focus pinned to the construction-time
		// distance drifts off the plane during a push — defocusing (and blooming)
		// content that should stay sharp. `focusDepth01(dist)` reuses the same
		// dist→depth01 mapping the plane fragment encodes.
		const focusDepth01 = (dist: number): number => (dist - D_NEAR) / (D_FAR - D_NEAR);

		this.#render = (input) => {
			const e = smootherstep(input.time);
			const amt = input.cameraAmount;
			let eyeX = 0;
			let eyeZ = CAM_Z;
			if (input.cameraMove === 'push') {
				eyeZ = CAM_Z + 0.55 * amt * (1 - e); // start pulled back, dolly in
			} else if (input.cameraMove === 'drift') {
				eyeX = mix(-0.18, 0.14, e) * amt; // lateral parallax sweep
			}
			const vp = mat4.multiply(projection, mat4.lookAt([eyeX, 0, eyeZ], [0, 0, 0], [0, 1, 0]));
			// The scene key light (Pack light-treatment Role): a unit travel vector +
			// intensity, shared by every plane. No light ⇒ intensity 0, and the plane
			// shader skips both the rake and the shadow march entirely.
			const lightDir = input.light ? LIGHT_VECTORS[input.light.direction] : null;
			const lightIntensity = lightDir
				? Math.min(1, Math.max(0, input.light?.intensity ?? 0))
				: 0;
			const lightVec = d.vec4f(
				lightDir?.[0] ?? 0,
				lightDir?.[1] ?? 0,
				lightDir?.[2] ?? -1,
				lightIntensity
			);
			const shadowStrength = lightIntensity * SHADOW_STRENGTH;
			const noCaster = d.vec4f(1, 1, 0, 0);
			// Composition-owned surface fade — the plane reconstructs the backdrop
			// as it fades (see the fragment), and its cast shadow fades with it (a
			// lingering silhouette under a faded surface reads as a ghost).
			const fade = Math.min(1, Math.max(0, input.surfaceFadeAlpha ?? 1));
			// Overlay plane (overlay-at-depth): sits `overlayZ` of the way from the
			// Surface plane to the backdrop, sized to fill the frame at its own rest
			// distance so authored content lands at its composed size — the camera
			// move then reprojects it at its own rate (real parallax) and the DOF
			// defocuses it by its own depth.
			const overlayDepth = Math.min(1, Math.max(0, input.overlayZ ?? 0.7)) * BACKDROP_DEPTH;
			const overlayFill = fillScale(CAM_Z + overlayDepth);
			const surfaceCaster = d.vec4f(surfaceFill[0], surfaceFill[1], 0, shadowStrength * fade);
			const overlayCaster = input.overlayPlaneView
				? d.vec4f(overlayFill[0], overlayFill[1], -overlayDepth, shadowStrength)
				: noCaster;
			// A backdrop image textures the far plane (misc.z = textured); it's opaque,
			// so misc.w = 0 (never discard, unlike the Surface plane's transparent
			// surround). With no image the plane stays a solid colour (misc.z = 0).
			const backdropTextured = input.backdropTextureView ? 1 : 0;
			const bgPlaneVec = d.vec4f(
				backdropFill[0] * BACKDROP_COVER,
				backdropFill[1] * BACKDROP_COVER,
				-BACKDROP_DEPTH,
				backdropTextured
			);
			// The backdrop's colour + darken, shared by the backdrop plane itself
			// and by fading planes reconstructing it (baseColor.a = darken strength
			// on a textured backdrop, 1 = solid-colour marker otherwise).
			const backdropBase = d.vec4f(
				input.backdropColor[0],
				input.backdropColor[1],
				input.backdropColor[2],
				backdropTextured > 0 ? (input.backdropContrast ?? 0) : 1
			);
			backdropPlane.write({
				mvp: toMat4(mat4.multiply(vp, backdropModel) as Float32Array),
				misc: d.vec4f(D_NEAR, D_FAR, backdropTextured, 0),
				baseColor: backdropBase,
				world: bgPlaneVec,
				light: lightVec,
				casterA: surfaceCaster,
				casterB: overlayCaster,
				eye: d.vec4f(eyeX, 0, eyeZ, 1),
				bgPlane: bgPlaneVec
			});
			surfacePlane.write({
				mvp: toMat4(mat4.multiply(vp, surfaceModel) as Float32Array),
				misc: d.vec4f(D_NEAR, D_FAR, 1, 1),
				baseColor: backdropBase,
				world: d.vec4f(surfaceFill[0], surfaceFill[1], 0, 0),
				light: lightVec,
				casterA: noCaster,
				casterB: noCaster,
				eye: d.vec4f(eyeX, 0, eyeZ, fade),
				bgPlane: bgPlaneVec
			});
			if (input.overlayPlaneView) {
				const overlayModel = mat4.scale(
					mat4.translate(mat4.identity(), [0, 0, -overlayDepth]),
					overlayFill
				);
				overlayPlane.write({
					mvp: toMat4(mat4.multiply(vp, overlayModel) as Float32Array),
					misc: d.vec4f(D_NEAR, D_FAR, 1, 1),
					baseColor: backdropBase,
					world: d.vec4f(overlayFill[0], overlayFill[1], -overlayDepth, 0),
					light: lightVec,
					// The Surface (nearer, when the overlay sits behind it) casts onto
					// the Overlay plane — the card shadowing the lower-third it overlaps.
					casterA: overlayDepth > 0 ? surfaceCaster : noCaster,
					casterB: noCaster,
					eye: d.vec4f(eyeX, 0, eyeZ, 1),
					bgPlane: bgPlaneVec
				});
			}
			// Live plane distances along the view (camera at [eyeX,0,eyeZ] → origin),
			// so focusZ=0 keeps the Surface plane sharp through the whole camera move.
			const surfaceDist = Math.hypot(eyeX, eyeZ);
			const backdropDist = Math.hypot(eyeX, eyeZ + BACKDROP_DEPTH);
			const focus = mix(focusDepth01(surfaceDist), focusDepth01(backdropDist), input.focusZ);
			dofUniform.write({
				params: d.vec4f(focus, input.aperture, maxCoc, input.focusBand ?? 0),
				resolution: d.vec2f(width, height),
				// The frontmost plane's live depth (the Surface plane is nearest).
				depths: d.vec4f(focusDepth01(surfaceDist), 0, 0, 0)
			});

			// Bind groups that reference the per-call Surface plane view. The backdrop
			// binds its image substrate when present (sampled via the `textured`
			// branch); otherwise it binds the Surface view as an unused placeholder
			// (the layout requires a texture, but misc.z = 0 ignores it).
			const bgTexView = input.backdropTextureView ?? input.surfacePlaneView;
			const backdropBind = root.createBindGroup(planeLayout, {
				surfaceTexture: bgTexView,
				casterTexA: input.surfacePlaneView,
				casterTexB: input.overlayPlaneView ?? input.surfacePlaneView,
				bgTex: bgTexView,
				samp: sampler,
				plane: backdropPlane
			});
			const surfaceBind = root.createBindGroup(planeLayout, {
				surfaceTexture: input.surfacePlaneView,
				casterTexA: input.surfacePlaneView,
				casterTexB: input.surfacePlaneView,
				bgTex: bgTexView,
				samp: sampler,
				plane: surfacePlane
			});
			const overlayBind = input.overlayPlaneView
				? root.createBindGroup(planeLayout, {
						surfaceTexture: input.overlayPlaneView,
						casterTexA: input.surfacePlaneView,
						casterTexB: input.surfacePlaneView,
						bgTex: bgTexView,
						samp: sampler,
						plane: overlayPlane
					})
				: null;

			// Painter's order, far → near: backdrop, then the Overlay plane when it
			// sits behind the Surface (overlayZ > 0), then the Surface. An overlay AT
			// the Surface's depth (overlayZ = 0) draws after it, preserving the flat
			// path's Layer stacking (Overlay over Surface).
			planePipeline
				.with(backdropBind)
				.withColorAttachment({
					view: mipViews[0],
					clearValue: [0, 0, 0, 1],
					loadOp: 'clear',
					storeOp: 'store'
				})
				.draw(6);
			if (overlayBind && overlayDepth > 0) {
				planePipeline
					.with(overlayBind)
					.withColorAttachment({ view: mipViews[0], loadOp: 'load', storeOp: 'store' })
					.draw(6);
			}
			planePipeline
				.with(surfaceBind)
				.withColorAttachment({ view: mipViews[0], loadOp: 'load', storeOp: 'store' })
				.draw(6);
			if (overlayBind && overlayDepth <= 0) {
				planePipeline
					.with(overlayBind)
					.withColorAttachment({ view: mipViews[0], loadOp: 'load', storeOp: 'store' })
					.draw(6);
			}

			// Prefiltered pyramid + half-res gather — only when there's defocus to
			// gather. With aperture ~0 the compose pass passes the sharp scene
			// through untouched (it never reads the gather), so skipping both is
			// free correctness AND the perf gate that keeps flat/degenerate-stage
			// pieces (the unify case) from paying the pyramid + gather cost.
			if (input.aperture > 0.001) {
				for (let i = 1; i < mipLevels; i += 1) {
					// Level 1 applies the CoC weighting (reads depth from mip 0's
					// alpha); deeper levels box-filter the premultiplied data.
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
		this.#dofHalfTexture.destroy();
		this.#outputTexture.destroy();
	}
}
