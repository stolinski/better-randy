export interface PosterCaptureRequest {
	canvas: HTMLCanvasElement;
	compositionIdentity: object;
	key: string;
}

export interface PosterCaptureServices {
	capture(canvas: HTMLCanvasElement): Promise<Blob | null>;
	delay(signal: AbortSignal): Promise<void>;
	exists(key: string): Promise<boolean>;
	nextFrame(signal: AbortSignal): Promise<void>;
	requestPaint(canvas: HTMLCanvasElement): void;
	store(key: string, blob: Blob): Promise<void>;
	waitForFonts(): Promise<void>;
	reportError(error: unknown): void;
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw signal.reason;
}

/** Owns delayed, once-per-content-key poster capture without outliving its Workspace identity. */
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
			this.#services.requestPaint(request.canvas);
			await this.#services.nextFrame(signal);
			await this.#services.nextFrame(signal);
			this.#assertCurrent(revision, signal);
			if (await this.#services.exists(request.key)) {
				this.#assertCurrent(revision, signal);
				this.#completedKeys.add(request.key);
				return;
			}
			const blob = await this.#services.capture(request.canvas);
			this.#assertCurrent(revision, signal);
			if (!blob) throw new Error('Poster canvas capture returned no image.');
			await this.#services.store(request.key, blob);
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
