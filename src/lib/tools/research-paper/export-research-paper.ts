import { AnimationManager } from '$lib/platform/animation-manager';
import {
	downloadVideoBlob,
	exportTransparentWebM,
	type TransparentVideoExportOptions
} from '$lib/platform/export-video';

import {
	buildResearchPaperAnimationManifest,
	researchPaperAnimState
} from './research-paper-animation.svelte';
import type { ResearchPaperPipeline } from './research-paper-pipeline';
import type { ResearchPaperMarkColors } from './research-paper-state.svelte';

export interface ResearchPaperExportOptions extends Pick<
	TransparentVideoExportOptions,
	'durationSeconds' | 'fps' | 'onProgress'
> {
	canvas: HTMLCanvasElement;
	markColors: ResearchPaperMarkColors;
	markIntensity: number;
	pipeline: ResearchPaperPipeline;
}

export async function exportResearchPaperOverlay({
	canvas,
	pipeline,
	durationSeconds,
	fps,
	markColors,
	markIntensity,
	onProgress
}: ResearchPaperExportOptions): Promise<void> {
	const exportManager = new AnimationManager();

	exportManager.rebuild(buildResearchPaperAnimationManifest());

	try {
		const blob = await exportTransparentWebM({
			canvas,
			durationSeconds,
			fps,
			onProgress,
			renderFrame: (_frame, timestamp) => {
				const fraction = durationSeconds > 0 ? timestamp / durationSeconds : 0;

				exportManager.progress(fraction);
				pipeline.render({
					animState: researchPaperAnimState,
					markColors,
					markIntensity,
					timestamp
				});
			}
		});

		downloadVideoBlob(blob, 'research-paper-overlay.webm');
	} finally {
		exportManager.dispose();
	}
}
