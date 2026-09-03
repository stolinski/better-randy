import { z } from 'zod';
import type { OverlayDefaults } from '$lib/platform/pipelines/types';
import type { OverlayPipelineDefinition } from '$lib/platform/pipelines/definition-types';

// Dimensional type (ADR-0062): a headline set in the Pack's face as a BODY on
// the depth Stage — extruded, beveled, lit by the Stage's material model,
// casting its shadow on whatever stands behind it, and pulling focus as it
// lands. Sizes are the headline's own: cap height as a fraction of the frame
// height, depth and bevel as fractions of the cap height, so the same
// content reads the same on the tube and on a tall frame.
const DimensionalTypeContentSchema = z.object({
	text: z.string().min(1).max(64).default('HEADLINE'),
	/** Cap height as a fraction of the frame height. */
	/** One cap height as a fraction of the frame's short side, so the headline reflows into the tall frame. */
	size: z.number().min(0.03).max(0.4).default(0.12),
	/** Extrusion depth in cap heights. */
	depth: z.number().min(0).max(1.5).default(0.35),
	/** Chamfer bevel in cap heights, taken from the front face's edge. */
	bevel: z.number().min(0).max(0.3).default(0.06),
	/** The settled-place entrance: how far the headline starts lifted off its plane, in cap heights. */
	lift: z.number().min(0).max(3).default(0.8),
	/** …and how far it leans in, in degrees, before it lands. */
	lean: z.number().min(0).max(45).default(14)
});

export type DimensionalTypeContent = z.infer<typeof DimensionalTypeContentSchema>;

function defaults(): OverlayDefaults<DimensionalTypeContent> {
	return {
		content: { text: 'HEADLINE', size: 0.12, depth: 0.35, bevel: 0.06, lift: 0.8, lean: 14 },
		position: { anchor: 'center', offset: { x: 0, y: 0 } },
		enter: { start: 0.08, duration: 0.24, ease: 'settled' },
		exit: { start: 0.86, duration: 0.1, ease: 'smooth' }
	};
}

export const dimensionalTypeOverlayDefinition = {
	type: 'dimensional-type',
	label: 'Dimensional type',
	schema: DimensionalTypeContentSchema,
	defaults,
	readableText: (content) => [{ id: 'headline', text: content.text, role: 'overlay-display' }],
	fieldInkOnBackground: true,
	stageBody: true
} satisfies OverlayPipelineDefinition<DimensionalTypeContent>;
