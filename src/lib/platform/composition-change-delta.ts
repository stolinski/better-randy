/**
 * What changed between two composition documents, named as composition
 * pointers and bounded for an Operation receipt
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §3).
 *
 * The comparison runs on the wire form — the persisted JSON shape, the same one
 * an agent reads back from the document — so a pointer a receipt names is a
 * pointer that exists in the saved composition. Entries of a list carrying
 * stable ids are matched by id, so inserting an Overlay reports one membership
 * change at `/state/overlays` rather than a cascade of shifted-index edits.
 */
import type { Preset } from './engine-schema';
import type { CompositionPointer } from './composition-pointer-ownership';
import { cloneJsonValue } from '../utils/json-clone';
import { presetToWireFormat } from './preset-pure';

/** A pointer list trimmed to a receipt budget, still reporting its true size. */
export interface BoundedCompositionPointers {
	pointers: readonly CompositionPointer[];
	total: number;
	truncated: boolean;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The id of every entry, or `null` when this list has no stable per-entry
 * identity (duplicate or missing ids). Lists without identity fall back to
 * positional comparison, which is what mark timings and chat messages need.
 */
function readEntryIdentities(items: readonly unknown[]): readonly string[] | null {
	const identities: string[] = [];
	for (const item of items) {
		if (!isPlainRecord(item) || typeof item['id'] !== 'string') return null;
		identities.push(item['id']);
	}
	return new Set(identities).size === identities.length ? identities : null;
}

function appendJsonValueDifferences(
	pointer: CompositionPointer,
	previous: unknown,
	next: unknown,
	changed: CompositionPointer[]
): void {
	if (previous === next) return;

	if (Array.isArray(previous) && Array.isArray(next)) {
		appendArrayDifferences(pointer, previous, next, changed);
		return;
	}

	if (isPlainRecord(previous) && isPlainRecord(next)) {
		appendRecordDifferences(pointer, previous, next, changed);
		return;
	}

	changed.push(pointer);
}

function appendArrayDifferences(
	pointer: CompositionPointer,
	previous: readonly unknown[],
	next: readonly unknown[],
	changed: CompositionPointer[]
): void {
	const previousIdentities = readEntryIdentities(previous);
	const nextIdentities = readEntryIdentities(next);

	if (previousIdentities && nextIdentities) {
		const membershipMoved =
			previousIdentities.length !== nextIdentities.length ||
			previousIdentities.some((identity, index) => identity !== nextIdentities[index]);
		if (membershipMoved) changed.push(pointer);

		for (const [index, identity] of nextIdentities.entries()) {
			const previousIndex = previousIdentities.indexOf(identity);
			if (previousIndex < 0) continue;
			appendJsonValueDifferences(
				`${pointer}/${index}`,
				previous[previousIndex],
				next[index],
				changed
			);
		}
		return;
	}

	if (previous.length !== next.length) changed.push(pointer);
	for (let index = 0; index < Math.min(previous.length, next.length); index += 1) {
		appendJsonValueDifferences(`${pointer}/${index}`, previous[index], next[index], changed);
	}
}

function appendRecordDifferences(
	pointer: CompositionPointer,
	previous: Record<string, unknown>,
	next: Record<string, unknown>,
	changed: CompositionPointer[]
): void {
	for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
		const childPointer = `${pointer}/${key}`;
		const inPrevious = key in previous;
		const inNext = key in next;
		if (inPrevious !== inNext) {
			changed.push(childPointer);
			continue;
		}
		appendJsonValueDifferences(childPointer, previous[key], next[key], changed);
	}
}

/**
 * Every composition pointer whose persisted value differs between the two
 * documents, in document order. An empty array means the edit was a no-op.
 */
export function diffCompositionDocuments(
	previous: Preset,
	next: Preset
): readonly CompositionPointer[] {
	const changed: CompositionPointer[] = [];
	appendJsonValueDifferences(
		'',
		// The JSON round trip drops keys the engine carries as explicit
		// `undefined`, so an absent optional and an undefined one compare equal —
		// exactly how the saved document treats them.
		cloneJsonValue(presetToWireFormat(previous)),
		cloneJsonValue(presetToWireFormat(next)),
		changed
	);
	return changed;
}

export function boundCompositionPointers(
	pointers: readonly CompositionPointer[],
	limit: number
): BoundedCompositionPointers {
	if (!Number.isSafeInteger(limit) || limit < 0) {
		throw new TypeError('Bounded composition pointers require a non-negative integer limit.');
	}
	return {
		pointers: pointers.slice(0, limit),
		total: pointers.length,
		truncated: pointers.length > limit
	};
}
