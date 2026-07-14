import { d } from 'typegpu';

import type { ShaderPass } from '$lib/platform/pipelines/types';
import type { SurfaceState } from '$lib/platform/engine-schema';

/**
 * `web-document-screen` — single-pass surface shader carrying the emissive
 * optical tells the `web-document` Surface claims (it is "a web page on a
 * backlit display"), which the paper compositor + CanvasSource CSS cannot
 * supply. It runs between the surface DOM upload and the effect chain via the
 * ShaderPassDispatcher (ADR-0008 / ADR-0010), on the composited card texture
 * (the opaque panel on the transparent overlay frame).
 *
 * Dimensions (each declared in `web-document/identity.ts`):
 *
 *   1. **subpixel-emission.** A faint per-column R/G/B stripe modulation on
 *      panel pixels — the light-emitting subpixel structure of an LCD/OLED.
 *      Low amplitude so it reads as screen texture, not colour noise.
 *   2. **backlight-bloom.** Bright UI (white text, the verified badge) emits a
 *      soft surrounding glow — light radiating OUT of the panel. Gathered from
 *      a bright-pass over two sample rings. The amber highlight sits *below*
 *      the bloom threshold on purpose, so the hand-marked span stays crisp ink
 *      rather than glowing like lit UI.
 *   3. **screen-backlight-floor.** The panel's darkest pixels are lifted above
 *      true black (an emissive panel never reaches 0), and its edge emission
 *      bleeds a faint glow halo past the panel boundary into the transparent
 *      frame — the backlight escaping at the bezel. The headline "light comes
 *      out, not in" tell. (CanvasSource CSS seeds the substrate floor; this
 *      pass enforces the per-pixel floor + the halo.)
 *   4. **viewport-edge-defocus.** The panel's outer edge falls slightly out of
 *      focus — the screen sits behind glass / just off the camera's focal
 *      plane — softening the hard rasterized card boundary.
 *
 * Emissive (light comes out), never photographed-reflective like paper /
 * newspaper: there is no vignette, no occlusion shadow, no paper grain here.
 */

export const WebDocumentScreenUniforms = d.struct({
	/** Composition canvas width / height in pixels, used to map UV to px. */
	canvasWidth: d.f32,
	canvasHeight: d.f32,
	/** Luminance above which a pixel counts as "lit UI" and emits bloom. */
	bloomThreshold: d.f32,
	/** Additive scale on the gathered bright-pass (the glow strength). */
	bloomStrength: d.f32,
	/** Inner gather ring radius in screen-space px (the bloom reach). */
	bloomRadiusPx: d.f32,
	/** Alpha scale on the edge halo bled into the transparent frame. */
	haloStrength: d.f32,
	/** Outer gather ring radius in screen-space px (the halo reach). */
	haloRadiusPx: d.f32,
	/** Additive emissive floor on panel pixels (darkest pixel > true black). */
	backlightFloor: d.f32,
	/** Per-column R/G/B subpixel stripe amplitude (0 = off). */
	subpixelAmount: d.f32,
	/** Edge-defocus blur radius in screen-space px. */
	edgeDefocusPx: d.f32
});

export interface WebDocumentScreenParams {
	canvasWidth: number;
	canvasHeight: number;
	bloomThreshold: number;
	bloomStrength: number;
	bloomRadiusPx: number;
	haloStrength: number;
	haloRadiusPx: number;
	backlightFloor: number;
	subpixelAmount: number;
	edgeDefocusPx: number;
}

// Tuned at 4K (3840×2160). The amber highlight band measures ~0.70 luma, so the
// bloom threshold sits just above it (0.74): lit UI (white text ~0.95, badge
// blue) blooms; the hand-marked highlight stays crisp ink. Floor is a hair
// above the X "Dim" background (#15202b ≈ 0.05 channel) so it reads as backlit
// without crushing the dark highlight ink (~0.05) into the band.
const BLOOM_THRESHOLD = 0.74;
const BLOOM_STRENGTH = 0.38;
const BLOOM_RADIUS_PX = 14;
const HALO_STRENGTH = 0.55;
const HALO_RADIUS_PX = 24;
const BACKLIGHT_FLOOR = 0.014;
const SUBPIXEL_AMOUNT = 0.05;
const EDGE_DEFOCUS_PX = 2.5;

// Fallback composition dimensions for the first-frame race before the
// compositionElement.getBoundingClientRect() resolves (mirrors newspaper-physics).
const FALLBACK_CANVAS_WIDTH = 3840;
const FALLBACK_CANVAS_HEIGHT = 2160;

const wgsl = /* wgsl */ `
	let canvasW = max(layout.$.uniforms.canvasWidth, 1.0);
	let canvasH = max(layout.$.uniforms.canvasHeight, 1.0);
	let pxUv = vec2f(1.0 / canvasW, 1.0 / canvasH);
	let lumaW = vec3f(0.2126, 0.7152, 0.0722);
	let isPanel = inputSample.a > 0.5;

	// ----- Gather: panel emission (edge halo) + bright-pass (bloom) -----
	//
	// One pass over two rings of eight taps. The inner ring (bloom radius)
	// feeds the bright-pass glow; both rings feed the panel-emission gather
	// that becomes the edge halo. glowCov tracks how much of the neighbourhood
	// is opaque panel — ~1 deep inside the card, falling toward 0 past the edge,
	// which also drives the edge-defocus proximity below.
	let bloomR = max(layout.$.uniforms.bloomRadiusPx, 1.0);
	let haloR = max(layout.$.uniforms.haloRadiusPx, 1.0);
	let thr = layout.$.uniforms.bloomThreshold;
	var glowRgb = vec3f(0.0);
	var glowCov = 0.0;
	var brightRgb = vec3f(0.0);
	var wsum = 0.0;
	for (var i = 0; i < 8; i = i + 1) {
		let a = (f32(i) / 8.0) * 6.2831853;
		let dir = vec2f(cos(a), sin(a));

		let o1 = dir * bloomR * pxUv;
		let s1 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + o1);
		let l1 = dot(s1.rgb, lumaW);
		glowRgb += s1.rgb * s1.a;
		glowCov += s1.a;
		brightRgb += s1.rgb * max(l1 - thr, 0.0) * s1.a;
		wsum += 1.0;

		let o2 = dir * haloR * pxUv;
		let s2 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + o2);
		glowRgb += s2.rgb * s2.a * 0.5;
		glowCov += s2.a * 0.5;
		wsum += 0.5;
	}
	let invW = 1.0 / max(wsum, 0.0001);
	let glowAvg = glowRgb * invW;
	let glowCovAvg = glowCov * invW;
	let bloomAvg = brightRgb * invW;

	// ----- Subpixel emission -----
	//
	// A faint per-column R/G/B stripe: column n%3 gets a small boost on one
	// channel and a slight dip on the others, so the panel reads as an array of
	// light-emitting subpixels rather than flat fill. Amplitude is low enough
	// not to tint the UI or disturb the highlight ink.
	let amt = layout.$.uniforms.subpixelAmount;
	let col = i32(floor(in.uv.x * canvasW)) % 3;
	var subMul = vec3f(1.0 - amt * 0.5);
	if (col == 0) {
		subMul.r = 1.0 + amt;
	} else if (col == 1) {
		subMul.g = 1.0 + amt;
	} else {
		subMul.b = 1.0 + amt;
	}
	let subpixelRgb = inputSample.rgb * subMul;

	// ----- Viewport edge defocus -----
	//
	// Near the panel boundary (glowCov < 1) the card falls slightly out of
	// focus — the screen sits behind glass / off the focal plane — softening
	// the hard rasterized edge. A 4-tap box blur mixed in by edge proximity.
	let edgeProx = clamp(1.0 - glowCovAvg, 0.0, 1.0);
	let dOff = max(layout.$.uniforms.edgeDefocusPx, 0.0) * pxUv;
	let b1 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( dOff.x,  dOff.y));
	let b2 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-dOff.x,  dOff.y));
	let b3 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f( dOff.x, -dOff.y));
	let b4 = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + vec2f(-dOff.x, -dOff.y));
	let blurredRgb = (b1.rgb + b2.rgb + b3.rgb + b4.rgb) * 0.25;
	let focusedRgb = mix(subpixelRgb, blurredRgb, edgeProx * 0.6);

	// ----- Screen backlight floor + bloom -----
	//
	// Lift the darkest panel pixels above true black (emissive floor), then add
	// the gathered bright-pass glow. The highlight band stays below the bloom
	// threshold, so only genuinely lit UI radiates.
	let floored = max(focusedRgb, vec3f(layout.$.uniforms.backlightFloor));
	let litRgb = floored + bloomAvg * layout.$.uniforms.bloomStrength;

	// ----- Edge halo (transparent frame) -----
	//
	// Past the panel edge, the gathered panel emission becomes a faint glow
	// whose colour is the panel's edge colour and whose alpha tracks how much
	// panel is nearby — the backlight escaping at the bezel into the otherwise
	// transparent overlay frame.
	let haloRgb = glowAvg;
	let haloAlpha = clamp(glowCovAvg * layout.$.uniforms.haloStrength, 0.0, 0.4);

	let finalRgb = select(haloRgb, litRgb, isPanel);
	let finalAlpha = select(haloAlpha, inputSample.a, isPanel);
	return vec4f(finalRgb, finalAlpha);
`;

export function createWebDocumentScreenPass(): ShaderPass<SurfaceState> {
	return {
		uniforms: WebDocumentScreenUniforms,
		wgsl,
		packUniforms(_target, bounds) {
			return {
				canvasWidth: bounds.width > 0 ? bounds.width : FALLBACK_CANVAS_WIDTH,
				canvasHeight: bounds.height > 0 ? bounds.height : FALLBACK_CANVAS_HEIGHT,
				bloomThreshold: BLOOM_THRESHOLD,
				bloomStrength: BLOOM_STRENGTH,
				bloomRadiusPx: BLOOM_RADIUS_PX,
				haloStrength: HALO_STRENGTH,
				haloRadiusPx: HALO_RADIUS_PX,
				backlightFloor: BACKLIGHT_FLOOR,
				subpixelAmount: SUBPIXEL_AMOUNT,
				edgeDefocusPx: EDGE_DEFOCUS_PX
			} satisfies WebDocumentScreenParams;
		}
	};
}

export const webDocumentScreen = createWebDocumentScreenPass();
