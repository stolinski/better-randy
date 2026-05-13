export type HtmlInCanvasQueue = GPUQueue & {
	copyElementImageToTexture: (
		element: Element,
		width: number,
		height: number,
		destination: { texture: GPUTexture }
	) => void;
};

export function getHtmlInCanvasQueue(queue: GPUQueue): HtmlInCanvasQueue {
	const copyElementImageToTexture = (queue as Partial<HtmlInCanvasQueue>).copyElementImageToTexture;

	if (typeof copyElementImageToTexture !== 'function') {
		throw new Error('HTML-in-Canvas copyElementImageToTexture is unavailable in this browser.');
	}

	return queue as HtmlInCanvasQueue;
}

export function requestCanvasPaint(canvas: HTMLCanvasElement): void {
	canvas.requestPaint?.();
}

export function setCanvasPaintHandler(canvas: HTMLCanvasElement, handler: () => void): void {
	(canvas as HTMLCanvasElement & { onpaint: () => void }).onpaint = handler;
}

export function clearCanvasPaintHandler(canvas: HTMLCanvasElement): void {
	(canvas as HTMLCanvasElement & { onpaint: (() => void) | null }).onpaint = null;
}
