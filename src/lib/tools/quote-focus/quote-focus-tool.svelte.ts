import type { AnimationManifest } from '$lib/platform/animation-manager';
import {
	engineState,
	getQuoteFocusMarkAppearance,
	getQuoteFocusSurface
} from '$lib/platform/engine-state.svelte';

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

function getAttribution(): string {
	const surface = getQuoteFocusSurface();
	const parts = [
		surface.content.author.trim(),
		surface.content.source.trim(),
		surface.content.dateLabel.trim()
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
	const surface = getQuoteFocusSurface();
	const markAppearance = getQuoteFocusMarkAppearance();

	return {
		animState: quoteFocusAnimState,
		attribution: getAttribution(),
		backgroundVisibility: surface.backgroundVisibility,
		cameraMotion: surface.camera,
		durationSeconds: engineState.transport.durationSeconds,
		focusStart: surface.focus.start,
		focusStyle: surface.focus.style,
		highlightColor: engineState.marks.defaults.highlight.color,
		markColor: markAppearance.color,
		markIntensity: markAppearance.intensity,
		markStyle: surface.mark.style,
		timestamp
	};
}

function buildAnimationManifest(): AnimationManifest {
	return buildQuoteFocusAnimationManifest();
}

function buildTracks(): TimelineTrack[] {
	const surface = getQuoteFocusSurface();
	const markAppearance = getQuoteFocusMarkAppearance();

	return [
		{
			id: 'focus',
			label: 'Focus',
			color: engineState.marks.defaults.highlight.color,
			transitions: [
				{
					id: 'enter',
					label: 'Focus',
					start: surface.focus.start,
					duration: surface.focus.duration,
					minStart: 0,
					maxStart: 0.95,
					minDuration: 0.05,
					maxDuration: 0.9,
					onUpdate: ({ start, duration }) => {
						surface.focus.start = start;
						surface.focus.duration = duration;
					}
				}
			]
		},
		{
			id: 'mark',
			label: 'Mark',
			color: markAppearance.color,
			transitions: [
				{
					id: 'enter',
					label: 'Mark',
					start: surface.mark.start,
					duration: surface.mark.duration,
					minStart: 0,
					maxStart: 0.95,
					minDuration: 0.05,
					maxDuration: 0.9,
					onUpdate: ({ start, duration }) => {
						surface.mark.start = start;
						surface.mark.duration = duration;
					}
				}
			]
		}
	];
}

function touchDomState(): void {
	const surface = getQuoteFocusSurface();

	void surface.content.body;
	void surface.content.author;
	void surface.content.source;
	void surface.content.dateLabel;
	void surface.showSourceMetadata;
	void engineState.typography.fontFamily;
	void engineState.typography.paperColor;
	void engineState.typography.inkColor;
}

function touchRenderState(): void {
	const surface = getQuoteFocusSurface();

	void surface.focus.style;
	void surface.mark.style;
	void surface.camera;
	void surface.backgroundVisibility;
	void engineState.marks.defaults.highlight.color;
	void engineState.marks.defaults.highlight.intensity;
	void engineState.marks.defaults.underline.color;
	void engineState.marks.defaults.underline.intensity;
	void engineState.marks.defaults.circle.color;
	void engineState.marks.defaults.circle.intensity;
}

async function exportToFile({ canvas, pipeline, onProgress }: ToolExportOptions): Promise<void> {
	const surface = getQuoteFocusSurface();
	const markAppearance = getQuoteFocusMarkAppearance();

	await exportQuoteFocusOverlay({
		canvas,
		pipeline: pipeline as QuoteFocusPipeline,
		durationSeconds: engineState.transport.durationSeconds,
		fps: engineState.transport.fps,
		onProgress,
		renderInputs: {
			attribution: getAttribution(),
			backgroundVisibility: surface.backgroundVisibility,
			cameraMotion: surface.camera,
			focusStart: surface.focus.start,
			focusStyle: surface.focus.style,
			highlightColor: engineState.marks.defaults.highlight.color,
			markColor: markAppearance.color,
			markIntensity: markAppearance.intensity,
			markStyle: surface.mark.style
		}
	});
}

export const quoteFocusTool: Tool = {
	title: 'Quote Focus',
	controlsId: 'quote-focus-controls',
	get transport() {
		return engineState.transport;
	},
	createPipeline,
	buildAnimationManifest,
	buildTracks,
	buildRenderInputs,
	touchDomState,
	touchRenderState,
	exportToFile
};
