import { z } from 'zod';
import type { PackManifest } from '$lib/platform/packs/types';
import type { EffectPipelineDefinition } from '$lib/platform/pipelines/definition-types';

const PaperGrainParamsSchema = z.object({
	warmth: z.number().min(0).max(1).default(0.5),
	density: z.number().min(0).max(1).default(0.3),
	// Additive shadow grain. Multiplicative grain scales with the pixel it
	// lands on, so a near-black field (luma ~0.02) carries ~0.0002 luma of
	// shimmer — below visibility. lift adds the same grain field directly,
	// weighted toward shadows (alpha − luma), so dark bumper fields get a
	// living grain layer. 0 = exactly the pre-lift output.
	lift: z.number().min(0).max(1).default(0)
});

export type PaperGrainParams = z.infer<typeof PaperGrainParamsSchema>;

const PaperGrainEffectSchema = z.object({
	type: z.literal('paper-grain'),
	id: z.string(),
	params: PaperGrainParamsSchema
});

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

export const paperGrainEffectDefinition = {
	type: 'paper-grain',
	label: 'Paper grain',
	schema: PaperGrainEffectSchema,
	defaults: () => ({ params: { warmth: 0.5, density: 0.3, lift: 0 } }),
	isPackInert: packDeclinesGrain
} satisfies EffectPipelineDefinition<PaperGrainParams>;
