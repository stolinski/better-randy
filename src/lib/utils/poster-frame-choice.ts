/**
 * Which frame of a composition becomes its poster, decided by what the frame
 * shows rather than by a fixed fraction of the run
 * ([ADR-0061](../../../docs/adr/0061-committed-composition-posters.md)).
 *
 * A composition is photographed at a few candidate timestamps and each
 * candidate is measured: `contentFraction` is the share of pixels that differ
 * from the frame's first pixel, which is the composition's visible content
 * against a transparent field or a flat fill alike. The midpoint is the
 * preferred candidate — the settled frame the editor parks on — and another
 * candidate takes it only by showing materially more. A frame that shows
 * nothing is never a poster.
 */

/** A candidate frame after measurement, in preference order when listed. */
export interface PosterFrameCandidate {
	timestampSeconds: number;
	/** Share of pixels that differ from the frame's first pixel, 0–1. */
	contentFraction: number;
	/** Every pixel identical: the frame renders nothing at all. */
	isBlank: boolean;
}

/**
 * Where along the run the candidates are taken, most preferred first. The
 * midpoint leads because every enter has landed and no exit has begun there for
 * most pieces; the others cover a piece whose midpoint is a beat between two
 * states or a cut to an empty frame.
 */
export const POSTER_FRAME_CANDIDATE_FRACTIONS: readonly number[] = [0.5, 0.4, 0.6, 0.3, 0.7];

/**
 * Below this share of differing pixels a frame is treated as empty. A small
 * source bug in one corner of a 4K frame downscaled to poster size still
 * clears it comfortably; encoder residue on a flat frame does not.
 */
export const MIN_POSTER_CONTENT_FRACTION = 0.0005;

/**
 * How much more content a later candidate must show to displace an earlier
 * one. Inside this margin the candidates are the same picture at different
 * moments, and the preferred moment wins.
 */
const POSTER_FRAME_CONTENT_MARGIN = 0.03;

/** The timestamps to photograph: the authored poster time alone when there is one. */
export function posterCandidateTimestamps(
	durationSeconds: number,
	authoredPosterSeconds?: number
): number[] {
	if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
		throw new TypeError(`A poster needs a positive duration, got ${durationSeconds}.`);
	}
	if (authoredPosterSeconds !== undefined) {
		if (!Number.isFinite(authoredPosterSeconds) || authoredPosterSeconds < 0) {
			throw new TypeError(
				`An authored poster time must be zero or more, got ${authoredPosterSeconds}.`
			);
		}
		return [Math.min(authoredPosterSeconds, durationSeconds)];
	}
	return POSTER_FRAME_CANDIDATE_FRACTIONS.map((fraction) => fraction * durationSeconds);
}

/** Whether a measured frame may be stored as a poster at all. */
export function isPosterFrameUsable(
	frame: Pick<PosterFrameCandidate, 'contentFraction' | 'isBlank'>
): boolean {
	return !frame.isBlank && frame.contentFraction >= MIN_POSTER_CONTENT_FRACTION;
}

/**
 * The candidate that becomes the poster, or null when none shows anything.
 * Candidates are in preference order; the first one within the content margin
 * of the fullest candidate wins.
 */
export function choosePosterFrame(
	candidates: readonly PosterFrameCandidate[]
): PosterFrameCandidate | null {
	const usable = candidates.filter(isPosterFrameUsable);
	if (usable.length === 0) return null;
	const fullest = Math.max(...usable.map((candidate) => candidate.contentFraction));
	return (
		usable.find(
			(candidate) => candidate.contentFraction >= fullest - POSTER_FRAME_CONTENT_MARGIN
		) ?? null
	);
}
