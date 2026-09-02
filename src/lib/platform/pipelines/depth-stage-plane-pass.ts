import tgpu, { d } from 'typegpu';

import { screenLightWgsl, STAGE_SCREEN_LIGHT_LAYOUT_ENTRIES, STAGE_SCREEN_LIGHT_UNIFORM_FIELDS } from './depth-stage-screen-light';
import {
	allCasterShadowsWgsl,
	shadowMapOcclusionWgsl,
	STAGE_CASTER_LAYOUT_ENTRIES,
	STAGE_CASTER_UNIFORM_FIELDS,
	STAGE_SHADOW_MAP_LAYOUT_ENTRIES,
	STAGE_SHADOW_MAP_UNIFORM_FIELDS
} from './depth-stage-shadow';

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
// this basis; posed Overlay planes ride the same passes, Pipeline bodies
// (ADR-0051 phase 2, `depth-stage-body-pass.ts`) join them in the same
// depth-tested targets and throw shadow onto them through the shadow map, and
// a screen's GLASS (ADR-0059) is the Surface plane drawn as a domed grid with
// the tube's own optics — the `crt-tube` Effect's beam raster, phosphor mask,
// halation, and vignette, fixed to the glass so they magnify with it.

export const STAGE_DEPTH_SIDECAR_FORMAT: GPUTextureFormat = 'r16float';
export const STAGE_DEPTH_ATTACHMENT_FORMAT: GPUTextureFormat = 'depth24plus';
/** Presence at or above which a texel owns its pixel (writes depth). Sits low
 *  so px-thin geometry at partial coverage (a 2px rule ≈ 0.3) keeps its own
 *  plane's depth instead of taking the backdrop's and blurring away. */
export const STAGE_PLANE_OPAQUE_PRESENCE = 0.3;
const SKIRT_PRESENCE_FLOOR = 0.003;
/** The glass grid: enough quads that the dome's silhouette and highlight read smooth. */
export const STAGE_GLASS_GRID_COLUMNS = 48;
export const STAGE_GLASS_GRID_ROWS = 27;
export const STAGE_GLASS_VERTEX_COUNT = STAGE_GLASS_GRID_COLUMNS * STAGE_GLASS_GRID_ROWS * 6;
/** The glass's diffuse reflectance: what keeps a dark tube from resolving to a hole. */
const GLASS_HAZE = 0.012;
/** The phosphor's exposure: a white page reads bright on a tube, never a blown white. */
const GLASS_EXPOSURE = 0.88;
/** The key's reflection on the domed glass. */
const GLASS_KEY_REFLECTION = 0.18;
const GLASS_KEY_POWER = 48.0;

/**
 * One plane's uniforms. `origin.w` = textured (1) or solid colour (0);
 * `axisU.w` = discard-transparent (a captured Layer with a transparent
 * surround) or opaque (the backdrop); `axisV.w` = the composition-owned fade
 * that multiplies presence; `normal.w` = centre-darken strength for a textured
 * backdrop; `misc` = (depthNear, depthFar, halfW, halfH); `light` = the key's
 * unit travel vector + intensity; `uvWindow` = the capture rect (x, y, w, h)
 * the quad shows — the whole capture for every plane but a screen's glass,
 * which crops the composition to its opening. A glass carries its tube optics:
 * `glass` = (isGlass, dome height in world units, glass pixels across, glass
 * pixels down), `optics` = (curvature, vignette, mask pitch px, mask
 * strength), `optics2` = (raster lines, beam focus, halation, mask mode). The
 * caster slots, the shadow-map fields, and the screen-light fields are the
 * shared receiver vocabulary in `depth-stage-shadow.ts` and
 * `depth-stage-screen-light.ts`.
 */
export const StagePlaneUniforms = d.struct({
	mvp: d.mat4x4f,
	/** The camera alone (world → clip), for vertices the quad's model matrix cannot place. */
	viewProjection: d.mat4x4f,
	origin: d.vec4f,
	axisU: d.vec4f,
	axisV: d.vec4f,
	normal: d.vec4f,
	misc: d.vec4f,
	baseColor: d.vec4f,
	light: d.vec4f,
	uvWindow: d.vec4f,
	glass: d.vec4f,
	optics: d.vec4f,
	optics2: d.vec4f,
	camera: d.vec4f,
	...STAGE_SCREEN_LIGHT_UNIFORM_FIELDS,
	...STAGE_SHADOW_MAP_UNIFORM_FIELDS,
	...STAGE_CASTER_UNIFORM_FIELDS
});

export const stagePlaneLayout = tgpu.bindGroupLayout({
	planeTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	plane: { uniform: StagePlaneUniforms },
	...STAGE_SCREEN_LIGHT_LAYOUT_ENTRIES,
	...STAGE_SHADOW_MAP_LAYOUT_ENTRIES,
	...STAGE_CASTER_LAYOUT_ENTRIES
});

const planeVertexOut = {
	position: d.builtin.position,
	uv: d.vec2f,
	dist: d.f32,
	world: d.vec3f,
	local: d.vec2f,
	normal: d.vec3f
};

// The unit quad on its basis: clip position, capture uv, camera-space distance
// (clip.w, the depth01 source), the fragment's world position (for the shadow
// march), its plane-local position in world units (for the rake), and the
// plane normal.
export const stagePlaneVertexFn = tgpu['~unstable'].vertexFn({
	in: { vertexIndex: d.builtin.vertexIndex },
	out: planeVertexOut
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
	return Out(clip, uv[in.vertexIndex], clip.w, world, local, plane.normal.xyz);
}`.$uses({ layout: stagePlaneLayout });

// The glass as a domed grid: each vertex of the quad lattice rises toward the
// camera by the dome height at the centre and nothing at the rim — gentler
// across the width than the height, the way a widescreen tube is — with the
// dome's analytic normal, so the key reflects off it as off real glass.
export const stageGlassVertexFn = tgpu['~unstable'].vertexFn({
	in: { vertexIndex: d.builtin.vertexIndex },
	out: planeVertexOut
}) /* wgsl */ `{
	let quad = in.vertexIndex / 6u;
	let corner = in.vertexIndex % 6u;
	let column = quad % ${STAGE_GLASS_GRID_COLUMNS}u;
	let row = quad / ${STAGE_GLASS_GRID_COLUMNS}u;
	var cornerOffset = array<vec2u, 6>(
		vec2u(0u, 0u), vec2u(1u, 0u), vec2u(1u, 1u),
		vec2u(0u, 0u), vec2u(1u, 1u), vec2u(0u, 1u)
	);
	let cell = cornerOffset[corner];
	let gridUv = vec2f(f32(column + cell.x), f32(row + cell.y))
		/ vec2f(${STAGE_GLASS_GRID_COLUMNS}.0, ${STAGE_GLASS_GRID_ROWS}.0);
	let p = vec2f(gridUv.x * 2.0 - 1.0, gridUv.y * 2.0 - 1.0);
	let plane = layout.$.plane;
	let dome = plane.glass.y;
	let r2 = min(1.0, p.x * p.x * 0.7 + p.y * p.y);
	let rise = dome * (1.0 - r2);
	let world = plane.origin.xyz + p.x * plane.axisU.xyz + p.y * plane.axisV.xyz + plane.normal.xyz * rise;
	// Tangents of the dome in world units, then the normal.
	let uHat = plane.axisU.xyz / max(plane.misc.z, 1e-4);
	let vHat = plane.axisV.xyz / max(plane.misc.w, 1e-4);
	let dzdx = -1.4 * dome * p.x / max(plane.misc.z, 1e-4);
	let dzdy = -2.0 * dome * p.y / max(plane.misc.w, 1e-4);
	let tangentU = uHat + plane.normal.xyz * dzdx;
	let tangentV = vHat + plane.normal.xyz * dzdy;
	let normal = normalize(cross(tangentU, tangentV));
	// The dome moves the vertex along the normal in world space, so the risen
	// world point projects through the camera directly.
	let clip = plane.viewProjection * vec4f(world, 1.0);
	let uv = vec2f(gridUv.x, 1.0 - gridUv.y);
	let local = p * plane.misc.zw;
	return Out(clip, uv, clip.w, world, local, normal);
}`.$uses({ layout: stagePlaneLayout });

type StagePlanePassMode = 'opaque' | 'skirt';

const DISCARD_RULE: Record<StagePlanePassMode, string> = {
	// A captured plane's soft texels wait for the skirt pass; the opaque
	// backdrop never discards.
	opaque: `if (plane.axisU.w > 0.5 && presence < ${STAGE_PLANE_OPAQUE_PRESENCE}) { discard; }`,
	skirt: `if (plane.axisU.w < 0.5 || presence >= ${STAGE_PLANE_OPAQUE_PRESENCE} || presence < ${SKIRT_PRESENCE_FLOOR}) { discard; }`
};

// The tube optics on the glass: the `crt-tube` Effect's physics, sampled in
// the glass's own pixels so the raster and mask are fixed to the phosphor and
// magnify with the camera. A structure finer than the frame can resolve fades
// out instead of aliasing into moiré — the lens sees a continuous phosphor
// field from a distance and the grille only as it comes close. Outside the
// barrel-warped raster the glass is dark; the picture's coverage is the beam's.
const GLASS_OPTICS = /* wgsl */ `
	let glassPx = plane.glass.zw;
	let glassAspect = glassPx.x / max(glassPx.y, 1.0);
	let refScale = min(glassPx.x, glassPx.y) / 2160.0;
	// Glass pixels per frame pixel at this fragment (derivatives taken above,
	// outside any branch).
	let framePxPerGlassPx = 1.0 / max(max(glassPxPerFramePx.x, glassPxPerFramePx.y), 1e-4);
	let cN = (in.uv - vec2f(0.5)) * vec2f(glassAspect, 1.0);
	let r2 = dot(cN, cN);
	let rc2 = 0.25 * (glassAspect * glassAspect + 1.0);
	let kCurv = plane.optics.x * 0.42;
	let warp = (1.0 + kCurv * r2) / (1.0 + kCurv * rc2);
	let cW = cN * warp;
	let uvW = cW / vec2f(glassAspect, 1.0) + vec2f(0.5);
	let inside = step(0.0, uvW.x) * step(uvW.x, 1.0) * step(0.0, uvW.y) * step(uvW.y, 1.0);
	let linesN = max(plane.optics2.x, 8.0);
	let lfp = uvW.y * linesN;
	let kA = floor(lfp - 0.5) + 0.5;
	let kB = kA + 1.0;
	let vA = kA / linesN;
	let vB = kB / linesN;
	let captureA = plane.uvWindow.xy + vec2f(uvW.x, vA) * plane.uvWindow.zw;
	let captureB = plane.uvWindow.xy + vec2f(uvW.x, vB) * plane.uvWindow.zw;
	let cA = textureSampleLevel(layout.$.planeTexture, layout.$.samp, captureA, 0.0);
	let cB = textureSampleLevel(layout.$.planeTexture, layout.$.samp, captureB, 0.0);
	let lumaW3 = vec3f(0.2126, 0.7152, 0.0722);
	let sigma0 = mix(0.24, 0.85, plane.optics2.y);
	let sigA = sigma0 * (1.0 + 0.65 * dot(cA.rgb, lumaW3));
	let sigB = sigma0 * (1.0 + 0.65 * dot(cB.rgb, lumaW3));
	let dA = (lfp - kA) / sigA;
	let dB = (lfp - kB) / sigB;
	let wA = exp(-0.5 * dA * dA);
	let wB = exp(-0.5 * dB * dB);
	let nrm = 1.0 + exp(-0.5 / (sigma0 * sigma0));
	let beamDenom = max(wA + wB, nrm);
	var beamPicture = (cA.rgb * wA + cB.rgb * wB) / beamDenom;
	var beam = (cA.a * wA + cB.a * wB) / beamDenom;
	// The raster reads only once a line spans a couple of frame pixels.
	let captureUvW = plane.uvWindow.xy + uvW * plane.uvWindow.zw;
	let plain = textureSampleLevel(layout.$.planeTexture, layout.$.samp, captureUvW, 0.0);
	let framePxPerLine = (glassPx.y / linesN) * framePxPerGlassPx;
	let rasterVisible = smoothstep(1.6, 3.2, framePxPerLine);
	var picture = mix(plain.rgb, beamPicture, rasterVisible);
	beam = mix(plain.a, beam, rasterVisible);
	// The phosphor mask is drawn in FRAME pixels, as the tube Effect draws it:
	// a structure finer than the frame's own raster can only alias, so the
	// grille is the one the lens resolves, uniform across the frame, never a
	// beat against the pixel grid through the barrel warp.
	let framePx = glassPx / max(plane.uvWindow.zw, vec2f(1e-4));
	let frameRefScale = min(framePx.x, framePx.y) / 2160.0;
	let pitch = max(plane.optics.z * frameRefScale, 3.0);
	let pxW = in.position.xy;
	var maskRGB = vec3f(1.0);
	var maskMean = 1.0;
	let mode = plane.optics2.w;
	if (mode > 1.5) {
		let t = fract(pxW.x / pitch) * 3.0;
		maskRGB = vec3f(
			1.0 - smoothstep(0.42, 0.62, abs(((t - 0.5 + 4.5) % 3.0) - 1.5)),
			1.0 - smoothstep(0.42, 0.62, abs(((t - 1.5 + 4.5) % 3.0) - 1.5)),
			1.0 - smoothstep(0.42, 0.62, abs(((t - 2.5 + 4.5) % 3.0) - 1.5)));
		maskMean = 0.347;
	} else if (mode > 0.5) {
		let rowH = pitch * 0.866;
		let rowIdx = floor(pxW.y / rowH);
		let xOff = (rowIdx % 2.0) * 0.5 * pitch;
		let t = fract((pxW.x + xOff) / pitch) * 3.0;
		let dotW = 1.0 - smoothstep(0.30, 0.50, abs(fract(pxW.y / rowH) - 0.5));
		maskRGB = vec3f(
			1.0 - smoothstep(0.42, 0.62, abs(((t - 0.5 + 4.5) % 3.0) - 1.5)),
			1.0 - smoothstep(0.42, 0.62, abs(((t - 1.5 + 4.5) % 3.0) - 1.5)),
			1.0 - smoothstep(0.42, 0.62, abs(((t - 2.5 + 4.5) % 3.0) - 1.5))) * dotW;
		maskMean = 0.277;
	} else {
		let t = fract(pxW.x / pitch) * 3.0;
		let colIdx = floor(pxW.x / pitch);
		let slotH = pitch * 2.0;
		let g = fract((pxW.y + (colIdx % 2.0) * 0.5 * slotH) / slotH);
		let slotW = smoothstep(0.0, 0.09, g) * (1.0 - smoothstep(0.91, 1.0, g));
		maskRGB = vec3f(
			1.0 - smoothstep(0.42, 0.62, abs(((t - 0.5 + 4.5) % 3.0) - 1.5)),
			1.0 - smoothstep(0.42, 0.62, abs(((t - 1.5 + 4.5) % 3.0) - 1.5)),
			1.0 - smoothstep(0.42, 0.62, abs(((t - 2.5 + 4.5) % 3.0) - 1.5))) * slotW;
		maskMean = 0.316;
	}
	picture = picture * mix(vec3f(1.0), maskRGB / maskMean, plane.optics.w);
	var hal = vec3f(0.0);
	var halNorm = 0.0;
	let rHal = vec2f(14.0 * refScale) / glassPx;
	for (var i = 0; i < 24; i = i + 1) {
		let ring = f32(i / 8);
		let ang = ((f32(i) + 0.5 * ring) / 8.0) * 6.2831853;
		let off = vec2f(cos(ang), sin(ang)) * rHal * (1.0 + 0.7 * ring);
		let wRing = 1.0 - 0.3 * ring;
		let tapUv = plane.uvWindow.xy + clamp(uvW + off, vec2f(0.0), vec2f(1.0)) * plane.uvWindow.zw;
		let s = textureSampleLevel(layout.$.planeTexture, layout.$.samp, tapUv, 0.0);
		hal = hal + s.rgb * max(dot(s.rgb, lumaW3) - 0.18, 0.0) * wRing;
		halNorm = halNorm + wRing;
	}
	picture = picture + plane.optics2.z * 0.9 * (hal / max(halNorm, 1.0)) * beam;
	let cent = uvW - vec2f(0.5);
	let vig = 1.0 - plane.optics.y * smoothstep(0.35, 0.85, length(cent) * 1.4142);
	// Un-premultiplied picture over the dark glass, gated to the raster, held
	// under the phosphor's exposure so a white page is bright, not blown.
	color = (picture / max(beam, 0.001)) * vig * inside * beam * ${GLASS_EXPOSURE} + vec3f(${GLASS_HAZE}) * (1.0 - inside * beam);
	coverage = 1.0;
`;

function planeFragmentBody(mode: StagePlanePassMode): string {
	return /* wgsl */ `{
	let plane = layout.$.plane;
	var color = plane.baseColor.rgb;
	var coverage = 1.0;
	let N = normalize(in.normal);
	// Derivatives live outside every branch (WGSL forbids them under
	// non-uniform control flow); the glass optics read them.
	let glassPxPerFramePx = fwidth(in.uv * plane.glass.zw);
	if (plane.glass.x > 0.5) {
		${GLASS_OPTICS}
	} else if (plane.origin.w > 0.5) {
		let captureUv = plane.uvWindow.xy + in.uv * plane.uvWindow.zw;
		let s = textureSample(layout.$.planeTexture, layout.$.samp, captureUv); // premultiplied
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
	//    sample its alpha in a small disc (penumbra grows with the gap), darken;
	//  - body shadow: read the shadow map the bodies rendered (absent bodies
	//    leave its strength at 0, so no read happens);
	//  - the picture: a screen's glass spills its average colour onto the
	//    planes that face it (absent screens leave its glow at 0).
	// intensity 0 skips the key entirely — pixel-identical to the unlit stage.
	let light = plane.light;
	let isGlass = plane.glass.x > 0.5;
	if (light.w > 0.001 && !isGlass) {
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
		${allCasterShadowsWgsl('plane')}
		${shadowMapOcclusionWgsl('plane')}
		color = color * (1.0 - min(shade, 1.0));
	}
	if (!isGlass) {
		let planeAlbedo = color;
		${screenLightWgsl('plane', 'planeAlbedo')}
	}
	if (isGlass && light.w > 0.001) {
		// The key on the dome: a broad soft highlight that slides as the camera moves.
		let L = -normalize(light.xyz);
		let V = normalize(plane.camera.xyz - in.world);
		let H = normalize(L + V);
		let reflection = pow(max(dot(N, H), 0.0), ${GLASS_KEY_POWER}) * ${GLASS_KEY_REFLECTION} * light.w;
		color = color + vec3f(reflection);
	}
	let depth01 = clamp((in.dist - plane.misc.x) / (plane.misc.y - plane.misc.x), 0.0, 1.0);
	return Out(vec4f(color * presence, presence), vec4f(depth01, 0.0, 0.0, 1.0));
}`;
}

const planeFragmentIn = {
	position: d.builtin.position,
	uv: d.vec2f,
	dist: d.f32,
	world: d.vec3f,
	local: d.vec2f,
	normal: d.vec3f
};
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
