import { d } from 'typegpu';

import { packState } from '$lib/platform/engine-state.svelte';
import { getPack } from '$lib/platform/packs/registry';
import type { PackManifest } from '$lib/platform/packs/types';
import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { resolveRoleNumber } from '$lib/utils/color';

import Editor from './Editor.svelte';
import {
	paperGrainEffectDefinition,
	type PaperGrainParams as PaperGrainParamsDefinition
} from './definition';

export type PaperGrainParams = PaperGrainParamsDefinition;
const PaperGrainUniforms = d.struct({
	warmth: d.f32,
	density: d.f32,
	lift: d.f32,
	// Clip timestamp in seconds. Drives the fine-octave grain shimmer at a film
	// cadence (24 updates/s) so a held frame is alive (no byte-identical hold)
	// rather than a frozen grain pattern. Frame-deterministic (derived from the
	// frame's time, not wall-clock), so preview and export match.
	grainTime: d.f32
});

// Two-octave value-noise grain multiplied into the input texture. Multi-scale
// per quality-rubric Q2; the density parameter caps overall strength so the
// grain stays a supporting layer (Q12: ≤2 supports, hero unchanged). Alpha is
// untouched so the transparent-overlay export contract holds (E4).
const fragmentBody = /* wgsl */ `
	let coarsePos = in.uv * vec2f(220.0, 220.0);
	let coarseI = floor(coarsePos);
	let coarseF = fract(coarsePos);
	let coarseS = coarseF * coarseF * (vec2f(3.0) - 2.0 * coarseF);
	let c00 = fract(sin(dot(coarseI, vec2f(127.1, 311.7))) * 43758.5453);
	let c10 = fract(sin(dot(coarseI + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
	let c01 = fract(sin(dot(coarseI + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let c11 = fract(sin(dot(coarseI + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
	let coarseN = mix(mix(c00, c10, coarseS.x), mix(c01, c11, coarseS.x), coarseS.y);

	let finePos = in.uv * vec2f(680.0, 680.0);
		// Fine octave = film grain: re-seeded each grain-frame (24/s) via a phase
		// added inside the hash so the field shimmers IN PLACE (no directional
		// drift) and a held frame is never byte-identical. Coarse octave above
		// stays static — paper fibre structure doesn't move.
		let gphase = floor(layout.$.uniforms.grainTime * 24.0) * 11.13;
	let fineI = floor(finePos);
	let fineF = fract(finePos);
	let fineS = fineF * fineF * (vec2f(3.0) - 2.0 * fineF);
	let f00 = fract(sin(dot(fineI, vec2f(269.5, 183.3)) + gphase) * 43758.5453);
	let f10 = fract(sin(dot(fineI + vec2f(1.0, 0.0), vec2f(269.5, 183.3)) + gphase) * 43758.5453);
	let f01 = fract(sin(dot(fineI + vec2f(0.0, 1.0), vec2f(269.5, 183.3)) + gphase) * 43758.5453);
	let f11 = fract(sin(dot(fineI + vec2f(1.0, 1.0), vec2f(269.5, 183.3)) + gphase) * 43758.5453);
	let fineN = mix(mix(f00, f10, fineS.x), mix(f01, f11, fineS.x), fineS.y);

	let warmth = layout.$.uniforms.warmth;
	let density = layout.$.uniforms.density;
	let lift = layout.$.uniforms.lift;

	// Grain peak is ±(0.06 * density); at density=0.3 that's ±0.018 (subtle,
	// reads as paper fibre). At density=1 it's ±0.06 (visible but never a
	// dominant layer — Q12).
	let grainN = coarseN * 0.55 + fineN * 0.45 - 0.5;
	let grain = grainN * (0.06 * density);
	// Warmth biases the tint towards a warm-paper cream at full strength
	// without crushing channels; range matches what a paper substrate carries.
	let warmthTint = vec3f(1.0, 1.0 - warmth * 0.04, 1.0 - warmth * 0.08);
	let tint = warmthTint + vec3f(grain);

	// Additive shadow grain (lift): the same grain field coupled directly
	// instead of through the pixel value, weighted by (alpha − luma) — full
	// strength on an opaque near-black field, fading to nothing on bright
	// content (the multiplicative term owns that register) and to zero with
	// alpha (premultiplied-correct; transparent overlays stay untreated, E4).
	let luma = dot(inputSample.rgb, vec3f(0.2126, 0.7152, 0.0722));
	let liftGrain = grainN * (0.06 * lift) * max(inputSample.a - luma, 0.0);

	// Only tint pixels that have content (alpha > 0) so transparent regions
	// stay transparent. Multiplicative blend preserves the substrate.
	let mask = step(0.001, inputSample.a);
	let outRgb = mix(inputSample.rgb, inputSample.rgb * tint + vec3f(liftGrain), mask);
	return vec4f(outRgb, inputSample.a);
`;

// Categorical decline (the house 'none' vocabulary, same as depth/light/
// textShadow claims): the pack rules paper tooth out of its material world.
// Distinct from a NUMBER, which is a dial — a dialed grain is live (editors
// stay), only 'none' reads as pack · off. Binary UI state must never hang
// off a magic point on a continuous dial (Scott, 2026-07-14: a draggable
// strength hitting exactly 0 would delete its own editors).
function packDeclinesGrain(pack: PackManifest): boolean {
	const role = pack.roles['paper-grain.strength'];
	return role?.kind === 'style' && role.value === 'none';
}

export const paperGrainEffectRenderer: EffectRenderer<PaperGrainParams> = {
	...paperGrainEffectDefinition,
	pass: {
		paramsStruct: PaperGrainUniforms,
		fragmentBody,
		pack: (params, ctx) => {
			// Pack-routed grain claim (ADR-0039 §3): paper tooth is a PAPER
			// material — a pack whose substrate isn't paper claims 'none' and the
			// authored effect goes inert (grain reads as dirt on a white studio
			// field; a phosphor screen has no tooth) instead of every composition
			// dropping the effect per pack. A NUMBER claim is a dial (quieter
			// grain, still live). Warmth scales too: the warm-paper tint applies
			// even at density 0, and a warm cast is exactly the leak a non-paper
			// pack is declining. Silent packs resolve 1 — bit-identical. Uniforms
			// pack per frame, so a pack switch needs no extra reactivity.
			const activePack = getPack(packState.slug);
			const strength = packDeclinesGrain(activePack)
				? 0
				: resolveRoleNumber(activePack.roles['paper-grain.strength'], 1);
			return {
				warmth: params.warmth * strength,
				density: params.density * strength,
				// Pack-chrome recipes bypass the zod parse (withPackChrome passes raw
				// manifest params), so a missing lift must not feed NaN to the GPU.
				lift: (params.lift ?? 0) * strength,
				grainTime: ctx.timestamp
			};
		}
	},
	Editor
};
