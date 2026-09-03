import earcut, { deviation as earcutDeviation } from 'earcut';

import {
	STAGE_GLYPH_COMMAND_ARITY,
	stageKerningKey,
	type StageGlyphOutline,
	type StageTypefaceData
} from '../stage-glyph-format';
import {
	flattenStageGlyph,
	groupStageGlyphContours,
	signedRingArea,
	type StageGlyphContour,
	type StageGlyphRing
} from '../stage-glyph-outline';
import { STAGE_MESH_VERTEX_FLOATS, type StageMeshData } from '../stage-mesh-format';

// Dimensional type's geometry (ADR-0062): a headline set in a compiled
// typeface becomes one body. The line is shaped from the face's advances and
// pair kerning; each glyph's resolved outline (`stage-glyph-outline.ts`) is
// sorted into outer rings and the holes they contain, triangulated for the
// caps, and extruded: a back cap on the plane, straight sides, a chamfer
// bevel over an inset ring, and a front cap standing toward the eye.
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

/** The miter at a sharp corner grows no longer than this many bevels, so a spike never crosses the stroke. */
const BEVEL_MITER_LIMIT = 2.5;
/** A bevel never eats more than this share of a ring's smallest half-width, so thin strokes keep a face. */
const BEVEL_STROKE_SHARE = 0.6;
/** An inset ring that crosses itself is retried at half the bevel this many times before the glyph goes unbevelled. */
const BEVEL_RETRIES = 6;
/** The largest area mismatch a cap's triangulation may show before the ring is treated as crossed. */
const CAP_DEVIATION_LIMIT = 1e-3;

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

/**
 * Inset a ring along its per-vertex edge normals by `amount`, miter-limited.
 * Null when the inset crossed the stroke — an edge turned back on itself or
 * the ring's area went the wrong way — so the caller can try a smaller bevel.
 */
function insetRing(ring: StageGlyphRing, amount: number, inward: 1 | -1): StageGlyphRing | null {
	const count = ring.length / 2;
	const out: StageGlyphRing = new Array(ring.length);
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
	for (let i = 0; i < count; i += 1) {
		const j = (i + 1) % count;
		const ex = ring[j * 2] - ring[i * 2];
		const ey = ring[j * 2 + 1] - ring[i * 2 + 1];
		const ox = out[j * 2] - out[i * 2];
		const oy = out[j * 2 + 1] - out[i * 2 + 1];
		if (ex * ox + ey * oy <= 0) return null;
	}
	const before = signedRingArea(ring);
	const after = signedRingArea(out);
	if (Math.sign(after) !== Math.sign(before)) return null;
	const shrank = Math.abs(after) < Math.abs(before);
	if (shrank !== (inward === 1)) return null;
	return out;
}

/** The inset front cap, or null when no bevel down to a hairline keeps the ring simple. */
function insetContour(contour: StageGlyphContour, bevel: number): StageGlyphContour | null {
	const outer = insetRing(contour.outer, bevel, 1);
	if (!outer) return null;
	const holes: StageGlyphRing[] = [];
	for (const hole of contour.holes) {
		const inset = insetRing(hole, bevel, -1);
		if (!inset) return null;
		holes.push(inset);
	}
	const flat = [...outer];
	const holeIndices: number[] = [];
	for (const hole of holes) {
		holeIndices.push(flat.length / 2);
		flat.push(...hole);
	}
	if (earcutDeviation(flat, holeIndices, 2, earcut(flat, holeIndices, 2)) > CAP_DEVIATION_LIMIT) {
		return null;
	}
	return { outer, holes };
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
function appendCap(builder: MeshBuilder, contour: StageGlyphContour, z: number, facing: 1 | -1, region: number): void {
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
function appendBand(builder: MeshBuilder, near: StageGlyphRing, nearZ: number, far: StageGlyphRing, farZ: number, region: number, inward: 1 | -1): void {
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

/** The largest bevel a contour's thinnest stroke allows: a share of its area over half its perimeter. */
function safeBevel(contour: StageGlyphContour, bevel: number): number {
	let smallest = Number.POSITIVE_INFINITY;
	const rings = [contour.outer, ...contour.holes];
	for (const ring of rings) {
		// The ring's smallest edge-to-opposite distance is approximated by its
		// area over half its perimeter: a thin stroke has a small ratio.
		let perimeter = 0;
		for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
			perimeter += Math.hypot(ring[i] - ring[j], ring[i + 1] - ring[j + 1]);
		}
		const halfWidth = Math.abs(signedRingArea(ring)) / Math.max(perimeter, 1e-6);
		smallest = Math.min(smallest, halfWidth);
	}
	return Math.min(bevel, smallest * BEVEL_STROKE_SHARE);
}

/**
 * Build one glyph's body: back cap on z = 0, sides to z = depth − bevel, the
 * chamfer to z = depth over an inset ring, and the front cap on the inset.
 */
function appendGlyphBody(builder: MeshBuilder, contours: StageGlyphContour[], form: StageTypeForm, offsetX: number): void {
	for (const contour of contours) {
		const shifted: StageGlyphContour = {
			outer: shiftRing(contour.outer, offsetX),
			holes: contour.holes.map((hole) => shiftRing(hole, offsetX))
		};
		// The bevel this contour can carry: halved while its inset crosses the
		// stroke, down to none — a hairline glyph extrudes straight rather than
		// growing a spike.
		let bevel = safeBevel(shifted, form.bevel);
		let front: StageGlyphContour | null = null;
		for (let attempt = 0; attempt < BEVEL_RETRIES && bevel > 1e-4; attempt += 1) {
			front = insetContour(shifted, bevel);
			if (front) break;
			bevel /= 2;
		}
		if (!front) {
			bevel = 0;
			front = shifted;
		}
		const sideTop = Math.max(form.depth - bevel, 0);
		appendCap(builder, shifted, 0, -1, STAGE_TYPE_REGION.back);
		if (sideTop > 0) {
			appendBand(builder, shifted.outer, sideTop, shifted.outer, 0, STAGE_TYPE_REGION.side, 1);
			for (const hole of shifted.holes) appendBand(builder, hole, sideTop, hole, 0, STAGE_TYPE_REGION.side, 1);
		}
		if (bevel > 0) {
			appendBand(builder, front.outer, form.depth, shifted.outer, sideTop, STAGE_TYPE_REGION.bevel, 1);
			shifted.holes.forEach((hole, index) => {
				appendBand(builder, front.holes[index], form.depth, hole, sideTop, STAGE_TYPE_REGION.bevel, 1);
			});
		}
		appendCap(builder, front, form.depth, 1, STAGE_TYPE_REGION.face);
	}
}

function shiftRing(ring: StageGlyphRing, offsetX: number): StageGlyphRing {
	const out: StageGlyphRing = new Array(ring.length);
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
