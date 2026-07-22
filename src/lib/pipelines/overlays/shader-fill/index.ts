import { d } from 'typegpu';
import { z } from 'zod';

import type { OverlayDefaults, OverlayRenderer, ShaderPass } from '$lib/platform/pipelines/types';
import { getRgbColorChannels } from '$lib/utils/color';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';

/**
 * `shader-fill` — first WGSL-rendered Overlay, validating the ADR-0005
 * `OverlayRenderer.shaderPass` path end-to-end. Paints a three-colour
 * smooth-mesh gradient inside the overlay's rect using inverse-square-distance
 * metaball blending of three time-driven centres. Animation comes from the
 * timeline's `progress`, threaded through `ShaderPass.packUniforms(...,
 * ctx)` per ADR-0013.
 *
 * Outside the rect: pass-through (the substrate behind the overlay shows
 * unchanged). Inside the rect: the gradient blends over the substrate at
 * `opacity`, never punching out alpha so the transparent-overlay export
 * contract holds. Drop-in for any Preset that wants a generated colour panel
 * — not bound to the channel aesthetic.
 */

const DEFAULT_COLOR_0 = '#ff5d8f';
const DEFAULT_COLOR_1 = '#5dd6e6';
const DEFAULT_COLOR_2 = '#a866f7';
const DEFAULT_FLOW_SPEED = 1;
const DEFAULT_OPACITY = 0.85;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB hex color');

const ShaderFillContentSchema = z.object({
	color0: HexColorSchema.optional(),
	color1: HexColorSchema.optional(),
	color2: HexColorSchema.optional(),
	flowSpeed: z.number().min(0).max(4).optional(),
	opacity: z.number().min(0).max(1).optional()
});

export type ShaderFillContent = z.infer<typeof ShaderFillContentSchema>;

const ShaderFillUniforms = d.struct({
	color0: d.vec3f,
	color1: d.vec3f,
	color2: d.vec3f,
	progress: d.f32,
	flowSpeed: d.f32,
	opacity: d.f32,
	// Bounds in 0..1 canvas-UV space. Inside the rect the shader paints; outside
	// it passes through. Canvas dimensions default to the native 4K horizontal
	// rect, matching the same well-formed fallback as newspaper-physics — actual
	// values are written every frame from `bounds`.
	boundsUvMin: d.vec2f,
	boundsUvMax: d.vec2f
});

const wgsl = /* wgsl */ `
	let uvMin = layout.$.uniforms.boundsUvMin;
	let uvMax = layout.$.uniforms.boundsUvMax;
	let inOverlay = in.uv.x >= uvMin.x && in.uv.x < uvMax.x
		&& in.uv.y >= uvMin.y && in.uv.y < uvMax.y;

	if (!inOverlay) {
		return inputSample;
	}

	// Local 0..1 UV inside the overlay rect.
	let span = max(uvMax - uvMin, vec2f(0.0001));
	let localUv = (in.uv - uvMin) / span;

	let t = layout.$.uniforms.progress * layout.$.uniforms.flowSpeed;
	let tau = 6.28318530718;

	// Three colour centres drift along Lissajous curves with prime-ish ratios so
	// the pattern doesn't visibly loop within typical 2–8 s clip lengths.
	let p0 = vec2f(0.30 + 0.22 * cos(t * tau * 0.7),  0.50 + 0.30 * sin(t * tau * 0.7));
	let p1 = vec2f(0.70 + 0.25 * cos(t * tau * 0.5 + 1.5), 0.40 + 0.20 * sin(t * tau * 0.5 + 1.5));
	let p2 = vec2f(0.50 + 0.28 * cos(t * tau * 0.9 + 3.0), 0.60 + 0.25 * sin(t * tau * 0.9 + 3.0));

	let d0 = max(distance(localUv, p0), 0.001);
	let d1 = max(distance(localUv, p1), 0.001);
	let d2 = max(distance(localUv, p2), 0.001);

	let w0 = 1.0 / (d0 * d0);
	let w1 = 1.0 / (d1 * d1);
	let w2 = 1.0 / (d2 * d2);
	let totalW = w0 + w1 + w2;

	let gradient = (layout.$.uniforms.color0 * w0
		+ layout.$.uniforms.color1 * w1
		+ layout.$.uniforms.color2 * w2) / totalW;

	let opacity = layout.$.uniforms.opacity;

	// Blend the gradient over the substrate. Alpha is the max so the overlay's
	// silhouette never punches out content underneath (E4: transparent export).
	let outRgb = mix(inputSample.rgb, gradient, opacity);
	let outAlpha = max(inputSample.a, opacity);
	return vec4f(outRgb, outAlpha);
`;

function packColor(hex: string | undefined, fallback: string): ReturnType<typeof d.vec3f> {
	const channels = getRgbColorChannels(hex ?? fallback);
	return d.vec3f(channels.red / 255, channels.green / 255, channels.blue / 255);
}

// Surface compositions in this repo render at the canvas's native size, so
// dividing pixel-space bounds by the canvas dims yields the UV-space rect the
// shader checks. Falls back to 4K horizontal so the shape is well-formed
// before the first paint (same convention as newspaper-physics).
const DEFAULT_CANVAS_WIDTH = 3840;
const DEFAULT_CANVAS_HEIGHT = 2160;

const shaderPass: ShaderPass<ShaderFillContent> = {
	uniforms: ShaderFillUniforms,
	wgsl,
	packUniforms(content, bounds, { progress }) {
		const canvasW = DEFAULT_CANVAS_WIDTH;
		const canvasH = DEFAULT_CANVAS_HEIGHT;
		return {
			color0: packColor(content.color0, DEFAULT_COLOR_0),
			color1: packColor(content.color1, DEFAULT_COLOR_1),
			color2: packColor(content.color2, DEFAULT_COLOR_2),
			progress,
			flowSpeed: content.flowSpeed ?? DEFAULT_FLOW_SPEED,
			opacity: content.opacity ?? DEFAULT_OPACITY,
			boundsUvMin: d.vec2f(bounds.x / canvasW, bounds.y / canvasH),
			boundsUvMax: d.vec2f(
				(bounds.x + bounds.width) / canvasW,
				(bounds.y + bounds.height) / canvasH
			)
		};
	}
};

function defaults(): OverlayDefaults<ShaderFillContent> {
	return {
		content: {
			color0: DEFAULT_COLOR_0,
			color1: DEFAULT_COLOR_1,
			color2: DEFAULT_COLOR_2,
			flowSpeed: DEFAULT_FLOW_SPEED,
			opacity: DEFAULT_OPACITY
		},
		// Centered 40% × 30% rect via normalized-rect so the size is part of the
		// position contract; authors can drag-resize or swap to anchor+offset.
		position: { anchor: 'normalized-rect', rect: { x: 0.3, y: 0.35, width: 0.4, height: 0.3 } },
		enter: { start: 0, duration: 0.108, ease: 'settled' },
		exit: { start: 0.915, duration: 0.085, ease: 'smooth' }
	};
}

export const shaderFillOverlayRenderer: OverlayRenderer<ShaderFillContent> = {
	type: 'shader-fill',
	label: 'Shader fill',
	schema: ShaderFillContentSchema,
	defaults,
	CanvasSource,
	Editor,
	shaderPass
};

export const SHADER_FILL_DEFAULTS = {
	color0: DEFAULT_COLOR_0,
	color1: DEFAULT_COLOR_1,
	color2: DEFAULT_COLOR_2,
	flowSpeed: DEFAULT_FLOW_SPEED,
	opacity: DEFAULT_OPACITY
} as const;
