import {
	downloadVideoBlob,
	exportTransparentWebM,
	type TransparentVideoExportOptions
} from '$lib/platform/export-video';

import { renderResearchPaperFrame } from './research-paper-renderer';
import type { ResearchPaperMarkColors } from './research-paper-state.svelte';

export interface ResearchPaperExportOptions extends Pick<
	TransparentVideoExportOptions,
	'durationSeconds' | 'fps' | 'onProgress'
> {
	canvas: HTMLCanvasElement;
	markColors: ResearchPaperMarkColors;
	markIntensity: number;
	sourceElement: HTMLElement;
}

export async function exportResearchPaperOverlay({
	canvas,
	durationSeconds,
	fps,
	markColors,
	markIntensity,
	onProgress,
	sourceElement
}: ResearchPaperExportOptions): Promise<void> {
	const blob = await exportTransparentWebM({
		canvas,
		durationSeconds,
		fps,
		onProgress,
		renderFrame: (_frame, timestamp, context) => {
			renderResearchPaperFrame({
				canvas,
				context,
				durationSeconds,
				markColors,
				markIntensity,
				sourceElement,
				timestamp
			});
		}
	});

	downloadVideoBlob(blob, 'research-paper-overlay.webm');
}
