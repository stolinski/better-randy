import type { VideoOrientation } from '$lib/utils/video-frame';

export type QuoteFocusFocusStyle = 'highlight' | 'magnify' | 'isolate' | 'lift-out' | 'tear-out';
export type QuoteFocusMarkStyle = 'none' | 'underline' | 'box' | 'circle' | 'side-note';
export type QuoteFocusCameraMotion = 'none' | 'push' | 'snap';
export type QuoteFocusFontFamily = 'serif' | 'sans' | 'mono' | 'condensed';
export type QuoteFocusEase = 'smooth' | 'settled' | 'sharp' | 'bouncy';

export const QUOTE_FOCUS_EASES: Record<QuoteFocusEase, { label: string; gsap: string }> = {
	smooth: { label: 'Smooth', gsap: 'power3.out' },
	settled: { label: 'Settled', gsap: 'back.out(1.2)' },
	sharp: { label: 'Sharp', gsap: 'expo.out' },
	bouncy: { label: 'Bouncy', gsap: 'elastic.out(1, 0.5)' }
};

export interface QuoteFocusAnimation {
	focusStart: number;
	focusDuration: number;
	focusEase: QuoteFocusEase;
	markStart: number;
	markDuration: number;
	markEase: QuoteFocusEase;
}

export interface QuoteFocusFontDefinition {
	label: string;
	stack: string;
}

export const QUOTE_FOCUS_FONT_FAMILIES: Record<QuoteFocusFontFamily, QuoteFocusFontDefinition> = {
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

export const QUOTE_FOCUS_FOCUS_STYLES: { value: QuoteFocusFocusStyle; label: string }[] = [
	{ value: 'highlight', label: 'Highlight' },
	{ value: 'magnify', label: 'Magnify' },
	{ value: 'isolate', label: 'Isolate' },
	{ value: 'lift-out', label: 'Lift out' },
	{ value: 'tear-out', label: 'Tear out' }
];

export const QUOTE_FOCUS_MARK_STYLES: { value: QuoteFocusMarkStyle; label: string }[] = [
	{ value: 'none', label: 'None' },
	{ value: 'underline', label: 'Underline' },
	{ value: 'box', label: 'Box' },
	{ value: 'circle', label: 'Circle' },
	{ value: 'side-note', label: 'Side note' }
];

export const QUOTE_FOCUS_CAMERA_MOTIONS: { value: QuoteFocusCameraMotion; label: string }[] = [
	{ value: 'none', label: 'None' },
	{ value: 'push', label: 'Slow push' },
	{ value: 'snap', label: 'Snap zoom' }
];

export interface QuoteFocusState {
	orientation: VideoOrientation;
	durationSeconds: number;
	fps: number;
	body: string;
	quote: string;
	author: string;
	source: string;
	dateLabel: string;
	fontFamily: QuoteFocusFontFamily;
	paperColor: string;
	inkColor: string;
	highlightColor: string;
	markColor: string;
	focusStyle: QuoteFocusFocusStyle;
	markStyle: QuoteFocusMarkStyle;
	cameraMotion: QuoteFocusCameraMotion;
	backgroundVisibility: number;
	showSourceMetadata: boolean;
	markIntensity: number;
	animation: QuoteFocusAnimation;
}

export const quoteFocusState = $state<QuoteFocusState>({
	orientation: 'horizontal',
	durationSeconds: 6,
	fps: 30,
	body: `The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.`,
	quote: 'a new simple network architecture, the Transformer, based solely on attention mechanisms',
	author: 'Vaswani et al.',
	source: 'Attention Is All You Need',
	dateLabel: '2017',
	fontFamily: 'serif',
	paperColor: '#ffffff',
	inkColor: '#111111',
	highlightColor: '#ffd642',
	markColor: '#de263a',
	focusStyle: 'lift-out',
	markStyle: 'underline',
	cameraMotion: 'none',
	backgroundVisibility: 0.2,
	showSourceMetadata: true,
	markIntensity: 0.62,
	animation: {
		focusStart: 0.22,
		focusDuration: 0.28,
		focusEase: 'smooth',
		markStart: 0.42,
		markDuration: 0.26,
		markEase: 'smooth'
	}
});

export interface QuoteFocusSegments {
	beforeQuote: string;
	quote: string;
	afterQuote: string;
	matched: boolean;
}

export function getQuoteFocusSegments(body: string, quote: string): QuoteFocusSegments {
	const trimmedQuote = quote.trim();

	if (trimmedQuote.length === 0) {
		return { beforeQuote: body, quote: '', afterQuote: '', matched: false };
	}

	const index = body.indexOf(trimmedQuote);

	if (index === -1) {
		return { beforeQuote: body, quote: '', afterQuote: '', matched: false };
	}

	return {
		beforeQuote: body.slice(0, index),
		quote: body.slice(index, index + trimmedQuote.length),
		afterQuote: body.slice(index + trimmedQuote.length),
		matched: true
	};
}
