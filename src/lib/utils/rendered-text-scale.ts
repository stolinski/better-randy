/**
 * Reads the vertical component of a computed individual CSS `scale` value.
 * Diagram text uses uniform scale today, but accepting the two-axis form keeps
 * visual-audit measurements correct if authored motion later separates axes.
 */
export function parseRenderedTextScaleY(computedScale: string): number {
	const value = computedScale.trim();
	if (value === '' || value === 'none') {
		return 1;
	}

	const components = value.split(/\s+/);
	const verticalComponent = components[1] ?? components[0];
	const parsed = verticalComponent.endsWith('%')
		? Number(verticalComponent.slice(0, -1)) / 100
		: Number(verticalComponent);

	return Number.isFinite(parsed) ? Math.abs(parsed) : 1;
}

/** Computes native-frame cap height without including outer preview scaling. */
export function calculateEffectiveCapHeight(
	fontSize: number,
	capHeightRatio: number,
	computedScale: string
): number {
	return fontSize * capHeightRatio * parseRenderedTextScaleY(computedScale);
}
