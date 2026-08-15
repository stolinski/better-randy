import { z } from 'zod';

import type { OverlayDefaults, OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';

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

export const sourceUrlOverlayRenderer: OverlayRenderer<SourceUrlContent> = {
	type: 'source-url',
	label: 'Source URL',
	schema: SourceUrlContentSchema,
	defaults,
	CanvasSource,
	Editor,
	readableText: (content) => [{ id: 'url', text: content.url, role: 'overlay-secondary' }],
	disableEntryOffset: true,
	disableOpacityTransition: true
};
