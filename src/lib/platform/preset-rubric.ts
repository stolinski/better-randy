import type { AnnotationMarkStyle } from '../annotations/annotation-mark-styles.ts';
import type { AnnotationBody } from '../annotations/annotation-marks.ts';
import type {
	MarkTiming,
	Overlay,
	Preset,
	SurfaceState,
	Transition
} from './engine-schema.ts';

export type RubricSeverity = 'error' | 'warn';

export interface RubricIssue {
	rule: string;
	severity: RubricSeverity;
	path: string;
	message: string;
}

interface FrameSize {
	width: number;
	height: number;
}

const FRAME_HORIZONTAL: FrameSize = { width: 3840, height: 2160 };
const FRAME_VERTICAL: FrameSize = { width: 2160, height: 3840 };

// Per ADR-0025 the static linter (`lintPreset`) carries only objective
// video-safety + readability. Motion-timing taste — enter/exit duration
// bands, mark-duration bands, stagger minimum, exit:enter ratio, the glance
// ceiling, the lower-third hold ceiling, "settled" ease on exit, and the
// centered-lower-third rule — moved to the Critic (animation-rubric.md).

const A1_BUFFER_NORMALIZED = 0.02;

const READING_WPM = 200;
const TITLE_GLANCE_MIN_SECONDS = 0.7;

interface CapHeightBand {
	min: number;
}

interface OrientedCapHeightBands {
	horizontal: CapHeightBand;
	vertical: CapHeightBand;
}

// Legibility FLOORS only (`min`). The cap-height ceiling ("reads as signage")
// is taste, enforced by the Critic, not the static linter (ADR-0025) — so the
// bands carry no `max`.
const CAP_HEIGHT_BANDS: Record<TextBandKey, OrientedCapHeightBands> = {
	'overlay-primary': {
		horizontal: { min: 96 },
		vertical: { min: 120 }
	},
	'overlay-secondary': {
		horizontal: { min: 80 },
		vertical: { min: 96 }
	},
	'surface-title': {
		horizontal: { min: 60 },
		vertical: { min: 76 }
	},
	'surface-body': {
		horizontal: { min: 32 },
		vertical: { min: 44 }
	},
	// Marked focal text inherits the body band — the highlight stroke provides
	// emphasis, not a larger font. Kept as a distinct key so future bands can
	// diverge if needed.
	'surface-body-focal': {
		horizontal: { min: 32 },
		vertical: { min: 44 }
	},
	'surface-label': {
		horizontal: { min: 24 },
		vertical: { min: 32 }
	}
};

const MEASURE_MIN_CHARS = 45;
const MEASURE_MAX_CHARS = 80;
const LINE_HEIGHT_SERIF_MIN = 1.28;
const LINE_HEIGHT_SERIF_MAX = 1.42;
const LINE_HEIGHT_SANS_MIN = 1.32;
const LINE_HEIGHT_SANS_MAX = 1.5;
const MAX_LINES_PER_PARAGRAPH = 8;

const TITLE_SAFE_MARGIN_PCT = 0.05;
const VERTICAL_TOP_BAND_PCT = 0.06;
const VERTICAL_BOTTOM_BAND_PCT = 0.16;
const VERTICAL_RIGHT_BAND_PCT = 0.09;

const LOWER_THIRD_OFFSET_Y_MIN_PCT_HORIZONTAL = 0.1;
const LOWER_THIRD_OFFSET_Y_MAX_PCT_HORIZONTAL = 0.28;
const LOWER_THIRD_OFFSET_Y_MIN_PCT_VERTICAL = 0.16;
const LOWER_THIRD_OFFSET_Y_MAX_PCT_VERTICAL = 0.32;

interface FlattenedMark {
	style: AnnotationMarkStyle;
	wordCount: number;
	/** Document-order index of the segment this mark sits on. Stacked marks on
	 *  one span (e.g. [magnify][side-note]) share a segmentIndex — they are one
	 *  read, not several. */
	segmentIndex: number;
}

export function lintPreset(preset: Preset): RubricIssue[] {
	const issues: RubricIssue[] = [];
	const { state } = preset;
	const totalSeconds = state.transport.durationSeconds;
	const orientation = state.transport.orientation;
	const frame = orientation === 'vertical' ? FRAME_VERTICAL : FRAME_HORIZONTAL;
	const flattenedMarks = flattenBody(state.surface.content.body);

	checkMarkTimings(flattenedMarks, state.marks.timings, issues);
	checkMarkOrdering(state.surface, state.marks.timings, totalSeconds, issues);
	checkOverlayTimings(state.overlays, totalSeconds, issues);
	checkOverlayPlacement(state.overlays, frame, orientation, issues);
	checkContrast(state.surface, state.typography, issues);
	checkHoldTime(state.surface, state.marks.timings, flattenedMarks, totalSeconds, issues);
	checkCameraSafety(state.surface, totalSeconds, issues);

	return issues;
}

export function formatIssues(issues: readonly RubricIssue[]): string {
	return issues
		.map((issue) => `[${issue.severity.toUpperCase()}] ${issue.rule} ${issue.path} — ${issue.message}`)
		.join('\n');
}

function checkOverlayTimings(
	overlays: readonly Overlay[],
	totalSeconds: number,
	issues: RubricIssue[]
): void {
	for (const [index, overlay] of overlays.entries()) {
		const path = `overlays[${index}]`;

		// Lower-third must stay on screen long enough to read (readability
		// floor). The hold ceiling and all enter/exit duration shaping are
		// taste — the Critic owns them.
		if (overlay.type === 'lower-third' && overlay.enter && overlay.exit) {
			issues.push(
				...checkLowerThirdHoldWindow(overlay.enter, overlay.exit, totalSeconds, path)
			);
		}
	}
}

// Readability floor — a name chip (kicker + title + subtitle) reads in ~2s;
// 2.5s gives the glance + read. The old 4s was the bottom of an industry taste
// band, not a read requirement.
const LOWER_THIRD_HOLD_MIN_SECONDS = 2.5;

function checkLowerThirdHoldWindow(
	enter: Transition,
	exit: Transition,
	totalSeconds: number,
	scope: string
): RubricIssue[] {
	const enterEnd = enter.start + enter.duration;
	const holdSeconds = (exit.start - enterEnd) * totalSeconds;

	// Readability floor only — the hold ceiling is taste (Critic owns it).
	if (holdSeconds < LOWER_THIRD_HOLD_MIN_SECONDS) {
		return [
			{
				rule: 'L4',
				severity: 'error',
				path: `${scope}.exit.start`,
				message: `Lower-third on-screen hold is ${holdSeconds.toFixed(2)}s — needs ≥ ${LOWER_THIRD_HOLD_MIN_SECONDS}s to read.`
			}
		];
	}

	return [];
}

function checkMarkTimings(
	flattenedMarks: readonly FlattenedMark[],
	timings: readonly MarkTiming[],
	issues: RubricIssue[]
): void {
	// Data integrity only — a timing with no marked span is a real authoring
	// error. Mark *duration* shaping is taste (Critic). The read-window after a
	// mark is enforced by checkHoldTime (G6-post-mark).
	for (const [index] of timings.entries()) {
		if (!flattenedMarks[index]) {
			issues.push({
				rule: 'A3',
				severity: 'error',
				path: `marks.timings[${index}]`,
				message: `Timing index ${index} has no corresponding marked segment in body.`
			});
		}
	}
}

function checkMarkOrdering(
	surface: SurfaceState,
	timings: readonly MarkTiming[],
	totalSeconds: number,
	issues: RubricIssue[]
): void {
	if (timings.length === 0) {
		return;
	}

	const enter = surface.enter;
	const surfaceEnd = enter ? enter.start + enter.duration : 0;

	// A1 only — a mark firing before the surface settles annotates content
	// that isn't on screen yet. Inter-mark stagger (A2) is taste (Critic).
	for (const [index, timing] of timings.entries()) {
		if (timing.start <= surfaceEnd + A1_BUFFER_NORMALIZED) {
			const msLate = (surfaceEnd + A1_BUFFER_NORMALIZED - timing.start) * totalSeconds * 1000;
			issues.push({
				rule: 'A1',
				severity: 'error',
				path: `marks.timings[${index}].start`,
				message: `Mark starts before surface settles — needs ≥ ${(A1_BUFFER_NORMALIZED * totalSeconds * 1000).toFixed(0)}ms buffer after surface.enter ends (currently ${msLate.toFixed(0)}ms early).`
			});
		}
	}
}

function checkOverlayPlacement(
	overlays: readonly Overlay[],
	frame: FrameSize,
	orientation: 'horizontal' | 'vertical',
	issues: RubricIssue[]
): void {
	for (const [index, overlay] of overlays.entries()) {
		const path = `overlays[${index}].position`;
		const anchor = overlay.position.anchor;
		const offset = overlay.position.offset;
		const rect = overlay.position.rect;

		if (anchor === 'normalized-rect' && rect) {
			if (
				rect.x < TITLE_SAFE_MARGIN_PCT ||
				rect.y < TITLE_SAFE_MARGIN_PCT ||
				rect.x + rect.width > 1 - TITLE_SAFE_MARGIN_PCT ||
				rect.y + rect.height > 1 - TITLE_SAFE_MARGIN_PCT
			) {
				issues.push({
					rule: 'G2',
					severity: 'error',
					path: `${path}.rect`,
					message: `Overlay rect extends outside title-safe (5% margin) zone.`
				});
			}
		} else if (offset) {
			// Offsets are fractions of the composition dimensions (0..1).
			if (anchor.includes('left') && offset.x < TITLE_SAFE_MARGIN_PCT) {
				issues.push({
					rule: 'G2',
					severity: 'error',
					path: `${path}.offset.x`,
					message: `Anchor "${anchor}" requires offset.x ≥ ${TITLE_SAFE_MARGIN_PCT} (${(TITLE_SAFE_MARGIN_PCT * 100).toFixed(0)}%) to clear title-safe; got ${offset.x}.`
				});
			}

			if (anchor.includes('top') && offset.y < TITLE_SAFE_MARGIN_PCT) {
				issues.push({
					rule: 'G2',
					severity: 'error',
					path: `${path}.offset.y`,
					message: `Anchor "${anchor}" requires offset.y ≥ ${TITLE_SAFE_MARGIN_PCT} (${(TITLE_SAFE_MARGIN_PCT * 100).toFixed(0)}%) to clear title-safe; got ${offset.y}.`
				});
			}

			if (anchor.includes('bottom') && offset.y < TITLE_SAFE_MARGIN_PCT) {
				issues.push({
					rule: 'G2',
					severity: 'error',
					path: `${path}.offset.y`,
					message: `Anchor "${anchor}" requires offset.y ≥ ${TITLE_SAFE_MARGIN_PCT} (${(TITLE_SAFE_MARGIN_PCT * 100).toFixed(0)}%) to clear title-safe; got ${offset.y}.`
				});
			}

			if (anchor.includes('right') && offset.x < TITLE_SAFE_MARGIN_PCT) {
				issues.push({
					rule: 'G2',
					severity: 'error',
					path: `${path}.offset.x`,
					message: `Anchor "${anchor}" requires offset.x ≥ ${TITLE_SAFE_MARGIN_PCT} (${(TITLE_SAFE_MARGIN_PCT * 100).toFixed(0)}%) to clear title-safe; got ${offset.x}.`
				});
			}

			if (orientation === 'vertical') {
				if (anchor.includes('top') && offset.y < VERTICAL_TOP_BAND_PCT) {
					issues.push({
						rule: 'G3',
						severity: 'error',
						path: `${path}.offset.y`,
						message: `Vertical platform-UI: top anchors need offset.y ≥ ${VERTICAL_TOP_BAND_PCT} (${(VERTICAL_TOP_BAND_PCT * 100).toFixed(0)}%); got ${offset.y}.`
					});
				}

				if (anchor.includes('bottom') && offset.y < VERTICAL_BOTTOM_BAND_PCT) {
					issues.push({
						rule: 'G3',
						severity: 'error',
						path: `${path}.offset.y`,
						message: `Vertical platform-UI: bottom anchors need offset.y ≥ ${VERTICAL_BOTTOM_BAND_PCT} (${(VERTICAL_BOTTOM_BAND_PCT * 100).toFixed(0)}%); got ${offset.y}.`
					});
				}

				if (anchor.includes('right') && offset.x < VERTICAL_RIGHT_BAND_PCT) {
					issues.push({
						rule: 'G3',
						severity: 'error',
						path: `${path}.offset.x`,
						message: `Vertical platform-UI: right anchors need offset.x ≥ ${VERTICAL_RIGHT_BAND_PCT} (${(VERTICAL_RIGHT_BAND_PCT * 100).toFixed(0)}%); got ${offset.x}.`
					});
				}
			}
		}

		if (overlay.type === 'lower-third') {
			checkLowerThirdPlacement(overlay, index, orientation, issues);
		}
	}
}

function checkLowerThirdPlacement(
	overlay: Overlay,
	index: number,
	orientation: 'horizontal' | 'vertical',
	issues: RubricIssue[]
): void {
	const path = `overlays[${index}].position`;
	const anchor = overlay.position.anchor;

	if (!anchor.includes('bottom')) {
		issues.push({
			rule: 'L1',
			severity: 'warn',
			path: `${path}.anchor`,
			message: `Lower-third anchored to "${anchor}" — convention is a bottom corner.`
		});

		return;
	}

	const offset = overlay.position.offset;

	if (!offset) {
		return;
	}

	// Offsets are fractions of the composition dimensions (0..1).
	const [minPct, maxPct] =
		orientation === 'vertical'
			? [LOWER_THIRD_OFFSET_Y_MIN_PCT_VERTICAL, LOWER_THIRD_OFFSET_Y_MAX_PCT_VERTICAL]
			: [LOWER_THIRD_OFFSET_Y_MIN_PCT_HORIZONTAL, LOWER_THIRD_OFFSET_Y_MAX_PCT_HORIZONTAL];

	if (offset.y < minPct) {
		issues.push({
			rule: 'L1',
			severity: 'error',
			path: `${path}.offset.y`,
			message: `Lower-third sits too low — offset.y must be ≥ ${minPct} (${(minPct * 100).toFixed(0)}% of frame height) so the block lands inside the lower-third band; got ${offset.y}.`
		});
	} else if (offset.y > maxPct) {
		issues.push({
			rule: 'L1',
			severity: 'error',
			path: `${path}.offset.y`,
			message: `Lower-third sits too high — offset.y must be ≤ ${maxPct} (${(maxPct * 100).toFixed(0)}% of frame height) so the block stays inside the lower-third band; got ${offset.y}.`
		});
	}

}

function checkContrast(
	surface: SurfaceState,
	typography: { paperColor: string; inkColor: string },
	issues: RubricIssue[]
): void {
	if (surface.type !== 'paper') {
		return;
	}

	const ratio = contrastRatio(typography.paperColor, typography.inkColor);

	if (ratio < 4.5) {
		issues.push({
			rule: 'G5',
			severity: 'error',
			path: 'typography',
			message: `Ink/paper contrast is ${ratio.toFixed(2)}:1 — body text needs ≥ 4.5:1.`
		});
	}
}

function checkHoldTime(
	surface: SurfaceState,
	timings: readonly MarkTiming[],
	flattenedMarks: readonly FlattenedMark[],
	totalSeconds: number,
	issues: RubricIssue[]
): void {
	if (!surface.enter || !surface.exit) {
		return;
	}

	if (timings.length === 0) {
		return;
	}

	const surfaceEnterEnd = surface.enter.start + surface.enter.duration;
	const exitStart = surface.exit.start;
	const sortedIndices = timings
		.map((timing, index) => ({ timing, index }))
		.sort((a, b) => a.timing.start - b.timing.start);
	const firstMark = sortedIndices[0];

	const hasGlanceableHead =
		(surface.content.title ?? '').trim().length > 0 ||
		(surface.content.author ?? '').trim().length > 0 ||
		(surface.content.source ?? '').trim().length > 0;

	if (hasGlanceableHead) {
		const preMarkSeconds = (firstMark.timing.start - surfaceEnterEnd) * totalSeconds;

		// Floor only — the viewer must be able to glance at the title/byline
		// before the first mark fires. The glance *ceiling* (card inert too
		// long) is taste (Critic).
		if (preMarkSeconds < TITLE_GLANCE_MIN_SECONDS) {
			issues.push({
				rule: 'G6-pre-mark',
				severity: 'error',
				path: 'surface',
				message: `Pre-mark window is ${preMarkSeconds.toFixed(2)}s — needs ≥ ${TITLE_GLANCE_MIN_SECONDS}s for the viewer to glance at title/byline before the mark fires.`
			});
		}
	}

	// Read window: one per marked *segment*, not per mark. Stacked marks on one
	// span (e.g. [magnify][side-note]) are a single read — require the read time
	// once, after the last mark on that span settles, until the next segment's
	// mark fires (or surface exit). 1× at 200 wpm is the readability floor;
	// re-read padding is taste (Critic).
	interface SegmentWindow {
		firstStart: number;
		lastEnd: number;
		words: number;
		index: number;
	}
	const bySegment = new Map<number, SegmentWindow>();

	for (const { timing, index } of sortedIndices) {
		const flat = flattenedMarks[index];

		if (!flat || flat.wordCount === 0) {
			continue;
		}

		const end = timing.start + timing.duration;
		const existing = bySegment.get(flat.segmentIndex);

		if (!existing) {
			bySegment.set(flat.segmentIndex, {
				firstStart: timing.start,
				lastEnd: end,
				words: flat.wordCount,
				index
			});
		} else {
			existing.firstStart = Math.min(existing.firstStart, timing.start);
			existing.lastEnd = Math.max(existing.lastEnd, end);
		}
	}

	const segments = [...bySegment.values()].sort((a, b) => a.firstStart - b.firstStart);

	for (let i = 0; i < segments.length; i += 1) {
		const seg = segments[i];
		const next = segments[i + 1];
		const windowEnd = next ? next.firstStart : exitStart;
		const holdSeconds = (windowEnd - seg.lastEnd) * totalSeconds;
		const requiredSeconds = (seg.words / READING_WPM) * 60;

		if (holdSeconds < requiredSeconds) {
			issues.push({
				rule: 'G6-post-mark',
				severity: 'error',
				path: `marks.timings[${seg.index}]`,
				message: `Post-mark window is ${holdSeconds.toFixed(2)}s — reading ${seg.words} marked words at ${READING_WPM} wpm needs ${requiredSeconds.toFixed(2)}s.`
			});
		}
	}
}

function checkCameraSafety(
	surface: SurfaceState,
	totalSeconds: number,
	issues: RubricIssue[]
): void {
	if (surface.camera !== 'snap') {
		return;
	}

	const bgVisibility = surface.backgroundVisibility ?? 0;

	if (bgVisibility >= 0.5 && surface.enter) {
		const enterMs = surface.enter.duration * totalSeconds * 1000;

		if (enterMs <= 200) {
			issues.push({
				rule: 'G10',
				severity: 'warn',
				path: 'surface',
				message: `Snap camera + high backgroundVisibility (${bgVisibility}) in a ≤200ms beat stacks two simultaneous motions — vestibular risk.`
			});
		}
	}
}

function flattenBody(body: AnnotationBody): FlattenedMark[] {
	const marks: FlattenedMark[] = [];

	let segmentIndex = 0;

	for (const block of body) {
		if (block.type !== 'paragraph') {
			continue;
		}

		for (const segment of block.segments) {
			const words = countWords(segment.text);

			for (const style of segment.markStyles) {
				marks.push({ style, wordCount: words, segmentIndex });
			}

			segmentIndex += 1;
		}
	}

	return marks;
}

function countWords(text: string): number {
	return text
		.trim()
		.split(/\s+/)
		.filter((token) => token.length > 0).length;
}

function contrastRatio(a: string, b: string): number {
	const lumA = relativeLuminance(a);
	const lumB = relativeLuminance(b);
	const lighter = Math.max(lumA, lumB);
	const darker = Math.min(lumA, lumB);

	return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(hex: string): number {
	const match = hex.match(/^#([0-9a-fA-F]{6})$/);

	if (!match) {
		throw new Error(`Invalid hex color: ${hex}`);
	}

	const value = match[1];
	const r = parseInt(value.slice(0, 2), 16) / 255;
	const g = parseInt(value.slice(2, 4), 16) / 255;
	const b = parseInt(value.slice(4, 6), 16) / 255;

	return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function channelLuminance(channel: number): number {
	return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

export type RenderedTextRole = 'title' | 'body' | 'caption' | 'kicker' | 'source' | 'subtitle';

export type TextBandKey =
	| 'overlay-primary'
	| 'overlay-secondary'
	| 'surface-title'
	| 'surface-body'
	| 'surface-body-focal'
	| 'surface-label';

export interface RenderedTextMeasurement {
	role: RenderedTextRole;
	/** Which cap-height band this text should be evaluated against. */
	bandKey: TextBandKey;
	capHeight: number;
	fontFamily: 'serif' | 'sans' | 'mono' | 'condensed' | 'unknown';
	lineHeight: number;
	/** Typical line capacity in characters (rendered-width / avg-char-width). */
	charsPerLine: number;
	lineCount: number;
	label?: string;
}

export interface RenderedSurfaceMeasurement {
	cardRect: { x: number; y: number; width: number; height: number };
	visibleCardRect: { x: number; y: number; width: number; height: number };
	textBounds: { x: number; y: number; width: number; height: number };
	texts: readonly RenderedTextMeasurement[];
	/** True if the card extends past the bottom of the frame intentionally. */
	bleeds: boolean;
	bleedLength: number;
}

export interface VisualMeasurement {
	preset: Preset;
	surface: RenderedSurfaceMeasurement | null;
	overlays?: readonly RenderedSurfaceMeasurement[];
}

export function lintPresetVisual(measurement: VisualMeasurement): RubricIssue[] {
	const issues: RubricIssue[] = [];
	const orientation = measurement.preset.state.transport.orientation;
	const frame = orientation === 'vertical' ? FRAME_VERTICAL : FRAME_HORIZONTAL;

	// Per ADR-0025 the visual linter carries readability + safety only.
	// Title:body hierarchy ratio and T1 card-mass are composition taste (Critic).
	if (measurement.surface) {
		checkSurfaceTextSafety(measurement.surface, frame, issues);
		checkSurfaceCapHeights(measurement.surface, orientation, issues);
		checkSurfaceDensity(measurement.surface, issues);
	}

	return issues;
}

function checkSurfaceTextSafety(
	surface: RenderedSurfaceMeasurement,
	frame: FrameSize,
	issues: RubricIssue[]
): void {
	const bounds = surface.textBounds;

	// Empty body produces a (0,0,0,0) rect; nothing to check.
	if (bounds.width <= 0 || bounds.height <= 0) {
		return;
	}

	const xMin = TITLE_SAFE_MARGIN_PCT * frame.width;
	const yMin = TITLE_SAFE_MARGIN_PCT * frame.height;
	const xMax = (1 - TITLE_SAFE_MARGIN_PCT) * frame.width;
	const yMax = (1 - TITLE_SAFE_MARGIN_PCT) * frame.height;

	if (bounds.x < xMin || bounds.y < yMin || bounds.x + bounds.width > xMax || bounds.y + bounds.height > yMax) {
		issues.push({
			rule: 'G2',
			severity: 'error',
			path: 'surface.textBounds',
			message: `Readable text bounds (${bounds.x.toFixed(0)},${bounds.y.toFixed(0)} ${bounds.width.toFixed(0)}×${bounds.height.toFixed(0)}) extend outside title-safe rect [${xMin.toFixed(0)},${yMin.toFixed(0)}]–[${xMax.toFixed(0)},${yMax.toFixed(0)}].`
		});
	}
}

function checkSurfaceCapHeights(
	surface: RenderedSurfaceMeasurement,
	orientation: 'horizontal' | 'vertical',
	issues: RubricIssue[]
): void {
	for (const text of surface.texts) {
		const bands = CAP_HEIGHT_BANDS[text.bandKey];

		if (!bands) {
			continue;
		}

		const band = orientation === 'vertical' ? bands.vertical : bands.horizontal;

		// Legibility floor only — text below this is unreadable at delivery
		// resolution. The cap-height ceiling ("reads as signage") is taste (Critic).
		if (text.capHeight < band.min) {
			issues.push({
				rule: 'G4',
				severity: 'error',
				path: `surface.texts[${text.bandKey}${text.label ? ':' + text.label : ''}]`,
				message: `${text.bandKey} cap-height ${text.capHeight.toFixed(0)}px is below ${orientation} floor ${band.min}px.`
			});
		}
	}
}

function getBodyLineHeightBand(
	fontFamily: RenderedTextMeasurement['fontFamily']
): { min: number; max: number } {
	if (fontFamily === 'serif') {
		return { min: LINE_HEIGHT_SERIF_MIN, max: LINE_HEIGHT_SERIF_MAX };
	}

	return { min: LINE_HEIGHT_SANS_MIN, max: LINE_HEIGHT_SANS_MAX };
}

function checkSurfaceDensity(
	surface: RenderedSurfaceMeasurement,
	issues: RubricIssue[]
): void {
	for (const text of surface.texts) {
		if (text.bandKey !== 'surface-body' && text.bandKey !== 'surface-body-focal') {
			continue;
		}

		if (text.lineCount <= 0 || text.charsPerLine <= 0) {
			continue;
		}

		const charsPerLine = text.charsPerLine;

		if (charsPerLine < MEASURE_MIN_CHARS || charsPerLine > MEASURE_MAX_CHARS) {
			issues.push({
				rule: 'G4-density',
				severity: 'error',
				path: `surface.texts[${text.bandKey}${text.label ? ':' + text.label : ''}].measure`,
				message: `Body measure is ${charsPerLine.toFixed(0)} chars/line — band ${MEASURE_MIN_CHARS}–${MEASURE_MAX_CHARS}.`
			});
		}

		if (text.lineCount > MAX_LINES_PER_PARAGRAPH) {
			issues.push({
				rule: 'G4-density',
				severity: 'error',
				path: `surface.texts[${text.bandKey}${text.label ? ':' + text.label : ''}].lineCount`,
				message: `Paragraph wraps to ${text.lineCount} lines — max ${MAX_LINES_PER_PARAGRAPH}. Shorten content or widen the surface.`
			});
		}

		const lhBand = getBodyLineHeightBand(text.fontFamily);

		if (text.lineHeight < lhBand.min || text.lineHeight > lhBand.max) {
			issues.push({
				rule: 'G4-density',
				severity: 'error',
				path: `surface.texts[${text.bandKey}${text.label ? ':' + text.label : ''}].lineHeight`,
				message: `Body line-height ${text.lineHeight.toFixed(2)} is outside ${text.fontFamily} band ${lhBand.min}–${lhBand.max}.`
			});
		}
	}
}

