// The WICG HTML-in-Canvas capture API (`GPUQueue.copyElementImageToTexture`)
// is experimental and its signature has DRIFTED across Chrome builds:
//   - legacy form:      copyElementImageToTexture(element, width, height, { texture })
//   - dictionary form:  copyElementImageToTexture({ source: element }, { texture }, [width, height])
//     (mirrors copyExternalImageToTexture; newer builds throw "Failed to read
//     the 'source' property from 'GPUCopyElementImageSource'" when handed the
//     legacy positional element — seen live 2026-07-09 across two Chromes.)
// The adapter below detects which form the running browser speaks on first
// call and caches it, so every render path works in both without per-frame
// overhead.

export interface HtmlInCanvasQueue {
	copyElementImageToTexture(
		element: Element,
		width: number,
		height: number,
		destination: { texture: GPUTexture }
	): void;
}

type LegacyCopy = (
	element: Element,
	width: number,
	height: number,
	destination: { texture: GPUTexture }
) => void;

type DictionaryCopy = (
	source: { source: Element },
	destination: { texture: GPUTexture },
	copySize: readonly [number, number]
) => void;

// One browser per session — the resolved form is process-global, not per-queue.
let apiForm: 'legacy' | 'dictionary' | null = null;

export function getHtmlInCanvasQueue(queue: GPUQueue): HtmlInCanvasQueue {
	const native = (queue as GPUQueue & { copyElementImageToTexture?: unknown })
		.copyElementImageToTexture;

	if (typeof native !== 'function') {
		throw new Error('HTML-in-Canvas copyElementImageToTexture is unavailable in this browser.');
	}

	return {
		copyElementImageToTexture(element, width, height, destination): void {
			if (apiForm === 'dictionary') {
				(native as DictionaryCopy).call(queue, { source: element }, destination, [width, height]);
				return;
			}
			try {
				(native as LegacyCopy).call(queue, element, width, height, destination);
				apiForm = 'legacy';
			} catch (error) {
				// First failure on an undetected browser: retry as the dictionary
				// form. Any later failure is a real capture error — rethrow.
				if (apiForm === null && error instanceof TypeError) {
					(native as DictionaryCopy).call(queue, { source: element }, destination, [
						width,
						height
					]);
					apiForm = 'dictionary';
					return;
				}
				throw error;
			}
		}
	};
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
