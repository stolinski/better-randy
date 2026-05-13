import type { ExportFormat } from '$lib/platform/engine-schema';
import { AnimationManager } from '$lib/platform/animation-manager';
import {
	downloadVideoBlob,
	exportTransparentProRes,
	exportTransparentWebM,
	type TransparentVideoExportOptions
} from '$lib/platform/export-video';

import {
	buildResearchPaperAnimationManifest,
	researchPaperAnimState
} from './research-paper-animation.svelte';
import type { ResearchPaperPipeline } from './research-paper-pipeline';

export interface ResearchPaperExportOptions extends Pick<
	TransparentVideoExportOptions,
	'durationSeconds' | 'fps' | 'onProgress'
> {
	canvas: HTMLCanvasElement;
	format: ExportFormat;
	markColorsByIndex: readonly string[];
	markIntensityByIndex: readonly number[];
	pipeline: ResearchPaperPipeline;
}

export async function exportResearchPaperOverlay({
	canvas,
	pipeline,
	durationSeconds,
	fps,
	format,
	markColorsByIndex,
	markIntensityByIndex,
	onProgress
}: ResearchPaperExportOptions): Promise<void> {
	const exportManager = new AnimationManager();

	exportManager.rebuild(buildResearchPaperAnimationManifest());

	const renderFrame: TransparentVideoExportOptions['renderFrame'] = (_frame, timestamp) => {
		const fraction = durationSeconds > 0 ? timestamp / durationSeconds : 0;

		exportManager.progress(fraction);
		pipeline.render({
			animState: researchPaperAnimState,
			markColorsByIndex,
			markIntensityByIndex,
			timestamp
		});
	};

	try {
		if (format === 'prores') {
			const blob = await exportTransparentProRes({
				canvas,
				durationSeconds,
				fps,
				onProgress,
				renderFrame
			});

			downloadVideoBlob(blob, 'research-paper-overlay.mov');
		} else {
			const blob = await exportTransparentWebM({
				canvas,
				durationSeconds,
				fps,
				onProgress,
				renderFrame
			});

			downloadVideoBlob(blob, 'research-paper-overlay.webm');
		}
	} finally {
		exportManager.dispose();
	}
}
