import { d } from 'typegpu';

import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { LowerThirdContent } from '$lib/pipelines/overlays/lower-third';

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
	boundsUvMax: d.vec2f
});

export interface CinematicLowerThirdFlareParams {
	progress: number;
	flareEnabled: number;
	boundsUvMin: ReturnType<typeof d.vec2f>;
	boundsUvMax: ReturnType<typeof d.vec2f>;
}

const DEFAULT_CANVAS_WIDTH = 3840;
const DEFAULT_CANVAS_HEIGHT = 2160;

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
	// Constant warm glow implying an off-frame key light. The anamorphic
	// entrance flare that used to sweep across the plate was removed — at its
	// peak it read as a line straight through the name.
	let rimSource = vec2f(0.0, 1.0);
	let rimDist = length((localUv - rimSource));
	let rimFalloff = (1.0 - smoothstep(0.0, 0.45, rimDist));
	let rimColor = vec3f(0.95, 0.74, 0.46);
	let rimRgb = rimColor * rimFalloff * 0.12;

	return vec4f(inputSample.rgb + rimRgb, inputSample.a);
`;

export const cinematicLowerThirdFlare: ShaderPass<LowerThirdContent> = {
	uniforms: CinematicLowerThirdFlareUniforms,
	wgsl,
	packUniforms(content, bounds, { progress }) {
		const canvasW = DEFAULT_CANVAS_WIDTH;
		const canvasH = DEFAULT_CANVAS_HEIGHT;
		return {
			progress,
			flareEnabled: content.variant === 'cinematic' ? 1 : 0,
			boundsUvMin: d.vec2f(bounds.x / canvasW, bounds.y / canvasH),
			boundsUvMax: d.vec2f(
				(bounds.x + bounds.width) / canvasW,
				(bounds.y + bounds.height) / canvasH
			)
		} satisfies CinematicLowerThirdFlareParams;
	}
};
