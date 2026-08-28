// The gfx.computer identity is drawn geometry, never typeset text: a favicon or
// social card must rasterize identically with no font available, so every
// letterform here is emitted as an SVG path built from explicit units.
//
// The ratified direction is **alpha cell**. Transparency is the engine's binding
// rule — an overlay renders to a cleared, premultiplied canvas — so the
// transparency checkerboard is the mark and the letters are built from the same
// cells. This module holds the four variants of that one direction that are up
// for selection (dex rzeorbo1). They differ in cell count, lean, proportion, and
// how literally the grid reads in the type. They never differ in concept.
//
// Marks are authored in a 64x64 tile so every export size is one uniform scale
// of the same paths. The family is achromatic — two neutrals and the plate,
// nothing else. A Pack colour never touches the identity.

/** The four alpha-cell variants explored for ratification (dex rzeorbo1). */
export type GfxAlphaCellVariantId =
	'alpha-cell-a' | 'alpha-cell-b' | 'alpha-cell-c' | 'alpha-cell-d';

export interface GfxIdentityPalette {
	/** Primary drawn form. */
	readonly ink: string;
	/**
	 * Second checker neutral. `null` drops the alternating cells entirely, which
	 * is how a transparency checkerboard correctly degrades to one ink rather
	 * than flattening into a solid block.
	 */
	readonly inkAlternate: string | null;
	/** Tile fill behind a mark; `null` emits a transparent mark. */
	readonly tile: string | null;
}

/**
 * How a variant builds its mark out of cells.
 *
 * `floating-checker` sets a square block of alternating cells inside the tile,
 * so the mark reads as a swatch laid on the deck. `bleed-checker` runs the same
 * cells to the tile edge, so the tile *is* the checker; it optionally resolves a
 * letter out of that field by switching cells to ink.
 *
 * A bleed field is always upright. Shearing it would slice the edge cells into
 * slivers, and a sliver is a separate ink region that appears and disappears
 * with the rendered size — exactly what the raster-fidelity gate forbids.
 */
export type GfxAlphaCellMarkGeometry =
	| { readonly kind: 'floating-checker'; readonly cellCount: number; readonly blockUnits: number }
	| { readonly kind: 'bleed-checker'; readonly cellUnits: number; readonly letter: 'G' | null };

export interface GfxAlphaCellVariant {
	readonly id: GfxAlphaCellVariantId;
	/** Human-facing variant name used in the review bundle. */
	readonly title: string;
	/** What this variant claims, and what it gives up to claim it. */
	readonly concept: string;
	readonly mark: GfxAlphaCellMarkGeometry;
	/** Italic lean shared by the mark and the logotype; `0` keeps the variant upright. */
	readonly shearDegrees: number;
	/**
	 * Gap between adjacent logotype cells, as a fraction of one cell. This is the
	 * logotype's weight control: a small gutter fuses the cells into heavy
	 * strokes, a large one leaves the raster structure explicit.
	 */
	readonly logotypeCellGutter: number;
	/** Space added between logotype letters, in module units. */
	readonly logotypeTrackingUnits: number;
}

/** The mark tile every variant is authored in. */
export const GFX_IDENTITY_TILE_UNITS = 64;

/** Corner radius of the mark tile, held at DESIGN.md's 4px ceiling for a 32px favicon. */
export const GFX_IDENTITY_TILE_RADIUS_UNITS = 8;

/** Cap height every logotype is emitted at, so lockups scale by one factor. */
export const GFX_IDENTITY_LOGOTYPE_CAP_UNITS = 48;

// ── Module grid ──────────────────────────────────────────────────────────────
// Every glyph occupies the same 5-wide by 7-tall box, so a change of gutter or
// tracking never changes an advance width.
const MODULE_WIDTH = 5;
const MODULE_HEIGHT = 7;

export const GFX_IDENTITY_PALETTES: Readonly<
	Record<'deck' | 'monoLight' | 'monoDark', GfxIdentityPalette>
> = Object.freeze({
	deck: Object.freeze({
		ink: '#e8e8ea',
		inkAlternate: '#8a8a90',
		tile: '#0c0c0e'
	}),
	monoDark: Object.freeze({
		ink: '#e8e8ea',
		inkAlternate: null,
		tile: null
	}),
	monoLight: Object.freeze({
		ink: '#0c0c0e',
		inkAlternate: null,
		tile: null
	})
});

export const GFX_ALPHA_CELL_VARIANTS: readonly GfxAlphaCellVariant[] = Object.freeze([
	Object.freeze({
		id: 'alpha-cell-a',
		title: 'Field',
		concept:
			'The ratified read, tightened. Three cells leaning with the chrome. The logotype keeps its cells visibly apart but sets the three letters closer together, so the word groups as one thing and the raster still reads.',
		mark: Object.freeze({ kind: 'floating-checker', cellCount: 3, blockUnits: 42 }),
		shearDegrees: -10,
		logotypeCellGutter: 0.17,
		logotypeTrackingUnits: 0.8
	} satisfies GfxAlphaCellVariant),
	Object.freeze({
		id: 'alpha-cell-b',
		title: 'Quarter',
		concept:
			'The checker cut to its smallest true statement — one quartered square, two cells of ink. The steepest lean and the heaviest, tightest logotype: the grid reads as weight rather than as raster. The most robust mark at a favicon, the least literal about transparency.',
		mark: Object.freeze({ kind: 'floating-checker', cellCount: 2, blockUnits: 46 }),
		shearDegrees: -14,
		logotypeCellGutter: 0.08,
		logotypeTrackingUnits: 0.5
	} satisfies GfxAlphaCellVariant),
	Object.freeze({
		id: 'alpha-cell-c',
		title: 'Weave',
		concept:
			'Four cells running edge to edge: the tile is the checker rather than a swatch floating on it. Upright, with an open logotype whose cells stay well apart. The most literal any of these gets about transparency — and the least ownable, because it is also the most expected.',
		mark: Object.freeze({ kind: 'bleed-checker', cellUnits: 16, letter: null }),
		shearDegrees: 0,
		logotypeCellGutter: 0.24,
		logotypeTrackingUnits: 1.3
	} satisfies GfxAlphaCellVariant),
	Object.freeze({
		id: 'alpha-cell-d',
		title: 'Glyph',
		concept:
			'The letter resolved out of the field. A finer checker fills the whole tile and the G is the cells switched to ink, on the same grid. Upright, so the cells read orthogonally and the mark states the name as well as the rule.',
		mark: Object.freeze({ kind: 'bleed-checker', cellUnits: 7, letter: 'G' }),
		shearDegrees: 0,
		logotypeCellGutter: 0.12,
		logotypeTrackingUnits: 0.9
	} satisfies GfxAlphaCellVariant)
]);

export function findGfxAlphaCellVariant(id: GfxAlphaCellVariantId): GfxAlphaCellVariant {
	const variant = GFX_ALPHA_CELL_VARIANTS.find((candidate) => candidate.id === id);
	if (!variant) throw new TypeError(`Unknown gfx alpha-cell variant: ${id}`);
	return variant;
}

/**
 * Smallest ink dimension a variant's mark relies on, in 64-unit tile space. For
 * both mark kinds that is one cell: a checker stops reading when its cells
 * merge, and a resolved letter's strokes are one cell wide.
 */
function markMinimumFeatureUnits(mark: GfxAlphaCellMarkGeometry): number {
	return mark.kind === 'floating-checker' ? mark.blockUnits / mark.cellCount : mark.cellUnits;
}

// ── Path primitives ──────────────────────────────────────────────────────────

interface UnitRectangle {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

function formatUnit(value: number): string {
	return Number(value.toFixed(4)).toString();
}

function rectanglePathData(rectangle: UnitRectangle): string {
	const { x, y, width, height } = rectangle;
	return `M${formatUnit(x)} ${formatUnit(y)}H${formatUnit(x + width)}V${formatUnit(y + height)}H${formatUnit(x)}Z`;
}

function shearTangent(shearDegrees: number): number {
	return Math.tan((Math.abs(shearDegrees) * Math.PI) / 180);
}

function shearTransform(
	shearDegrees: number,
	heightUnits: number,
	originX: number,
	originY: number,
	scale: number
): string {
	const scaled = `scale(${formatUnit(scale)})`;
	if (shearDegrees === 0) {
		return `translate(${formatUnit(originX)} ${formatUnit(originY)}) ${scaled}`;
	}
	// skewX(-n) shifts the bottom edge left by height * tan(n); pre-translating by
	// that amount keeps the sheared box flush against `originX`.
	const compensation = heightUnits * shearTangent(shearDegrees);
	return `translate(${formatUnit(originX + compensation)} ${formatUnit(originY)}) skewX(${shearDegrees}) ${scaled}`;
}

// ── Cell glyphs ──────────────────────────────────────────────────────────────
// G, F and X quantized to the module grid. Rows read top to bottom. The G's
// counter is an open mouth rather than a closed pocket: at a 16px favicon a
// closed counter is the first thing to fill in, and an open one cannot.

const CELL_GLYPH_ROWS: Readonly<Record<'G' | 'F' | 'X', readonly string[]>> = Object.freeze({
	G: Object.freeze(['11111', '10000', '10000', '10111', '10001', '10001', '11111']),
	F: Object.freeze(['11111', '10000', '10000', '11110', '10000', '10000', '10000']),
	X: Object.freeze(['10001', '10001', '01010', '00100', '01010', '10001', '10001'])
});

/**
 * Lit cells of a glyph as rectangles on the module grid, each inset by half the
 * gutter. A gutter of `0` fuses adjacent cells into continuous strokes, which is
 * what the mark's letter-field needs; the logotype always keeps some gutter.
 */
function cellGlyphRectangles(
	glyph: 'G' | 'F' | 'X',
	offsetX: number,
	gutter: number
): UnitRectangle[] {
	const inset = gutter / 2;
	const size = 1 - gutter;
	const rectangles: UnitRectangle[] = [];
	CELL_GLYPH_ROWS[glyph].forEach((row, rowIndex) => {
		[...row].forEach((cell, columnIndex) => {
			if (cell !== '1') return;
			rectangles.push({
				x: offsetX + columnIndex + inset,
				y: rowIndex + inset,
				width: size,
				height: size
			});
		});
	});
	return rectangles;
}

// ── Logotype layout ──────────────────────────────────────────────────────────

interface LogotypeLayout {
	/** Combined `d` for all three letters, in module units with the baseline at y = 7. */
	readonly pathData: string;
	/** Advance width of the set line in module units, before shear. */
	readonly widthUnits: number;
}

function layoutLogotype(variant: GfxAlphaCellVariant): LogotypeLayout {
	const glyphs: readonly ('G' | 'F' | 'X')[] = ['G', 'F', 'X'];
	const advance = MODULE_WIDTH + variant.logotypeTrackingUnits;
	return {
		pathData: glyphs
			.flatMap((glyph, index) =>
				cellGlyphRectangles(glyph, index * advance, variant.logotypeCellGutter)
			)
			.map(rectanglePathData)
			.join(''),
		widthUnits: advance * glyphs.length - variant.logotypeTrackingUnits
	};
}

// ── Mark geometry ────────────────────────────────────────────────────────────

interface MarkShape {
	readonly pathData: string;
	readonly fill: 'ink' | 'inkAlternate';
}

interface MarkGeometry {
	readonly transform: string;
	readonly shapes: readonly MarkShape[];
	/** True when the mark's cells run to the tile edge and need the rounded clip. */
	readonly clipsToTile: boolean;
}

function floatingCheckerMarkGeometry(
	variant: GfxAlphaCellVariant,
	mark: Extract<GfxAlphaCellMarkGeometry, { kind: 'floating-checker' }>
): MarkGeometry {
	const cell = mark.blockUnits / mark.cellCount;
	const shearedWidth = mark.blockUnits * (1 + shearTangent(variant.shearDegrees));
	const ink: string[] = [];
	const alternate: string[] = [];
	for (let row = 0; row < mark.cellCount; row += 1) {
		for (let column = 0; column < mark.cellCount; column += 1) {
			const path = rectanglePathData({
				x: column * cell,
				y: row * cell,
				width: cell,
				height: cell
			});
			((row + column) % 2 === 0 ? ink : alternate).push(path);
		}
	}
	return {
		transform: shearTransform(
			variant.shearDegrees,
			mark.blockUnits,
			(GFX_IDENTITY_TILE_UNITS - shearedWidth) / 2,
			(GFX_IDENTITY_TILE_UNITS - mark.blockUnits) / 2,
			1
		),
		shapes: [
			{ pathData: alternate.join(''), fill: 'inkAlternate' },
			{ pathData: ink.join(''), fill: 'ink' }
		],
		clipsToTile: false
	};
}

function bleedCheckerMarkGeometry(
	mark: Extract<GfxAlphaCellMarkGeometry, { kind: 'bleed-checker' }>
): MarkGeometry {
	const cell = mark.cellUnits;
	const cellsAcross = GFX_IDENTITY_TILE_UNITS / cell;
	const drawn = Math.ceil(cellsAcross);
	const even: string[] = [];
	const odd: string[] = [];
	for (let row = 0; row < drawn; row += 1) {
		for (let column = 0; column < drawn; column += 1) {
			const path = rectanglePathData({
				x: column * cell,
				y: row * cell,
				width: cell,
				height: cell
			});
			((row + column) % 2 === 0 ? even : odd).push(path);
		}
	}
	// With no letter the field IS the mark, so it alternates both visible
	// neutrals and covers the tile. With a letter the field is ground: the dark
	// half drops to the plate so the ink letter stays the brightest thing in the
	// tile, and the monochrome cut removes the field entirely.
	const shapes: MarkShape[] = mark.letter
		? [{ pathData: even.join(''), fill: 'inkAlternate' }]
		: [
				{ pathData: odd.join(''), fill: 'inkAlternate' },
				{ pathData: even.join(''), fill: 'ink' }
			];
	if (mark.letter) {
		// Seat the letter on whole cells so its strokes coincide with the field's,
		// which is what makes it read as cells switched to ink rather than as a
		// letter laid over a pattern. Centring is measured against the tile's true
		// width in cells, not the clipped cell count.
		const letterColumn = Math.round((cellsAcross - MODULE_WIDTH) / 2);
		const letterRow = Math.round((cellsAcross - MODULE_HEIGHT) / 2);
		shapes.push({
			pathData: cellGlyphRectangles(mark.letter, 0, 0)
				.map((rectangle) =>
					rectanglePathData({
						x: (letterColumn + rectangle.x) * cell,
						y: (letterRow + rectangle.y) * cell,
						width: rectangle.width * cell,
						height: rectangle.height * cell
					})
				)
				.join(''),
			fill: 'ink'
		});
	}
	return { transform: 'translate(0 0)', shapes, clipsToTile: true };
}

function alphaCellMarkGeometry(variant: GfxAlphaCellVariant): MarkGeometry {
	return variant.mark.kind === 'floating-checker'
		? floatingCheckerMarkGeometry(variant, variant.mark)
		: bleedCheckerMarkGeometry(variant.mark);
}

// ── SVG emitters ─────────────────────────────────────────────────────────────

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const TILE_CLIP_ID = 'gfx-identity-tile';

function svgDocument(viewBox: string, title: string, body: string): string {
	return `<svg xmlns="${SVG_NAMESPACE}" viewBox="${viewBox}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
}

/**
 * Emit a variant's square mark in the 64-unit tile. A palette with `tile: null`
 * emits the transparent one-ink cut, which is the variant that proves the form
 * carries without the second neutral or the plate behind it.
 *
 * The field geometry is identical in both cuts. Only fills drop, so a variant
 * can never rely on a tone the monochrome cut removes.
 */
export function renderGfxIdentityMarkSvg(
	id: GfxAlphaCellVariantId,
	palette: GfxIdentityPalette
): string {
	const variant = findGfxAlphaCellVariant(id);
	const { transform, shapes, clipsToTile } = alphaCellMarkGeometry(variant);
	const tilePath = `<rect width="${GFX_IDENTITY_TILE_UNITS}" height="${GFX_IDENTITY_TILE_UNITS}" rx="${GFX_IDENTITY_TILE_RADIUS_UNITS}"`;
	const layers: string[] = [];
	if (palette.tile) layers.push(`${tilePath} fill="${palette.tile}"/>`);
	const drawn = shapes
		.flatMap((shape) => {
			const fill = palette[shape.fill];
			return fill && shape.pathData ? [`<path d="${shape.pathData}" fill="${fill}"/>`] : [];
		})
		.join('');
	const content = `<g transform="${transform}">${drawn}</g>`;
	layers.push(
		clipsToTile && palette.tile
			? `<defs><clipPath id="${TILE_CLIP_ID}">${tilePath}/></clipPath></defs><g clip-path="url(#${TILE_CLIP_ID})">${content}</g>`
			: content
	);
	return svgDocument(
		`0 0 ${GFX_IDENTITY_TILE_UNITS} ${GFX_IDENTITY_TILE_UNITS}`,
		`GFX ${variant.title} mark`,
		layers.join('')
	);
}

/**
 * Emit a variant's `GFX` logotype with a tight bounding viewBox. A logotype
 * never carries its own plate — the host surface supplies the deck.
 */
export function renderGfxIdentityLogotypeSvg(
	id: GfxAlphaCellVariantId,
	palette: GfxIdentityPalette
): string {
	const variant = findGfxAlphaCellVariant(id);
	const layout = layoutLogotype(variant);
	const scale = GFX_IDENTITY_LOGOTYPE_CAP_UNITS / MODULE_HEIGHT;
	const lean = GFX_IDENTITY_LOGOTYPE_CAP_UNITS * shearTangent(variant.shearDegrees);
	const width = layout.widthUnits * scale + (variant.shearDegrees === 0 ? 0 : lean);
	const transform = shearTransform(
		variant.shearDegrees,
		GFX_IDENTITY_LOGOTYPE_CAP_UNITS,
		0,
		0,
		scale
	);
	return svgDocument(
		`0 0 ${formatUnit(width)} ${GFX_IDENTITY_LOGOTYPE_CAP_UNITS}`,
		`GFX ${variant.title} logotype`,
		`<g transform="${transform}"><path d="${layout.pathData}" fill="${palette.ink}"/></g>`
	);
}

/**
 * Pixel width of a variant's tightest cell when its mark is rasterized at
 * `renderedPixels`. Below roughly 1.5px a feature stops resolving on a
 * standard-density display, which is the small-size legibility gate.
 */
export function measureGfxIdentityFeaturePixels(
	id: GfxAlphaCellVariantId,
	renderedPixels: number
): number {
	if (!Number.isFinite(renderedPixels) || renderedPixels <= 0) {
		throw new TypeError(`renderedPixels must be a positive number, received ${renderedPixels}`);
	}
	const variant = findGfxAlphaCellVariant(id);
	return (markMinimumFeatureUnits(variant.mark) * renderedPixels) / GFX_IDENTITY_TILE_UNITS;
}
