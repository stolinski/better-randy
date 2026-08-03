export interface PassPixelBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PassExecutionHints {
	/** Limit expensive fragment work to this native-composition pixel region. */
	region?: PassPixelBounds;
	/** Full-frame intermediate quality. Final output remains native size. */
	resolutionScale?: number;
}

export interface ResolvedPassExecution {
	mode: 'full' | 'region' | 'scaled';
	region: PassPixelBounds;
	targetWidth: number;
	targetHeight: number;
}

function finiteOr(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback;
}

export function resolvePassExecution(
	hints: PassExecutionHints | undefined,
	canvasWidth: number,
	canvasHeight: number
): ResolvedPassExecution {
	if (hints?.region && hints.resolutionScale !== undefined) {
		throw new Error('A render pass cannot combine a local region with a reduced target.');
	}

	const fullRegion = { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
	if (hints?.region) {
		const left = Math.max(0, Math.floor(finiteOr(hints.region.x, 0)));
		const top = Math.max(0, Math.floor(finiteOr(hints.region.y, 0)));
		const right = Math.min(
			canvasWidth,
			Math.ceil(finiteOr(hints.region.x + hints.region.width, canvasWidth))
		);
		const bottom = Math.min(
			canvasHeight,
			Math.ceil(finiteOr(hints.region.y + hints.region.height, canvasHeight))
		);
		return {
			mode: 'region',
			region: {
				x: left,
				y: top,
				width: Math.max(1, right - left),
				height: Math.max(1, bottom - top)
			},
			targetWidth: canvasWidth,
			targetHeight: canvasHeight
		};
	}

	if (hints?.resolutionScale !== undefined && hints.resolutionScale < 1) {
		const scale = Math.max(0.125, hints.resolutionScale);
		return {
			mode: 'scaled',
			region: fullRegion,
			targetWidth: Math.max(1, Math.round(canvasWidth * scale)),
			targetHeight: Math.max(1, Math.round(canvasHeight * scale))
		};
	}

	return {
		mode: 'full',
		region: fullRegion,
		targetWidth: canvasWidth,
		targetHeight: canvasHeight
	};
}

export function normalizedPassRegion(
	region: readonly [number, number, number, number],
	canvasWidth: number,
	canvasHeight: number,
	paddingPx = 0
): PassPixelBounds {
	return {
		x: region[0] * canvasWidth - paddingPx,
		y: region[1] * canvasHeight - paddingPx,
		width: region[2] * canvasWidth + paddingPx * 2,
		height: region[3] * canvasHeight + paddingPx * 2
	};
}
