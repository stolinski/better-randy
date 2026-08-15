import type { Captions } from '$lib/platform/engine-schema';
import { cueWordWindows } from './srt';

export interface CaptionReadableText {
	id: string;
	text: string;
	cueId: string;
	wordIndex: number | null;
}

/** Resolve the exact half-open cue/word identity painted at one timestamp. */
export function resolveCaptionReadableText(
	captions: Captions | undefined,
	timestampMilliseconds: number
): CaptionReadableText | null {
	const cue = captions?.cues.find(
		(candidate) =>
			timestampMilliseconds >= candidate.startMs && timestampMilliseconds < candidate.endMs
	);
	if (!captions || !cue) return null;
	if (captions.style !== 'word-pop') {
		return { id: `caption:${cue.id}`, text: cue.text.trim(), cueId: cue.id, wordIndex: null };
	}
	const words = cueWordWindows(cue);
	const wordIndex = words.findIndex(
		(word) => timestampMilliseconds >= word.startMs && timestampMilliseconds < word.endMs
	);
	if (wordIndex < 0) return null;
	return {
		id: `caption:${cue.id}:word:${wordIndex}`,
		text: words[wordIndex].text,
		cueId: cue.id,
		wordIndex
	};
}
