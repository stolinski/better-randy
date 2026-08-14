import type {
	ChartTextMeasurer,
	ChartTextMeasureRequest,
	ChartTextMeasurement,
	ChartTextRole
} from './chart-layout';

export interface ChartTextRoleStyle {
	fontSize: number;
	fontWeight: number;
	letterSpacing: number;
	lineHeight: number;
}

const HORIZONTAL_CHART_TEXT_ROLE_STYLES: Readonly<Record<ChartTextRole, ChartTextRoleStyle>> = {
	title: { fontSize: 96, fontWeight: 760, letterSpacing: -1.4, lineHeight: 1.04 },
	axis: { fontSize: 52, fontWeight: 560, letterSpacing: 0, lineHeight: 1.15 },
	category: { fontSize: 56, fontWeight: 650, letterSpacing: -0.2, lineHeight: 1.1 },
	value: { fontSize: 52, fontWeight: 720, letterSpacing: 0.2, lineHeight: 1.05 },
	legend: { fontSize: 64, fontWeight: 620, letterSpacing: 0, lineHeight: 1.1 },
	source: { fontSize: 48, fontWeight: 480, letterSpacing: 0.2, lineHeight: 1.15 },
	callout: { fontSize: 72, fontWeight: 760, letterSpacing: -0.2, lineHeight: 1.05 }
};

// Portrait compositions retain independent native-pixel floors tuned for their narrower safe width.
// Horizontal supporting text is larger at editor scale; portrait roles stay bounded to avoid overflow.
const VERTICAL_CHART_TEXT_ROLE_STYLES: Readonly<Record<ChartTextRole, ChartTextRoleStyle>> = {
	title: { fontSize: 112, fontWeight: 760, letterSpacing: -1.4, lineHeight: 1.04 },
	axis: { fontSize: 48, fontWeight: 560, letterSpacing: 0, lineHeight: 1.15 },
	category: { fontSize: 48, fontWeight: 650, letterSpacing: -0.2, lineHeight: 1.1 },
	value: { fontSize: 52, fontWeight: 720, letterSpacing: 0.2, lineHeight: 1.05 },
	legend: { fontSize: 48, fontWeight: 620, letterSpacing: 0, lineHeight: 1.1 },
	source: { fontSize: 48, fontWeight: 480, letterSpacing: 0.2, lineHeight: 1.15 },
	callout: { fontSize: 72, fontWeight: 760, letterSpacing: -0.2, lineHeight: 1.05 }
};

function chartCharacterWidthFactor(character: string): number {
	if (/\s/u.test(character)) return 0.34;
	if (/[ilI1|.,:;'!]/u.test(character)) return 0.32;
	if (/[mwMW@%&]/u.test(character)) return 0.88;
	if (/\p{Number}/u.test(character)) return 0.58;
	if (/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u.test(character)) return 1;
	return 0.59;
}

export function resolveChartTextRoleStyle(
	role: ChartTextRole,
	orientation: 'horizontal' | 'vertical' = 'horizontal'
): ChartTextRoleStyle {
	return orientation === 'vertical'
		? VERTICAL_CHART_TEXT_ROLE_STYLES[role]
		: HORIZONTAL_CHART_TEXT_ROLE_STYLES[role];
}

/**
 * Native-pixel chart measurement contract. SVG renderers apply the returned width through
 * `textLength`, so Pack font changes preserve this deterministic layout in preview and export.
 */
export function measureChartTextForRender(
	request: ChartTextMeasureRequest,
	orientation: 'horizontal' | 'vertical' = 'horizontal'
): ChartTextMeasurement {
	const style = resolveChartTextRoleStyle(request.role, orientation);
	const characters = Array.from(request.text);
	const glyphWidth = characters.reduce(
		(total, character) => total + chartCharacterWidthFactor(character) * style.fontSize,
		0
	);
	const trackingWidth = Math.max(0, characters.length - 1) * style.letterSpacing;
	return {
		width: Math.max(0, glyphWidth + trackingWidth),
		height: style.fontSize * style.lineHeight
	};
}

export function createChartRenderTextMeasurer(
	orientation: 'horizontal' | 'vertical'
): ChartTextMeasurer {
	return (request) => measureChartTextForRender(request, orientation);
}

export const chartRenderTextMeasurer: ChartTextMeasurer =
	createChartRenderTextMeasurer('horizontal');
