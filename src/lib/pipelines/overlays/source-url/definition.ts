import { z } from 'zod';
import type { OverlayDefaults } from '$lib/platform/pipelines/types';
import type { OverlayPipelineDefinition } from '$lib/platform/pipelines/definition-types';

export const SourceUrlContentSchema = z.strictObject({ url: z.string().trim().min(3).max(2048) });

export type SourceUrlContent = z.infer<typeof SourceUrlContentSchema>;

function defaults(): OverlayDefaults<SourceUrlContent> {
	return {
		content: { url: 'github.com/syntaxfm' },
		position: { anchor: 'center' },
		enter: { start: 0.09, duration: 0.0467, ease: 'sharp' },
		exit: { start: 0.8833, duration: 0.05, ease: 'sharp' }
	};
}

export const sourceUrlOverlayDefinition = {
	type: 'source-url',
	label: 'Source URL',
	schema: SourceUrlContentSchema,
	defaults,
	readableText: (content) => [{ id: 'url', text: content.url, role: 'overlay-secondary' }],
	disableEntryOffset: true,
	disableOpacityTransition: true
} satisfies OverlayPipelineDefinition<SourceUrlContent>;
