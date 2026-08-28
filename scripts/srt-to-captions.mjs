#!/usr/bin/env node
/**
 * SRT → captions importer (CLI lane of the captions domain; the GUI's SRT
 * editor and agent-authored JSON are the other two lanes — all three share
 * src/lib/utils/srt.ts).
 *
 *   node scripts/srt-to-captions.mjs subtitles.srt
 *       → prints a `captions` JSON block (style karaoke) to stdout
 *
 *   node scripts/srt-to-captions.mjs subtitles.srt --preset src/lib/presets/foo.json [--style word-pop]
 *       → writes/replaces `state.captions` in the preset file in place
 *
 * Options: --style karaoke|word-pop|pack (default karaoke)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

const { parseSrt } = await import(pathToFileURL(resolve(repoRoot, 'src/lib/utils/srt.ts')).href);
const { parsePresetIngress } = await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/preset-ingress.ts')).href
);
const { presetToWireFormat } = await import(
	pathToFileURL(resolve(repoRoot, 'src/lib/platform/preset-pure.ts')).href
);

const args = process.argv.slice(2);
const srtPath = args.find((arg) => !arg.startsWith('--'));
if (!srtPath) {
	console.error(
		'Usage: node scripts/srt-to-captions.mjs <file.srt> [--preset <preset.json>] [--style karaoke|word-pop|pack]'
	);
	process.exit(1);
}

const styleFlag = args.indexOf('--style');
const style = styleFlag >= 0 ? args[styleFlag + 1] : 'karaoke';
if (!['karaoke', 'word-pop', 'pack'].includes(style)) {
	console.error(`Unknown --style "${style}" (karaoke | word-pop | pack)`);
	process.exit(1);
}

const srtText = await readFile(resolve(srtPath), 'utf-8');
const cues = parseSrt(srtText);
const captions = { style, cues };

const presetFlag = args.indexOf('--preset');
if (presetFlag >= 0) {
	const presetPath = resolve(args[presetFlag + 1]);
	let preset;
	try {
		preset = parsePresetIngress(JSON.parse(await readFile(presetPath, 'utf-8')));
	} catch (error) {
		console.error(`${presetPath} is not a valid GFX preset.`, error);
		process.exit(1);
	}
	preset.state.captions = captions;
	await writeFile(presetPath, JSON.stringify(presetToWireFormat(preset), null, '\t') + '\n');
	console.log(`Wrote ${cues.length} cues (style ${style}) into ${presetPath}`);
} else {
	console.log(JSON.stringify({ captions }, null, '\t'));
}
