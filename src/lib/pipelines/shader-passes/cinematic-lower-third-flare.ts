import { d } from 'typegpu';

import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { LowerThirdContent } from '$lib/pipelines/overlays/lower-third';

/**
 * `cinematic-lower-third-flare` — Overlay-side shader pass (ADR-0005) that
 * carries the anamorphic horizontal flare + lower-left rim glow on the
 * lower-third family. After the Phase 2.1 migration the pass is the
 * family\'s single shaderPass and gates its contributions on the active
 * variant via a `flareEnabled` uniform — the `standard` variant passes the
 * pass-through path (no flare, no rim), the `cinematic` variant runs the
 * full broadcast lighting.
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
	let t = layout.$.uniforms.progress;

	// ----- Anamorphic horizontal flare -----
	let flareEnter = 0.02;
	let flareExit = 0.16;
	let flarePhase = clamp((t - flareEnter) / (flareExit - flareEnter), 0.0, 1.0);
	let flareWindow = smoothstep(0.0, 0.20, flarePhase) * (1.0 - smoothstep(0.75, 1.0, flarePhase));
	let flareCentreX = mix(-0.15, 1.15, flarePhase);

	let chromaticOffset = 0.012;
	let dxR = localUv.x - (flareCentreX + chromaticOffset);
	let dxB = localUv.x - (flareCentreX - chromaticOffset);
	let dy = localUv.y - 0.5;

	let radiusX = 0.18;
	let radiusY = 0.030;
	let flareEllipseR = (dxR * dxR) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY);
	let flareEllipseB = (dxB * dxB) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY);
	let flareIntensityR = max(0.0, 1.0 - flareEllipseR);
	let flareIntensityB = max(0.0, 1.0 - flareEllipseB);

	let flareStrength = flareWindow * 0.55;
	let flareR = flareIntensityR * flareStrength;
	let flareG = (flareIntensityR + flareIntensityB) * 0.5 * flareStrength * 0.92;
	let flareB = flareIntensityB * flareStrength * 0.95;
	let flareRgb = vec3f(flareR, flareG, flareB);

	// ----- Resting rim glow (lower-left) -----
	let rimSource = vec2f(0.0, 1.0);
	let rimDist = length((localUv - rimSource));
	let rimFalloff = (1.0 - smoothstep(0.0, 0.45, rimDist));
	let rimColor = vec3f(0.95, 0.74, 0.46);
	let rimRgb = rimColor * rimFalloff * 0.12;

	let withEffects = inputSample.rgb + flareRgb + rimRgb;

	return vec4f(withEffects, inputSample.a);
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
