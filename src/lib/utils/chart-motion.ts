import type { ChartMotion } from '$lib/platform/engine-schema';

export const CHART_TIMING_EPSILON = 1e-12;
export const CHART_MOTION_PHASE_NAMES = [
	'entry',
	'reveal',
	'emphasis',
	'annotation',
	'exit'
] as const;

export type ChartMotionPhaseName = (typeof CHART_MOTION_PHASE_NAMES)[number];
type ChartMotionEase = NonNullable<ChartMotion[ChartMotionPhaseName]['ease']>;

export interface ChartMotionState {
	compositionProgress: number;
	entryProgress: number;
	revealProgress: number;
	emphasisProgress: number;
	annotationProgress: number;
	exitProgress: number;
	chartAlpha: number;
	chromeAlpha: number;
	annotationAlpha: number;
}

const CHART_PHASE_DEFAULT_EASE: Readonly<Record<ChartMotionPhaseName, ChartMotionEase>> = {
	entry: 'smooth',
	reveal: 'smooth',
	emphasis: 'sharp',
	annotation: 'smooth',
	exit: 'smooth'
};

function clampChartUnitInterval(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function applyChartMotionEase(progress: number, ease: ChartMotionEase): number {
	if (progress === 0 || progress === 1) return progress;
	return ease === 'sharp' ? 1 - 2 ** (-10 * progress) : 1 - (1 - progress) ** 3;
}

function assertChartMotion(motion: ChartMotion): void {
	let previousEnd = 0;
	for (const phaseName of CHART_MOTION_PHASE_NAMES) {
		const phase = motion[phaseName];
		if (phase.ease !== undefined && phase.ease !== 'smooth' && phase.ease !== 'sharp') {
			throw new RangeError(`Chart motion phase "${phaseName}" uses an unsupported ease.`);
		}
		if (
			!Number.isFinite(phase.start) ||
			!Number.isFinite(phase.duration) ||
			phase.start < 0 ||
			phase.duration <= 0 ||
			phase.start + phase.duration > 1 + CHART_TIMING_EPSILON
		) {
			throw new RangeError(`Chart motion phase "${phaseName}" must be finite and bounded.`);
		}
		if (phase.start + CHART_TIMING_EPSILON < previousEnd) {
			throw new RangeError(`Chart motion phase "${phaseName}" overlaps the previous phase.`);
		}
		previousEnd = phase.start + phase.duration;
	}
}

function resolveChartPhaseRawProgress(
	motion: ChartMotion,
	phaseName: ChartMotionPhaseName,
	compositionProgress: number
): number {
	const phase = motion[phaseName];
	if (compositionProgress <= phase.start) return 0;
	if (compositionProgress >= phase.start + phase.duration) return 1;
	const rawProgress = (compositionProgress - phase.start) / phase.duration;
	const stableProgress = Math.round(rawProgress / CHART_TIMING_EPSILON) * CHART_TIMING_EPSILON;
	return clampChartUnitInterval(stableProgress);
}

function resolveChartPhaseProgress(
	motion: ChartMotion,
	phaseName: ChartMotionPhaseName,
	compositionProgress: number
): number {
	return applyChartMotionEase(
		resolveChartPhaseRawProgress(motion, phaseName, compositionProgress),
		motion[phaseName].ease ?? CHART_PHASE_DEFAULT_EASE[phaseName]
	);
}

export function resolveChartMotionState(
	motion: ChartMotion,
	compositionProgress: number
): ChartMotionState {
	if (!Number.isFinite(compositionProgress)) {
		throw new RangeError('Chart motion requires finite composition progress.');
	}
	assertChartMotion(motion);
	const progress = clampChartUnitInterval(compositionProgress);
	const entryProgress = resolveChartPhaseProgress(motion, 'entry', progress);
	const revealProgress = resolveChartPhaseProgress(motion, 'reveal', progress);
	const emphasisProgress = resolveChartPhaseProgress(motion, 'emphasis', progress);
	const annotationProgress = resolveChartPhaseProgress(motion, 'annotation', progress);
	const exitProgress = resolveChartPhaseProgress(motion, 'exit', progress);
	const chartAlpha = entryProgress * (1 - exitProgress);
	return {
		compositionProgress: progress,
		entryProgress,
		revealProgress,
		emphasisProgress,
		annotationProgress,
		exitProgress,
		chartAlpha,
		chromeAlpha: chartAlpha,
		annotationAlpha: annotationProgress * chartAlpha
	};
}

export function resolveChartOrderedRevealProgress(
	motion: ChartMotion,
	compositionProgress: number,
	declarationIndex: number,
	itemCount: number
): number {
	if (!Number.isFinite(compositionProgress)) {
		throw new RangeError('Chart ordered reveal requires finite composition progress.');
	}
	assertChartMotion(motion);
	if (
		!Number.isSafeInteger(itemCount) ||
		itemCount <= 0 ||
		!Number.isSafeInteger(declarationIndex) ||
		declarationIndex < 0 ||
		declarationIndex >= itemCount
	) {
		throw new RangeError('Chart ordered reveal requires an in-range declaration index.');
	}
	const revealProgress = resolveChartPhaseRawProgress(
		motion,
		'reveal',
		clampChartUnitInterval(compositionProgress)
	);
	const stride = 0.5;
	const span = 1 / (1 + (itemCount - 1) * stride);
	const start = declarationIndex * stride * span;
	const localProgress = clampChartUnitInterval((revealProgress - start) / span);
	return applyChartMotionEase(localProgress, motion.reveal.ease ?? CHART_PHASE_DEFAULT_EASE.reveal);
}

/** Linear lifetime progress from chart entry start until its exit begins. */
export function resolveChartProgressBarProgress(
	motion: ChartMotion,
	compositionProgress: number
): number {
	if (!Number.isFinite(compositionProgress)) {
		throw new RangeError('Chart progress bar requires finite composition progress.');
	}
	assertChartMotion(motion);
	const lifetimeStart = motion.entry.start;
	const lifetimeEnd = motion.exit.start;
	if (lifetimeEnd <= lifetimeStart) {
		throw new RangeError('Chart progress bar requires exit to begin after entry starts.');
	}
	return clampChartUnitInterval(
		(clampChartUnitInterval(compositionProgress) - lifetimeStart) / (lifetimeEnd - lifetimeStart)
	);
}
