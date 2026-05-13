import {
	getAnnotatedTextParagraphs,
	type AnnotationMarkStyle
} from '$lib/annotations/annotation-marks';
import type { AnimationManifest } from '$lib/platform/animation-manager';
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
	researchPaperAnimState
} from './research-paper-animation.svelte';
import { exportResearchPaperOverlay } from './export-research-paper';
import {
	createResearchPaperPipeline,
	type ResearchPaperPipeline,
	type ResearchPaperRenderInputs
} from './research-paper-pipeline';
import {
	createDefaultMarkAnimation,
	researchPaperState
} from './research-paper-state.svelte';

interface ParsedMark {
	style: AnnotationMarkStyle;
	text: string;
}

function readParsedMarks(): ParsedMark[] {
	const result: ParsedMark[] = [];

	for (const paragraph of getAnnotatedTextParagraphs(researchPaperState.body)) {
		for (const segment of paragraph.segments) {
			if (segment.markStyle) {
				result.push({ style: segment.markStyle, text: segment.text });
			}
		}
	}

	return result;
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
		markColorsByIndex: researchPaperState.animation.marks.map((mark) => mark.color),
		markIntensityByIndex: researchPaperState.animation.marks.map((mark) => mark.intensity),
		timestamp
	};
}

function buildAnimationManifest(): AnimationManifest {
	return buildResearchPaperAnimationManifest();
}

function buildTracks(): TimelineTrack[] {
	const parsedMarks = readParsedMarks();
	const paper = researchPaperState.animation.paper;

	const trackList: TimelineTrack[] = [
		{
			id: 'paper',
			label: 'Paper',
			color: researchPaperState.paperColor,
			transitions: [
				{
					id: 'enter',
					label: 'Paper in',
					start: paper.enter.start,
					duration: paper.enter.duration,
					ramp: 'in',
					minStart: 0,
					maxStart: 0.9,
					minDuration: 0.05,
					maxDuration: 0.6,
					onUpdate: ({ start, duration }) => {
						paper.enter.start = start;
						paper.enter.duration = duration;
					}
				},
				{
					id: 'exit',
					label: 'Paper out',
					start: paper.exit.start,
					duration: paper.exit.duration,
					ramp: 'out',
					minStart: 0.1,
					maxStart: 0.95,
					minDuration: 0.05,
					maxDuration: 0.6,
					onUpdate: ({ start, duration }) => {
						paper.exit.start = start;
						paper.exit.duration = duration;
					}
				}
			],
			onTrackMove: (delta) => {
				const nextEnterStart = clampNumber(paper.enter.start + delta, 0, 0.9);
				const enterDelta = nextEnterStart - paper.enter.start;
				const nextExitStart = clampNumber(paper.exit.start + enterDelta, 0.1, 0.95);

				paper.enter.start = nextEnterStart;
				paper.exit.start = nextExitStart;
			}
		}
	];

	parsedMarks.forEach((mark, index) => {
		const config =
			researchPaperState.animation.marks[index] ?? createDefaultMarkAnimation(mark.style);
		const label = truncateMiddle(mark.text, 20);

		trackList.push({
			id: `mark-${index}`,
			label,
			color: config.color,
			transitions: [
				{
					id: 'enter',
					label,
					start: config.start,
					duration: config.duration,
					minStart: 0,
					maxStart: 0.95,
					minDuration: 0.05,
					maxDuration: 0.9,
					onUpdate: ({ start, duration }) => {
						const target = researchPaperState.animation.marks[index];

						if (!target) {
							return;
						}

						target.start = start;
						target.duration = duration;
					}
				}
			]
		});
	});

	return trackList;
}

function syncDerived(): void {
	const parsedMarks = readParsedMarks();
	const marks = researchPaperState.animation.marks;

	for (let index = 0; index < parsedMarks.length; index += 1) {
		const parsed = parsedMarks[index];
		const existing = marks[index];

		if (!existing) {
			marks.push(createDefaultMarkAnimation(parsed.style));
			continue;
		}

		if (existing.style !== parsed.style) {
			marks[index] = {
				...createDefaultMarkAnimation(parsed.style),
				start: existing.start,
				duration: existing.duration
			};
		}
	}

	if (marks.length > parsedMarks.length) {
		marks.length = parsedMarks.length;
	}
}

function touchDomState(): void {
	researchPaperState.title;
	researchPaperState.sourceUrl;
	researchPaperState.body;
	researchPaperState.fontFamily;
	researchPaperState.paperColor;
	researchPaperState.inkColor;
}

function touchRenderState(): void {
	for (const mark of researchPaperState.animation.marks) {
		mark.color;
		mark.intensity;
	}
}

async function exportToFile({ canvas, pipeline, onProgress }: ToolExportOptions): Promise<void> {
	await exportResearchPaperOverlay({
		canvas,
		pipeline: pipeline as ResearchPaperPipeline,
		durationSeconds: researchPaperState.durationSeconds,
		fps: researchPaperState.fps,
		format: researchPaperState.format,
		markColorsByIndex: researchPaperState.animation.marks.map((mark) => mark.color),
		markIntensityByIndex: researchPaperState.animation.marks.map((mark) => mark.intensity),
		onProgress
	});
}

export const researchPaperTool: Tool = {
	title: 'Research Paper',
	kicker: 'Tool',
	controlsId: 'research-paper-controls',
	get transport() {
		return researchPaperState;
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
