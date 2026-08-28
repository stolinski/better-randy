// The gfx.computer identity is drawn geometry, never typeset text: a favicon or
// social card must rasterize identically with no font available, so every
// letterform here is emitted as an SVG path built from explicit units.
//
// The ratified identity is **alpha cell, Quarter** — candidate `alpha-cell-b`,
// approved 2026-08-28 (dex rzeorbo1). Transparency is the engine's binding rule —
// an overlay renders to a cleared, premultiplied canvas — so a transparency
// checkerboard cut to its smallest true statement is the mark, and the letters
// are built from the same cells. The three candidates that lost are gone;
// docs/identity/README.md records what each claimed.
//
// The mark is authored in a 64x64 tile so every export size is one uniform scale
// of the same paths. The family is achromatic — two neutrals and the plate,
// nothing else. A Pack colour never touches the identity.

export interface GfxIdentityPalette {
	/** Primary drawn form. */
	readonly ink: string;
	/**
	 * Second checker neutral. `null` drops the alternating cells entirely, which
	 * is how a transparency checkerboard correctly degrades to one ink rather
	 * than flattening into a solid block.
	 */
	readonly inkAlternate: string | null;
	/** Tile fill behind the mark; `null` emits a transparent mark. */
	readonly tile: string | null;
}

/**
 * The checker block the mark is built from: `cellCount` squares to a side,
 * alternating between the two neutrals, floating inside the tile rather than
 * bleeding to its edge — so the mark reads as a swatch laid on the deck.
 */
export interface GfxIdentityMarkGeometry {
	readonly cellCount: number;
	readonly blockUnits: number;
}

export interface GfxIdentity {
	/**
	 * Candidate id the ratified artwork was reviewed and approved under, kept so
	 * the shipped assets stay traceable to the review bundle.
	 */
	readonly ratifiedCandidateId: string;
	readonly mark: GfxIdentityMarkGeometry;
	/** Italic lean shared by the mark and the logotype. */
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

/** The mark tile the identity is authored in. */
export const GFX_IDENTITY_TILE_UNITS = 64;

/** Corner radius of the mark tile, held at DESIGN.md's 4px ceiling for a 32px favicon. */
export const GFX_IDENTITY_TILE_RADIUS_UNITS = 8;

/** Cap height the logotype is emitted at, so every lockup scales by one factor. */
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

/**
 * The ratified identity: one quartered square, two cells of ink, at the steepest
 * lean the family allows, over the heaviest and tightest of the four logotypes —
 * so the grid reads as weight rather than as raster, and the mark stays robust
 * down to a 16px favicon.
 */
export const GFX_IDENTITY: GfxIdentity = Object.freeze({
	ratifiedCandidateId: 'alpha-cell-b',
	mark: Object.freeze({ cellCount: 2, blockUnits: 46 }),
	shearDegrees: -14,
	logotypeCellGutter: 0.08,
	logotypeTrackingUnits: 0.5
} satisfies GfxIdentity);

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
	heightUnits: number,
	originX: number,
	originY: number,
	scale: number
): string {
	// skewX(-n) shifts the bottom edge left by height * tan(n); pre-translating by
	// that amount keeps the sheared box flush against `originX`.
	const compensation = heightUnits * shearTangent(GFX_IDENTITY.shearDegrees);
	const scaled = scale === 1 ? '' : ` scale(${formatUnit(scale)})`;
	return `translate(${formatUnit(originX + compensation)} ${formatUnit(originY)}) skewX(${GFX_IDENTITY.shearDegrees})${scaled}`;
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
 * gutter, so the gutter reads as the gap between neighbouring cells.
 */
function cellGlyphRectangles(glyph: 'G' | 'F' | 'X', offsetX: number): UnitRectangle[] {
	const inset = GFX_IDENTITY.logotypeCellGutter / 2;
	const size = 1 - GFX_IDENTITY.logotypeCellGutter;
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

function layoutLogotype(): LogotypeLayout {
	const glyphs: readonly ('G' | 'F' | 'X')[] = ['G', 'F', 'X'];
	const advance = MODULE_WIDTH + GFX_IDENTITY.logotypeTrackingUnits;
	return {
		pathData: glyphs
			.flatMap((glyph, index) => cellGlyphRectangles(glyph, index * advance))
			.map(rectanglePathData)
			.join(''),
		widthUnits: advance * glyphs.length - GFX_IDENTITY.logotypeTrackingUnits
	};
}

// ── Mark geometry ────────────────────────────────────────────────────────────

interface MarkGeometry {
	readonly transform: string;
	/** Alternating cells, then ink cells — the checker's two tones as two subpaths. */
	readonly alternatePathData: string;
	readonly inkPathData: string;
}

function markGeometry(): MarkGeometry {
	const { cellCount, blockUnits } = GFX_IDENTITY.mark;
	const cell = blockUnits / cellCount;
	const shearedWidth = blockUnits * (1 + shearTangent(GFX_IDENTITY.shearDegrees));
	const ink: string[] = [];
	const alternate: string[] = [];
	for (let row = 0; row < cellCount; row += 1) {
		for (let column = 0; column < cellCount; column += 1) {
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
			blockUnits,
			(GFX_IDENTITY_TILE_UNITS - shearedWidth) / 2,
			(GFX_IDENTITY_TILE_UNITS - blockUnits) / 2,
			1
		),
		alternatePathData: alternate.join(''),
		inkPathData: ink.join('')
	};
}

// ── SVG emitters ─────────────────────────────────────────────────────────────

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function svgDocument(viewBox: string, title: string, body: string): string {
	return `<svg xmlns="${SVG_NAMESPACE}" viewBox="${viewBox}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
}

/**
 * Emit the square mark in the 64-unit tile. A palette with `tile: null` emits the
 * transparent one-ink cut, which is what every surface that cannot carry the
 * plate uses. The checker geometry is identical in both cuts — only fills drop,
 * so the mark can never rely on a tone the monochrome cut removes.
 */
export function renderGfxIdentityMarkSvg(palette: GfxIdentityPalette): string {
	const { transform, alternatePathData, inkPathData } = markGeometry();
	const layers: string[] = [];
	if (palette.tile) {
		layers.push(
			`<rect width="${GFX_IDENTITY_TILE_UNITS}" height="${GFX_IDENTITY_TILE_UNITS}" rx="${GFX_IDENTITY_TILE_RADIUS_UNITS}" fill="${palette.tile}"/>`
		);
	}
	const cells = [
		palette.inkAlternate ? `<path d="${alternatePathData}" fill="${palette.inkAlternate}"/>` : '',
		`<path d="${inkPathData}" fill="${palette.ink}"/>`
	].join('');
	layers.push(`<g transform="${transform}">${cells}</g>`);
	return svgDocument(
		`0 0 ${GFX_IDENTITY_TILE_UNITS} ${GFX_IDENTITY_TILE_UNITS}`,
		'GFX mark',
		layers.join('')
	);
}

/**
 * Emit the `GFX` logotype with a tight bounding viewBox. A logotype never carries
 * its own plate — the host surface supplies the deck.
 */
export function renderGfxIdentityLogotypeSvg(palette: GfxIdentityPalette): string {
	const layout = layoutLogotype();
	const scale = GFX_IDENTITY_LOGOTYPE_CAP_UNITS / MODULE_HEIGHT;
	const lean = GFX_IDENTITY_LOGOTYPE_CAP_UNITS * shearTangent(GFX_IDENTITY.shearDegrees);
	const width = layout.widthUnits * scale + lean;
	return svgDocument(
		`0 0 ${formatUnit(width)} ${GFX_IDENTITY_LOGOTYPE_CAP_UNITS}`,
		'GFX logotype',
		`<g transform="${shearTransform(GFX_IDENTITY_LOGOTYPE_CAP_UNITS, 0, 0, scale)}"><path d="${layout.pathData}" fill="${palette.ink}"/></g>`
	);
}

/**
 * Pixel width of the mark's tightest cell when it is rasterized at
 * `renderedPixels`. Below roughly 1.5px a feature stops resolving on a
 * standard-density display, which is the small-size legibility gate.
 */
export function measureGfxIdentityFeaturePixels(renderedPixels: number): number {
	if (!Number.isFinite(renderedPixels) || renderedPixels <= 0) {
		throw new TypeError(`renderedPixels must be a positive number, received ${renderedPixels}`);
	}
	const { blockUnits, cellCount } = GFX_IDENTITY.mark;
	return (blockUnits / cellCount / GFX_IDENTITY_TILE_UNITS) * renderedPixels;
}
