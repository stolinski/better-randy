import type { AnnotationBody } from '$lib/annotations/annotation-marks';
import type { SurfaceState } from '$lib/platform/engine-schema';
import type { SurfaceControlsMetadata } from '$lib/platform/pipelines/types';

// Every string slot a Surface can declare, in display order. `body` stays
// outside this mechanism — it has its own always/optional semantics.
export const DOCUMENT_SLOTS = [
	'kicker',
	'title',
	'counterpoint',
	'sourceUrl',
	'author',
	'affiliation',
	'avatarUrl',
	'source',
	'dateLabel',
	'bodyLabel'
] as const;
export type DocumentSlot = (typeof DOCUMENT_SLOTS)[number];

export const DOCUMENT_SLOT_LABELS: Record<DocumentSlot, string> = {
	kicker: 'Kicker',
	title: 'Title',
	counterpoint: 'Counterpoint',
	sourceUrl: 'Source',
	author: 'Author',
	affiliation: 'Affiliation',
	avatarUrl: 'Avatar',
	source: 'Citation',
	dateLabel: 'Date',
	bodyLabel: 'Body label'
};

export function hasAnyBodyText(body: AnnotationBody): boolean {
	for (const block of body) {
		if (block.type === 'paragraph') {
			for (const segment of block.segments) {
				if (segment.text.length > 0) return true;
			}
		}
	}
	return false;
}

/** The body editor shows when the renderer demands it or the author wrote one. */
export function isBodyVisible(controls: SurfaceControlsMetadata, surface: SurfaceState): boolean {
	return (
		controls.body === 'always' ||
		(controls.body === 'optional' && hasAnyBodyText(surface.content.body))
	);
}

// A slot is declared when the renderer's controls claim it AND the current
// state renders it: counterpoint only exists on the `pair` variant;
// web-document limits avatarUrl to its twitter mock, while other renderers
// that declare the slot can consume it directly.
export function isDocumentSlotDeclared(
	controls: SurfaceControlsMetadata,
	slot: DocumentSlot,
	surface: SurfaceState,
	activeVariant: string | undefined
): boolean {
	if (slot === 'counterpoint') return controls.counterpoint === true && activeVariant === 'pair';
	if (slot === 'avatarUrl')
		return (
			controls.avatarUrl === true && (!controls.site || (surface.site ?? 'twitter') === 'twitter')
		);
	return controls[slot] === true;
}

export type DocumentSlotVisibility = Record<DocumentSlot, boolean>;

/** Declared-AND-present slots — the rows the document editor renders. */
export function resolveDocumentSlotVisibility(
	controls: SurfaceControlsMetadata,
	surface: SurfaceState,
	activeVariant: string | undefined
): DocumentSlotVisibility {
	const present = (slot: DocumentSlot): boolean =>
		isDocumentSlotDeclared(controls, slot, surface, activeVariant) &&
		surface.content[slot] !== undefined;
	return {
		kicker: present('kicker'),
		title: present('title'),
		counterpoint: present('counterpoint'),
		sourceUrl: present('sourceUrl'),
		author: present('author'),
		affiliation: present('affiliation'),
		avatarUrl: present('avatarUrl'),
		source: present('source'),
		dateLabel: present('dateLabel'),
		bodyLabel: present('bodyLabel')
	};
}

// Declared-but-absent slots — what the "+ Slot…" select offers so a GUI user
// can add e.g. an author to a composition that lacks it (parity with agents).
export function listAbsentDocumentSlots(
	controls: SurfaceControlsMetadata,
	surface: SurfaceState,
	activeVariant: string | undefined
): DocumentSlot[] {
	return DOCUMENT_SLOTS.filter(
		(slot) =>
			isDocumentSlotDeclared(controls, slot, surface, activeVariant) &&
			surface.content[slot] === undefined
	);
}
