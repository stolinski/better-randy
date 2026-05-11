import type { ResearchPaperMarkStyle } from './research-paper-state.svelte';

export interface ResearchPaperMarkDelimiters {
	closer: string;
	opener: string;
}

export interface ResearchPaperTextSegment {
	markStyle: ResearchPaperMarkStyle | null;
	text: string;
}

export interface ResearchPaperParagraph {
	segments: ResearchPaperTextSegment[];
}

interface ResearchPaperMarkSyntax extends ResearchPaperMarkDelimiters {
	style: ResearchPaperMarkStyle;
}

const RESEARCH_PAPER_MARK_SYNTAX: ResearchPaperMarkSyntax[] = [
	{
		style: 'highlight',
		opener: '==',
		closer: '=='
	},
	{
		style: 'underline',
		opener: '__',
		closer: '__'
	},
	{
		style: 'strike',
		opener: '~~',
		closer: '~~'
	},
	{
		style: 'circle',
		opener: '((',
		closer: '))'
	}
];

export function getResearchPaperMarkDelimiters(
	style: ResearchPaperMarkStyle
): ResearchPaperMarkDelimiters {
	const syntax = RESEARCH_PAPER_MARK_SYNTAX.find((item) => item.style === style);

	if (!syntax) {
		throw new TypeError(`Unknown research paper mark style: ${style}`);
	}

	return {
		opener: syntax.opener,
		closer: syntax.closer
	};
}

export function isResearchPaperMarkStyle(
	value: string | undefined
): value is ResearchPaperMarkStyle {
	return RESEARCH_PAPER_MARK_SYNTAX.some((syntax) => syntax.style === value);
}

function getResearchPaperTextSegments(paragraph: string): ResearchPaperTextSegment[] {
	const segments: ResearchPaperTextSegment[] = [];
	let cursor = 0;

	while (cursor < paragraph.length) {
		const syntax = RESEARCH_PAPER_MARK_SYNTAX.find((item) =>
			paragraph.startsWith(item.opener, cursor)
		);

		if (!syntax) {
			const nextMarkIndex = RESEARCH_PAPER_MARK_SYNTAX.reduce((nearestIndex, item) => {
				const index = paragraph.indexOf(item.opener, cursor + 1);

				if (index === -1) {
					return nearestIndex;
				}

				return nearestIndex === -1 ? index : Math.min(nearestIndex, index);
			}, -1);
			const end = nextMarkIndex === -1 ? paragraph.length : nextMarkIndex;

			segments.push({
				text: paragraph.slice(cursor, end),
				markStyle: null
			});
			cursor = end;
			continue;
		}

		const markStart = cursor + syntax.opener.length;
		const markEnd = paragraph.indexOf(syntax.closer, markStart);

		if (markEnd === -1) {
			segments.push({
				text: syntax.opener,
				markStyle: null
			});
			cursor += syntax.opener.length;
			continue;
		}

		const markedText = paragraph.slice(markStart, markEnd);

		if (markedText.length > 0) {
			segments.push({
				text: markedText,
				markStyle: syntax.style
			});
		}

		cursor = markEnd + syntax.closer.length;
	}

	return segments;
}

export function getResearchPaperParagraphs(body: string): ResearchPaperParagraph[] {
	return body
		.split(/\n{2,}/)
		.map((paragraph) => paragraph.trim())
		.filter((paragraph) => paragraph.length > 0)
		.map((paragraph) => ({
			segments: getResearchPaperTextSegments(paragraph)
		}));
}

export function getResearchPaperSourceLabel(sourceUrl: string): string {
	const trimmedSourceUrl = sourceUrl.trim();

	if (!trimmedSourceUrl) {
		return 'Working paper';
	}

	try {
		return new URL(trimmedSourceUrl).hostname.replace(/^www\./, '');
	} catch {
		return trimmedSourceUrl;
	}
}
