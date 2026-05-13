import type { AnimationManifest } from '$lib/platform/animation-manager';
import { resolveMarkForIndex } from '$lib/platform/engine-schema';
import {
	engineState,
	ensureMarkTimingAtIndex,
	getResearchPaperSurface
} from '$lib/platform/engine-state.svelte';
import type {
	Tool,
	ToolExportOptions,
	ToolPipeline,
	ToolPipelineFactoryOptions
} from '$lib/platform/tool';
import type { TimelineTrack } from '$lib/platform/TimelineTrackView.svelte';
import { clampNumber } from '$lib/utils/math';
import { truncateMiddle } from '$lib/utils/string';

import {
	buildResearchPaperAnimationManifest,
	readResearchPaperMarks,
	researchPaperAnimState
} from './research-paper-animation.svelte';
import { exportResearchPaperOverlay } from './export-research-paper';
import {
	createResearchPaperPipeline,
	type ResearchPaperPipeline,
	type ResearchPaperRenderInputs
} from './research-paper-pipeline';

function getMarkColorsByIndex(): string[] {
	const parsedMarks = readResearchPaperMarks();

	return parsedMarks.map(
		(mark, index) => resolveMarkForIndex(mark.style, index, engineState.marks).color
	);
}

function getMarkIntensityByIndex(): number[] {
	const parsedMarks = readResearchPaperMarks();

	return parsedMarks.map(
		(mark, index) => resolveMarkForIndex(mark.style, index, engineState.marks).intensity
	);
}

function createPipeline(options: ToolPipelineFactoryOptions): ToolPipeline {
	const pipeline = createResearchPaperPipeline(options);

	return {
		uploadDom: () => pipeline.uploadDom(),
		render: (inputs) => pipeline.render(inputs as ResearchPaperRenderInputs),
		dispose: () => pipeline.dispose()
	};
}

function buildRenderInputs(timestamp: number): ResearchPaperRenderInputs {
	return {
		animState: researchPaperAnimState,
		markColorsByIndex: getMarkColorsByIndex(),
		markIntensityByIndex: getMarkIntensityByIndex(),
		timestamp
	};
}

function buildAnimationManifest(): AnimationManifest {
	return buildResearchPaperAnimationManifest();
}

function buildTracks(): TimelineTrack[] {
	const parsedMarks = readResearchPaperMarks();
	const surface = getResearchPaperSurface();
	const enter = surface.enter;
	const exit = surface.exit;

	const trackList: TimelineTrack[] = [
		{
			id: 'paper',
			label: 'Paper',
			color: engineState.typography.paperColor,
			transitions: [
				{
					id: 'enter',
					label: 'Paper in',
					start: enter.start,
					duration: enter.duration,
					ramp: 'in',
					minStart: 0,
					maxStart: 0.9,
					minDuration: 0.05,
					maxDuration: 0.6,
					onUpdate: ({ start, duration }) => {
						enter.start = start;
						enter.duration = duration;
					}
				},
				{
					id: 'exit',
					label: 'Paper out',
					start: exit.start,
					duration: exit.duration,
					ramp: 'out',
					minStart: 0.1,
					maxStart: 0.95,
					minDuration: 0.05,
					maxDuration: 0.6,
					onUpdate: ({ start, duration }) => {
						exit.start = start;
						exit.duration = duration;
					}
				}
			],
			onTrackMove: (delta) => {
				const nextEnterStart = clampNumber(enter.start + delta, 0, 0.9);
				const enterDelta = nextEnterStart - enter.start;
				const nextExitStart = clampNumber(exit.start + enterDelta, 0.1, 0.95);

				enter.start = nextEnterStart;
				exit.start = nextExitStart;
			}
		}
	];

	parsedMarks.forEach((mark, index) => {
		const resolved = resolveMarkForIndex(mark.style, index, engineState.marks);
		const label = truncateMiddle(mark.text, 20);

		trackList.push({
			id: `mark-${index}`,
			label,
			color: resolved.color,
			transitions: [
				{
					id: 'enter',
					label,
					start: resolved.start,
					duration: resolved.duration,
					minStart: 0,
					maxStart: 0.95,
					minDuration: 0.05,
					maxDuration: 0.9,
					onUpdate: ({ start, duration }) => {
						const timing = ensureMarkTimingAtIndex(index);

						timing.start = start;
						timing.duration = duration;
					}
				}
			]
		});
	});

	return trackList;
}

function syncDerived(): void {
	const parsedMarks = readResearchPaperMarks();
	const timings = engineState.marks.timings;

	for (let index = 0; index < parsedMarks.length; index += 1) {
		ensureMarkTimingAtIndex(index);
	}

	if (timings.length > parsedMarks.length) {
		timings.length = parsedMarks.length;
	}
}

function touchDomState(): void {
	const surface = getResearchPaperSurface();

	void surface.content.title;
	void surface.content.sourceUrl;
	void surface.content.body;
	void engineState.typography.fontFamily;
	void engineState.typography.paperColor;
	void engineState.typography.inkColor;
}

function touchRenderState(): void {
	for (const timing of engineState.marks.timings) {
		void timing.color;
		void timing.intensity;
	}

	void engineState.marks.defaults.highlight.color;
	void engineState.marks.defaults.highlight.intensity;
	void engineState.marks.defaults.underline.color;
	void engineState.marks.defaults.underline.intensity;
	void engineState.marks.defaults.strike.color;
	void engineState.marks.defaults.strike.intensity;
	void engineState.marks.defaults.circle.color;
	void engineState.marks.defaults.circle.intensity;
}

async function exportToFile({ canvas, pipeline, onProgress }: ToolExportOptions): Promise<void> {
	await exportResearchPaperOverlay({
		canvas,
		pipeline: pipeline as ResearchPaperPipeline,
		durationSeconds: engineState.transport.durationSeconds,
		fps: engineState.transport.fps,
		format: engineState.transport.format,
		markColorsByIndex: getMarkColorsByIndex(),
		markIntensityByIndex: getMarkIntensityByIndex(),
		onProgress
	});
}

export const researchPaperTool: Tool = {
	title: 'Research Paper',
	controlsId: 'research-paper-controls',
	get transport() {
		return engineState.transport;
	},
	createPipeline,
	buildAnimationManifest,
	buildTracks,
	buildRenderInputs,
	touchDomState,
	touchRenderState,
	syncDerived,
	exportToFile
};
