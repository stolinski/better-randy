import { AnimationManager } from '$lib/platform/animation-manager';
import {
	downloadVideoBlob,
	exportTransparentWebM,
	type TransparentVideoExportOptions
} from '$lib/platform/export-video';

import {
	buildQuoteFocusAnimationManifest,
	quoteFocusAnimState
} from './quote-focus-animation.svelte';
import type {
	QuoteFocusPipeline,
	QuoteFocusRenderInputs
} from './quote-focus-pipeline';

export interface QuoteFocusExportOptions
	extends Pick<TransparentVideoExportOptions, 'durationSeconds' | 'fps' | 'onProgress'> {
	canvas: HTMLCanvasElement;
	pipeline: QuoteFocusPipeline;
	renderInputs: Omit<QuoteFocusRenderInputs, 'animState' | 'timestamp' | 'durationSeconds'>;
}

export async function exportQuoteFocusOverlay({
	canvas,
	pipeline,
	durationSeconds,
	fps,
	onProgress,
	renderInputs
}: QuoteFocusExportOptions): Promise<void> {
	const exportManager = new AnimationManager();

	exportManager.rebuild(buildQuoteFocusAnimationManifest());

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
					...renderInputs,
					animState: quoteFocusAnimState,
					durationSeconds,
					timestamp
				});
			}
		});

		downloadVideoBlob(blob, 'quote-focus-overlay.webm');
	} finally {
		exportManager.dispose();
	}
}
