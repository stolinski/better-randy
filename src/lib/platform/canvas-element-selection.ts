/**
 * Stable identities for spatial canvas elements that can participate in
 * multi-selection transforms. Surface content remains single-select because it
 * has no authored composition-space translation.
 */
export type CanvasElementSelectionKey = `overlay:${string}` | `block:${string}`;

export interface CanvasElementSelectionIdentity {
	kind: 'overlay' | 'block';
	id: string;
}

export function parseCanvasElementSelectionKey(
	value: string
): CanvasElementSelectionIdentity | null {
	if (value.startsWith('overlay:')) {
		const id = value.slice('overlay:'.length);
		return id.length > 0 ? { kind: 'overlay', id } : null;
	}
	if (value.startsWith('block:')) {
		const id = value.slice('block:'.length);
		return id.length > 0 ? { kind: 'block', id } : null;
	}
	return null;
}

export function isCanvasElementSelectionKey(value: string): value is CanvasElementSelectionKey {
	return parseCanvasElementSelectionKey(value) !== null;
}
