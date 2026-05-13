import type { AnnotationMarkColors, AnnotationMarkStyle } from '$lib/annotations/annotation-marks';
import type { VideoOrientation } from '$lib/utils/video-frame';

export type ResearchPaperMarkStyle = AnnotationMarkStyle;
export type ResearchPaperFontFamily = 'serif' | 'sans' | 'mono' | 'condensed';
export type ResearchPaperEase = 'smooth' | 'settled' | 'sharp' | 'bouncy';

export interface ResearchPaperFontDefinition {
	label: string;
	stack: string;
}

export type ResearchPaperMarkColors = AnnotationMarkColors;

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

export interface ResearchPaperMarkAnimation {
	start: number;
	duration: number;
	ease: ResearchPaperEase;
}

export interface ResearchPaperAnimation {
	paperEntranceEase: ResearchPaperEase;
	paperEntranceDuration: number;
	marks: ResearchPaperMarkAnimation[];
}

export interface ResearchPaperState {
	orientation: VideoOrientation;
	durationSeconds: number;
	fps: number;
	title: string;
	sourceUrl: string;
	body: string;
	fontFamily: ResearchPaperFontFamily;
	paperColor: string;
	inkColor: string;
	markStyle: ResearchPaperMarkStyle;
	markIntensity: number;
	markColors: ResearchPaperMarkColors;
	animation: ResearchPaperAnimation;
}

export const DEFAULT_MARK_ANIMATION: ResearchPaperMarkAnimation = {
	start: 0.34,
	duration: 0.24,
	ease: 'smooth'
};

export const researchPaperState = $state<ResearchPaperState>({
	orientation: 'horizontal',
	durationSeconds: 6,
	fps: 30,
	title: 'Attention Is All You Need',
	sourceUrl: 'https://arxiv.org/abs/1706.03762',
	body: `The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder.

The Transformer allows for significantly more parallelization and can reach ==a new state of the art in translation quality after being trained for as little as twelve hours==.

Self-attention connects all positions with a constant number of sequentially executed operations, whereas recurrent layers require a number of operations proportional to sequence length.`,
	fontFamily: 'serif',
	paperColor: '#ffffff',
	inkColor: '#000000',
	markStyle: 'highlight',
	markIntensity: 0.62,
	markColors: {
		circle: '#de263a',
		highlight: '#ffd642',
		strike: '#de263a',
		underline: '#1f5aff'
	},
	animation: {
		paperEntranceEase: 'settled',
		paperEntranceDuration: 0.28,
		marks: [{ ...DEFAULT_MARK_ANIMATION }]
	}
});
