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
	DEFAULT_MARK_ANIMATION,
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
		markColors: researchPaperState.markColors,
		markIntensity: researchPaperState.markIntensity,
		timestamp
	};
}

function buildAnimationManifest(): AnimationManifest {
	return buildResearchPaperAnimationManifest();
}

function buildTracks(): TimelineTrack[] {
	const parsedMarks = readParsedMarks();

	const trackList: TimelineTrack[] = [
		{
			id: 'paper',
			label: 'Paper',
			color: researchPaperState.paperColor,
			start: 0,
			duration: researchPaperState.animation.paperEntranceDuration,
			minStart: 0,
			maxStart: 0,
			minDuration: 0.1,
			maxDuration: 0.6,
			onUpdate: ({ duration }) => {
				researchPaperState.animation.paperEntranceDuration = duration;
			}
		}
	];

	parsedMarks.forEach((mark, index) => {
		const config = researchPaperState.animation.marks[index] ?? DEFAULT_MARK_ANIMATION;

		trackList.push({
			id: `mark-${index}`,
			label: truncateMiddle(mark.text, 20),
			color: researchPaperState.markColors[mark.style],
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
		});
	});

	return trackList;
}

function syncDerived(): void {
	const parsedMarks = readParsedMarks();
	const count = parsedMarks.length;
	const current = researchPaperState.animation.marks.length;

	if (count > current) {
		for (let index = current; index < count; index += 1) {
			researchPaperState.animation.marks.push({ ...DEFAULT_MARK_ANIMATION });
		}
	} else if (count < current) {
		researchPaperState.animation.marks.length = count;
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
	researchPaperState.markIntensity;
	researchPaperState.markColors.highlight;
	researchPaperState.markColors.underline;
	researchPaperState.markColors.circle;
	researchPaperState.markColors.strike;
}

async function exportToFile({ canvas, pipeline, onProgress }: ToolExportOptions): Promise<void> {
	await exportResearchPaperOverlay({
		canvas,
		pipeline: pipeline as ResearchPaperPipeline,
		durationSeconds: researchPaperState.durationSeconds,
		fps: researchPaperState.fps,
		markColors: researchPaperState.markColors,
		markIntensity: researchPaperState.markIntensity,
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
