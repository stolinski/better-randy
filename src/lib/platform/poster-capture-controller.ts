import type { PosterFrameCapture } from '$lib/utils/canvas-capture';
import { isPosterFrameUsable } from '$lib/utils/poster-frame-choice';

export interface PosterCaptureRequest {
	canvas: HTMLCanvasElement;
	compositionIdentity: object;
	key: string;
}

export interface PosterCaptureServices {
	capture(canvas: HTMLCanvasElement): Promise<PosterFrameCapture | null>;
	delay(signal: AbortSignal): Promise<void>;
	exists(key: string): Promise<boolean>;
	nextFrame(signal: AbortSignal): Promise<void>;
	/** Resolves once one composition paint has been acknowledged. Requesting a
	 *  paint and waiting a frame is only equivalent in the WICG lane, where the
	 *  browser paints on its own tick; the standard-browser rasterization lane
	 *  takes far longer than a frame, so an unawaited request stores a poster of
	 *  the pre-paint canvas. */
	settlePaint(signal: AbortSignal): Promise<void>;
	store(key: string, blob: Blob): Promise<void>;
	waitForFonts(): Promise<void>;
	reportError(error: unknown): void;
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw signal.reason;
}

/**
 * Owns delayed, once-per-content-key poster capture for a User composition
 * without outliving its Workspace identity. A frame that shows nothing is
 * never stored and never counts as done: the key stays open, so the next view
 * of the composition tries again instead of pinning a blank card to it
 * ([ADR-0061](../../../docs/adr/0061-committed-composition-posters.md)).
 */
export class PosterCaptureController {
	readonly #services: PosterCaptureServices;
	readonly #completedKeys = new Set<string>();
	#activeAbort: AbortController | null = null;
	#revision = 0;
	#isDisposed = false;

	constructor(services: PosterCaptureServices) {
		this.#services = services;
	}

	update(request: PosterCaptureRequest | null): void {
		this.#activeAbort?.abort(new DOMException('Poster capture identity changed.', 'AbortError'));
		this.#activeAbort = null;
		const revision = ++this.#revision;
		if (!request || this.#isDisposed || this.#completedKeys.has(request.key)) return;

		const abortController = new AbortController();
		this.#activeAbort = abortController;
		void this.#capture(request, revision, abortController.signal);
	}

	dispose(): void {
		if (this.#isDisposed) return;
		this.#isDisposed = true;
		this.#revision += 1;
		this.#activeAbort?.abort(new DOMException('Poster capture disposed.', 'AbortError'));
		this.#activeAbort = null;
	}

	async #capture(
		request: PosterCaptureRequest,
		revision: number,
		signal: AbortSignal
	): Promise<void> {
		try {
			await this.#services.waitForFonts();
			throwIfAborted(signal);
			await this.#services.delay(signal);
			throwIfAborted(signal);
			await this.#services.settlePaint(signal);
			// The paint drives the composite asynchronously; the frames after it are
			// for that GPU present to land in the canvas, not for the paint itself.
			await this.#services.nextFrame(signal);
			await this.#services.nextFrame(signal);
			this.#assertCurrent(revision, signal);
			if (await this.#services.exists(request.key)) {
				this.#assertCurrent(revision, signal);
				this.#completedKeys.add(request.key);
				return;
			}
			const frame = await this.#services.capture(request.canvas);
			this.#assertCurrent(revision, signal);
			if (!frame) throw new Error('Poster canvas capture returned no image.');
			if (!isPosterFrameUsable(frame)) return;
			await this.#services.store(request.key, frame.blob);
			this.#assertCurrent(revision, signal);
			this.#completedKeys.add(request.key);
		} catch (error) {
			if (signal.aborted || this.#isDisposed || revision !== this.#revision) return;
			this.#services.reportError(error);
		} finally {
			if (revision === this.#revision) this.#activeAbort = null;
		}
	}

	#assertCurrent(revision: number, signal: AbortSignal): void {
		throwIfAborted(signal);
		if (this.#isDisposed || revision !== this.#revision) {
			throw new DOMException('Poster capture was superseded.', 'AbortError');
		}
	}
}
