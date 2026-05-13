import { z } from 'zod';

import { parseAnnotationBodyText } from '../annotations/annotation-body-text.ts';
import type {
	AnnotationBody,
	AnnotationMarkStyle
} from '$lib/annotations/annotation-marks';

export type FontFamily = 'serif' | 'sans' | 'mono' | 'condensed';
export type Ease = 'smooth' | 'settled' | 'sharp' | 'bouncy';
export type ExportFormat = 'webm' | 'prores';

export type QuoteFocusFocusStyle = 'highlight' | 'magnify' | 'isolate' | 'lift-out' | 'tear-out';
export type QuoteFocusMarkStyle = 'none' | 'underline' | 'box' | 'circle' | 'side-note';
export type QuoteFocusCameraMotion = 'none' | 'push' | 'snap';

export interface FontDefinition {
	label: string;
	stack: string;
}

export const ENGINE_FONT_FAMILIES: Record<FontFamily, FontDefinition> = {
	serif: { label: 'Serif', stack: 'Georgia, "Times New Roman", serif' },
	sans: { label: 'Sans', stack: 'Avenir Next, Helvetica, Arial, sans-serif' },
	mono: { label: 'Mono', stack: '"SFMono-Regular", Consolas, "Liberation Mono", monospace' },
	condensed: { label: 'Condensed', stack: '"Avenir Next Condensed", "Arial Narrow", sans-serif' }
};

export const ENGINE_EASES: Record<Ease, { label: string; gsap: string }> = {
	smooth: { label: 'Smooth', gsap: 'power3.out' },
	settled: { label: 'Settled', gsap: 'back.out(1.2)' },
	sharp: { label: 'Sharp', gsap: 'expo.out' },
	bouncy: { label: 'Bouncy', gsap: 'elastic.out(1, 0.5)' }
};

export type EaseDirection = 'enter' | 'exit';

export function getEaseGsap(ease: Ease, direction: EaseDirection): string {
	const base = ENGINE_EASES[ease].gsap;

	if (direction === 'enter') {
		return base;
	}

	return base.replace('.out', '.in');
}

export const FOCUS_STYLE_OPTIONS: { value: QuoteFocusFocusStyle; label: string }[] = [
	{ value: 'highlight', label: 'Highlight' },
	{ value: 'magnify', label: 'Magnify' },
	{ value: 'isolate', label: 'Isolate' },
	{ value: 'lift-out', label: 'Lift out' },
	{ value: 'tear-out', label: 'Tear out' }
];

export const QUOTE_MARK_STYLE_OPTIONS: { value: QuoteFocusMarkStyle; label: string }[] = [
	{ value: 'none', label: 'None' },
	{ value: 'underline', label: 'Underline' },
	{ value: 'box', label: 'Box' },
	{ value: 'circle', label: 'Circle' },
	{ value: 'side-note', label: 'Side note' }
];

export const CAMERA_MOTION_OPTIONS: { value: QuoteFocusCameraMotion; label: string }[] = [
	{ value: 'none', label: 'None' },
	{ value: 'push', label: 'Slow push' },
	{ value: 'snap', label: 'Snap zoom' }
];

const FontFamilySchema = z.enum(['serif', 'sans', 'mono', 'condensed']);
const EaseSchema = z.enum(['smooth', 'settled', 'sharp', 'bouncy']);
const ExportFormatSchema = z.enum(['webm', 'prores']);
const VideoOrientationSchema = z.enum(['horizontal', 'vertical']);
const QuoteFocusFocusStyleSchema = z.enum([
	'highlight',
	'magnify',
	'isolate',
	'lift-out',
	'tear-out'
]);
const QuoteFocusMarkStyleSchema = z.enum(['none', 'underline', 'box', 'circle', 'side-note']);
const QuoteFocusCameraMotionSchema = z.enum(['none', 'push', 'snap']);

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #RRGGBB hex color');
const FractionSchema = z.number().min(0).max(1);

const AnnotationBodySchema = z
	.string()
	.transform((text): AnnotationBody => parseAnnotationBodyText(text));

const TransportSchema = z.object({
	orientation: VideoOrientationSchema,
	durationSeconds: z.number().min(0.1).max(600),
	fps: z.number().int().min(1).max(120),
	format: ExportFormatSchema
});

const TypographySchema = z.object({
	fontFamily: FontFamilySchema,
	paperColor: HexColorSchema,
	inkColor: HexColorSchema
});

const MarkAppearanceSchema = z.object({
	color: HexColorSchema,
	intensity: FractionSchema
});

const MarkTimingSchema = z.object({
	start: FractionSchema,
	duration: FractionSchema,
	ease: EaseSchema,
	color: HexColorSchema.optional(),
	intensity: FractionSchema.optional()
});

const MarksStateSchema = z.object({
	defaults: z.object({
		highlight: MarkAppearanceSchema,
		underline: MarkAppearanceSchema,
		strike: MarkAppearanceSchema,
		circle: MarkAppearanceSchema
	}),
	timings: z.array(MarkTimingSchema)
});

const TransitionSchema = z.object({
	start: FractionSchema,
	duration: FractionSchema,
	ease: EaseSchema
});

const ResearchPaperSurfaceSchema = z.object({
	type: z.literal('research-paper'),
	content: z.object({
		title: z.string(),
		sourceUrl: z.string(),
		body: AnnotationBodySchema
	}),
	enter: TransitionSchema,
	exit: TransitionSchema
});

const QuoteFocusSurfaceSchema = z.object({
	type: z.literal('quote-focus'),
	content: z.object({
		body: AnnotationBodySchema,
		author: z.string(),
		source: z.string(),
		dateLabel: z.string()
	}),
	focus: z.object({
		start: FractionSchema,
		duration: FractionSchema,
		ease: EaseSchema,
		style: QuoteFocusFocusStyleSchema
	}),
	mark: z.object({
		start: FractionSchema,
		duration: FractionSchema,
		ease: EaseSchema,
		style: QuoteFocusMarkStyleSchema
	}),
	camera: QuoteFocusCameraMotionSchema,
	backgroundVisibility: FractionSchema,
	showSourceMetadata: z.boolean()
});

const SurfaceSchema = z.discriminatedUnion('type', [
	ResearchPaperSurfaceSchema,
	QuoteFocusSurfaceSchema
]);

export const EngineStateSchema = z.object({
	transport: TransportSchema,
	typography: TypographySchema,
	marks: MarksStateSchema,
	surface: SurfaceSchema
});

export type Transport = z.infer<typeof TransportSchema>;
export type Typography = z.infer<typeof TypographySchema>;
export type MarkAppearance = z.infer<typeof MarkAppearanceSchema>;
export type MarkTiming = z.infer<typeof MarkTimingSchema>;
export type MarksState = z.infer<typeof MarksStateSchema>;
export type Transition = z.infer<typeof TransitionSchema>;
export type SurfaceState = z.infer<typeof SurfaceSchema>;
export type SurfaceType = SurfaceState['type'];
export type ResearchPaperSurface = Extract<SurfaceState, { type: 'research-paper' }>;
export type QuoteFocusSurface = Extract<SurfaceState, { type: 'quote-focus' }>;
export type EngineState = z.infer<typeof EngineStateSchema>;

const RESEARCH_PAPER_DEFAULT_BODY: AnnotationBody = [
	{
		segments: [
			{
				text: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder.',
				markStyle: null
			}
		]
	},
	{
		segments: [
			{
				text: 'The Transformer allows for significantly more parallelization and can reach ',
				markStyle: null
			},
			{
				text: 'a new state of the art in translation quality after being trained for as little as twelve hours',
				markStyle: 'highlight'
			},
			{ text: '.', markStyle: null }
		]
	},
	{
		segments: [
			{
				text: 'Self-attention connects all positions with a constant number of sequentially executed operations, whereas recurrent layers require a number of operations proportional to sequence length.',
				markStyle: null
			}
		]
	}
];

const QUOTE_FOCUS_DEFAULT_BODY: AnnotationBody = [
	{
		segments: [
			{
				text: 'The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose ',
				markStyle: null
			},
			{
				text: 'a new simple network architecture, the Transformer, based solely on attention mechanisms',
				markStyle: 'highlight'
			},
			{
				text: ', dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train.',
				markStyle: null
			}
		]
	}
];

export function createDefaultEngineState(): EngineState {
	return {
		transport: {
			orientation: 'horizontal',
			durationSeconds: 6,
			fps: 30,
			format: 'webm'
		},
		typography: {
			fontFamily: 'serif',
			paperColor: '#ffffff',
			inkColor: '#000000'
		},
		marks: {
			defaults: {
				highlight: { color: '#ffd642', intensity: 0.62 },
				underline: { color: '#1f5aff', intensity: 0.62 },
				strike: { color: '#de263a', intensity: 0.62 },
				circle: { color: '#de263a', intensity: 0.62 }
			},
			timings: [{ start: 0.34, duration: 0.24, ease: 'smooth' }]
		},
		surface: {
			type: 'research-paper',
			content: {
				title: 'Attention Is All You Need',
				sourceUrl: 'https://arxiv.org/abs/1706.03762',
				body: RESEARCH_PAPER_DEFAULT_BODY
			},
			enter: { start: 0, duration: 0.18, ease: 'settled' },
			exit: { start: 0.82, duration: 0.18, ease: 'smooth' }
		}
	};
}

export function createDefaultQuoteFocusSurface(): QuoteFocusSurface {
	return {
		type: 'quote-focus',
		content: {
			body: QUOTE_FOCUS_DEFAULT_BODY,
			author: 'Vaswani et al.',
			source: 'Attention Is All You Need',
			dateLabel: '2017'
		},
		focus: { start: 0.22, duration: 0.28, ease: 'smooth', style: 'lift-out' },
		mark: { start: 0.42, duration: 0.26, ease: 'smooth', style: 'underline' },
		camera: 'none',
		backgroundVisibility: 0.2,
		showSourceMetadata: true
	};
}

export function isResearchPaperSurface(surface: SurfaceState): surface is ResearchPaperSurface {
	return surface.type === 'research-paper';
}

export function isQuoteFocusSurface(surface: SurfaceState): surface is QuoteFocusSurface {
	return surface.type === 'quote-focus';
}

export interface ResolvedMark {
	style: AnnotationMarkStyle;
	start: number;
	duration: number;
	ease: Ease;
	color: string;
	intensity: number;
}

const FALLBACK_TIMING = { start: 0.34, duration: 0.24, ease: 'smooth' as Ease };

export function resolveMarkForIndex(
	style: AnnotationMarkStyle,
	index: number,
	marks: MarksState
): ResolvedMark {
	const defaults = marks.defaults[style];
	const timing = marks.timings[index];

	if (!timing) {
		return {
			style,
			start: FALLBACK_TIMING.start,
			duration: FALLBACK_TIMING.duration,
			ease: FALLBACK_TIMING.ease,
			color: defaults.color,
			intensity: defaults.intensity
		};
	}

	return {
		style,
		start: timing.start,
		duration: timing.duration,
		ease: timing.ease,
		color: timing.color ?? defaults.color,
		intensity: timing.intensity ?? defaults.intensity
	};
}

export function createMarkTiming(): MarkTiming {
	return {
		start: FALLBACK_TIMING.start,
		duration: FALLBACK_TIMING.duration,
		ease: FALLBACK_TIMING.ease
	};
}

export const PRESET_SCHEMA_ID = 'hiviz@1' as const;

export const PresetSchema = z.object({
	schema: z.literal(PRESET_SCHEMA_ID),
	name: z.string().min(1, 'Preset name is required'),
	description: z.string().optional(),
	state: EngineStateSchema
});

export type Preset = z.infer<typeof PresetSchema>;
