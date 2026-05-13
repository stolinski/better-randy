import type { AnnotationMarkStyle } from '$lib/annotations/annotation-marks';
import type { ExportFormat } from '$lib/platform/tool';
import type { VideoOrientation } from '$lib/utils/video-frame';

export type ResearchPaperMarkStyle = AnnotationMarkStyle;
export type ResearchPaperFontFamily = 'serif' | 'sans' | 'mono' | 'condensed';
export type ResearchPaperEase = 'smooth' | 'settled' | 'sharp' | 'bouncy';

export interface ResearchPaperFontDefinition {
	label: string;
	stack: string;
}

export const RESEARCH_PAPER_FONT_FAMILIES: Record<
	ResearchPaperFontFamily,
	ResearchPaperFontDefinition
> = {
	serif: {
		label: 'Serif',
		stack: 'Georgia, "Times New Roman", serif'
	},
	sans: {
		label: 'Sans',
		stack: 'Avenir Next, Helvetica, Arial, sans-serif'
	},
	mono: {
		label: 'Mono',
		stack: '"SFMono-Regular", Consolas, "Liberation Mono", monospace'
	},
	condensed: {
		label: 'Condensed',
		stack: '"Avenir Next Condensed", "Arial Narrow", sans-serif'
	}
};

export const RESEARCH_PAPER_EASES: Record<ResearchPaperEase, { label: string; gsap: string }> = {
	smooth: { label: 'Smooth', gsap: 'power3.out' },
	settled: { label: 'Settled', gsap: 'back.out(1.2)' },
	sharp: { label: 'Sharp', gsap: 'expo.out' },
	bouncy: { label: 'Bouncy', gsap: 'elastic.out(1, 0.5)' }
};

export type ResearchPaperEaseDirection = 'enter' | 'exit';

export function getResearchPaperEaseGsap(
	ease: ResearchPaperEase,
	direction: ResearchPaperEaseDirection
): string {
	const base = RESEARCH_PAPER_EASES[ease].gsap;

	if (direction === 'enter') {
		return base;
	}

	return base.replace('.out', '.in');
}

export interface ResearchPaperMarkDefault {
	color: string;
	intensity: number;
	ease: ResearchPaperEase;
}

export const RESEARCH_PAPER_MARK_DEFAULTS: Record<ResearchPaperMarkStyle, ResearchPaperMarkDefault> = {
	highlight: { color: '#ffd642', intensity: 0.62, ease: 'smooth' },
	underline: { color: '#1f5aff', intensity: 0.62, ease: 'smooth' },
	strike: { color: '#de263a', intensity: 0.62, ease: 'smooth' },
	circle: { color: '#de263a', intensity: 0.62, ease: 'smooth' }
};

export const RESEARCH_PAPER_EDITOR_MARK_COLORS = {
	highlight: RESEARCH_PAPER_MARK_DEFAULTS.highlight.color,
	underline: RESEARCH_PAPER_MARK_DEFAULTS.underline.color,
	strike: RESEARCH_PAPER_MARK_DEFAULTS.strike.color,
	circle: RESEARCH_PAPER_MARK_DEFAULTS.circle.color
} as const;

export interface ResearchPaperMarkAnimation {
	style: ResearchPaperMarkStyle;
	start: number;
	duration: number;
	ease: ResearchPaperEase;
	color: string;
	intensity: number;
}

export interface ResearchPaperPaperTransition {
	start: number;
	duration: number;
	ease: ResearchPaperEase;
}

export interface ResearchPaperPaperAnimation {
	enter: ResearchPaperPaperTransition;
	exit: ResearchPaperPaperTransition;
}

export interface ResearchPaperAnimation {
	paper: ResearchPaperPaperAnimation;
	marks: ResearchPaperMarkAnimation[];
}

export interface ResearchPaperState {
	orientation: VideoOrientation;
	durationSeconds: number;
	fps: number;
	format: ExportFormat;
	title: string;
	sourceUrl: string;
	body: string;
	fontFamily: ResearchPaperFontFamily;
	paperColor: string;
	inkColor: string;
	animation: ResearchPaperAnimation;
}

export function createDefaultMarkAnimation(
	style: ResearchPaperMarkStyle
): ResearchPaperMarkAnimation {
	const defaults = RESEARCH_PAPER_MARK_DEFAULTS[style];

	return {
		style,
		start: 0.34,
		duration: 0.24,
		ease: defaults.ease,
		color: defaults.color,
		intensity: defaults.intensity
	};
}

export const researchPaperState = $state<ResearchPaperState>({
	orientation: 'horizontal',
	durationSeconds: 6,
	fps: 30,
	format: 'webm',
	title: 'Attention Is All You Need',
	sourceUrl: 'https://arxiv.org/abs/1706.03762',
	body: `The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder.

The Transformer allows for significantly more parallelization and can reach ==a new state of the art in translation quality after being trained for as little as twelve hours==.

Self-attention connects all positions with a constant number of sequentially executed operations, whereas recurrent layers require a number of operations proportional to sequence length.`,
	fontFamily: 'serif',
	paperColor: '#ffffff',
	inkColor: '#000000',
	animation: {
		paper: {
			enter: { start: 0, duration: 0.18, ease: 'settled' },
			exit: { start: 0.82, duration: 0.18, ease: 'smooth' }
		},
		marks: [createDefaultMarkAnimation('highlight')]
	}
});
