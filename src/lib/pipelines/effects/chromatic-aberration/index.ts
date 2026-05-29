import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';

import Editor from './Editor.svelte';

const ChromaticAberrationParamsSchema = z.object({
	strength: z.number().min(0).max(1).default(0.25),
	radial: z.number().min(0).max(1).default(1)
});

export type ChromaticAberrationParams = z.infer<typeof ChromaticAberrationParamsSchema>;

const ChromaticAberrationEffectSchema = z.object({
	type: z.literal('chromatic-aberration'),
	id: z.string(),
	params: ChromaticAberrationParamsSchema
});

const ChromaticAberrationUniforms = d.struct({
	strength: d.f32,
	radial: d.f32
});

// Splits R / B channels along a direction vector to produce a colored-fringe
// look at high-contrast edges. `strength` scales the magnitude; `radial`
// blends between a uniform horizontal offset (0) and a radial offset that
// grows with distance from the canvas center (1) — the lens-style look.
//
// Alpha is taken from the center sample so the silhouette of the underlying
// content is preserved (rubric E4: transparent-overlay contract). Per-channel
// samples are premultiplied; pairing R*aR / G*aC / B*aB with output alpha aC
// is exactly what produces the cyan / magenta fringe at edges where the
// offset samples cross the alpha boundary.
//
// Max UV offset is 0.01 (~1% of the canvas, ~38 px at 3840 wide). The default
// strength of 0.25 lands at ~10 px split, which reads as a deliberate but
// not screaming chromatic effect.
const fragmentBody = /* wgsl */ `
	let centered = in.uv - vec2f(0.5);
	let dist = length(centered);
	let dir = select(vec2f(1.0, 0.0), centered / max(dist, 0.0001), dist > 0.0001);
	let radialOffset = dir * dist * 2.0;
	let uniformOffset = vec2f(1.0, 0.0);
	let offsetDir = mix(uniformOffset, radialOffset, layout.$.uniforms.radial);
	let offset = offsetDir * layout.$.uniforms.strength * 0.01;

	let rSample = textureSample(layout.$.inputTexture, layout.$.samp, in.uv - offset);
	let bSample = textureSample(layout.$.inputTexture, layout.$.samp, in.uv + offset);

	return vec4f(rSample.r, inputSample.g, bSample.b, inputSample.a);
`;

export const chromaticAberration: EffectRenderer<ChromaticAberrationParams> = {
	type: 'chromatic-aberration',
	label: 'Chromatic aberration',
	schema: ChromaticAberrationEffectSchema,
	defaults: () => ({ params: { strength: 0.25, radial: 1 } }),
	pass: {
		paramsStruct: ChromaticAberrationUniforms,
		fragmentBody,
		pack: (params, _ctx) => ({ strength: params.strength, radial: params.radial })
	},
	Editor
};
