import { d } from 'typegpu';

import { packState } from '$lib/platform/engine-state.svelte';
import { getPack } from '$lib/platform/packs/registry';
import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { LowerThirdContent } from '$lib/pipelines/overlays/lower-third';
import { resolveRoleColorFloat } from '$lib/utils/color';

/**
 * `cinematic-lower-third-flare` — Overlay-side shader pass (ADR-0005) that
 * carries the cinematic lower-third's resting warm rim glow (an implied
 * off-frame lower-left key light) on the lower-third family. After the Phase
 * 2.1 migration the pass is the family's single shaderPass and gates its
 * contribution on the active variant via a `flareEnabled` uniform — the
 * `standard` variant passes through unchanged; the `cinematic` variant adds
 * the rim glow.
 *
 * The anamorphic horizontal entrance flare this pass originally swept across
 * the plate was removed by design: at its peak it read as a bright line
 * straight through the name. Only the constant rim glow remains, so the pass
 * no longer reads `progress` (the field is retained on the uniform for shape
 * stability but unused).
 */

export const CinematicLowerThirdFlareUniforms = d.struct({
	progress: d.f32,
	flareEnabled: d.u32,
	boundsUvMin: d.vec2f,
	boundsUvMax: d.vec2f,
	// Pack-routed rim tint (the `lower-third.flare` Role): the implied
	// off-frame key light's colour.
	rimColor: d.vec3f
});

export interface CinematicLowerThirdFlareParams {
	progress: number;
	flareEnabled: number;
	boundsUvMin: ReturnType<typeof d.vec2f>;
	boundsUvMax: ReturnType<typeof d.vec2f>;
	rimColor: ReturnType<typeof d.vec3f>;
}

// Neutral achromatic fallback when the active Pack doesn't claim the
// `lower-third.flare` Role (ADR-0024 structural posture: a Pack opts INTO a
// light character; absence never falls back to Syntax warmth). Rec.709
// luminance of the original constant with zero chroma.
const NEUTRAL_RIM_COLOR: readonly [number, number, number] = [0.7644, 0.7644, 0.7644];

const wgsl = /* wgsl */ `
	let uvMin = layout.$.uniforms.boundsUvMin;
	let uvMax = layout.$.uniforms.boundsUvMax;
	let inOverlay = in.uv.x >= uvMin.x && in.uv.x < uvMax.x
		&& in.uv.y >= uvMin.y && in.uv.y < uvMax.y;

	if (!inOverlay) {
		return inputSample;
	}

	// Variant gate: pass through unchanged for non-cinematic variants. The
	// standard variant shares this shaderPass slot but contributes nothing.
	if (layout.$.uniforms.flareEnabled == 0u) {
		return inputSample;
	}

	let span = max(uvMax - uvMin, vec2f(0.0001));
	let localUv = (in.uv - uvMin) / span;

	// ----- Resting rim glow (lower-left) -----
	// Constant glow implying an off-frame key light, colour Pack-routed (the
	// lower-third.flare Role). The anamorphic entrance flare that used to
	// sweep across the plate was removed — at its peak it read as a line
	// straight through the name.
	let rimSource = vec2f(0.0, 1.0);
	let rimDist = length((localUv - rimSource));
	let rimFalloff = (1.0 - smoothstep(0.0, 0.45, rimDist));
	let rimColor = layout.$.uniforms.rimColor;
	let rimRgb = rimColor * rimFalloff * 0.12;

	return vec4f(inputSample.rgb + rimRgb, inputSample.a);
`;

export const cinematicLowerThirdFlare: ShaderPass<LowerThirdContent> = {
	uniforms: CinematicLowerThirdFlareUniforms,
	wgsl,
	packUniforms(content, bounds, { progress, canvasWidth, canvasHeight }) {
		// Uniforms pack per frame, so a Pack switch takes effect without extra
		// reactivity — read the active Pack imperatively here.
		const flareRole = getPack(packState.slug).roles['lower-third.flare'];
		return {
			progress,
			flareEnabled: content.variant === 'cinematic' ? 1 : 0,
			boundsUvMin: d.vec2f(bounds.x / canvasWidth, bounds.y / canvasHeight),
			boundsUvMax: d.vec2f(
				(bounds.x + bounds.width) / canvasWidth,
				(bounds.y + bounds.height) / canvasHeight
			),
			rimColor: d.vec3f(...resolveRoleColorFloat(flareRole, 'rim', NEUTRAL_RIM_COLOR))
		} satisfies CinematicLowerThirdFlareParams;
	}
};
