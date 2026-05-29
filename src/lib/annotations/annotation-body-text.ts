import {
	ANNOTATION_MARK_STYLES,
	type AnnotationMarkStyle
} from './annotation-mark-styles.ts';
import type {
	AnnotationBody,
	AnnotationTextSegment,
	ParagraphBlock
} from './annotation-marks.ts';

export function parseAnnotationBodyText(text: string): AnnotationBody {
	return text
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0)
		.map<ParagraphBlock>((paragraph) => ({
			type: 'paragraph',
			segments: parseParagraphSegments(paragraph)
		}));
}

/**
 * Plain-text projection of an annotation body, with paragraphs joined by
 * a single space. Used as a `{#key}` signature so a Svelte template re-creates
 * a body slot whenever the rendered text changes, even though the AnnotationBody
 * array itself is mutated in place.
 */
export function annotationBodyPlainText(body: AnnotationBody): string {
	let out = '';
	for (const block of body) {
		if (block.type !== 'paragraph') {
			continue;
		}
		if (out.length > 0) {
			out += ' ';
		}
		for (const segment of block.segments) {
			out += segment.text;
		}
	}
	return out;
}

export function serializeAnnotationBodyToText(body: AnnotationBody): string {
	return body
		.map((block) => {
			if (block.type !== 'paragraph') {
				return '';
			}

			return block.segments
				.map((segment) => {
					if (segment.markStyles.length === 0) {
						return segment.text;
					}

					let wrapped = segment.text;

					for (let i = segment.markStyles.length - 1; i >= 0; i -= 1) {
						const style = segment.markStyles[i];
						wrapped = `[${style}]${wrapped}[/${style}]`;
					}

					return wrapped;
				})
				.join('');
		})
		.join('\n\n');
}

function parseParagraphSegments(paragraph: string): AnnotationTextSegment[] {
	const segments: AnnotationTextSegment[] = [];
	const styleStack: AnnotationMarkStyle[] = [];
	let cursor = 0;

	while (cursor < paragraph.length) {
		if (paragraph[cursor] === '[') {
			const closer = matchCloserAt(paragraph, cursor);

			if (closer) {
				const top = styleStack[styleStack.length - 1];

				if (top === closer.style) {
					styleStack.pop();
					cursor += closer.tag.length;
					continue;
				}
			}

			const opener = matchOpenerAt(paragraph, cursor);

			if (opener) {
				styleStack.push(opener.style);
				cursor += opener.tag.length;
				continue;
			}
		}

		const nextBracket = paragraph.indexOf('[', cursor + 1);
		const end = nextBracket === -1 ? paragraph.length : nextBracket;

		appendSegment(segments, paragraph.slice(cursor, end), styleStack);
		cursor = end;
	}

	return segments;
}

function matchOpenerAt(
	paragraph: string,
	cursor: number
): { tag: string; style: AnnotationMarkStyle } | null {
	for (const style of ANNOTATION_MARK_STYLES) {
		const tag = `[${style}]`;

		if (paragraph.startsWith(tag, cursor)) {
			return { tag, style };
		}
	}

	return null;
}

function matchCloserAt(
	paragraph: string,
	cursor: number
): { tag: string; style: AnnotationMarkStyle } | null {
	for (const style of ANNOTATION_MARK_STYLES) {
		const tag = `[/${style}]`;

		if (paragraph.startsWith(tag, cursor)) {
			return { tag, style };
		}
	}

	return null;
}

function appendSegment(
	segments: AnnotationTextSegment[],
	text: string,
	markStyles: AnnotationMarkStyle[]
): void {
	if (text.length === 0) {
		return;
	}

	const last = segments[segments.length - 1];

	if (
		last &&
		last.markStyles.length === markStyles.length &&
		last.markStyles.every((style, index) => style === markStyles[index])
	) {
		last.text += text;
		return;
	}

	segments.push({ text, markStyles: [...markStyles] });
}
