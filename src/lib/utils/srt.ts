/**
 * SRT ⇄ caption-cue conversion — the one parser every import lane shares:
 * the GUI's SRT editor, the CLI importer (`scripts/srt-to-captions.mjs`),
 * and any agent tooling. Pure (no Svelte, no DOM, no engine imports beyond
 * the cue shape) so plain-node scripts can import it directly.
 *
 * Accepts standard SRT and the tolerant variants real subtitle files carry:
 * optional sequence numbers, `,` or `.` millisecond separators (SRT vs VTT
 * habit), CRLF, and blank-line-separated blocks. Multi-line cue text joins
 * with a single space — the caption styles re-wrap for the frame themselves.
 */
import type { CaptionCue } from '$lib/platform/engine-schema';

const TIMING_LINE =
	/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function timestampToMs(h: string, m: string, s: string, ms: string): number {
	return Number(h) * 3_600_000 + Number(m) * 60_000 + Number(s) * 1000 + Number(ms.padEnd(3, '0'));
}

/**
 * Parse SRT text into caption cues. Throws a descriptive Error on the first
 * malformed block (fail fast — a silently half-imported subtitle track is
 * worse than an error). Returns cues sorted by startMs with stable
 * `cue-<n>` ids.
 */
export function parseSrt(text: string): CaptionCue[] {
	const blocks = text
		.replace(/\r\n/g, '\n')
		.replace(/^\uFEFF/, '')
		.split(/\n{2,}/)
		.map((block) => block.trim())
		.filter((block) => block.length > 0);

	const cues: CaptionCue[] = [];

	for (const block of blocks) {
		const lines = block.split('\n').map((line) => line.trim());
		// Optional sequence-number line precedes the timing line.
		const timingIndex = lines.findIndex((line) => TIMING_LINE.test(line));
		if (timingIndex === -1) {
			throw new Error(
				`SRT block ${cues.length + 1} has no timing line (expected "HH:MM:SS,mmm --> HH:MM:SS,mmm"): "${lines[0] ?? ''}"`
			);
		}
		const match = lines[timingIndex].match(TIMING_LINE);
		if (!match) {
			throw new Error(`Unparseable SRT timing line: "${lines[timingIndex]}"`);
		}
		const startMs = timestampToMs(match[1], match[2], match[3], match[4]);
		const endMs = timestampToMs(match[5], match[6], match[7], match[8]);
		const text = lines
			.slice(timingIndex + 1)
			.join(' ')
			.replace(/<[^>]+>/g, '') // strip inline styling tags
			.trim();
		if (text.length === 0) {
			throw new Error(`SRT cue at ${lines[timingIndex]} has no text.`);
		}
		if (endMs <= startMs) {
			throw new Error(`SRT cue at ${lines[timingIndex]} ends before it starts.`);
		}
		cues.push({ id: `cue-${cues.length + 1}`, startMs, endMs, text });
	}

	cues.sort((a, b) => a.startMs - b.startMs);
	return cues.map((cue, index) => ({ ...cue, id: `cue-${index + 1}` }));
}

function msToTimestamp(ms: number): string {
	const clamped = Math.max(0, Math.round(ms));
	const h = Math.floor(clamped / 3_600_000);
	const m = Math.floor((clamped % 3_600_000) / 60_000);
	const s = Math.floor((clamped % 60_000) / 1000);
	const rem = clamped % 1000;
	const pad = (value: number, width: number) => String(value).padStart(width, '0');
	return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(rem, 3)}`;
}

/** Serialize cues back to standard SRT — the GUI editor's round-trip face. */
export function cuesToSrt(cues: readonly CaptionCue[]): string {
	return cues
		.map(
			(cue, index) =>
				`${index + 1}\n${msToTimestamp(cue.startMs)} --> ${msToTimestamp(cue.endMs)}\n${cue.text}`
		)
		.join('\n\n');
}

/**
 * Per-word timing derived proportionally by word length within a cue — the
 * karaoke/word-pop styles' clock. Deterministic and schema-free: the cues
 * stay pure SRT data. A word's window is [startMs, endMs) within the cue.
 */
export interface CaptionWordWindow {
	text: string;
	startMs: number;
	endMs: number;
}

export function cueWordWindows(cue: CaptionCue): CaptionWordWindow[] {
	const words = cue.text.split(/\s+/).filter((word) => word.length > 0);
	if (words.length === 0) {
		return [];
	}
	const totalLength = words.reduce((sum, word) => sum + word.length, 0);
	const span = cue.endMs - cue.startMs;
	const windows: CaptionWordWindow[] = [];
	let cursor = cue.startMs;
	for (let i = 0; i < words.length; i += 1) {
		const share = words[i].length / totalLength;
		const end = i === words.length - 1 ? cue.endMs : cursor + span * share;
		windows.push({ text: words[i], startMs: cursor, endMs: end });
		cursor = end;
	}
	return windows;
}
