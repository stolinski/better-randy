import {
	ANNOTATION_MARK_ATTRIBUTE,
	isAnnotationMarkStyle,
	type AnnotatedTextParagraph,
	type AnnotationBody,
	type AnnotationMarkColors,
	type AnnotationMarkStyle,
	type AnnotationTextSegment
} from './annotation-marks';

export interface EditorSelection {
	end: number;
	paragraphIndex: number;
	start: number;
}

const PARAGRAPH_CLASS = 'paragraph';

export function renderEditorBody(
	root: HTMLElement,
	body: AnnotationBody,
	colors: AnnotationMarkColors
): void {
	root.replaceChildren();

	const paragraphs = body.length > 0 ? body : [{ segments: [] }];

	for (const paragraph of paragraphs) {
		root.appendChild(buildParagraphElement(paragraph, colors));
	}
}

export function serializeEditorBody(root: HTMLElement): AnnotationBody {
	const result: AnnotationBody = [];

	for (const child of Array.from(root.children)) {
		if (!(child instanceof HTMLElement) || !child.classList.contains(PARAGRAPH_CLASS)) {
			continue;
		}

		result.push({ segments: serializeParagraphSegments(child) });
	}

	return result;
}

export function getEditorSelection(root: HTMLElement): EditorSelection | null {
	const selection = window.getSelection();

	if (!selection || selection.rangeCount === 0) {
		return null;
	}

	const range = selection.getRangeAt(0);

	if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
		return null;
	}

	const startParagraph = findParagraph(root, range.startContainer);
	const endParagraph = findParagraph(root, range.endContainer);

	if (!startParagraph || startParagraph !== endParagraph) {
		return null;
	}

	const paragraphIndex = Array.prototype.indexOf.call(root.children, startParagraph);

	if (paragraphIndex < 0) {
		return null;
	}

	const startOffset = countTextBeforePosition(
		startParagraph,
		range.startContainer,
		range.startOffset
	);
	const endOffset = countTextBeforePosition(
		startParagraph,
		range.endContainer,
		range.endOffset
	);

	return {
		paragraphIndex,
		start: Math.min(startOffset, endOffset),
		end: Math.max(startOffset, endOffset)
	};
}

export function setEditorSelection(root: HTMLElement, target: EditorSelection): void {
	const paragraph = root.children[target.paragraphIndex];

	if (!(paragraph instanceof HTMLElement)) {
		return;
	}

	const startPosition = resolveTextPosition(paragraph, target.start, 'start');
	const endPosition = resolveTextPosition(paragraph, target.end, 'end');

	if (!startPosition || !endPosition) {
		return;
	}

	const range = document.createRange();
	range.setStart(startPosition.node, startPosition.offset);
	range.setEnd(endPosition.node, endPosition.offset);

	const selection = window.getSelection();

	if (!selection) {
		return;
	}

	selection.removeAllRanges();
	selection.addRange(range);
}

export function toggleMarkInBody(
	body: AnnotationBody,
	selection: EditorSelection,
	style: AnnotationMarkStyle
): { body: AnnotationBody; selection: EditorSelection } {
	const paragraph = body[selection.paragraphIndex];

	if (!paragraph) {
		return { body, selection };
	}

	const segments = applyMarkToSegments(paragraph.segments, selection, style);
	const nextBody: AnnotationBody = body.map((current, index) =>
		index === selection.paragraphIndex ? { segments } : current
	);

	return { body: nextBody, selection };
}

function buildParagraphElement(
	paragraph: AnnotatedTextParagraph,
	colors: AnnotationMarkColors
): HTMLDivElement {
	const div = document.createElement('div');
	div.className = PARAGRAPH_CLASS;

	for (const segment of paragraph.segments) {
		if (segment.markStyle === null) {
			div.appendChild(document.createTextNode(segment.text));
			continue;
		}

		const span = document.createElement('span');
		span.setAttribute(ANNOTATION_MARK_ATTRIBUTE, segment.markStyle);
		span.setAttribute('class', 'annotation-band');
		span.style.setProperty('--annotation-color', colors[segment.markStyle]);
		span.textContent = segment.text;
		div.appendChild(span);
	}

	if (div.childNodes.length === 0) {
		div.appendChild(document.createElement('br'));
	}

	return div;
}

function serializeParagraphSegments(paragraph: HTMLElement): AnnotationTextSegment[] {
	const segments: AnnotationTextSegment[] = [];

	for (const child of Array.from(paragraph.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) {
			appendSegmentText(segments, child.textContent ?? '', null);
			continue;
		}

		if (!(child instanceof HTMLElement)) {
			continue;
		}

		if (child.tagName === 'BR') {
			continue;
		}

		const markStyle = child.getAttribute(ANNOTATION_MARK_ATTRIBUTE) ?? undefined;
		const text = child.textContent ?? '';

		if (isAnnotationMarkStyle(markStyle)) {
			appendSegmentText(segments, text, markStyle);
			continue;
		}

		appendSegmentText(segments, text, null);
	}

	return segments;
}

function appendSegmentText(
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

function applyMarkToSegments(
	segments: AnnotationTextSegment[],
	selection: EditorSelection,
	style: AnnotationMarkStyle
): AnnotationTextSegment[] {
	const characters: AnnotationTextSegment[] = [];

	for (const segment of segments) {
		for (const character of segment.text) {
			characters.push({ text: character, markStyle: segment.markStyle });
		}
	}

	const start = Math.max(0, Math.min(selection.start, characters.length));
	const end = Math.max(start, Math.min(selection.end, characters.length));

	if (end === start) {
		return coalesce(characters);
	}

	const allAlreadyStyled = characters
		.slice(start, end)
		.every((character) => character.markStyle === style);
	const nextStyle: AnnotationMarkStyle | null = allAlreadyStyled ? null : style;

	for (let index = start; index < end; index += 1) {
		characters[index] = { text: characters[index].text, markStyle: nextStyle };
	}

	return coalesce(characters);
}

function coalesce(characters: AnnotationTextSegment[]): AnnotationTextSegment[] {
	const result: AnnotationTextSegment[] = [];

	for (const character of characters) {
		const last = result[result.length - 1];

		if (last && last.markStyle === character.markStyle) {
			last.text += character.text;
			continue;
		}

		result.push({ text: character.text, markStyle: character.markStyle });
	}

	return result;
}

function findParagraph(root: HTMLElement, node: Node): HTMLElement | null {
	let current: Node | null = node;

	while (current && current !== root) {
		if (current.nodeType === Node.ELEMENT_NODE) {
			const element = current as HTMLElement;

			if (element.classList.contains(PARAGRAPH_CLASS) && element.parentElement === root) {
				return element;
			}
		}

		current = current.parentNode;
	}

	return null;
}

function countTextBeforePosition(root: Node, target: Node, targetOffset: number): number {
	let count = 0;
	let stopped = false;

	function recurse(node: Node): void {
		if (stopped) {
			return;
		}

		if (node === target) {
			if (node.nodeType === Node.TEXT_NODE) {
				count += Math.min(targetOffset, node.textContent?.length ?? 0);
			} else {
				const limit = Math.min(targetOffset, node.childNodes.length);

				for (let index = 0; index < limit; index += 1) {
					count += node.childNodes[index].textContent?.length ?? 0;
				}
			}

			stopped = true;
			return;
		}

		if (node.nodeType === Node.TEXT_NODE) {
			count += node.textContent?.length ?? 0;
			return;
		}

		if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
			return;
		}

		for (const child of Array.from(node.childNodes)) {
			recurse(child);

			if (stopped) {
				return;
			}
		}
	}

	recurse(root);

	return count;
}

function resolveTextPosition(
	root: HTMLElement,
	target: number,
	prefer: 'start' | 'end'
): { node: Node; offset: number } | null {
	let remaining = Math.max(0, target);
	let result: { node: Node; offset: number } | null = null;
	let fallback: { node: Node; offset: number } | null = null;

	function recurse(node: Node): boolean {
		if (node.nodeType === Node.TEXT_NODE) {
			const length = node.textContent?.length ?? 0;
			const fitsStrictly = remaining < length;
			const fitsAtBoundary = remaining === length;

			if (fitsStrictly || (fitsAtBoundary && prefer === 'end')) {
				result = { node, offset: remaining };
				return true;
			}

			if (fitsAtBoundary) {
				fallback = { node, offset: length };
			}

			remaining -= length;
			return false;
		}

		if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === 'BR') {
			return false;
		}

		for (const child of Array.from(node.childNodes)) {
			if (recurse(child)) {
				return true;
			}
		}

		return false;
	}

	recurse(root);

	if (result) {
		return result;
	}

	if (fallback) {
		return fallback;
	}

	return { node: root, offset: root.childNodes.length };
}

export function splitParagraphAt(
	body: AnnotationBody,
	paragraphIndex: number,
	offset: number
): AnnotationBody {
	const paragraph = body[paragraphIndex];

	if (!paragraph) {
		return body;
	}

	const left: AnnotationTextSegment[] = [];
	const right: AnnotationTextSegment[] = [];
	let consumed = 0;

	for (const segment of paragraph.segments) {
		const length = segment.text.length;

		if (consumed + length <= offset) {
			left.push({ ...segment });
			consumed += length;
			continue;
		}

		if (consumed >= offset) {
			right.push({ ...segment });
			continue;
		}

		const splitAt = offset - consumed;
		left.push({ text: segment.text.slice(0, splitAt), markStyle: segment.markStyle });
		right.push({ text: segment.text.slice(splitAt), markStyle: segment.markStyle });
		consumed = offset + (length - splitAt);
	}

	const next: AnnotationBody = [
		...body.slice(0, paragraphIndex),
		{ segments: left },
		{ segments: right },
		...body.slice(paragraphIndex + 1)
	];

	return next;
}
