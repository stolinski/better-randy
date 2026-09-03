import {
	STAGE_GLYPH_COMMAND,
	STAGE_GLYPH_COMMAND_ARITY,
	type StageGlyphOutline
} from './stage-glyph-format.ts';

// A compiled glyph's outline as closed rings (ADR-0062). The compiler flattens
// a face's curves here once, at a tolerance in cap heights so it is the same
// at every size, splits the contours fonts draw over themselves at their own
// crossings, and unions the pieces under the nonzero rule fonts fill by; the
// runtime reads the resolved rings back and only sorts them into outers and
// the counters they contain. Units throughout are CAP HEIGHTS (1 = the face's
// cap height), x right, y up.

/** x0, y0, x1, y1 … in cap heights; closed implicitly. */
export type StageGlyphRing = number[];

/** The compiler's curve flattening: the largest deviation a chord may show, in cap heights. */
export const STAGE_GLYPH_FLATTEN_TOLERANCE = 0.0015;
/** The fewest and most segments a curve flattens into. */
const FLATTEN_SEGMENTS_MIN = 2;
const FLATTEN_SEGMENTS_MAX = 48;
/** Vertices closer than this (in cap heights) collapse: an outline's own repeats and hairline stubs. */
export const STAGE_GLYPH_WELD_EPSILON = 1e-4;

function segmentsFor(chord: number, deviation: number, tolerance: number): number {
	if (!(deviation > 0)) return FLATTEN_SEGMENTS_MIN;
	const wanted = Math.ceil(Math.sqrt((deviation / tolerance) * 2));
	return Math.max(
		FLATTEN_SEGMENTS_MIN,
		Math.min(FLATTEN_SEGMENTS_MAX, wanted, Math.ceil(chord / tolerance))
	);
}

/** Flatten a glyph's outline into closed rings in cap heights, welding repeats. */
export function flattenStageGlyph(
	glyph: StageGlyphOutline,
	capHeight: number,
	tolerance = STAGE_GLYPH_FLATTEN_TOLERANCE
): StageGlyphRing[] {
	const scale = 1 / capHeight;
	const { commands } = glyph;
	const rings: StageGlyphRing[] = [];
	let ring: StageGlyphRing = [];
	let x = 0;
	let y = 0;
	const push = (px: number, py: number): void => {
		const length = ring.length;
		if (length >= 2) {
			const dx = px - ring[length - 2];
			const dy = py - ring[length - 1];
			if (dx * dx + dy * dy < STAGE_GLYPH_WELD_EPSILON * STAGE_GLYPH_WELD_EPSILON) return;
		}
		ring.push(px, py);
	};
	const closeRing = (): void => {
		if (ring.length >= 6) {
			// Drop a closing point that repeats the first.
			const dx = ring[ring.length - 2] - ring[0];
			const dy = ring[ring.length - 1] - ring[1];
			if (dx * dx + dy * dy < STAGE_GLYPH_WELD_EPSILON * STAGE_GLYPH_WELD_EPSILON) ring.length -= 2;
			if (ring.length >= 6) rings.push(ring);
		}
		ring = [];
	};
	let cursor = 0;
	while (cursor < commands.length) {
		const opcode = commands[cursor];
		switch (opcode) {
			case STAGE_GLYPH_COMMAND.move:
				closeRing();
				x = commands[cursor + 1] * scale;
				y = commands[cursor + 2] * scale;
				push(x, y);
				break;
			case STAGE_GLYPH_COMMAND.line:
				x = commands[cursor + 1] * scale;
				y = commands[cursor + 2] * scale;
				push(x, y);
				break;
			case STAGE_GLYPH_COMMAND.quadratic: {
				const cx = commands[cursor + 1] * scale;
				const cy = commands[cursor + 2] * scale;
				const ex = commands[cursor + 3] * scale;
				const ey = commands[cursor + 4] * scale;
				const chord = Math.hypot(ex - x, ey - y);
				const deviation = Math.hypot(cx - (x + ex) / 2, cy - (y + ey) / 2) / 2;
				const segments = segmentsFor(chord, deviation, tolerance);
				for (let step = 1; step <= segments; step += 1) {
					const t = step / segments;
					const mt = 1 - t;
					push(
						mt * mt * x + 2 * mt * t * cx + t * t * ex,
						mt * mt * y + 2 * mt * t * cy + t * t * ey
					);
				}
				x = ex;
				y = ey;
				break;
			}
			case STAGE_GLYPH_COMMAND.cubic: {
				const c1x = commands[cursor + 1] * scale;
				const c1y = commands[cursor + 2] * scale;
				const c2x = commands[cursor + 3] * scale;
				const c2y = commands[cursor + 4] * scale;
				const ex = commands[cursor + 5] * scale;
				const ey = commands[cursor + 6] * scale;
				const chord = Math.hypot(ex - x, ey - y);
				const deviation =
					Math.max(
						Math.hypot(c1x - (2 * x + ex) / 3, c1y - (2 * y + ey) / 3),
						Math.hypot(c2x - (x + 2 * ex) / 3, c2y - (y + 2 * ey) / 3)
					) * 0.75;
				const segments = segmentsFor(chord, deviation, tolerance);
				for (let step = 1; step <= segments; step += 1) {
					const t = step / segments;
					const mt = 1 - t;
					push(
						mt * mt * mt * x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * ex,
						mt * mt * mt * y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * ey
					);
				}
				x = ex;
				y = ey;
				break;
			}
			case STAGE_GLYPH_COMMAND.close:
				closeRing();
				break;
			default:
				throw new TypeError(`Stage glyph outline has an unknown opcode ${opcode}.`);
		}
		cursor += 1 + STAGE_GLYPH_COMMAND_ARITY[opcode];
	}
	closeRing();
	return rings;
}

/** Twice the shoelace sum halved: positive for a counter-clockwise ring (y up). */
export function signedRingArea(ring: StageGlyphRing): number {
	let area = 0;
	for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
		area += (ring[j] - ring[i]) * (ring[i + 1] + ring[j + 1]);
	}
	return area / 2;
}

export function ringContainsPoint(ring: StageGlyphRing, px: number, py: number): boolean {
	let inside = false;
	for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
		const xi = ring[i];
		const yi = ring[i + 1];
		const xj = ring[j];
		const yj = ring[j + 1];
		if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

export function reverseRing(ring: StageGlyphRing): StageGlyphRing {
	const out: StageGlyphRing = [];
	for (let i = ring.length - 2; i >= 0; i -= 2) out.push(ring[i], ring[i + 1]);
	return out;
}

export interface StageGlyphContour {
	/** The outer ring, counter-clockwise (y up). */
	outer: StageGlyphRing;
	/** Its holes, clockwise. */
	holes: StageGlyphRing[];
}

/**
 * Sort a glyph's rings into the outers and the holes each contains, by area
 * sign and containment: a font's outer contours and counters wind against
 * each other, and a counter sits inside exactly one outer. Orientation is
 * normalised so the caps triangulate and the sides extrude consistently.
 */
export function groupStageGlyphContours(rings: StageGlyphRing[]): StageGlyphContour[] {
	const oriented = rings.map((ring) => ({ ring, area: signedRingArea(ring) }));
	// The dominant winding of the largest rings is the outer winding.
	const largest = oriented.reduce(
		(best, entry) => (Math.abs(entry.area) > Math.abs(best.area) ? entry : best),
		oriented[0]
	);
	if (!largest) return [];
	const outerSign = Math.sign(largest.area) || 1;
	const outers: StageGlyphContour[] = [];
	const holes: StageGlyphRing[] = [];
	for (const entry of oriented) {
		if (Math.abs(entry.area) < STAGE_GLYPH_WELD_EPSILON * STAGE_GLYPH_WELD_EPSILON) continue;
		if (Math.sign(entry.area) === outerSign) outers.push({ outer: entry.ring, holes: [] });
		else holes.push(entry.ring);
	}
	for (const hole of holes) {
		// A hole belongs to the smallest outer that contains its first vertex.
		let owner: StageGlyphContour | null = null;
		let ownerArea = Number.POSITIVE_INFINITY;
		for (const contour of outers) {
			if (!ringContainsPoint(contour.outer, hole[0], hole[1])) continue;
			const area = Math.abs(signedRingArea(contour.outer));
			if (area < ownerArea) {
				owner = contour;
				ownerArea = area;
			}
		}
		if (owner) owner.holes.push(hole);
	}
	// Normalise: outers counter-clockwise (positive area), holes clockwise.
	for (const contour of outers) {
		if (signedRingArea(contour.outer) < 0) contour.outer = reverseRing(contour.outer);
		contour.holes = contour.holes.map((hole) =>
			signedRingArea(hole) > 0 ? reverseRing(hole) : hole
		);
	}
	return outers;
}

/** Where two segments cross strictly inside both, as their parameters and the point. */
function segmentCrossing(
	ax: number,
	ay: number,
	bx: number,
	by: number,
	cx: number,
	cy: number,
	dx: number,
	dy: number
): { t: number; u: number; x: number; y: number } | null {
	const rx = bx - ax;
	const ry = by - ay;
	const sx = dx - cx;
	const sy = dy - cy;
	const denominator = rx * sy - ry * sx;
	if (Math.abs(denominator) < 1e-12) return null;
	const qx = cx - ax;
	const qy = cy - ay;
	const t = (qx * sy - qy * sx) / denominator;
	const u = (qx * ry - qy * rx) / denominator;
	const epsilon = 1e-9;
	if (t <= epsilon || t >= 1 - epsilon || u <= epsilon || u >= 1 - epsilon) return null;
	return { t, u, x: ax + rx * t, y: ay + ry * t };
}

/**
 * Split a ring at its own crossings into simple loops. Fonts draw a stem and
 * its foot, or a serif and its stroke, as one contour that runs over itself
 * and rely on the nonzero rule to fill the overlap; a triangulator needs the
 * simple loops, each of which then carries one turn of winding. A ring that
 * never crosses itself comes back alone.
 */
export function splitRingAtSelfIntersections(ring: StageGlyphRing): StageGlyphRing[] {
	const count = ring.length / 2;
	if (count < 4) return [ring];
	const cuts: { t: number; x: number; y: number }[][] = Array.from({ length: count }, () => []);
	let crossings = 0;
	for (let i = 0; i < count; i += 1) {
		const ax = ring[i * 2];
		const ay = ring[i * 2 + 1];
		const bx = ring[((i + 1) % count) * 2];
		const by = ring[((i + 1) % count) * 2 + 1];
		for (let j = i + 2; j < count; j += 1) {
			if (i === 0 && j === count - 1) continue;
			const hit = segmentCrossing(
				ax,
				ay,
				bx,
				by,
				ring[j * 2],
				ring[j * 2 + 1],
				ring[((j + 1) % count) * 2],
				ring[((j + 1) % count) * 2 + 1]
			);
			if (!hit) continue;
			cuts[i].push({ t: hit.t, x: hit.x, y: hit.y });
			cuts[j].push({ t: hit.u, x: hit.x, y: hit.y });
			crossings += 1;
		}
	}
	if (crossings === 0) return [ring];
	// The ring with its crossings as vertices, each crossing one shared id.
	const ids = new Map<string, number>();
	const idOf = (x: number, y: number): number => {
		const key = `${Math.round(x * 1e6)}:${Math.round(y * 1e6)}`;
		let id = ids.get(key);
		if (id === undefined) {
			id = ids.size;
			ids.set(key, id);
		}
		return id;
	};
	const sequence: { id: number; x: number; y: number }[] = [];
	for (let i = 0; i < count; i += 1) {
		const x = ring[i * 2];
		const y = ring[i * 2 + 1];
		sequence.push({ id: idOf(x, y), x, y });
		cuts[i].sort((a, b) => a.t - b.t);
		for (const cut of cuts[i]) sequence.push({ id: idOf(cut.x, cut.y), x: cut.x, y: cut.y });
	}
	// Walk it: reaching a vertex already on the path closes the loop since it.
	const loops: StageGlyphRing[] = [];
	const stack: { id: number; x: number; y: number }[] = [];
	const position = new Map<number, number>();
	const emit = (entries: { x: number; y: number }[]): void => {
		if (entries.length < 3) return;
		const loop: StageGlyphRing = [];
		for (const entry of entries) loop.push(entry.x, entry.y);
		if (Math.abs(signedRingArea(loop)) > STAGE_GLYPH_WELD_EPSILON * STAGE_GLYPH_WELD_EPSILON) {
			loops.push(loop);
		}
	};
	for (const entry of sequence) {
		const at = position.get(entry.id);
		if (at === undefined) {
			position.set(entry.id, stack.length);
			stack.push(entry);
			continue;
		}
		const removed = stack.splice(at + 1);
		emit([stack[at], ...removed]);
		for (const gone of removed) position.delete(gone.id);
	}
	emit(stack);
	return loops;
}
