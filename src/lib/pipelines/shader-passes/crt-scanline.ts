import { d } from 'typegpu';

import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { ScanlineMaterial } from '$lib/platform/packs/resolve';

/**
 * `crt-scanline` — the shared, Pack-driven scanline material pass (the
 * emissive form of the optional `material-treatment` core, resolved by
 * `resolveMaterialTreatment`). Modeled on `web-document-screen.ts` (the
 * ADR-0030 per-element emissive pattern) and `edge-treatment.ts` (the shared
 * Pack-structural pass shape).
 *
 * The claim (docs/packs/crt-terminal/aesthetic.md § Surface Treatment): grain
 * is scanline, not paper tooth — a subtle horizontal raster + faint phosphor
 * shimmer INSIDE element pixels. Three properties are load-bearing:
 *
 *   - **Alpha-masked.** The raster rides only where element pixels exist. The
 *     factor is gated by the input alpha, so the transparent overlay frame —
 *     the creator's footage underneath — is NEVER treated (it isn't ours).
 *     One full-frame dispatch therefore treats the surface card and every
 *     overlay in the same composited capture exactly once, per element.
 *   - **Subtle.** Low-contrast line-gap dimming (`strength`) — visible at
 *     pause, invisible in motion. The raster only DIMS premultiplied rgb
 *     (factor ≤ 1), so premultiplication stays valid and no pixel gains light.
 *   - **Deterministic.** The shimmer beats on the timeline `timestamp`
 *     forwarded from the paused-scrub timebase — never wall-clock, no random —
 *     so preview and export agree frame for frame.
 *
 * NO curvature, ever: barrel distortion fights composition geometry,
 * safe-areas, and reflow (aesthetic doc § Screen scope).
 */

export const CrtScanlineUniforms = d.struct({
	/** Raster line pitch in 4K-reference px. */
	pitchPx: d.f32,
	/** Line-gap darkening 0..1. */
	strength: d.f32,
	/** Phosphor shimmer amplitude 0..1 (only ever dims — factor stays ≤ 1). */
	shimmer: d.f32,
	/** Timeline seconds (frame-deterministic scrub value, not wall-clock). */
	timestamp: d.f32,
	/** Composition canvas size in px, for UV↔px mapping. */
	canvasWidth: d.f32,
	canvasHeight: d.f32
});

const FALLBACK_CANVAS_WIDTH = 3840;
const FALLBACK_CANVAS_HEIGHT = 2160;

const wgsl = /* wgsl */ `
	let canvasW = max(layout.$.uniforms.canvasWidth, 1.0);
	let canvasH = max(layout.$.uniforms.canvasHeight, 1.0);
	// 4K-reference px → this composition's px (both transports share a 2160
	// short side, so the raster holds physical scale across orientations).
	let refScale = min(canvasW, canvasH) / 2160.0;
	let pitch = max(layout.$.uniforms.pitchPx * refScale, 2.0);
	let py = in.uv.y * canvasH;

	// ----- Horizontal raster -----
	//
	// A raised-cosine line profile: line centres stay at full drive, the gaps
	// between lines dim by \`strength\`. Pure function of pixel y — the raster is
	// the screen's, not the content's, and it does not crawl over time.
	let phase = fract(py / pitch);
	let raster = 1.0 - layout.$.uniforms.strength * (0.5 - 0.5 * cos(6.2831853 * phase));

	// ----- Phosphor shimmer -----
	//
	// A faint, slow beat riding the timeline clock, phase-offset per raster
	// line and along x so it reads as tube shimmer, not a global flicker.
	// Deterministic (timestamp is the paused-scrub value) and dim-only: the
	// term is 0..1 so the combined factor never exceeds 1 and premultiplied
	// rgb never outruns its alpha.
	let line = floor(py / pitch);
	let t = layout.$.uniforms.timestamp;
	let beat = 0.5 + 0.5 * sin(t * 7.3 + line * 0.61) * sin(t * 3.1 + in.uv.x * 9.7);
	let shimmerFactor = 1.0 - layout.$.uniforms.shimmer * beat;

	// ----- Alpha mask (per-element emissive scope) -----
	//
	// Element pixels only: the smoothstep keeps AA fringes from over-modulating
	// and leaves the transparent frame (alpha 0 — the footage underneath)
	// untouched. Multiplying rgb by a ≤1 factor keeps premultiplication valid;
	// alpha is never rewritten.
	let mask = smoothstep(0.02, 0.25, inputSample.a);
	let factor = mix(1.0, raster * shimmerFactor, mask);
	return vec4f(inputSample.rgb * factor, inputSample.a);
`;

export function createCrtScanlinePass(): ShaderPass<ScanlineMaterial> {
	return {
		uniforms: CrtScanlineUniforms,
		wgsl,
		packUniforms(target, _bounds, ctx) {
			return {
				pitchPx: target.pitchPx,
				strength: target.strength,
				shimmer: target.shimmer,
				timestamp: ctx.timestamp,
				canvasWidth: ctx.canvasWidth > 0 ? ctx.canvasWidth : FALLBACK_CANVAS_WIDTH,
				canvasHeight: ctx.canvasHeight > 0 ? ctx.canvasHeight : FALLBACK_CANVAS_HEIGHT
			};
		}
	};
}

export const crtScanlinePass = createCrtScanlinePass();
