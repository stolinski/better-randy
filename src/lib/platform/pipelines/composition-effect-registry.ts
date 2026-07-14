import { z } from 'zod';

import type { Effect } from '../engine-schema';

export interface CompositionEffectRegistration {
	type: string;
	label: string;
	schema: z.ZodType<Effect>;
}

const DepthOfFieldEffectSchema = z.object({
	type: z.literal('depth-of-field'),
	id: z.string().min(1),
	params: z.object({
		focusZ: z.number().min(0).max(1).default(0),
		aperture: z.number().min(0).max(1).default(0),
		focusPull: z
			.object({
				from: z.number().min(0).max(1),
				to: z.number().min(0).max(1),
				start: z.number().min(0).max(1).default(0),
				duration: z.number().gt(0).max(1).default(1)
			})
			.optional(),
		backdrop: z
			.object({
				strength: z.number().min(0).max(1).default(0),
				edgeBlur: z.number().min(0).max(1).default(1),
				vignette: z.number().min(0).max(1).default(0.5),
				speckle: z.number().min(0).max(1).default(0.5),
				color: z
					.string()
					.regex(/^#[0-9a-fA-F]{6}$/)
					.default('#0f0f14'),
				grain: z.number().min(0).max(1).default(0.02)
			})
			.optional()
	})
});

const depthOfField: CompositionEffectRegistration = {
	type: 'depth-of-field',
	label: 'Depth of field',
	schema: DepthOfFieldEffectSchema
};

export const COMPOSITION_EFFECT_REGISTRY: Readonly<Record<string, CompositionEffectRegistration>> =
	{
		depthOfField
	};

export function getCompositionEffectRegistration(
	type: string
): CompositionEffectRegistration | null {
	return (
		Object.values(COMPOSITION_EFFECT_REGISTRY).find((registration) => registration.type === type) ??
		null
	);
}
