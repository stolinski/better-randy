import tgpu, { d } from 'typegpu';

import { STAGE_BODY_MAX_REGIONS } from './depth-stage-geometry';
import {
	STAGE_MATERIAL_UNIFORM_FIELDS,
	stageMaterialShadingWgsl,
	stageToneEncodeWgsl
} from './depth-stage-material';
import {
	screenLightWgsl,
	STAGE_SCREEN_LIGHT_LAYOUT_ENTRIES,
	STAGE_SCREEN_LIGHT_UNIFORM_FIELDS
} from './depth-stage-screen-light';
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
// the same depth-tested scene as the captured planes, shaded in linear light
// by the Stage's material model (depth-stage-material.ts) under the Pack key
// and the room, shadowed by the caster planes and the shadow map, and — for a
// screen body — lit by its own glass, so the bezel and chin carry the
// composition's glow. Alongside it: the shadow-depth pass that renders the
// bodies from the key's direction, and the resolve pass that folds the
// multisampled scene back into the single-sample colour target and depth
// sidecar the DOF reads.

/** Presence below which a body fragment is dropped rather than blended. */
const BODY_PRESENCE_FLOOR = 0.003;

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
 * One body's uniforms. The material fields as in `depth-stage-material.ts`;
 * `light` = the key's unit travel + intensity; `camera` = the eye; `misc` =
 * (depthNear, depthFar, presence, 0); the screen-light, shadow-map, and
 * caster fields as in `depth-stage-screen-light.ts` and
 * `depth-stage-shadow.ts`; `shadowMvp` = the light's clip transform of the
 * body for the shadow-depth pass.
 */
export const StageBodyUniforms = d.struct({
	mvp: d.mat4x4f,
	model: d.mat4x4f,
	normalMatrix: d.mat4x4f,
	shadowMvp: d.mat4x4f,
	...STAGE_MATERIAL_UNIFORM_FIELDS,
	light: d.vec4f,
	camera: d.vec4f,
	misc: d.vec4f,
	...STAGE_SCREEN_LIGHT_UNIFORM_FIELDS,
	...STAGE_SHADOW_MAP_UNIFORM_FIELDS,
	...STAGE_CASTER_UNIFORM_FIELDS
});

export const stageBodyLayout = tgpu.bindGroupLayout({
	body: { uniform: StageBodyUniforms },
	samp: { sampler: 'filtering' },
	...STAGE_SCREEN_LIGHT_LAYOUT_ENTRIES,
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
 * The body's material. Albedo, roughness, and metallic come from the region's
 * material; the material model lights it in linear light under the key
 * (darkened by both shadow mechanisms) and the room; the glass, when the
 * body is a screen, spills its picture onto whatever faces it; the result is
 * tone-compressed and encoded for the display-space scene. Output is
 * premultiplied by presence with the depth01 sidecar alongside, exactly as a
 * captured plane, and marked occludable.
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
	let metallic = clamp(body.materialParams[regionIndex].x, 0.0, 1.0);
	let light = body.light;
	let L = -normalize(light.xyz);
	let V = normalize(body.camera.xyz - in.world);
	let keyIntensity = light.w;
	var shade = 0.0;
	${allCasterShadowsWgsl('body')}
	${shadowMapOcclusionWgsl('body')}
	let lit = 1.0 - min(shade, 1.0);
	${stageMaterialShadingWgsl('body')}
	${screenLightWgsl('body', 'diffuseColor', 'linear')}
	${stageToneEncodeWgsl()}
	let depth01 = clamp((in.dist - body.misc.x) / (body.misc.y - body.misc.x), 0.0, 1.0);
	return Out(vec4f(color * presence, presence), vec4f(depth01, 1.0, 0.0, 1.0));
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
 * antialiasing), the depth sidecar takes the NEAREST sample with its
 * occludable mark — never an average, whose in-between depth at a contour
 * would sweep through the focal plane and read "in focus" in the DOF gather.
 */
export const stageResolveFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: { color: d.location(0, d.vec4f), depth: d.location(1, d.vec4f) }
}) /* wgsl */ `{
	let size = vec2f(textureDimensions(layout.$.sceneSamples));
	let coord = vec2i(in.uv * size);
	var sum = vec4f(0.0);
	var nearest = vec2f(1.0, 0.0);
	for (var i: i32 = 0; i < ${STAGE_SCENE_SAMPLE_COUNT}; i = i + 1) {
		sum = sum + textureLoad(layout.$.sceneSamples, coord, i);
		let sample = textureLoad(layout.$.depthSamples, coord, i).xy;
		if (sample.x < nearest.x) { nearest = sample; }
	}
	return Out(sum / ${STAGE_SCENE_SAMPLE_COUNT}.0, vec4f(nearest.x, nearest.y, 0.0, 1.0));
}`.$uses({ layout: stageResolveLayout });
