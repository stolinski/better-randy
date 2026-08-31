// The gfx.computer identity is drawn geometry, never typeset text: a favicon or
// social card must rasterize identically with no font available, so every
// letterform here is emitted as an SVG path built from explicit units.
//
// The ratified identity is **the Slate** — the early-broadcast title card,
// approved 2026-08-31 (dex bqkcgts5), replacing the achromatic Quarter
// (`alpha-cell-b`, retired the same day). A stack of opaque cards fans up-left
// behind a black top card that carries drawn extended letterforms. Colour is a
// luminance decay ramp — white face, then yellow, red, blue, each one frame
// older — never a flat triad, and never a UI signal colour. There are no
// scanlines, stripes, or discs anywhere in the family, and no one-ink cuts:
// Scott killed the mono versions at ratification, so every surface carries the
// full stack.
//
// The mark is authored in a 64-unit tile so every export size is one uniform
// scale of the same paths. The title card is authored around a 400×225 card.

export interface GfxIdentityPalette {
	/** The letter face in flat cuts — the chrome ink. */
	readonly face: string;
	/** The letter face in the lit cut, under bloom. */
	readonly faceLit: string;
	/**
	 * The decay ramp, nearest echo first. Each colour is one frame older than
	 * the face: yellow, then red, then blue — a luminance decay, not a triad.
	 */
	readonly decay: readonly [string, string, string];
	/** The top card of the mark, and the ground the face sits on. */
	readonly card: string;
	/**
	 * The title card's fill: one surface step above the deck. The card carries
	 * no keyline — elevation separates it, matching the app's depth language.
	 */
	readonly cardLifted: string;
}

export const GFX_IDENTITY_PALETTE: GfxIdentityPalette = Object.freeze({
	face: '#E8E8EA',
	faceLit: '#FFFFFF',
	decay: Object.freeze(['#FFC940', '#F23B3F', '#3D5AF5'] as const),
	card: '#0C0C0E',
	cardLifted: '#131315'
});

/** The mark tile the identity is authored in. */
export const GFX_IDENTITY_TILE_UNITS = 64;

/** Cap height the letterforms are authored at. */
export const GFX_IDENTITY_LETTER_CAP_UNITS = 100;

/** Bar thickness of the letterforms, in cap units. */
export const GFX_IDENTITY_LETTER_BAR_UNITS = 26;

/**
 * The levers the ratified artwork is drawn from. The mark's fan is flat (every
 * card at the top radius) because the concentric roll reads swooshy below
 * ~32px; the title card's fan is concentric (a deeper card's radius grows by
 * exactly its offset) so the colour bands hold constant width around the
 * corner at display sizes.
 */
export interface GfxIdentityLevers {
	readonly ratifiedCandidateId: string;
	readonly markCardUnits: number;
	readonly markCardRadiusUnits: number;
	readonly markFanStepUnits: number;
	readonly markLetterScale: number;
	readonly titleCardUnits: { readonly width: number; readonly height: number };
	readonly titleCardRadiusUnits: number;
	readonly titleCardFanStepUnits: number;
	readonly titleCardLetterScale: number;
}

export const GFX_IDENTITY: GfxIdentityLevers = Object.freeze({
	ratifiedCandidateId: 'slate',
	markCardUnits: 42,
	markCardRadiusUnits: 8,
	markFanStepUnits: 6,
	markLetterScale: 0.3,
	titleCardUnits: Object.freeze({ width: 400, height: 225 }),
	titleCardRadiusUnits: 16,
	titleCardFanStepUnits: 13,
	titleCardLetterScale: 0.92
});

// ── Rounded polygon paths ────────────────────────────────────────────────────
// Every letter is one clockwise polygon; each vertex carries its own corner
// radius, so silhouette corners, stroke terminals, and interior notches each
// keep one disciplined value instead of per-bar rounding that collides at
// joins.

/** Silhouette corners — the extremes of the cap box. */
const SILHOUETTE_RADIUS = 10;
/** Stroke terminals — bar ends inside the letter. */
const TERMINAL_RADIUS = 7;
/** Interior reflex corners, softened just enough not to trap ink. */
const NOTCH_RADIUS = 4;

interface RoundedPolygonVertex {
	readonly x: number;
	readonly y: number;
	readonly r: number;
}

function formatUnit(value: number): string {
	return Number(value.toFixed(3)).toString();
}

/**
 * Emit a clockwise polygon with per-vertex tangent arcs. The tangent offset is
 * r / tan(half the interior angle), clamped so adjacent arcs never overlap —
 * which is why acute corners (the X's tips) must carry small radii.
 */
function roundedPolygonPath(vertices: readonly RoundedPolygonVertex[]): string {
	const count = vertices.length;
	const corners = vertices.map((vertex, index) => {
		const previous = vertices[(index + count - 1) % count];
		const next = vertices[(index + 1) % count];
		const inboundX = vertex.x - previous.x;
		const inboundY = vertex.y - previous.y;
		const outboundX = next.x - vertex.x;
		const outboundY = next.y - vertex.y;
		const inboundLength = Math.hypot(inboundX, inboundY);
		const outboundLength = Math.hypot(outboundX, outboundY);
		const u = { x: inboundX / inboundLength, y: inboundY / inboundLength };
		const w = { x: outboundX / outboundLength, y: outboundY / outboundLength };
		const cosAngle = -(u.x * w.x + u.y * w.y);
		const angle = Math.acos(Math.min(1, Math.max(-1, cosAngle)));
		const offset = Math.min(
			vertex.r / Math.tan(angle / 2),
			inboundLength * 0.48,
			outboundLength * 0.48
		);
		const cross = u.x * w.y - u.y * w.x;
		return {
			entry: { x: vertex.x - u.x * offset, y: vertex.y - u.y * offset },
			exit: { x: vertex.x + w.x * offset, y: vertex.y + w.y * offset },
			sweep: cross > 0 ? 1 : 0,
			radius: vertex.r
		};
	});
	const segments: string[] = [];
	corners.forEach((corner, index) => {
		segments.push(
			index === 0
				? `M${formatUnit(corner.exit.x)} ${formatUnit(corner.exit.y)}`
				: `A${corner.radius} ${corner.radius} 0 0 ${corner.sweep} ${formatUnit(corner.exit.x)} ${formatUnit(corner.exit.y)}`
		);
		const next = corners[(index + 1) % count];
		segments.push(`L${formatUnit(next.entry.x)} ${formatUnit(next.entry.y)}`);
	});
	const first = corners[0];
	segments.push(
		`A${first.radius} ${first.radius} 0 0 ${first.sweep} ${formatUnit(first.exit.x)} ${formatUnit(first.exit.y)}`
	);
	return `${segments.join('')}Z`;
}

// ── Letterforms ──────────────────────────────────────────────────────────────
// Extended flat-sided letters on a cap-100 module, bar 26 — the broadcast-era
// technical letter, deliberately not the reference's rounded-heavy style. The
// G's counter is an open mouth: at a 16px favicon a closed counter is the
// first thing to fill in, and an open one cannot.

/** Vertical-cut face height of the X's terminals (bar / sin of the bar angle). */
const X_TERMINAL_FACE_UNITS = GFX_IDENTITY_LETTER_BAR_UNITS / Math.sin((47.84 * Math.PI) / 180);

interface LetterOutline {
	readonly advanceUnits: number;
	readonly polygon: readonly RoundedPolygonVertex[];
}

const LETTER_OUTLINES: Readonly<Record<'G' | 'F' | 'X', LetterOutline>> = Object.freeze({
	G: {
		advanceUnits: 92,
		polygon: [
			{ x: 0, y: 0, r: SILHOUETTE_RADIUS },
			{ x: 92, y: 0, r: SILHOUETTE_RADIUS },
			{ x: 92, y: 26, r: TERMINAL_RADIUS },
			{ x: 26, y: 26, r: NOTCH_RADIUS },
			{ x: 26, y: 74, r: NOTCH_RADIUS },
			{ x: 46, y: 74, r: NOTCH_RADIUS },
			{ x: 46, y: 46, r: TERMINAL_RADIUS },
			{ x: 92, y: 46, r: TERMINAL_RADIUS },
			{ x: 92, y: 100, r: SILHOUETTE_RADIUS },
			{ x: 0, y: 100, r: SILHOUETTE_RADIUS }
		]
	},
	F: {
		advanceUnits: 78,
		polygon: [
			{ x: 0, y: 0, r: SILHOUETTE_RADIUS },
			{ x: 78, y: 0, r: SILHOUETTE_RADIUS },
			{ x: 78, y: 26, r: TERMINAL_RADIUS },
			{ x: 26, y: 26, r: NOTCH_RADIUS },
			{ x: 26, y: 42, r: NOTCH_RADIUS },
			{ x: 66, y: 42, r: TERMINAL_RADIUS },
			{ x: 66, y: 68, r: TERMINAL_RADIUS },
			{ x: 26, y: 68, r: NOTCH_RADIUS },
			{ x: 26, y: 100, r: TERMINAL_RADIUS },
			{ x: 0, y: 100, r: SILHOUETTE_RADIUS }
		]
	},
	// The X's tip corners are acute, so their tangent offsets grow fast — every
	// corner stays at a small radius to keep the vertical-cut terminals crisp.
	X: {
		advanceUnits: 94,
		polygon: [
			{ x: 0, y: 0, r: 5 },
			{ x: 47, y: 32.45, r: NOTCH_RADIUS },
			{ x: 94, y: 0, r: 5 },
			{ x: 94, y: X_TERMINAL_FACE_UNITS, r: 5 },
			{ x: 72.42, y: 50, r: NOTCH_RADIUS },
			{ x: 94, y: 100 - X_TERMINAL_FACE_UNITS, r: 5 },
			{ x: 94, y: 100, r: 5 },
			{ x: 47, y: 67.55, r: NOTCH_RADIUS },
			{ x: 0, y: 100, r: 5 },
			{ x: 0, y: 100 - X_TERMINAL_FACE_UNITS, r: 5 },
			{ x: 21.58, y: 50, r: NOTCH_RADIUS },
			{ x: 0, y: X_TERMINAL_FACE_UNITS, r: 5 }
		]
	}
});

/** Space between letters; the X's diagonal opens its sides, so it sets tighter. */
const LETTER_GAP_UNITS = 16;
const LETTER_GAP_BEFORE_X_UNITS = 9;

interface LetterLine {
	/** One `<path>` element per letter, all on one baseline. */
	readonly body: string;
	readonly widthUnits: number;
}

function layoutLetterLine(sequence: readonly ('G' | 'F' | 'X')[]): LetterLine {
	let cursor = 0;
	const parts: string[] = [];
	sequence.forEach((key, index) => {
		if (index > 0) cursor += key === 'X' ? LETTER_GAP_BEFORE_X_UNITS : LETTER_GAP_UNITS;
		const letter = LETTER_OUTLINES[key];
		const shifted = letter.polygon.map((vertex) => ({ ...vertex, x: vertex.x + cursor }));
		parts.push(`<path d="${roundedPolygonPath(shifted)}"/>`);
		cursor += letter.advanceUnits;
	});
	return { body: parts.join(''), widthUnits: cursor };
}

// ── The card stack ───────────────────────────────────────────────────────────

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function svgDocument(viewBox: string, title: string, body: string): string {
	return `<svg xmlns="${SVG_NAMESPACE}" viewBox="${viewBox}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
}

interface CardStackGeometry {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
	readonly radius: number;
	readonly fill: string;
	readonly fanStep: number;
	/** 'concentric' holds band width around the corner; 'flat' keeps the small cut crisp. */
	readonly fanStyle: 'concentric' | 'flat';
}

/** Deepest card first, so nearer cards occlude — the decay needs no masks. */
function cardStackLayers(card: CardStackGeometry): string {
	const layers: string[] = [];
	for (let depth = 3; depth >= 1; depth -= 1) {
		const radius = card.fanStyle === 'concentric' ? card.radius + card.fanStep * depth : card.radius;
		layers.push(
			`<rect x="${formatUnit(card.x - card.fanStep * depth)}" y="${formatUnit(card.y - card.fanStep * depth)}" width="${card.width}" height="${card.height}" rx="${radius}" fill="${GFX_IDENTITY_PALETTE.decay[depth - 1]}"/>`
		);
	}
	layers.push(
		`<rect x="${card.x}" y="${card.y}" width="${card.width}" height="${card.height}" rx="${card.radius}" fill="${card.fill}"/>`
	);
	return layers.join('');
}

const LIT_FILTER_DEFS = `<filter id="gfx-face-bloom" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter><filter id="gfx-face-glow" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="2"/></filter>`;

// ── Emitters ─────────────────────────────────────────────────────────────────

/**
 * The mark: the G on its card stack in the 64-unit tile. This is the favicon,
 * the app icon, and the editor home link. The surround is transparent — the
 * opaque top card keeps the face legible on any tab-bar ground.
 */
export function renderGfxIdentityMarkSvg(): string {
	const { markCardUnits, markCardRadiusUnits, markFanStepUnits, markLetterScale } = GFX_IDENTITY;
	const origin = GFX_IDENTITY_TILE_UNITS - 2 - markCardUnits;
	const letters = layoutLetterLine(['G']);
	const letterX = origin + (markCardUnits - letters.widthUnits * markLetterScale) / 2;
	const letterY = origin + (markCardUnits - GFX_IDENTITY_LETTER_CAP_UNITS * markLetterScale) / 2;
	const body =
		cardStackLayers({
			x: origin,
			y: origin,
			width: markCardUnits,
			height: markCardUnits,
			radius: markCardRadiusUnits,
			fill: GFX_IDENTITY_PALETTE.card,
			fanStep: markFanStepUnits,
			fanStyle: 'flat'
		}) +
		`<g transform="translate(${formatUnit(letterX)} ${formatUnit(letterY)}) scale(${markLetterScale})" fill="${GFX_IDENTITY_PALETTE.face}">${letters.body}</g>`;
	return svgDocument(
		`0 0 ${GFX_IDENTITY_TILE_UNITS} ${GFX_IDENTITY_TILE_UNITS}`,
		'GFX mark',
		body
	);
}

/**
 * The flat logotype for chrome: GFX on one baseline, no card, no decay. The
 * host surface supplies the ground.
 */
export function renderGfxIdentityLogotypeSvg(): string {
	const letters = layoutLetterLine(['G', 'F', 'X']);
	return svgDocument(
		`-2 -2 ${formatUnit(letters.widthUnits + 4)} ${GFX_IDENTITY_LETTER_CAP_UNITS + 4}`,
		'GFX logotype',
		`<g fill="${GFX_IDENTITY_PALETTE.face}">${letters.body}</g>`
	);
}

/**
 * The title card: GFX on the 16:9 card stack — the masthead and the share
 * card. The lit cut blooms the face white-hot, the on-air treatment; bloom is
 * dressing, never structure, so the core cut is the same geometry flat.
 */
export function renderGfxIdentityTitleCardSvg(options: { readonly lit: boolean }): string {
	const { titleCardUnits, titleCardRadiusUnits, titleCardFanStepUnits, titleCardLetterScale } =
		GFX_IDENTITY;
	const reach = titleCardFanStepUnits * 3;
	const originX = reach + 3;
	const originY = reach + 3;
	const letters = layoutLetterLine(['G', 'F', 'X']);
	const letterX = originX + (titleCardUnits.width - letters.widthUnits * titleCardLetterScale) / 2;
	const letterY =
		originY + (titleCardUnits.height - GFX_IDENTITY_LETTER_CAP_UNITS * titleCardLetterScale) / 2;
	const face = `<g transform="translate(${formatUnit(letterX)} ${formatUnit(letterY)}) scale(${titleCardLetterScale})" fill="${options.lit ? GFX_IDENTITY_PALETTE.faceLit : GFX_IDENTITY_PALETTE.face}">${letters.body}</g>`;
	// Bloom halos paint over the card and under the crisp face, so the glow
	// reads as the face burning on the card rather than dimming the fan.
	const stack = cardStackLayers({
		x: originX,
		y: originY,
		width: titleCardUnits.width,
		height: titleCardUnits.height,
		radius: titleCardRadiusUnits,
		fill: GFX_IDENTITY_PALETTE.cardLifted,
		fanStep: titleCardFanStepUnits,
		fanStyle: 'concentric'
	});
	const litLayers = options.lit
		? `<g filter="url(#gfx-face-bloom)" opacity="0.55">${face}</g><g filter="url(#gfx-face-glow)" opacity="0.9">${face}</g>`
		: '';
	const body = `${options.lit ? `<defs>${LIT_FILTER_DEFS}</defs>` : ''}${stack}${litLayers}${face}`;
	return svgDocument(
		`0 0 ${formatUnit(originX + titleCardUnits.width + 3)} ${formatUnit(originY + titleCardUnits.height + 3)}`,
		'GFX title card',
		body
	);
}

/**
 * Pixel width of the mark's tightest feature when it is rasterized at
 * `renderedPixels`: the fan step and the G's mouth both measure 6 units, the
 * small-size legibility floor. Below roughly 1.5px a feature stops resolving
 * on a standard-density display.
 */
export function measureGfxIdentityFeaturePixels(renderedPixels: number): number {
	if (!Number.isFinite(renderedPixels) || renderedPixels <= 0) {
		throw new TypeError(`renderedPixels must be a positive number, received ${renderedPixels}`);
	}
	const tightestUnits = Math.min(
		GFX_IDENTITY.markFanStepUnits,
		GFX_IDENTITY_LETTER_BAR_UNITS * GFX_IDENTITY.markLetterScale,
		// The G's mouth: aperture rows are 20 cap units tall at the mark scale.
		20 * GFX_IDENTITY.markLetterScale
	);
	return (tightestUnits / GFX_IDENTITY_TILE_UNITS) * renderedPixels;
}
