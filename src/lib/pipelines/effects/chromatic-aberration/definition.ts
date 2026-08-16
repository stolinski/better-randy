import { z } from 'zod';
import type { EffectPipelineDefinition } from '$lib/platform/pipelines/definition-types';

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

export const chromaticAberrationEffectDefinition = {
	type: 'chromatic-aberration',
	label: 'Chromatic aberration',
	schema: ChromaticAberrationEffectSchema,
	defaults: () => ({ params: { strength: 0.25, radial: 1 } })
} satisfies EffectPipelineDefinition<ChromaticAberrationParams>;
