import type { StageMeshData } from './stage-mesh-format';

export interface StageModelRequest {
	/** The registered model the stage's screen declares, or null for none. */
	model: string | null;
	stageIdentity: object | null;
}

export interface StageModelSnapshot {
	generation: number;
	promise: Promise<void>;
}

export interface StageModelServices {
	load(model: string): Promise<StageMeshData> | null;
	onReady(): void;
	onError(error: unknown): void;
}

/**
 * Tracks the one live stage model's decoded mesh and rejects stale async
 * loads — the same seam as `StageSubstrateController`, so first paint and
 * export wait on the mesh the way they wait on the backdrop image.
 */
export class StageModelController {
	readonly #services: StageModelServices;
	#request: StageModelRequest = { model: null, stageIdentity: null };
	#mesh: StageMeshData | null = null;
	#generation = 0;
	#readiness: Promise<void> = Promise.resolve();
	#isDisposed = false;

	constructor(services: StageModelServices) {
		this.#services = services;
	}

	update(request: StageModelRequest): void {
		if (
			this.#request.model === request.model &&
			this.#request.stageIdentity === request.stageIdentity
		) {
			return;
		}
		this.#request = request;
		this.#mesh = null;
		const generation = ++this.#generation;
		const pending = this.#isDisposed || !request.model ? null : this.#services.load(request.model);
		if (!pending) {
			this.#readiness = Promise.resolve();
			if (request.model && !this.#isDisposed) {
				const error = new Error(`Declared stage model "${request.model}" is unavailable.`);
				this.#readiness = Promise.reject(error);
				void this.#readiness.catch(() => undefined);
				this.#services.onError(error);
				return;
			}
			this.#services.onReady();
			return;
		}
		const readiness = pending.then((mesh) => {
			this.#assertCurrent(request, generation);
			this.#mesh = mesh;
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

	mesh(): StageMeshData | null {
		return this.#mesh;
	}

	snapshot(): StageModelSnapshot {
		return { generation: this.#generation, promise: this.#readiness };
	}

	assertCurrent(snapshot: StageModelSnapshot): void {
		if (snapshot.generation !== this.#generation || snapshot.promise !== this.#readiness) {
			throw new Error('Stage model changed while composition resources were pending.');
		}
	}

	dispose(): void {
		if (this.#isDisposed) return;
		this.#isDisposed = true;
		this.#generation += 1;
		this.#mesh = null;
		this.#readiness = Promise.resolve();
		this.#request = { model: null, stageIdentity: null };
	}

	#assertCurrent(request: StageModelRequest, generation: number): void {
		if (!this.#isCurrent(request, generation)) {
			throw new DOMException('Stage model load was superseded.', 'AbortError');
		}
	}

	#isCurrent(request: StageModelRequest, generation: number): boolean {
		return !this.#isDisposed && this.#request === request && this.#generation === generation;
	}
}
