import type { StageTypefaceData } from './stage-glyph-format';

export interface StageTypefaceRequest {
	/** The registered typefaces the composition's bodies set in, in a stable order. */
	slugs: readonly string[];
	stageIdentity: object | null;
}

export interface StageTypefaceSnapshot {
	generation: number;
	promise: Promise<void>;
}

export interface StageTypefaceServices {
	load(slug: string): Promise<StageTypefaceData> | null;
	onReady(): void;
	onError(error: unknown): void;
}

function sameSlugs(first: readonly string[], second: readonly string[]): boolean {
	return first.length === second.length && first.every((slug, index) => slug === second[index]);
}

/**
 * Tracks the decoded typefaces the live composition's bodies set in and
 * rejects stale async loads — the same seam as `StageModelController`, so
 * first paint and export wait on the outlines the way they wait on a model's
 * mesh and the backdrop image (ADR-0062).
 */
export class StageTypefaceController {
	readonly #services: StageTypefaceServices;
	#request: StageTypefaceRequest = { slugs: [], stageIdentity: null };
	#typefaces = new Map<string, StageTypefaceData>();
	#generation = 0;
	#readiness: Promise<void> = Promise.resolve();
	#isDisposed = false;

	constructor(services: StageTypefaceServices) {
		this.#services = services;
	}

	update(request: StageTypefaceRequest): void {
		if (
			sameSlugs(this.#request.slugs, request.slugs) &&
			this.#request.stageIdentity === request.stageIdentity
		) {
			return;
		}
		this.#request = request;
		const generation = ++this.#generation;
		// Faces already decoded stay resident; only the missing ones load.
		for (const slug of [...this.#typefaces.keys()]) {
			if (!request.slugs.includes(slug)) this.#typefaces.delete(slug);
		}
		const missing = this.#isDisposed
			? []
			: request.slugs.filter((slug) => !this.#typefaces.has(slug));
		if (missing.length === 0) {
			this.#readiness = Promise.resolve();
			if (!this.#isDisposed) this.#services.onReady();
			return;
		}
		const loads = missing.map((slug) => {
			const pending = this.#services.load(slug);
			if (!pending) {
				return Promise.reject(new Error(`Declared stage typeface "${slug}" is unavailable.`));
			}
			return pending.then((data) => {
				this.#assertCurrent(request, generation);
				this.#typefaces.set(slug, data);
			});
		});
		const readiness = Promise.all(loads).then(() => {
			this.#assertCurrent(request, generation);
			this.#services.onReady();
		});
		this.#readiness = readiness.catch((error: unknown) => {
			if (!this.#isCurrent(request, generation)) return;
			this.#services.onError(error);
			throw error;
		});
		// Keep the rejection observable to future waiters without leaking an
		// unhandled rejection while none exists yet.
		void this.#readiness.catch(() => undefined);
	}

	typeface(slug: string): StageTypefaceData | null {
		return this.#typefaces.get(slug) ?? null;
	}

	snapshot(): StageTypefaceSnapshot {
		return { generation: this.#generation, promise: this.#readiness };
	}

	assertCurrent(snapshot: StageTypefaceSnapshot): void {
		if (snapshot.generation !== this.#generation || snapshot.promise !== this.#readiness) {
			throw new Error('Stage typefaces changed while composition resources were pending.');
		}
	}

	dispose(): void {
		if (this.#isDisposed) return;
		this.#isDisposed = true;
		this.#generation += 1;
		this.#typefaces.clear();
		this.#readiness = Promise.resolve();
		this.#request = { slugs: [], stageIdentity: null };
	}

	#assertCurrent(request: StageTypefaceRequest, generation: number): void {
		if (!this.#isCurrent(request, generation)) {
			throw new DOMException('Stage typeface load was superseded.', 'AbortError');
		}
	}

	#isCurrent(request: StageTypefaceRequest, generation: number): boolean {
		return !this.#isDisposed && this.#request === request && this.#generation === generation;
	}
}
