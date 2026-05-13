import type { AnimationManifest } from '$lib/platform/animation-manager';
import type {
	Tool,
	ToolExportOptions,
	ToolPipeline,
	ToolPipelineFactoryOptions
} from '$lib/platform/tool';
import type { TimelineTrack } from '$lib/platform/TimelineTrackView.svelte';

import {
	buildQuoteFocusAnimationManifest,
	quoteFocusAnimState
} from './quote-focus-animation.svelte';
import { exportQuoteFocusOverlay } from './export-quote-focus';
import {
	createQuoteFocusPipeline,
	type QuoteFocusPipeline,
	type QuoteFocusRenderInputs
} from './quote-focus-pipeline';
import { quoteFocusState } from './quote-focus-state.svelte';

function getAttribution(): string {
	const parts = [
		quoteFocusState.author.trim(),
		quoteFocusState.source.trim(),
		quoteFocusState.dateLabel.trim()
	].filter((part) => part.length > 0);

	return parts.join(' · ');
}

function createPipeline(options: ToolPipelineFactoryOptions): ToolPipeline {
	const pipeline = createQuoteFocusPipeline(options);

	return {
		uploadDom: () => pipeline.uploadDom(),
		render: (inputs) => pipeline.render(inputs as QuoteFocusRenderInputs),
		dispose: () => pipeline.dispose()
	};
}

function buildRenderInputs(timestamp: number): QuoteFocusRenderInputs {
	return {
		animState: quoteFocusAnimState,
		attribution: getAttribution(),
		backgroundVisibility: quoteFocusState.backgroundVisibility,
		cameraMotion: quoteFocusState.cameraMotion,
		durationSeconds: quoteFocusState.durationSeconds,
		focusStart: quoteFocusState.animation.focusStart,
		focusStyle: quoteFocusState.focusStyle,
		highlightColor: quoteFocusState.highlightColor,
		markColor: quoteFocusState.markColor,
		markIntensity: quoteFocusState.markIntensity,
		markStyle: quoteFocusState.markStyle,
		timestamp
	};
}

function buildAnimationManifest(): AnimationManifest {
	return buildQuoteFocusAnimationManifest();
}

function buildTracks(): TimelineTrack[] {
	return [
		{
			id: 'focus',
			label: 'Focus',
			color: quoteFocusState.highlightColor,
			transitions: [
				{
					id: 'enter',
					label: 'Focus',
					start: quoteFocusState.animation.focusStart,
					duration: quoteFocusState.animation.focusDuration,
					minStart: 0,
					maxStart: 0.95,
					minDuration: 0.05,
					maxDuration: 0.9,
					onUpdate: ({ start, duration }) => {
						quoteFocusState.animation.focusStart = start;
						quoteFocusState.animation.focusDuration = duration;
					}
				}
			]
		},
		{
			id: 'mark',
			label: 'Mark',
			color: quoteFocusState.markColor,
			transitions: [
				{
					id: 'enter',
					label: 'Mark',
					start: quoteFocusState.animation.markStart,
					duration: quoteFocusState.animation.markDuration,
					minStart: 0,
					maxStart: 0.95,
					minDuration: 0.05,
					maxDuration: 0.9,
					onUpdate: ({ start, duration }) => {
						quoteFocusState.animation.markStart = start;
						quoteFocusState.animation.markDuration = duration;
					}
				}
			]
		}
	];
}

function touchDomState(): void {
	quoteFocusState.body;
	quoteFocusState.quote;
	quoteFocusState.author;
	quoteFocusState.source;
	quoteFocusState.dateLabel;
	quoteFocusState.fontFamily;
	quoteFocusState.paperColor;
	quoteFocusState.inkColor;
	quoteFocusState.showSourceMetadata;
}

function touchRenderState(): void {
	quoteFocusState.focusStyle;
	quoteFocusState.markStyle;
	quoteFocusState.markIntensity;
	quoteFocusState.markColor;
	quoteFocusState.highlightColor;
	quoteFocusState.cameraMotion;
	quoteFocusState.backgroundVisibility;
}

async function exportToFile({ canvas, pipeline, onProgress }: ToolExportOptions): Promise<void> {
	await exportQuoteFocusOverlay({
		canvas,
		pipeline: pipeline as QuoteFocusPipeline,
		durationSeconds: quoteFocusState.durationSeconds,
		fps: quoteFocusState.fps,
		onProgress,
		renderInputs: {
			attribution: getAttribution(),
			backgroundVisibility: quoteFocusState.backgroundVisibility,
			cameraMotion: quoteFocusState.cameraMotion,
			focusStart: quoteFocusState.animation.focusStart,
			focusStyle: quoteFocusState.focusStyle,
			highlightColor: quoteFocusState.highlightColor,
			markColor: quoteFocusState.markColor,
			markIntensity: quoteFocusState.markIntensity,
			markStyle: quoteFocusState.markStyle
		}
	});
}

export const quoteFocusTool: Tool = {
	title: 'Quote Focus',
	kicker: 'Tool',
	controlsId: 'quote-focus-controls',
	get transport() {
		return quoteFocusState;
	},
	createPipeline,
	buildAnimationManifest,
	buildTracks,
	buildRenderInputs,
	touchDomState,
	touchRenderState,
	exportToFile
};
