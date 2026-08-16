import { z } from 'zod';
import type { OverlayDefaults } from '$lib/platform/pipelines/types';
import {
	formatCounterReadableValue,
	resolveCounterValueAtProgress
} from '$lib/utils/counter-readable-value';
import { VARIANT_IDS } from './variants/variant-ids';
import type { OverlayPipelineDefinition } from '$lib/platform/pipelines/definition-types';

const CounterContentSchema = z.object({
	variant: z.enum(VARIANT_IDS).default('slot-machine-roll'),
	from: z.number(),
	to: z.number(),
	format: z.enum(['integer', 'currency', 'percent', 'timecode']).default('integer'),
	ease: z.string().default('cubic-bezier(0.22, 1, 0.36, 1)'),
	// The roll runs over [rollStart, rollStart + rollWindow] (fractions of the
	// clip) and then HOLDS the landed value — a draggable timeline clip, so the
	// count's timing is composition data rather than a hardcoded window.
	rollStart: z.number().min(0).max(1).default(0),
	rollWindow: z.number().min(0).max(1).default(0.78)
});

export type CounterContent = z.infer<typeof CounterContentSchema>;

function defaults(): OverlayDefaults<CounterContent> {
	return {
		content: {
			variant: 'slot-machine-roll',
			from: 0,
			to: 12450,
			format: 'integer',
			ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
			rollStart: 0,
			rollWindow: 0.78
		},
		position: { anchor: 'center', offset: { x: 0, y: 0 } },
		enter: { start: 0.05, duration: 0.15, ease: 'smooth' },
		exit: { start: 0.88, duration: 0.08, ease: 'smooth' }
	};
}

export const counterOverlayDefinition = {
	type: 'counter',
	label: 'Counter',
	schema: CounterContentSchema,
	defaults,
	readableText: (content, context) => [
		{
			id: 'value',
			text: formatCounterReadableValue(
				content,
				resolveCounterValueAtProgress(content, context.progress)
			),
			role: 'overlay-display'
		}
	],
	fieldInkOnBackground: true
} satisfies OverlayPipelineDefinition<CounterContent>;
