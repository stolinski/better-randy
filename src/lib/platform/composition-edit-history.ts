export interface CompositionEditHistoryEntry {
	label: string;
	undo: () => void;
	redo: () => void;
}

/**
 * In-memory authoring transaction history. Callers record an edit only after it
 * has been applied; undo/redo callbacks must restore the same bounded domain
 * mutation without re-recording it.
 */
export class CompositionEditHistory {
	#past: CompositionEditHistoryEntry[] = [];
	#future: CompositionEditHistoryEntry[] = [];

	get canUndo(): boolean {
		return this.#past.length > 0;
	}

	get canRedo(): boolean {
		return this.#future.length > 0;
	}

	get undoLabel(): string | null {
		return this.#past.at(-1)?.label ?? null;
	}

	get redoLabel(): string | null {
		return this.#future.at(-1)?.label ?? null;
	}

	recordApplied(entry: CompositionEditHistoryEntry): void {
		this.#past.push(entry);
		this.#future.length = 0;
	}

	undo(): boolean {
		const entry = this.#past.at(-1);
		if (!entry) return false;
		entry.undo();
		this.#past.pop();
		this.#future.push(entry);
		return true;
	}

	redo(): boolean {
		const entry = this.#future.at(-1);
		if (!entry) return false;
		entry.redo();
		this.#future.pop();
		this.#past.push(entry);
		return true;
	}

	clear(): void {
		this.#past.length = 0;
		this.#future.length = 0;
	}
}

export const compositionEditHistory = new CompositionEditHistory();
