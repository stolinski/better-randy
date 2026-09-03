// Compile a Pack face into a bundled Dimensional Stage typeface (ADR-0062, the
// compiled-typeface lane).
//
//   node --experimental-strip-types scripts/compile-stage-typeface.ts <slug> <face.woff2>
//
// Reads one font file the Pack already ships (a `@fontsource` WOFF2 cut),
// takes the outline, advance, and pair kerning of every code point in the
// headline glyph set, and writes `src/lib/assets/typefaces/<slug>.stageglyphs`.
// It prints the facts the registry declares — glyph count, metrics, the
// source's sha256 — so a mismatch is visible before the tests catch it. This
// is the only path that turns a font file into stage outlines; nothing parses
// a font at runtime, and no font library ships to the browser.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { create as createFont } from 'fontkit';

import {
	encodeStageTypeface,
	listStageTypefaceCodePoints,
	STAGE_GLYPH_COMMAND,
	type StageGlyphOutline
} from '../src/lib/platform/stage-glyph-format.ts';

function usage(): never {
	throw new Error(
		'Usage: node --experimental-strip-types scripts/compile-stage-typeface.ts <slug> <face.woff2>'
	);
}

const [, , slug, facePath] = process.argv;
if (!slug || !facePath || !/^[a-z0-9-]+$/.test(slug)) usage();

const bytes = await readFile(resolve(facePath));
const sha256 = createHash('sha256').update(bytes).digest('hex');
const parsed = createFont(bytes);
// A collection would hand back several faces; a Pack cut is one.
if ('fonts' in parsed) throw new Error('The file is a font collection, not one face.');
const font = parsed;
if (font.numGlyphs === 0) throw new Error('The face carries no glyphs.');

// Kerning is what the face's own layout says the pair advances by, minus the
// left glyph's plain advance — GPOS and legacy kern tables alike.
function outlineOf(codePoint: number): StageGlyphOutline | null {
	if (!font.hasGlyphForCodePoint(codePoint)) return null;
	const glyph = font.glyphForCodePoint(codePoint);
	if (glyph.id === 0) return null;
	const commands: number[] = [];
	for (const command of glyph.path.commands) {
		switch (command.command) {
			case 'moveTo':
				commands.push(STAGE_GLYPH_COMMAND.move, ...command.args);
				break;
			case 'lineTo':
				commands.push(STAGE_GLYPH_COMMAND.line, ...command.args);
				break;
			case 'quadraticCurveTo':
				commands.push(STAGE_GLYPH_COMMAND.quadratic, ...command.args);
				break;
			case 'bezierCurveTo':
				commands.push(STAGE_GLYPH_COMMAND.cubic, ...command.args);
				break;
			case 'closePath':
				commands.push(STAGE_GLYPH_COMMAND.close);
				break;
			default:
				throw new Error(`Unhandled outline command ${String(command.command)}.`);
		}
	}
	return { codePoint, advance: glyph.advanceWidth, commands: new Float32Array(commands) };
}

const glyphs: StageGlyphOutline[] = [];
for (const codePoint of listStageTypefaceCodePoints()) {
	const outline = outlineOf(codePoint);
	if (outline) glyphs.push(outline);
}
if (glyphs.length === 0) throw new Error('The face carries none of the headline glyph set.');

const kerning: { left: number; right: number; adjust: number }[] = [];
const present = glyphs.filter((glyph) => glyph.commands.length > 0);
for (const left of present) {
	for (const right of present) {
		const run = font.layout(String.fromCodePoint(left.codePoint, right.codePoint));
		if (run.glyphs.length !== 2) continue;
		const adjust = Math.round(run.positions[0].xAdvance - left.advance);
		if (adjust !== 0) kerning.push({ left: left.codePoint, right: right.codePoint, adjust });
	}
}

const encoded = encodeStageTypeface({
	unitsPerEm: font.unitsPerEm,
	capHeight: font.capHeight,
	xHeight: font.xHeight,
	ascender: font.ascent,
	descender: font.descent,
	glyphs,
	kerning
});
const outputPath = resolve('src/lib/assets/typefaces', `${slug}.stageglyphs`);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, encoded);

console.log(
	JSON.stringify(
		{
			slug,
			family: font.familyName,
			subfamily: font.subfamilyName,
			source: facePath,
			sha256,
			unitsPerEm: font.unitsPerEm,
			capHeight: font.capHeight,
			xHeight: font.xHeight,
			glyphs: glyphs.length,
			kerningPairs: kerning.length,
			bytes: encoded.byteLength,
			output: outputPath
		},
		null,
		2
	)
);
