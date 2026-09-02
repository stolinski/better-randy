import tgpu, { d } from 'typegpu';

import { STAGE_BODY_MAX_REGIONS } from './depth-stage-geometry';
import {
	allCasterShadowsWgsl,
	shadowMapOcclusionWgsl,
	STAGE_CASTER_LAYOUT_ENTRIES,
	STAGE_CASTER_UNIFORM_FIELDS,
	STAGE_SCENE_SAMPLE_COUNT,
	STAGE_SHADOW_MAP_LAYOUT_ENTRIES,
	STAGE_SHADOW_MAP_UNIFORM_FIELDS
} from './depth-stage-shadow';

// The depth stage's body pass (ADR-0051 phase 2): a registered mesh drawn into
// the same depth-tested scene as the captured planes, lit by the Pack key as
// a matte object with per-region materials, shadowed by the caster planes
// and the shadow map, and — for a screen body — lit by its own glass, so the
// bezel and chin carry the composition's glow. Alongside it: the shadow-depth
// pass that renders the bodies from the key's direction, and the resolve pass
// that folds the multisampled scene back into the single-sample colour target
// and depth sidecar the DOF reads.

/** Presence below which a body fragment is dropped rather than blended. */
const BODY_PRESENCE_FLOOR = 0.003;
/** The Pack key's intensity (0.45 for the house Pack) scaled into a body key. */
const KEY_GAIN = 2.2;
const KEY_MAX = 1.3;
/** Wrapped Lambert: light reaches a little past the terminator, the way a
 *  matte body in a lit room does. */
const LAMBERT_WRAP = 0.3;
/** Hemisphere fill: brighter facing up, darker facing the floor. */
const FILL_LOW = 0.3;
const FILL_HIGH = 0.46;
const KEY_DIFFUSE = 0.75;
/** A broad, faint sheen that tightens as a region gets smoother — matte, never glossy. */
const SHEEN_POWER_ROUGH = 8.0;
const SHEEN_POWER_SMOOTH = 64.0;
const SHEEN = 0.22;
/** The room the object reflects at a glancing angle: a dark warm ceiling over a black floor. */
const ENVIRONMENT_FLOOR = 0.015;
const ENVIRONMENT_CEILING = 0.07;
/** How much of the glass's average colour spills onto the body at unit glow. */
const SCREEN_LIGHT_GAIN = 2.4;
/** Soft shoulder above which body colour compresses instead of clipping. */
const TONE_SHOULDER = 0.85;

/** Vertex stream of every body mesh: position, normal, material region (tightly packed). */
export const StageBodyVertex = d.unstruct({
	position: d.vec3f,
	normal: d.vec3f,
	region: d.f32
});

export const stageBodyVertexLayout = tgpu.vertexLayout((count) =>
	d.disarrayOf(StageBodyVertex, count)
);

/**
 * One body's uniforms. `materialColor[k]` = (linear rgb, roughness) per
 * region; `light` = the key's unit travel + intensity; `camera` = the eye;
 * `screenOrigin` = (glass centre, glow); `screenU` / `screenV` = the glass
 * half-vectors with their half-lengths in w; `screenNormal` = (unit normal,
 * mip level whose single texel is the glass's average colour); `misc` =
 * (depthNear, depthFar, presence, 0); `shadow` / `shadowViewProjection` and
 * the caster slots as in `depth-stage-shadow.ts`; `shadowMvp` = the light's
 * clip transform of the body for the shadow-depth pass.
 */
export const StageBodyUniforms = d.struct({
	mvp: d.mat4x4f,
	model: d.mat4x4f,
	normalMatrix: d.mat4x4f,
	shadowMvp: d.mat4x4f,
	materialColor: d.arrayOf(d.vec4f, STAGE_BODY_MAX_REGIONS),
	light: d.vec4f,
	camera: d.vec4f,
	screenOrigin: d.vec4f,
	screenU: d.vec4f,
	screenV: d.vec4f,
	screenNormal: d.vec4f,
	misc: d.vec4f,
	...STAGE_SHADOW_MAP_UNIFORM_FIELDS,
	...STAGE_CASTER_UNIFORM_FIELDS
});

export const stageBodyLayout = tgpu.bindGroupLayout({
	body: { uniform: StageBodyUniforms },
	/** The Surface plane's mip chain: its top levels are the glass's average colour. */
	screenTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	...STAGE_SHADOW_MAP_LAYOUT_ENTRIES,
	...STAGE_CASTER_LAYOUT_ENTRIES
});

// Clip position, world position (for both shadow reads and the screen light),
// world normal, camera-space distance (clip.w, the depth01 source), and the
// material region.
export const stageBodyVertexFn = tgpu['~unstable'].vertexFn({
	in: { position: d.vec3f, normal: d.vec3f, region: d.f32 },
	out: {
		position: d.builtin.position,
		world: d.vec3f,
		normal: d.vec3f,
		dist: d.f32,
		region: d.f32
	}
}) /* wgsl */ `{
	let body = layout.$.body;
	let worldPosition = body.model * vec4f(in.position, 1.0);
	let clip = body.mvp * vec4f(in.position, 1.0);
	let worldNormal = normalize((body.normalMatrix * vec4f(in.normal, 0.0)).xyz);
	return Out(clip, worldPosition.xyz, worldNormal, clip.w, in.region);
}`.$uses({ layout: stageBodyLayout });

const bodyFragmentIn = { world: d.vec3f, normal: d.vec3f, dist: d.f32, region: d.f32 };
const bodyFragmentOut = { color: d.location(0, d.vec4f), depth: d.location(1, d.vec4f) };

/**
 * The body's matte material. Albedo and roughness come from the region's
 * material; the Pack key lights it as a wrapped Lambert over a hemisphere fill
 * with a roughness-shaped sheen; a dark room reflects at glancing angles; the
 * glass, when the body is a screen, spills its average colour onto whatever
 * faces it; both shadow mechanisms darken the key. Output is premultiplied by
 * presence with the depth01 sidecar alongside, exactly as a captured plane.
 */
export const stageBodyFragmentFn = tgpu['~unstable'].fragmentFn({
	in: bodyFragmentIn,
	out: bodyFragmentOut
}) /* wgsl */ `{
	let body = layout.$.body;
	let presence = body.misc.z;
	if (presence < ${BODY_PRESENCE_FLOOR}) { discard; }
	let N = normalize(in.normal);
	let regionIndex = clamp(i32(round(in.region)), 0, ${STAGE_BODY_MAX_REGIONS - 1});
	let material = body.materialColor[regionIndex];
	let albedo = material.rgb;
	let roughness = clamp(material.w, 0.0, 1.0);
	let light = body.light;
	let L = -normalize(light.xyz);
	let V = normalize(body.camera.xyz - in.world);
	let key = clamp(light.w * ${KEY_GAIN}, 0.0, ${KEY_MAX});
	let wrapped = max(0.0, (dot(N, L) + ${LAMBERT_WRAP}) / (1.0 + ${LAMBERT_WRAP}));
	let hemisphere = 0.5 + 0.5 * N.y;
	let fill = mix(${FILL_LOW}, ${FILL_HIGH}, hemisphere);
	let H = normalize(L + V);
	let sheenPower = mix(${SHEEN_POWER_SMOOTH}, ${SHEEN_POWER_ROUGH}, roughness);
	let sheen = pow(max(dot(N, H), 0.0), sheenPower) * ${SHEEN} * (1.0 - roughness) * key;
	let fresnel = pow(1.0 - max(dot(N, V), 0.0), 5.0);
	let environment = mix(${ENVIRONMENT_FLOOR}, ${ENVIRONMENT_CEILING}, hemisphere) * fresnel * (1.0 - roughness);
	var shade = 0.0;
	${allCasterShadowsWgsl('body')}
	${shadowMapOcclusionWgsl('body')}
	let lit = 1.0 - min(shade, 1.0);
	var color = albedo * (fill + wrapped * key * ${KEY_DIFFUSE} * lit) + vec3f((sheen * lit) + environment);
	// The glass as an area light: the nearest point of the opening to this
	// fragment, the cosine at both ends, and a solid angle that softens as the
	// fragment approaches the glass — the bezel's inner chamfer takes the most.
	if (body.screenOrigin.w > 0.001) {
		let halfW = max(body.screenU.w, 1e-4);
		let halfH = max(body.screenV.w, 1e-4);
		let uHat = body.screenU.xyz / halfW;
		let vHat = body.screenV.xyz / halfH;
		let rel = in.world - body.screenOrigin.xyz;
		let nearest = body.screenOrigin.xyz
			+ uHat * clamp(dot(rel, uHat), -halfW, halfW)
			+ vHat * clamp(dot(rel, vHat), -halfH, halfH);
		let toGlass = nearest - in.world;
		let distance = max(length(toGlass), 1e-4);
		let direction = toGlass / distance;
		let cosReceiver = max(dot(N, direction), 0.0);
		let cosEmitter = max(dot(body.screenNormal.xyz, -direction), 0.0);
		let area = 4.0 * halfW * halfH;
		let glassColor = textureSampleLevel(layout.$.screenTexture, layout.$.samp, vec2f(0.5), body.screenNormal.w).rgb;
		let irradiance = cosReceiver * cosEmitter * area / (distance * distance + area);
		color = color + albedo * glassColor * irradiance * body.screenOrigin.w * ${SCREEN_LIGHT_GAIN};
	}
	// A soft shoulder so the glass's spill never clips to a flat white.
	let over = max(color - vec3f(${TONE_SHOULDER}), vec3f(0.0));
	color = min(color, vec3f(${TONE_SHOULDER})) + over / (vec3f(1.0) + over);
	let depth01 = clamp((in.dist - body.misc.x) / (body.misc.y - body.misc.x), 0.0, 1.0);
	return Out(vec4f(color * presence, presence), vec4f(depth01, 0.0, 0.0, 1.0));
}`.$uses({ layout: stageBodyLayout });

/**
 * The shadow-depth pass binds the body uniforms alone: it renders INTO the
 * shadow map, so the receiver layout that reads the map cannot be bound in
 * the same pass.
 */
export const stageShadowDepthLayout = tgpu.bindGroupLayout({
	body: { uniform: StageBodyUniforms }
});

/** The shadow-depth pass: the body as the key sees it, depth only. */
export const stageShadowDepthVertexFn = tgpu['~unstable'].vertexFn({
	in: { position: d.vec3f },
	out: { position: d.builtin.position }
}) /* wgsl */ `{
	return Out(layout.$.body.shadowMvp * vec4f(in.position, 1.0));
}`.$uses({ layout: stageShadowDepthLayout });

/** The multisampled scene set the bodies switch on (multisampled bindings
 *  are read per sample, never filtered). */
export const stageResolveLayout = tgpu.bindGroupLayout({
	sceneSamples: { texture: d.textureMultisampled2d(d.f32), sampleType: 'unfilterable-float' },
	depthSamples: { texture: d.textureMultisampled2d(d.f32), sampleType: 'unfilterable-float' }
});

/**
 * Resolve the multisampled scene: colour averages its samples (the edge
 * antialiasing), the depth sidecar takes the NEAREST sample — never an
 * average, whose in-between depth at a contour would sweep through the focal
 * plane and read "in focus" in the DOF gather.
 */
export const stageResolveFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: { color: d.location(0, d.vec4f), depth: d.location(1, d.vec4f) }
}) /* wgsl */ `{
	let size = vec2f(textureDimensions(layout.$.sceneSamples));
	let coord = vec2i(in.uv * size);
	var sum = vec4f(0.0);
	var nearest = 1.0;
	for (var i: i32 = 0; i < ${STAGE_SCENE_SAMPLE_COUNT}; i = i + 1) {
		sum = sum + textureLoad(layout.$.sceneSamples, coord, i);
		nearest = min(nearest, textureLoad(layout.$.depthSamples, coord, i).x);
	}
	return Out(sum / ${STAGE_SCENE_SAMPLE_COUNT}.0, vec4f(nearest, 0.0, 0.0, 1.0));
}`.$uses({ layout: stageResolveLayout });
