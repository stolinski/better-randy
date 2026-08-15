/** Cancels stale async authoring completions after a newer operation or component teardown. */
export class AsyncAuthoringOperationGuard {
	#generation = 0;
	#disposed = false;

	begin(): number {
		this.#generation += 1;
		return this.#generation;
	}

	supersede(): void {
		this.#generation += 1;
	}

	isCurrent(generation: number): boolean {
		return !this.#disposed && generation === this.#generation;
	}

	dispose(): void {
		this.#disposed = true;
		this.#generation += 1;
	}
}
