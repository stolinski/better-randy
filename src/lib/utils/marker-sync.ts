import {
	framesToDropTimecode,
	framesToSeconds,
	framesToTimecode,
	resolveFrameRate,
	secondsToFrames,
	NTSC_FRACTIONAL_FPS,
	type FrameRate
} from './composition-timing.ts';

// ---- Resolve marker sync (ADR-0042, grammar v2) ----
// Pure derivation from a DaVinci Resolve timeline's marker snapshot to
// frame-exact Preset timings. The bridge scripts (scripts/resolve-markers.py /
// resolve-place.py) are dumb I/O pipes; every decision lives here, tested.
//
// The grammar (the editor's language, in Resolve) is COLOR-BLIND on read —
// recoloring markers by hand is editor-hostile, so input color carries no
// meaning. A group's HEAD is a marker whose note is `supers <slug>`; the span
// is closed by an explicit END marker (name's last word `END`), or by the
// head's dragged duration, or — degenerate, linted — by the last beat plus a
// handle. Every marker inside the delimited span is a BEAT, whatever its
// color or name: the span is the claim. Beat names carry the item text
// (`parseBeatLabel`). Color is OUTPUT-only: after a sync the group is
// recolored Mint and each synced marker carries `customData`
// (`supers-sync@1`, head = beat 0, END = beat -1), which is how re-syncs find
// their own groups without re-parsing notes. The binding lives Resolve-side
// only — the Preset carries no edit anchor (WHAT in the preset, WHERE in the
// edit).

/** The marker color a synced group is recolored to — "synced" at a glance. The only color in the grammar: input color is meaningless. */
export const SUPERS_SYNCED_MARKER_COLOR = 'Mint';

/** The customData schema tag written on every synced marker. */
export const SUPERS_SYNC_SCHEMA = 'supers-sync@1';

/** Head-marker note prefix; the rest of the note is the Preset slug. */
export const SUPERS_HEAD_NOTE_PREFIX = 'supers ';

/** A marker whose name's last whitespace-separated token is exactly this closes its group's span. */
export const SUPERS_END_NAME_TOKEN = 'END';

/** The customData beat index written on a group's END marker (head = 0, beats 1-based). */
export const SUPERS_END_BEAT = -1;

/** One timeline marker as Resolve reports it (frameId relative to timeline start). */
export interface ResolveMarker {
	frameId: number;
	color: string;
	name: string;
	note: string;
	/** Dragged duration in frames; 1 = undragged. */
	durationFrames: number;
	customData: string;
}

/** The timeline snapshot `scripts/resolve-markers.py` emits. */
export interface ResolveTimelineSnapshot {
	/** Raw timeline rate as Resolve reports it (`"29.97"` → 29.97). */
	fps: number;
	/** `Timeline.GetStartFrame()` — marker frameIds are relative to this. */
	startFrame: number;
	/**
	 * `Timeline.GetStartTimecode()` — its frame separator is the timeline's
	 * DF/NDF declaration (`01:00:00;00` = drop-frame, `01:00:00:00` = NDF).
	 * Optional: snapshots taken before the field existed derive NDF.
	 */
	startTimecode?: string;
	markers: ResolveMarker[];
}

/** The customData payload written on each synced marker. Head = beat 0, END = beat -1; beats are 1-based. */
export interface SupersSyncMarkerData {
	schema: typeof SUPERS_SYNC_SCHEMA;
	slug: string;
	beat: number;
	version: number;
}

export interface MarkerGroup {
	slug: string;
	head: ResolveMarker;
	beats: ResolveMarker[];
	/** The explicit END marker closing the span, when the editor dropped one. */
	end: ResolveMarker | null;
}

export type MarkerSyncWarningCode =
	| 'orphan-beats'
	| 'undragged-head-duration'
	| 'end-vs-head-duration'
	| 'beat-count-mismatch'
	| 'beats-out-of-order'
	| 'beat-before-enter-complete'
	| 'beat-beyond-span';

export interface MarkerSyncWarning {
	code: MarkerSyncWarningCode;
	message: string;
}

/** An item's authored window in ABSOLUTE seconds — the motion the beats re-place, never re-speed. */
export interface MarkerSyncItemInput {
	startSeconds: number;
	durationSeconds: number;
}

export interface DeriveMarkerSyncOptions {
	slug: string;
	/** The composition's timed items, in order (beat 1 → item 1 …). */
	items: MarkerSyncItemInput[];
	/** The card enter's absolute length, for the beat-1 lint. */
	cardEnterDurationSeconds: number;
	/** Span fallback tail when the head is undragged (default 2.5 s). */
	fallbackTailSeconds?: number;
	/**
	 * Conversational selection: a group the caller assembled from free-form
	 * labels (no `supers <slug>` note yet). Skips the head-note lookup; the
	 * sync's customData receipt makes the group formally findable afterward.
	 */
	group?: MarkerGroup;
}

/** One derived item window as clip fractions, snapped to frame boundaries. */
export interface MarkerSyncItemWindow {
	start: number;
	duration: number;
}

/** Which grammar path produced the span. */
export type MarkerSyncSpanSource = 'end-marker' | 'head-duration' | 'last-beat-fallback';

/** A synced beat: its label (the item text rides here — see `parseBeatLabel`) and where it sits. */
export interface MarkerSyncSyncedBeat {
	name: string;
	/** frameId relative to timeline start (Resolve's marker key). */
	frameId: number;
	/** Absolute timeline frame (startFrame + frameId). */
	recordFrame: number;
}

export interface MarkerSyncDerivation {
	/** The legal `transport.fps` literal (e.g. 29.97). */
	fps: number;
	/** Whole-frame span at the timeline rate, as exact seconds. */
	durationSeconds: number;
	spanFrames: number;
	spanSource: MarkerSyncSpanSource;
	/** Absolute timeline frame the piece places at (startFrame + head offset). */
	headRecordFrame: number;
	/**
	 * Timecode at `headRecordFrame` — the export's embedded `-timecode`.
	 * Drop-frame (`HH:MM:SS;FF`) when the timeline's start TC declares DF,
	 * NDF (`HH:MM:SS:FF`) otherwise.
	 */
	startTimecode: string;
	/** This sync's version (1 + the highest already written on the group). */
	version: number;
	/** One window per item; drives `enter` (build-in) or `strike` (completion). */
	itemWindows: MarkerSyncItemWindow[];
	/** The beats actually synced (≤ items.length), labels included. */
	syncedBeats: MarkerSyncSyncedBeat[];
	warnings: MarkerSyncWarning[];
}

/**
 * Normalize the rate Resolve reports (`GetSetting('timelineFrameRate')`, a
 * float/string like `24.0` or `29.97` — or the true NTSC 29.97002997…) to a
 * legal `transport.fps` literal.
 */
export function normalizeTimelineFps(raw: number | string): number {
	const value = typeof raw === 'string' ? Number(raw) : raw;
	if (!Number.isFinite(value) || value <= 0) {
		throw new TypeError(`Unrecognized Resolve timeline rate "${raw}".`);
	}
	for (const ntsc of NTSC_FRACTIONAL_FPS) {
		if (Math.abs(value - ntsc) < 0.01) {
			return ntsc;
		}
	}
	const rounded = Math.round(value);
	if (Math.abs(value - rounded) < 1e-9 && rounded >= 1 && rounded <= 120) {
		return rounded;
	}
	throw new TypeError(
		`Unrecognized Resolve timeline rate "${raw}": expected an integer or one of ${NTSC_FRACTIONAL_FPS.join(', ')}.`
	);
}

/** Parse a marker's customData into the supers-sync payload, or null when it is not ours. */
export function parseMarkerCustomData(raw: string): SupersSyncMarkerData | null {
	if (!raw) {
		return null;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null) {
		return null;
	}
	const candidate = parsed as Record<string, unknown>;
	if (
		candidate.schema !== SUPERS_SYNC_SCHEMA ||
		typeof candidate.slug !== 'string' ||
		typeof candidate.beat !== 'number' ||
		typeof candidate.version !== 'number'
	) {
		return null;
	}
	return {
		schema: SUPERS_SYNC_SCHEMA,
		slug: candidate.slug,
		beat: candidate.beat,
		version: candidate.version
	};
}

/** The customData string written on a synced marker (head = beat 0, END = beat -1). */
export function buildMarkerCustomData(slug: string, beat: number, version: number): string {
	const payload: SupersSyncMarkerData = { schema: SUPERS_SYNC_SCHEMA, slug, beat, version };
	return JSON.stringify(payload);
}

/** `<slug>__<startTC with '-' separators>__<frames>f__v<version>.mov` — a DF `;` becomes `-` too (the embedded tmcd atom keeps the DF/NDF distinction). */
export function buildSyncExportFilename(
	slug: string,
	startTimecode: string,
	frames: number,
	version: number
): string {
	return `${slug}__${startTimecode.replace(/[:;]/g, '-')}__${frames}f__v${version}.mov`;
}

/** The role a beat's label suffix assigns to its item. */
export type BeatRole = 'build-in' | 'checked' | 'add-to-list';

export interface ParsedBeatLabel {
	/** The item text — the beat's name with any role suffix stripped. */
	text: string;
	role: BeatRole;
}

const BEAT_ROLE_SUFFIXES: ReadonlyArray<{ suffix: string; role: BeatRole }> = [
	{ suffix: 'checked', role: 'checked' },
	{ suffix: 'add to list', role: 'add-to-list' }
];

/**
 * Parse a beat marker's name into item text + role — beat labels carry the
 * content. `<item> - Checked` = on the list from arrival, strike at the beat;
 * `<item> - Add to list` = enter at the beat; a bare label = build-in enter.
 * Suffix matching is case-insensitive; only the LAST ` - ` separates a role,
 * so item text may itself contain ` - `.
 */
export function parseBeatLabel(name: string): ParsedBeatLabel {
	const trimmed = name.trim();
	const separator = trimmed.lastIndexOf(' - ');
	if (separator > 0) {
		const suffix = trimmed
			.slice(separator + 3)
			.trim()
			.toLowerCase();
		const match = BEAT_ROLE_SUFFIXES.find((candidate) => candidate.suffix === suffix);
		if (match) {
			return { text: trimmed.slice(0, separator).trim(), role: match.role };
		}
	}
	return { text: trimmed, role: 'build-in' };
}

function headSlugOf(marker: ResolveMarker): string | null {
	const note = marker.note.trim();
	if (note.toLowerCase().startsWith(SUPERS_HEAD_NOTE_PREFIX)) {
		const slug = note.slice(SUPERS_HEAD_NOTE_PREFIX.length).trim();
		if (slug.length > 0) {
			return slug;
		}
	}
	// Re-sync lane: a previously synced head is found through its customData,
	// never by re-parsing notes.
	const synced = parseMarkerCustomData(marker.customData);
	return synced !== null && synced.beat === 0 ? synced.slug : null;
}

function isEndMarker(marker: ResolveMarker): boolean {
	if (marker.name.trim().split(/\s+/).at(-1) === SUPERS_END_NAME_TOKEN) {
		return true;
	}
	const synced = parseMarkerCustomData(marker.customData);
	return synced !== null && synced.beat === SUPERS_END_BEAT;
}

/**
 * Group the timeline's Supers markers, color-blind: each head (note
 * `supers <slug>`, or previously synced customData) starts a group; the first
 * END marker after it (or the head's dragged duration) closes the span; every
 * marker inside the span is a beat regardless of color or name — the
 * delimited span is the claim. An unclosed, undragged head degenerately
 * claims everything until the next head (linted at derivation). Markers that
 * are provably ours (supers-sync customData) but sit outside every group are
 * orphans (warned, ignored); everything else outside a span is simply not
 * ours and stays silent.
 */
export function groupSupersMarkers(markers: readonly ResolveMarker[]): {
	groups: MarkerGroup[];
	warnings: MarkerSyncWarning[];
} {
	const sorted = markers.toSorted((a, b) => a.frameId - b.frameId);
	const warnings: MarkerSyncWarning[] = [];

	const heads: Array<{ index: number; slug: string }> = [];
	for (const [index, marker] of sorted.entries()) {
		const slug = headSlugOf(marker);
		if (slug !== null) {
			heads.push({ index, slug });
		}
	}

	const groups: MarkerGroup[] = [];
	const claimed = new Set<ResolveMarker>();
	for (const [headPosition, { index, slug }] of heads.entries()) {
		const head = sorted[index];
		claimed.add(head);
		const boundary = heads[headPosition + 1]?.index ?? sorted.length;
		const following = sorted.slice(index + 1, boundary);
		const end = following.find(isEndMarker) ?? null;
		if (end) {
			claimed.add(end);
		}
		const durationSpanEnd = head.durationFrames > 1 ? head.frameId + head.durationFrames : null;
		const beats = following.filter((candidate) => {
			if (end) {
				return candidate.frameId < end.frameId;
			}
			return durationSpanEnd === null || candidate.frameId <= durationSpanEnd;
		});
		for (const beat of beats) {
			claimed.add(beat);
		}
		groups.push({ slug, head, beats, end });
	}

	const orphanCount = sorted.filter(
		(marker) => !claimed.has(marker) && parseMarkerCustomData(marker.customData) !== null
	).length;
	if (orphanCount > 0) {
		warnings.push({
			code: 'orphan-beats',
			message: `${orphanCount} previously synced marker(s) sit outside every group (their head moved, lost its "${SUPERS_HEAD_NOTE_PREFIX}<slug>" note, or was deleted) and were ignored.`
		});
	}

	return { groups, warnings };
}

function nextSyncVersion(group: MarkerGroup): number {
	let highest = 0;
	const members = group.end ? [group.head, ...group.beats, group.end] : [group.head, ...group.beats];
	for (const marker of members) {
		const data = parseMarkerCustomData(marker.customData);
		if (data !== null && data.version > highest) {
			highest = data.version;
		}
	}
	return highest + 1;
}

function lintBeatOrder(beats: readonly ResolveMarker[], warnings: MarkerSyncWarning[]): void {
	// After a sync, beats carry their 1-based index in customData. If the
	// editor drags a synced beat past a neighbour, frame order and recorded
	// beat order disagree — item N would suddenly ride a different moment.
	const recorded = beats
		.map((beat) => parseMarkerCustomData(beat.customData))
		.filter((data): data is SupersSyncMarkerData => data !== null && data.beat > 0);
	for (let i = 1; i < recorded.length; i += 1) {
		if (recorded[i].beat < recorded[i - 1].beat) {
			warnings.push({
				code: 'beats-out-of-order',
				message: `Beats are out of item order: previously synced beat ${recorded[i].beat} now sits after beat ${recorded[i - 1].beat}. Beats map to items in timeline order.`
			});
			return;
		}
	}
}

function resolveSpanFrames(
	group: MarkerGroup,
	rate: FrameRate,
	fallbackTailSeconds: number,
	warnings: MarkerSyncWarning[]
): { spanFrames: number; spanSource: MarkerSyncSpanSource } {
	if (group.end) {
		const spanFrames = group.end.frameId - group.head.frameId;
		if (spanFrames < 1) {
			throw new Error(
				`END marker for "${group.slug}" sits at or before its head (frame ${group.end.frameId} vs ${group.head.frameId}).`
			);
		}
		if (group.head.durationFrames > 1 && group.head.durationFrames !== spanFrames) {
			warnings.push({
				code: 'end-vs-head-duration',
				message: `The END marker closes the span at ${spanFrames} frames but the head is dragged to ${group.head.durationFrames} — the END marker wins.`
			});
		}
		return { spanFrames, spanSource: 'end-marker' };
	}
	if (group.head.durationFrames > 1) {
		return { spanFrames: group.head.durationFrames, spanSource: 'head-duration' };
	}
	const lastBeat = group.beats.at(-1);
	if (!lastBeat) {
		throw new Error(
			`Head marker for "${group.slug}" is undragged, unclosed, and the group has no beats — nothing to derive a span from.`
		);
	}
	const spanFrames =
		lastBeat.frameId - group.head.frameId + secondsToFrames(fallbackTailSeconds, rate);
	warnings.push({
		code: 'undragged-head-duration',
		message: `Head marker is undragged and the group has no END marker; span fell back to the last beat + ${fallbackTailSeconds} s hold/exit handle (${spanFrames} frames). Drop an END marker (or drag the head) to author the span.`
	});
	return { spanFrames, spanSource: 'last-beat-fallback' };
}

/**
 * Project a marker group onto a composition's timed items — the
 * authoring-time projection, never a live link. Markers are read once and
 * the result is written into the Preset as explicit timings; re-sync re-runs
 * the projection, and `rescaleCompositionTimings` continues to govern manual
 * duration edits afterward.
 *
 * Semantics (the motion-graphics contract): the head marker's frame is the
 * composition's start; the span comes from the END marker, else the head's
 * dragged duration, else last beat + handle; item STARTS pin to beat frames;
 * item window LENGTHS keep their authored absolute durations — beats
 * re-place motion, never re-speed it. All derived times snap to frame
 * boundaries at the timeline rate.
 */
export function deriveMarkerSync(
	snapshot: ResolveTimelineSnapshot,
	options: DeriveMarkerSyncOptions
): MarkerSyncDerivation {
	if (options.items.length === 0) {
		throw new TypeError('deriveMarkerSync needs at least one timed item to project onto.');
	}

	const fps = normalizeTimelineFps(snapshot.fps);
	const rate = resolveFrameRate(fps);
	let group: MarkerGroup;
	let warnings: MarkerSyncWarning[];
	if (options.group) {
		group = options.group;
		warnings = [];
	} else {
		const grouped = groupSupersMarkers(snapshot.markers);
		warnings = grouped.warnings;
		const found = grouped.groups.find((candidate) => candidate.slug === options.slug);
		if (!found) {
			const known = grouped.groups.map((candidate) => candidate.slug);
			throw new Error(
				`No marker group for "${options.slug}" on the timeline. ` +
					(known.length > 0
						? `Found: ${known.join(', ')}.`
						: `Drop a marker (any color) with the note "${SUPERS_HEAD_NOTE_PREFIX}${options.slug}" at the piece's start, closed by an END-named marker or a dragged head duration.`)
			);
		}
		group = found;
	}

	lintBeatOrder(group.beats, warnings);

	const { spanFrames, spanSource } = resolveSpanFrames(
		group,
		rate,
		options.fallbackTailSeconds ?? 2.5,
		warnings
	);
	const syncedCount = Math.min(group.beats.length, options.items.length);

	if (group.beats.length !== options.items.length) {
		warnings.push({
			code: 'beat-count-mismatch',
			message:
				group.beats.length > options.items.length
					? `${group.beats.length} beats for ${options.items.length} items — the ${group.beats.length - options.items.length} extra beat(s) were ignored.`
					: `${group.beats.length} beats for ${options.items.length} items — the remaining item(s) keep their authored spacing after the last synced beat.`
		});
	}

	// Item start frames: synced items pin to beat offsets; unsynced items keep
	// their authored spacing measured from the last synced beat (or from the
	// composition start when nothing synced).
	const beatOffsets = group.beats
		.slice(0, syncedCount)
		.map((beat) => beat.frameId - group.head.frameId);
	const baseOffsetFrames = syncedCount > 0 ? beatOffsets[syncedCount - 1] : 0;
	const baseAuthoredSeconds = syncedCount > 0 ? options.items[syncedCount - 1].startSeconds : 0;

	const itemWindows: MarkerSyncItemWindow[] = options.items.map((item, index) => {
		const durationFrames = Math.max(1, secondsToFrames(item.durationSeconds, rate));
		let startFrames =
			index < syncedCount
				? beatOffsets[index]
				: baseOffsetFrames + secondsToFrames(item.startSeconds - baseAuthoredSeconds, rate);
		if (startFrames + durationFrames > spanFrames) {
			warnings.push({
				code: 'beat-beyond-span',
				message: `Item ${index + 1}'s window (frame ${startFrames} + ${durationFrames}) leaves the ${spanFrames}-frame span; it was pulled back to complete inside the piece.`
			});
			startFrames = Math.max(0, spanFrames - durationFrames);
		}
		return { start: startFrames / spanFrames, duration: durationFrames / spanFrames };
	});

	if (syncedCount > 0) {
		const beatOneSeconds = framesToSeconds(beatOffsets[0], rate);
		if (beatOneSeconds < options.cardEnterDurationSeconds) {
			warnings.push({
				code: 'beat-before-enter-complete',
				message: `Beat 1 lands at ${beatOneSeconds.toFixed(3)} s, before the card enter completes (${options.cardEnterDurationSeconds.toFixed(3)} s) — the first item would reveal on a card still flying in.`
			});
		}
	}

	const headRecordFrame = snapshot.startFrame + group.head.frameId;
	// Resolve's GetStartFrame already counts real frames in both TC modes —
	// only the LABEL differs, declared by the start TC's frame separator.
	const isDropFrameTimeline = snapshot.startTimecode?.includes(';') ?? false;

	return {
		fps,
		durationSeconds: framesToSeconds(spanFrames, rate),
		spanFrames,
		spanSource,
		headRecordFrame,
		startTimecode: isDropFrameTimeline
			? framesToDropTimecode(headRecordFrame, rate)
			: framesToTimecode(headRecordFrame, rate),
		version: nextSyncVersion(group),
		itemWindows,
		syncedBeats: group.beats.slice(0, syncedCount).map((beat) => ({
			name: beat.name,
			frameId: beat.frameId,
			recordFrame: snapshot.startFrame + beat.frameId
		})),
		warnings
	};
}

/** One marker rewrite `scripts/resolve-place.py` applies: recolor + customData. */
export interface MarkerUpdate {
	/** frameId relative to timeline start (Resolve's marker key). */
	frameId: number;
	color: string;
	customData: string;
}

/**
 * The Mint/customData round-trip updates for a synced group: the head (beat
 * 0), every synced beat (1-based), and the END marker (beat -1) when one
 * closes the span. Extra beats beyond the item count keep their input color —
 * visibly unsynced.
 */
export function buildSyncedMarkerUpdates(
	snapshot: ResolveTimelineSnapshot,
	slug: string,
	version: number,
	itemCount: number,
	group?: MarkerGroup
): MarkerUpdate[] {
	let resolved = group;
	if (!resolved) {
		const { groups } = groupSupersMarkers(snapshot.markers);
		resolved = groups.find((candidate) => candidate.slug === slug);
	}
	if (!resolved) {
		throw new Error(`No marker group for "${slug}" to write sync state onto.`);
	}
	const updates: MarkerUpdate[] = [
		{
			frameId: resolved.head.frameId,
			color: SUPERS_SYNCED_MARKER_COLOR,
			customData: buildMarkerCustomData(slug, 0, version)
		}
	];
	for (const [index, beat] of resolved.beats.slice(0, itemCount).entries()) {
		updates.push({
			frameId: beat.frameId,
			color: SUPERS_SYNCED_MARKER_COLOR,
			customData: buildMarkerCustomData(slug, index + 1, version)
		});
	}
	if (resolved.end) {
		updates.push({
			frameId: resolved.end.frameId,
			color: SUPERS_SYNCED_MARKER_COLOR,
			customData: buildMarkerCustomData(slug, SUPERS_END_BEAT, version)
		});
	}
	return updates;
}
