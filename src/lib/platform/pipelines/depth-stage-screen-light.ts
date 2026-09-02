import { d } from 'typegpu';

// The picture lights the room (ADR-0059): a screen's glass is an area light
// whose colour is the composition's own average, read from the top of the
// Surface plane's mip chain. Every receiver — the housing, the floor, the
// backdrop — takes it through this one snippet, so the bezel's inner faces
// and the desk under the monitor carry the same picture-coloured glow.

/** How much of the glass's average colour a receiver takes at unit glow. */
const SCREEN_LIGHT_GAIN = 7.0;
/** A tube's phosphor throws light past its own plane; the emitter's cosine keeps a floor. */
const EMITTER_WRAP = 0.18;

/**
 * `screenOrigin` = (glass centre, glow — 0 disables the read); `screenU` /
 * `screenV` = the glass half-vectors with their half-lengths in w;
 * `screenNormal` = (unit normal, mip level whose texels are the glass's
 * average colour).
 */
export const STAGE_SCREEN_LIGHT_UNIFORM_FIELDS = {
	screenOrigin: d.vec4f,
	screenU: d.vec4f,
	screenV: d.vec4f,
	screenNormal: d.vec4f
} as const;

/** The Surface plane's mip chain; its top levels are the glass's average colour. */
export const STAGE_SCREEN_LIGHT_LAYOUT_ENTRIES = {
	screenTexture: { texture: d.texture2d(d.f32) }
} as const;

/**
 * WGSL: add the glass's spill to `color` for a receiver with unit normal `N`
 * at `in.world` whose albedo is `${albedo}`. The nearest point of the opening
 * to the fragment, the cosine at both ends, and a solid angle that softens as
 * the fragment approaches the glass; `samp` and `screenTexture` on `layout`.
 */
export function screenLightWgsl(uniforms: string, albedo: string): string {
	return /* wgsl */ `
	if (${uniforms}.screenOrigin.w > 0.001) {
		let screenHalfW = max(${uniforms}.screenU.w, 1e-4);
		let screenHalfH = max(${uniforms}.screenV.w, 1e-4);
		let screenUHat = ${uniforms}.screenU.xyz / screenHalfW;
		let screenVHat = ${uniforms}.screenV.xyz / screenHalfH;
		let screenRel = in.world - ${uniforms}.screenOrigin.xyz;
		let screenNearest = ${uniforms}.screenOrigin.xyz
			+ screenUHat * clamp(dot(screenRel, screenUHat), -screenHalfW, screenHalfW)
			+ screenVHat * clamp(dot(screenRel, screenVHat), -screenHalfH, screenHalfH);
		let toGlass = screenNearest - in.world;
		let glassDistance = max(length(toGlass), 1e-4);
		let glassDirection = toGlass / glassDistance;
		let cosReceiver = max(dot(N, glassDirection), 0.0);
		let cosEmitter = max(dot(${uniforms}.screenNormal.xyz, -glassDirection), 0.0) * (1.0 - ${EMITTER_WRAP}) + ${EMITTER_WRAP};
		let glassArea = 4.0 * screenHalfW * screenHalfH;
		let glassColor = textureSampleLevel(layout.$.screenTexture, layout.$.samp, vec2f(0.5), ${uniforms}.screenNormal.w).rgb;
		let glassIrradiance = cosReceiver * cosEmitter * glassArea / (glassDistance * glassDistance + glassArea);
		color = color + ${albedo} * glassColor * glassIrradiance * ${uniforms}.screenOrigin.w * ${SCREEN_LIGHT_GAIN};
	}`;
}
