import type {
	AnnotationBody,
	AnnotationMarkStyle,
	AnnotationTextSegment
} from './annotation-marks';

const ANNOTATION_MARK_STYLES: readonly AnnotationMarkStyle[] = [
	'highlight',
	'underline',
	'strike',
	'circle'
];

export function parseAnnotationBodyText(text: string): AnnotationBody {
	return text
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0)
		.map((paragraph) => ({ segments: parseParagraphSegments(paragraph) }));
}

export function serializeAnnotationBodyToText(body: AnnotationBody): string {
	return body
		.map((paragraph) =>
			paragraph.segments
				.map((segment) => {
					if (segment.markStyle === null) {
						return segment.text;
					}

					return `[${segment.markStyle}]${segment.text}[/${segment.markStyle}]`;
				})
				.join('')
		)
		.join('\n\n');
}

function parseParagraphSegments(paragraph: string): AnnotationTextSegment[] {
	const segments: AnnotationTextSegment[] = [];
	let cursor = 0;

	while (cursor < paragraph.length) {
		if (paragraph[cursor] === '[') {
			const tagMatch = matchOpenerAt(paragraph, cursor);

			if (tagMatch) {
				const closer = `[/${tagMatch.style}]`;
				const contentStart = cursor + tagMatch.opener.length;
				const closerIndex = paragraph.indexOf(closer, contentStart);

				if (closerIndex !== -1) {
					const inner = paragraph.slice(contentStart, closerIndex);

					if (inner.length > 0) {
						appendSegment(segments, inner, tagMatch.style);
					}

					cursor = closerIndex + closer.length;
					continue;
				}
			}
		}

		const nextBracket = paragraph.indexOf('[', cursor + 1);
		const end = nextBracket === -1 ? paragraph.length : nextBracket;

		appendSegment(segments, paragraph.slice(cursor, end), null);
		cursor = end;
	}

	return segments;
}

function matchOpenerAt(
	paragraph: string,
	cursor: number
): { opener: string; style: AnnotationMarkStyle } | null {
	for (const style of ANNOTATION_MARK_STYLES) {
		const opener = `[${style}]`;

		if (paragraph.startsWith(opener, cursor)) {
			return { opener, style };
		}
	}

	return null;
}

function appendSegment(
	segments: AnnotationTextSegment[],
	text: string,
	markStyle: AnnotationMarkStyle | null
): void {
	if (text.length === 0) {
		return;
	}

	const last = segments[segments.length - 1];

	if (last && last.markStyle === markStyle) {
		last.text += text;
		return;
	}

	segments.push({ text, markStyle });
}
