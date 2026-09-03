import earcut from 'earcut';

import {
	STAGE_GLYPH_COMMAND,
	STAGE_GLYPH_COMMAND_ARITY,
	stageKerningKey,
	type StageGlyphOutline,
	type StageTypefaceData
} from '../stage-glyph-format';
import { STAGE_MESH_VERTEX_FLOATS, type StageMeshData } from '../stage-mesh-format';

// Dimensional type's geometry (ADR-0062): a headline set in a compiled
// typeface becomes one body. The line is shaped from the face's advances and
// pair kerning; each glyph's outline is flattened to a tolerance the body's
// size asks for, split into outer rings and the holes they contain by
// winding, triangulated for the caps, and extruded: a back cap on the plane,
// straight sides, a chamfer bevel, and a front cap standing toward the eye.
// Every step is deterministic — the same text in the same face at the same
// size yields the same bytes — and the result is a `StageMeshData` the body
// pass draws like a compiled model, with four material regions.
//
// Units: the mesh is in CAP HEIGHTS (1 = the face's cap height), x right, y
// up, z toward the eye with the back cap on z = 0. The body's placement
// scales cap heights into world units, so a headline's depth and bevel are
// fractions of its own cap height at every size.

/** Material regions of a type body, in the order the material table expects. */
export const STAGE_TYPE_REGION = { face: 0, bevel: 1, side: 2, back: 3 } as const;
export const STAGE_TYPE_REGION_COUNT = 4;

/** Curve flattening: the largest deviation a chord may show, in cap heights. */
const FLATTEN_TOLERANCE_CAP = 0.004;
/** The fewest and most segments a curve flattens into. */
const FLATTEN_SEGMENTS_MIN = 2;
const FLATTEN_SEGMENTS_MAX = 24;
/** Vertices closer than this (in cap heights) collapse: the outline's own repeats and hairline stubs. */
const WELD_EPSILON = 1e-4;
/** A bevel inset never exceeds this share of a ring's smallest half-width, so thin strokes keep a face. */
const BEVEL_MITER_LIMIT = 2.5;

export interface StageTypeGlyphPlacement {
	codePoint: number;
	/** Pen position of the glyph's origin, in cap heights. */
	x: number;
}

export interface StageTypeLine {
	glyphs: readonly StageTypeGlyphPlacement[];
	/** The pen's advance across the whole line, in cap heights. */
	advance: number;
	/** Extents of the glyph boxes (not the advances), in cap heights: the visible width. */
	left: number;
	right: number;
	/** The face's ascender and descender in cap heights, for the line box. */
	ascender: number;
	descender: number;
}

export interface StageTypeForm {
	/** Extrusion depth in cap heights. */
	depth: number;
	/** Chamfer bevel in cap heights, taken from the front face's edge. */
	bevel: number;
}

/**
 * Shape one line: advances plus pair kerning, in cap heights. Code points the
 * face does not carry are left out — a headline is not a paragraph, and a
 * missing glyph is a missing glyph, never a box.
 */
export function shapeStageTypeLine(typeface: StageTypefaceData, text: string): StageTypeLine {
	const scale = 1 / typeface.capHeight;
	const glyphs: StageTypeGlyphPlacement[] = [];
	let pen = 0;
	let previous: number | null = null;
	let left = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	for (const character of text) {
		const codePoint = character.codePointAt(0);
		if (codePoint === undefined) continue;
		const glyph = typeface.glyphs.get(codePoint);
		if (!glyph) continue;
		if (previous !== null) {
			pen += (typeface.kerning.get(stageKerningKey(previous, codePoint)) ?? 0) * scale;
		}
		glyphs.push({ codePoint, x: pen });
		const bounds = outlineBounds(glyph);
		if (bounds) {
			left = Math.min(left, pen + bounds.minX * scale);
			right = Math.max(right, pen + bounds.maxX * scale);
		}
		pen += glyph.advance * scale;
		previous = codePoint;
	}
	if (!Number.isFinite(left)) {
		left = 0;
		right = pen;
	}
	return {
		glyphs,
		advance: pen,
		left,
		right,
		ascender: typeface.ascender * scale,
		descender: typeface.descender * scale
	};
}

function outlineBounds(glyph: StageGlyphOutline): { minX: number; maxX: number } | null {
	const { commands } = glyph;
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let cursor = 0;
	while (cursor < commands.length) {
		const opcode = commands[cursor];
		const arity = STAGE_GLYPH_COMMAND_ARITY[opcode];
		for (let index = cursor + 1; index <= cursor + arity; index += 2) {
			const x = commands[index];
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
		}
		cursor += 1 + arity;
	}
	return Number.isFinite(minX) ? { minX, maxX } : null;
}

type Ring = number[]; // x0, y0, x1, y1 … in cap heights, closed implicitly

function segmentsFor(chord: number, deviation: number): number {
	if (!(deviation > 0)) return FLATTEN_SEGMENTS_MIN;
	const wanted = Math.ceil(Math.sqrt((deviation / FLATTEN_TOLERANCE_CAP) * 2));
	return Math.max(FLATTEN_SEGMENTS_MIN, Math.min(FLATTEN_SEGMENTS_MAX, wanted, Math.ceil(chord / FLATTEN_TOLERANCE_CAP)));
}

/** Flatten a glyph's outline into closed rings in cap heights, welding repeats. */
export function flattenStageGlyph(glyph: StageGlyphOutline, capHeight: number): Ring[] {
	const scale = 1 / capHeight;
	const { commands } = glyph;
	const rings: Ring[] = [];
	let ring: Ring = [];
	let x = 0;
	let y = 0;
	const push = (px: number, py: number): void => {
		const length = ring.length;
		if (length >= 2) {
			const dx = px - ring[length - 2];
			const dy = py - ring[length - 1];
			if (dx * dx + dy * dy < WELD_EPSILON * WELD_EPSILON) return;
		}
		ring.push(px, py);
	};
	const closeRing = (): void => {
		if (ring.length >= 6) {
			// Drop a closing point that repeats the first.
			const dx = ring[ring.length - 2] - ring[0];
			const dy = ring[ring.length - 1] - ring[1];
			if (dx * dx + dy * dy < WELD_EPSILON * WELD_EPSILON) ring.length -= 2;
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
				const segments = segmentsFor(chord, deviation);
				for (let step = 1; step <= segments; step += 1) {
					const t = step / segments;
					const mt = 1 - t;
					push(mt * mt * x + 2 * mt * t * cx + t * t * ex, mt * mt * y + 2 * mt * t * cy + t * t * ey);
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
				const segments = segmentsFor(chord, deviation);
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

function signedArea(ring: Ring): number {
	let area = 0;
	for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
		area += (ring[j] - ring[i]) * (ring[i + 1] + ring[j + 1]);
	}
	return area / 2;
}

function ringContainsPoint(ring: Ring, px: number, py: number): boolean {
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

export interface StageTypeContour {
	/** The outer ring, counter-clockwise (y up). */
	outer: Ring;
	/** Its holes, clockwise. */
	holes: Ring[];
}

/**
 * Sort a glyph's rings into the outers and the holes each contains, by area
 * sign and containment: a font's outer contours and counters wind against
 * each other, and a counter sits inside exactly one outer. Orientation is
 * normalised so the caps triangulate and the sides extrude consistently.
 */
export function groupStageGlyphContours(rings: Ring[]): StageTypeContour[] {
	const oriented = rings.map((ring) => ({ ring, area: signedArea(ring) }));
	// The dominant winding of the largest rings is the outer winding.
	const largest = oriented.reduce((best, entry) => (Math.abs(entry.area) > Math.abs(best.area) ? entry : best), oriented[0]);
	if (!largest) return [];
	const outerSign = Math.sign(largest.area) || 1;
	const outers: StageTypeContour[] = [];
	const holes: Ring[] = [];
	for (const entry of oriented) {
		if (Math.abs(entry.area) < WELD_EPSILON * WELD_EPSILON) continue;
		if (Math.sign(entry.area) === outerSign) outers.push({ outer: entry.ring, holes: [] });
		else holes.push(entry.ring);
	}
	for (const hole of holes) {
		// A hole belongs to the smallest outer that contains its first vertex.
		let owner: StageTypeContour | null = null;
		let ownerArea = Number.POSITIVE_INFINITY;
		for (const contour of outers) {
			if (!ringContainsPoint(contour.outer, hole[0], hole[1])) continue;
			const area = Math.abs(signedArea(contour.outer));
			if (area < ownerArea) {
				owner = contour;
				ownerArea = area;
			}
		}
		if (owner) owner.holes.push(hole);
	}
	// Normalise: outers counter-clockwise (positive area), holes clockwise.
	for (const contour of outers) {
		if (signedArea(contour.outer) < 0) contour.outer = reverseRing(contour.outer);
		contour.holes = contour.holes.map((hole) => (signedArea(hole) > 0 ? reverseRing(hole) : hole));
	}
	return outers;
}

function reverseRing(ring: Ring): Ring {
	const out: Ring = [];
	for (let i = ring.length - 2; i >= 0; i -= 2) out.push(ring[i], ring[i + 1]);
	return out;
}

/** Inset a ring along its per-vertex edge normals by `amount`, miter-limited so thin strokes keep a face. */
function insetRing(ring: Ring, amount: number, inward: 1 | -1): Ring {
	const count = ring.length / 2;
	const out: Ring = new Array(ring.length);
	for (let i = 0; i < count; i += 1) {
		const prev = (i - 1 + count) % count;
		const next = (i + 1) % count;
		const px = ring[prev * 2];
		const py = ring[prev * 2 + 1];
		const x = ring[i * 2];
		const y = ring[i * 2 + 1];
		const nx = ring[next * 2];
		const ny = ring[next * 2 + 1];
		// Edge normals for a counter-clockwise ring point outward as (dy, -dx).
		let e1x = x - px;
		let e1y = y - py;
		let e2x = nx - x;
		let e2y = ny - y;
		const l1 = Math.hypot(e1x, e1y) || 1;
		const l2 = Math.hypot(e2x, e2y) || 1;
		e1x /= l1;
		e1y /= l1;
		e2x /= l2;
		e2y /= l2;
		const n1x = e1y;
		const n1y = -e1x;
		const n2x = e2y;
		const n2y = -e2x;
		let mx = n1x + n2x;
		let my = n1y + n2y;
		const ml = Math.hypot(mx, my);
		if (ml < 1e-6) {
			mx = n1x;
			my = n1y;
		} else {
			mx /= ml;
			my /= ml;
		}
		// The miter length grows as the corner sharpens; cap it so a spike never crosses the stroke.
		const cosHalf = Math.max(mx * n1x + my * n1y, 1 / BEVEL_MITER_LIMIT);
		const distance = amount / cosHalf;
		out[i * 2] = x - inward * mx * distance;
		out[i * 2 + 1] = y - inward * my * distance;
	}
	return out;
}

interface MeshBuilder {
	positions: number[];
	normals: number[];
	regions: number[];
	indices: number[];
}

function pushVertex(builder: MeshBuilder, x: number, y: number, z: number, nx: number, ny: number, nz: number, region: number): number {
	const index = builder.positions.length / 3;
	builder.positions.push(x, y, z);
	builder.normals.push(nx, ny, nz);
	builder.regions.push(region);
	return index;
}

/** Triangulate a contour (outer + holes) as a flat cap at `z`, facing `facing` (+1 toward the eye). */
function appendCap(builder: MeshBuilder, contour: StageTypeContour, z: number, facing: 1 | -1, region: number): void {
	const flat: number[] = [...contour.outer];
	const holeIndices: number[] = [];
	for (const hole of contour.holes) {
		holeIndices.push(flat.length / 2);
		flat.push(...hole);
	}
	const triangles = earcut(flat, holeIndices, 2);
	const base = builder.positions.length / 3;
	for (let i = 0; i < flat.length; i += 2) {
		pushVertex(builder, flat[i], flat[i + 1], z, 0, 0, facing, region);
	}
	for (let i = 0; i < triangles.length; i += 3) {
		// earcut winds counter-clockwise for a counter-clockwise outer; flip the back cap.
		if (facing > 0) builder.indices.push(base + triangles[i], base + triangles[i + 1], base + triangles[i + 2]);
		else builder.indices.push(base + triangles[i], base + triangles[i + 2], base + triangles[i + 1]);
	}
}

/** Join two rings of equal length at two depths with flat-shaded quads. */
function appendBand(builder: MeshBuilder, near: Ring, nearZ: number, far: Ring, farZ: number, region: number, inward: 1 | -1): void {
	const count = near.length / 2;
	for (let i = 0; i < count; i += 1) {
		const j = (i + 1) % count;
		const ax = far[i * 2];
		const ay = far[i * 2 + 1];
		const bx = far[j * 2];
		const by = far[j * 2 + 1];
		const cx = near[j * 2];
		const cy = near[j * 2 + 1];
		const dx = near[i * 2];
		const dy = near[i * 2 + 1];
		// Face normal of the quad (a, b, c) — flat per segment, the machined look.
		const ux = bx - ax;
		const uy = by - ay;
		const uz = 0;
		const vx = cx - ax;
		const vy = cy - ay;
		const vz = nearZ - farZ;
		let nx = uy * vz - uz * vy;
		let ny = uz * vx - ux * vz;
		let nz = ux * vy - uy * vx;
		const length = Math.hypot(nx, ny, nz) || 1;
		nx = (nx / length) * inward;
		ny = (ny / length) * inward;
		nz = (nz / length) * inward;
		const a = pushVertex(builder, ax, ay, farZ, nx, ny, nz, region);
		const b = pushVertex(builder, bx, by, farZ, nx, ny, nz, region);
		const c = pushVertex(builder, cx, cy, nearZ, nx, ny, nz, region);
		const d = pushVertex(builder, dx, dy, nearZ, nx, ny, nz, region);
		if (inward > 0) builder.indices.push(a, b, c, a, c, d);
		else builder.indices.push(a, c, b, a, d, c);
	}
}

/** Bounds the miter so the inset ring never crosses its own stroke: the largest inset a ring allows. */
function safeBevel(contour: StageTypeContour, bevel: number): number {
	let smallest = Number.POSITIVE_INFINITY;
	const rings = [contour.outer, ...contour.holes];
	for (const ring of rings) {
		// The ring's smallest edge-to-opposite distance is approximated by its
		// area over half its perimeter: a thin stroke has a small ratio.
		let perimeter = 0;
		for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
			perimeter += Math.hypot(ring[i] - ring[j], ring[i + 1] - ring[j + 1]);
		}
		const halfWidth = Math.abs(signedArea(ring)) / Math.max(perimeter, 1e-6);
		smallest = Math.min(smallest, halfWidth);
	}
	return Math.min(bevel, smallest * 0.9);
}

/**
 * Build one glyph's body: back cap on z = 0, sides to z = depth − bevel, the
 * chamfer to z = depth over an inset ring, and the front cap on the inset.
 */
function appendGlyphBody(builder: MeshBuilder, contours: StageTypeContour[], form: StageTypeForm, offsetX: number): void {
	for (const contour of contours) {
		const shifted: StageTypeContour = {
			outer: shiftRing(contour.outer, offsetX),
			holes: contour.holes.map((hole) => shiftRing(hole, offsetX))
		};
		const bevel = safeBevel(shifted, form.bevel);
		const sideTop = Math.max(form.depth - bevel, 0);
		appendCap(builder, shifted, 0, -1, STAGE_TYPE_REGION.back);
		if (sideTop > 0) {
			appendBand(builder, shifted.outer, sideTop, shifted.outer, 0, STAGE_TYPE_REGION.side, 1);
			for (const hole of shifted.holes) appendBand(builder, hole, sideTop, hole, 0, STAGE_TYPE_REGION.side, 1);
		}
		const frontOuter = bevel > 0 ? insetRing(shifted.outer, bevel, 1) : shifted.outer;
		const frontHoles = shifted.holes.map((hole) => (bevel > 0 ? insetRing(hole, bevel, -1) : hole));
		if (bevel > 0) {
			appendBand(builder, frontOuter, form.depth, shifted.outer, sideTop, STAGE_TYPE_REGION.bevel, 1);
			shifted.holes.forEach((hole, index) => {
				appendBand(builder, frontHoles[index], form.depth, hole, sideTop, STAGE_TYPE_REGION.bevel, 1);
			});
		}
		appendCap(builder, { outer: frontOuter, holes: frontHoles }, form.depth, 1, STAGE_TYPE_REGION.face);
	}
}

function shiftRing(ring: Ring, offsetX: number): Ring {
	const out: Ring = new Array(ring.length);
	for (let i = 0; i < ring.length; i += 2) {
		out[i] = ring[i] + offsetX;
		out[i + 1] = ring[i + 1];
	}
	return out;
}

export interface StageTypeMeshInput {
	typeface: StageTypefaceData;
	text: string;
	form: StageTypeForm;
}

export interface StageTypeMesh {
	mesh: StageMeshData;
	line: StageTypeLine;
}

/**
 * The headline as one body, centred on the line's visible extents so the
 * placement's point is the middle of what is seen: x spans
 * ±(right − left)/2, the baseline sits at y = 0, the back cap at z = 0.
 */
export function buildStageTypeMesh(input: StageTypeMeshInput): StageTypeMesh {
	const line = shapeStageTypeLine(input.typeface, input.text);
	const centre = (line.left + line.right) / 2;
	const builder: MeshBuilder = { positions: [], normals: [], regions: [], indices: [] };
	const form: StageTypeForm = {
		depth: Math.max(input.form.depth, 0),
		bevel: Math.max(Math.min(input.form.bevel, input.form.depth), 0)
	};
	for (const placement of line.glyphs) {
		const glyph = input.typeface.glyphs.get(placement.codePoint);
		if (!glyph || glyph.commands.length === 0) continue;
		const contours = groupStageGlyphContours(flattenStageGlyph(glyph, input.typeface.capHeight));
		appendGlyphBody(builder, contours, form, placement.x - centre);
	}
	const vertexCount = builder.positions.length / 3;
	const vertices = new Float32Array(vertexCount * STAGE_MESH_VERTEX_FLOATS);
	const min: [number, number, number] = [Infinity, Infinity, Infinity];
	const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
	for (let i = 0; i < vertexCount; i += 1) {
		const offset = i * STAGE_MESH_VERTEX_FLOATS;
		for (let axis = 0; axis < 3; axis += 1) {
			const value = builder.positions[i * 3 + axis];
			vertices[offset + axis] = value;
			if (value < min[axis]) min[axis] = value;
			if (value > max[axis]) max[axis] = value;
			vertices[offset + 3 + axis] = builder.normals[i * 3 + axis];
		}
		vertices[offset + 6] = builder.regions[i];
	}
	if (vertexCount === 0) {
		min.fill(0);
		max.fill(0);
	}
	return {
		mesh: {
			vertices,
			indices: new Uint32Array(builder.indices),
			vertexCount,
			indexCount: builder.indices.length,
			regionCount: STAGE_TYPE_REGION_COUNT,
			min,
			max
		},
		line
	};
}
