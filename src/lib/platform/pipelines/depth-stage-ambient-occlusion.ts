import tgpu, { d } from 'typegpu';

// Ambient obscurance on the depth stage (ADR-0059): what grounds a body. The
// key's shadow map darkens the key; this pass darkens the ROOM — the crease
// where a stand meets its base, the desk under a housing, the page under a
// posed card — from the resolved depth sidecar alone, so every receiver in
// the scene takes it without a second geometry pass. The estimate is a
// screen-space spiral of samples over a world-space radius (McGuire's
// scalable obscurance, with the cosine of each sample to the reconstructed
// normal), smoothed by a depth-aware separable blur, and applied to the
// resolved colour where the sidecar marks a texel occludable: a screen's
// glass is an emitter and takes none.

/** Samples per pixel of the obscurance estimate. */
export const STAGE_OCCLUSION_SAMPLES = 48;
/** Turns of the sample spiral; coprime with the sample count so no two samples share a ray. */
const SPIRAL_TURNS = 7;
/** Cosine bias that keeps a flat surface from occluding itself. */
const OCCLUSION_BIAS = 0.06;
/**
 * How far a tap must rise above its centre, along the normal, before it
 * counts: a pixel and a half of slope, plus the sidecar's own precision. The
 * sidecar stores depth01 as a 16-bit float, whose step at a given depth is
 * about a thousandth of that depth: a face nearly square to the camera reads
 * back as terraces a few pixels wide, and the spiral traced their walls as a
 * hatch across a leaning headline (ADR-0062). A real crease rises by a share
 * of the radius, many steps deep, so it is untouched.
 */
const OCCLUSION_PIXEL_BIAS = 1.5;
/** Two steps of the rg16float sidecar at a given view depth, as a fraction of that depth. */
const OCCLUSION_DEPTH_PRECISION = 2 ** -9;
/** Obscurance gain: how dark a fully creased fragment goes before the power. */
export const STAGE_OCCLUSION_INTENSITY = 5.0;
/** World radius of the obscurance: a step of the Surface plane's height at rest. */
export const STAGE_OCCLUSION_RADIUS = 0.18;
/** Power the smoothed obscurance is raised to before it darkens the room. */
export const STAGE_OCCLUSION_POWER = 1.4;
/** Screen-space reach of the spiral in pixels: enough to read at 4K, bounded near the eye. */
const RADIUS_PX_MIN = 2;
const RADIUS_PX_MAX = 180;
/** Blur taps to each side, and the depth01 gap (scaled) past which a tap is discarded. */
const BLUR_TAPS = 4;
const BLUR_WEIGHTS = [0.2, 0.18, 0.14, 0.09, 0.04] as const;
const BLUR_DEPTH_TOLERANCE = 160;
export const STAGE_OCCLUSION_FORMAT: GPUTextureFormat = 'r8unorm';
export const BYTES_PER_OCCLUSION_TEXEL = 1;

/**
 * `projection` = (tan half-fov x, tan half-fov y, depth near, depth far) —
 * enough to rebuild a view-space position from a sidecar depth; `params` =
 * (world radius, intensity, width, height); `direction` = the blur step in
 * pixels for the pass that blurs.
 */
export const StageOcclusionUniforms = d.struct({
	projection: d.vec4f,
	params: d.vec4f,
	direction: d.vec4f
});

export const stageOcclusionLayout = tgpu.bindGroupLayout({
	depth: { texture: d.texture2d(d.f32) },
	occlusion: { uniform: StageOcclusionUniforms }
});

export const stageOcclusionBlurLayout = tgpu.bindGroupLayout({
	obscurance: { texture: d.texture2d(d.f32) },
	depth: { texture: d.texture2d(d.f32) },
	occlusion: { uniform: StageOcclusionUniforms }
});

export const stageOcclusionApplyLayout = tgpu.bindGroupLayout({
	scene: { texture: d.texture2d(d.f32) },
	obscurance: { texture: d.texture2d(d.f32) },
	depth: { texture: d.texture2d(d.f32) },
	occlusion: { uniform: StageOcclusionUniforms }
});

// A view-space position named `${name}` from the sidecar at pixel `${pixel}`:
// the sidecar's depth01 is the camera-space distance along the line of sight,
// so the position rebuilds from the pixel's frame ray without any matrix.
function viewPositionWgsl(name: string, pixel: string): string {
	return /* wgsl */ `
	let ${name}Coord = clamp(${pixel}, vec2i(0), size - vec2i(1));
	let ${name}Depth = textureLoad(layout.$.depth, ${name}Coord, 0).x;
	let ${name}Dist = u.projection.z + ${name}Depth * (u.projection.w - u.projection.z);
	let ${name}Ndc = (vec2f(${name}Coord) + vec2f(0.5)) / vec2f(size) * 2.0 - vec2f(1.0);
	let ${name} = vec3f(${name}Ndc.x * u.projection.x * ${name}Dist, -${name}Ndc.y * u.projection.y * ${name}Dist, -${name}Dist);`;
}

const occlusionIn = { position: d.builtin.position, uv: d.vec2f };

/** The obscurance estimate: 1 = open, 0 = fully creased. */
export const stageOcclusionFragmentFn = tgpu['~unstable'].fragmentFn({
	in: occlusionIn,
	out: d.vec4f
}) /* wgsl */ `{
	let u = layout.$.occlusion;
	let size = vec2i(i32(u.params.z), i32(u.params.w));
	let px = vec2i(in.position.xy);
	${viewPositionWgsl('P', 'px')}
	${viewPositionWgsl('Pxp', 'px + vec2i(1, 0)')}
	${viewPositionWgsl('Pxn', 'px - vec2i(1, 0)')}
	${viewPositionWgsl('Pyp', 'px + vec2i(0, 1)')}
	${viewPositionWgsl('Pyn', 'px - vec2i(0, 1)')}
	// The normal from the nearer neighbour on each axis, so a silhouette edge
	// never bends it.
	let dx = select(P - Pxn, Pxp - P, abs(Pxp.z - P.z) < abs(P.z - Pxn.z));
	let dy = select(P - Pyn, Pyp - P, abs(Pyp.z - P.z) < abs(P.z - Pyn.z));
	var N = normalize(cross(dx, dy));
	if (dot(N, -P) < 0.0) { N = -N; }
	let radius = u.params.x;
	let pxPerWorld = (f32(size.y) * 0.5 / u.projection.y) / PDist;
	let radiusPx = clamp(radius * pxPerWorld, ${RADIUS_PX_MIN}.0, ${RADIUS_PX_MAX}.0);
	let riseBias = ${OCCLUSION_PIXEL_BIAS} / pxPerWorld + PDist * ${OCCLUSION_DEPTH_PRECISION};
	// Interleaved gradient noise turns the spiral per pixel; the blur evens it.
	let noise = fract(52.9829189 * fract(dot(vec2f(px), vec2f(0.06711056, 0.00583715))));
	let angle0 = noise * 6.2831853;
	var sum = 0.0;
	for (var i: i32 = 0; i < ${STAGE_OCCLUSION_SAMPLES}; i = i + 1) {
		let alpha = (f32(i) + 0.5) / ${STAGE_OCCLUSION_SAMPLES}.0;
		let angle = alpha * ${SPIRAL_TURNS}.0 * 6.2831853 + angle0;
		let reach = radiusPx * alpha;
		let offset = vec2i(vec2f(cos(angle), sin(angle)) * reach);
		${viewPositionWgsl('Q', 'px + offset')}
		let v = Q - P;
		let vv = dot(v, v);
		let vn = dot(v, N);
		let falloff = max(1.0 - vv / (radius * radius), 0.0);
		sum = sum + falloff * falloff * max((vn - riseBias) / sqrt(vv + 1e-6) - ${OCCLUSION_BIAS}, 0.0);
	}
	let obscurance = clamp(1.0 - sum * (u.params.y / ${STAGE_OCCLUSION_SAMPLES}.0), 0.0, 1.0);
	return vec4f(obscurance, 0.0, 0.0, 1.0);
}`.$uses({ layout: stageOcclusionLayout });

// One direction of the depth-aware blur; a tap across a depth step drops out
// so the darkening never bleeds off a silhouette.
function blurWgsl(): string {
	const taps: string[] = [];
	for (let k = 1; k <= BLUR_TAPS; k += 1) {
		for (const sign of [-1, 1]) {
			taps.push(/* wgsl */ `{
		let tapCoord = clamp(px + step * ${sign * k}, vec2i(0), size - vec2i(1));
		let tapDepth = textureLoad(layout.$.depth, tapCoord, 0).x;
		let weight = ${BLUR_WEIGHTS[k]} * max(1.0 - abs(tapDepth - centreDepth) * ${BLUR_DEPTH_TOLERANCE}.0, 0.0);
		total = total + textureLoad(layout.$.obscurance, tapCoord, 0).x * weight;
		weightSum = weightSum + weight;
	}`);
		}
	}
	return /* wgsl */ `
	let u = layout.$.occlusion;
	let size = vec2i(i32(u.params.z), i32(u.params.w));
	let px = vec2i(in.position.xy);
	let step = vec2i(u.direction.xy);
	let centreDepth = textureLoad(layout.$.depth, px, 0).x;
	var total = textureLoad(layout.$.obscurance, px, 0).x * ${BLUR_WEIGHTS[0]};
	var weightSum = ${BLUR_WEIGHTS[0]};
	${taps.join('\n')}
	let blurred = total / max(weightSum, 1e-4);`;
}

/** The first blur direction, back into an obscurance texture. */
export const stageOcclusionBlurFragmentFn = tgpu['~unstable'].fragmentFn({
	in: occlusionIn,
	out: d.vec4f
}) /* wgsl */ `{
	${blurWgsl()}
	return vec4f(blurred, 0.0, 0.0, 1.0);
}`.$uses({ layout: stageOcclusionBlurLayout });

/**
 * The second blur direction, applied: the resolved colour darkened by the
 * obscurance where the sidecar's second channel marks the texel occludable.
 * Premultiplied colour scales as one; presence in alpha is untouched.
 */
export const stageOcclusionApplyFragmentFn = tgpu['~unstable'].fragmentFn({
	in: occlusionIn,
	out: d.vec4f
}) /* wgsl */ `{
	${blurWgsl()}
	let scene = textureLoad(layout.$.scene, px, 0);
	let occludable = textureLoad(layout.$.depth, px, 0).y;
	let darken = mix(1.0, pow(blurred, ${STAGE_OCCLUSION_POWER}), clamp(occludable, 0.0, 1.0));
	return vec4f(scene.rgb * darken, scene.a);
}`.$uses({ layout: stageOcclusionApplyLayout });
