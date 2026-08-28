/**
 * The reader half of ADR-0053's Legacy Supers compatibility matrix.
 *
 * Every entry here belongs to a matrix row marked `accept-old / write-new` or
 * `deprecated alias`: a persisted value, or a value supplied by something we do
 * not control, where the GFX and Legacy Supers spellings name the SAME thing.
 * Readers accept both permanently; exactly one spelling is what a writer emits.
 *
 * ADR-0053 sequences readers ahead of writers — a writer may not emit a GFX
 * form until the matching legacy reader exists and a fixture proves an old
 * artifact still loads, round-trips, and renders. That is why both spellings
 * are already accepted at every surface below while the writers still emit the
 * Supers form; flipping a writer is then a one-constant change with no reader
 * consequence.
 *
 * Each accepted list is ordered `[GFX spelling, Legacy Supers spelling]`. Add a
 * surface here only after adding its row to the ADR-0053 matrix — a value the
 * matrix does not list has no disposition, and guessing one is what the "no
 * global string replacement" rule exists to prevent.
 *
 * Deliberately free of imports so the browser, server modules, probes, and the
 * `scripts/` CLIs all read one contract.
 */

// ---- Composition and interchange ----

/**
 * Ids accepted for a composition's `schema` field. A namespace rename is not a
 * schema revision, so `gfx@1` and `supers@1` describe one identical document
 * shape. Ingress folds whichever arrived onto the id writers emit, so nothing
 * downstream branches on the spelling — and the same composition renders to the
 * same pixels under either id.
 */
export const ACCEPTED_COMPOSITION_SCHEMA_IDS = ['gfx@1', 'supers@1'] as const;

export type AcceptedCompositionSchemaId = (typeof ACCEPTED_COMPOSITION_SCHEMA_IDS)[number];

export function isAcceptedCompositionSchemaId(
	value: unknown
): value is AcceptedCompositionSchemaId {
	return (
		typeof value === 'string' &&
		(ACCEPTED_COMPOSITION_SCHEMA_IDS as readonly string[]).includes(value)
	);
}

// ---- Resolve marker sync and placement (ADR-0042) ----

/**
 * `customData` receipt tags a re-sync recognizes on a Resolve marker. The
 * receipt lives in the editor's project, which we do not own, so a group synced
 * before the rename stays findable forever; a re-sync rewrites that group's
 * receipt in place to whichever tag the writer emits.
 */
export const ACCEPTED_MARKER_SYNC_SCHEMAS = ['gfx-sync@1', 'supers-sync@1'] as const;

export type AcceptedMarkerSyncSchema = (typeof ACCEPTED_MARKER_SYNC_SCHEMAS)[number];

export function isAcceptedMarkerSyncSchema(value: unknown): value is AcceptedMarkerSyncSchema {
	return (
		typeof value === 'string' && (ACCEPTED_MARKER_SYNC_SCHEMAS as readonly string[]).includes(value)
	);
}

/**
 * Head-note prefixes that open a marker group; the rest of the note is the
 * composition slug. A human typed this note onto the editor's timeline, so both
 * spellings are read forever and the sync never rewrites the note itself — the
 * `customData` receipt is what it writes.
 */
export const ACCEPTED_HEAD_NOTE_PREFIXES = ['gfx ', 'supers '] as const;

// ---- Files the host and the visitor see ----

/**
 * Temp-directory prefixes the startup sweep and the retention probe both
 * remove. The sweep must span both spellings: a deploy or rollback across the
 * rename would otherwise orphan the previous release's private export
 * directories, which is exactly the zero-retention rule ADR-0052 forbids
 * breaking.
 */
export const SWEPT_EXPORT_DIRECTORY_PREFIXES = ['gfx-export-', 'supers-export-'] as const;

export type SweptExportDirectoryPrefix = (typeof SWEPT_EXPORT_DIRECTORY_PREFIXES)[number];

export function isSweptExportDirectoryName(name: string): boolean {
	return SWEPT_EXPORT_DIRECTORY_PREFIXES.some((prefix) => name.startsWith(prefix));
}

// ---- Environment a person exports in a shell ----

/**
 * Read a `GFX_`-prefixed environment value, falling back to the same name under
 * the `SUPERS_` prefix.
 *
 * The `SUPERS_` spelling is a `deprecated alias` (ADR-0053): it is what an
 * existing shell profile, launchd plist, or CI job already exports, so it keeps
 * working and its eventual removal is a decision with a visible cost rather
 * than a silent break. New profiles export the `GFX_` name, which always wins.
 *
 * @param environment usually `process.env`.
 * @param gfxName the current `GFX_`-prefixed variable name.
 */
export function readGfxEnvironmentValue(
	environment: Record<string, string | undefined>,
	gfxName: `GFX_${string}`
): string | undefined {
	const legacySupersName = `SUPERS_${gfxName.slice('GFX_'.length)}`;
	return environment[gfxName] ?? environment[legacySupersName];
}
