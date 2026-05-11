export type HtmlInCanvas2DContext = (
	| CanvasRenderingContext2D
	| OffscreenCanvasRenderingContext2D
) & {
	drawElementImage: (
		element: Element,
		dx: number,
		dy: number,
		dwidth: number,
		dheight: number
	) => DOMMatrix;
};

export function getHtmlInCanvasContext(
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
): HtmlInCanvas2DContext {
	const drawElementImage = context.drawElementImage;

	if (typeof drawElementImage !== 'function') {
		throw new Error('HTML-in-Canvas drawElementImage is unavailable in this browser.');
	}

	return context as HtmlInCanvas2DContext;
}

export function isHtmlInCanvasContext(
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
): context is HtmlInCanvas2DContext {
	return typeof context?.drawElementImage === 'function';
}

export function getCanvasParent(element: Element): HTMLCanvasElement {
	const parent = element.parentElement;

	if (!(parent instanceof HTMLCanvasElement)) {
		throw new Error('HTML-in-Canvas source elements must be direct canvas children.');
	}

	return parent;
}

export function requestCanvasPaint(canvas: HTMLCanvasElement): void {
	canvas.requestPaint?.();
}
