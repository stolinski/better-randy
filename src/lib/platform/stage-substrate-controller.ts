import type { GpuHost } from './gpu-host';

export interface StageSubstrateRequest {
	asset: string | null;
	host: GpuHost | null;
	stageIdentity: object | null;
}

export interface StageSubstrateSnapshot {
	generation: number;
	promise: Promise<void>;
}

export interface StageSubstrateServices {
	load(host: GpuHost, asset: string): Promise<GPUTexture | null>;
	onReady(): void;
	onError(error: unknown): void;
}

/** Tracks one live depth-stage backdrop texture and rejects stale async uploads. */
export class StageSubstrateController {
	readonly #services: StageSubstrateServices;
	#request: StageSubstrateRequest = { asset: null, host: null, stageIdentity: null };
	#texture: GPUTexture | null = null;
	#generation = 0;
	#readiness: Promise<void> = Promise.resolve();
	#isDisposed = false;

	constructor(services: StageSubstrateServices) {
		this.#services = services;
	}

	update(request: StageSubstrateRequest): void {
		if (
			this.#request.host === request.host &&
			this.#request.asset === request.asset &&
			this.#request.stageIdentity === request.stageIdentity
		) {
			return;
		}
		this.#request = request;
		this.#texture = null;
		const generation = ++this.#generation;
		if (this.#isDisposed || !request.host || !request.asset) {
			this.#readiness = Promise.resolve();
			this.#services.onReady();
			return;
		}

		const readiness = this.#services.load(request.host, request.asset).then((texture) => {
			this.#assertCurrent(request, generation);
			if (!texture) throw new Error(`Declared stage substrate "${request.asset}" is unavailable.`);
			this.#texture = texture;
			this.#services.onReady();
		});
		this.#readiness = readiness.catch((error: unknown) => {
			if (!this.#isCurrent(request, generation)) return;
			this.#services.onError(error);
			throw error;
		});
		// Asset changes outside first paint/export may have no readiness waiter yet.
		// Keep the rejection observable to future callers without leaking an
		// unhandled promise rejection in the meantime.
		void this.#readiness.catch(() => undefined);
	}

	texture(): GPUTexture | null {
		return this.#texture;
	}

	snapshot(): StageSubstrateSnapshot {
		return { generation: this.#generation, promise: this.#readiness };
	}

	assertCurrent(snapshot: StageSubstrateSnapshot): void {
		if (snapshot.generation !== this.#generation || snapshot.promise !== this.#readiness) {
			throw new Error('Stage substrate changed while composition resources were pending.');
		}
	}

	dispose(): void {
		if (this.#isDisposed) return;
		this.#isDisposed = true;
		this.#generation += 1;
		this.#texture = null;
		this.#readiness = Promise.resolve();
		this.#request = { asset: null, host: null, stageIdentity: null };
	}

	#assertCurrent(request: StageSubstrateRequest, generation: number): void {
		if (!this.#isCurrent(request, generation)) {
			throw new DOMException('Stage substrate load was superseded.', 'AbortError');
		}
	}

	#isCurrent(request: StageSubstrateRequest, generation: number): boolean {
		return !this.#isDisposed && this.#request === request && this.#generation === generation;
	}
}
