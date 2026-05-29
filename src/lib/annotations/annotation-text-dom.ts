import {
	ANNOTATION_MARK_ATTRIBUTE,
	isAnnotationMarkStyle,
	type AnnotationMarkStyle
} from './annotation-mark-styles';
import type {
	AnnotationBody,
	AnnotationMarkColors,
	AnnotationTextSegment,
	ParagraphBlock
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

	const paragraphs = body.length > 0 ? body : [{ type: 'paragraph' as const, segments: [] }];

	for (const block of paragraphs) {
		if (block.type !== 'paragraph') {
			continue;
		}

		root.appendChild(buildParagraphElement(block, colors));
	}
}

export function serializeEditorBody(root: HTMLElement): AnnotationBody {
	const result: AnnotationBody = [];

	for (const child of Array.from(root.children)) {
		if (!(child instanceof HTMLElement) || !child.classList.contains(PARAGRAPH_CLASS)) {
			continue;
		}

		result.push({ type: 'paragraph', segments: serializeParagraphSegments(child) });
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
	const block = body[selection.paragraphIndex];

	if (!block || block.type !== 'paragraph') {
		return { body, selection };
	}

	const segments = applyMarkToSegments(block.segments, selection, style);
	const nextBody: AnnotationBody = body.map((current, index) =>
		index === selection.paragraphIndex && current.type === 'paragraph'
			? { type: 'paragraph', segments }
			: current
	);

	return { body: nextBody, selection };
}

function buildParagraphElement(
	paragraph: ParagraphBlock,
	colors: AnnotationMarkColors
): HTMLDivElement {
	const div = document.createElement('div');
	div.className = PARAGRAPH_CLASS;

	for (const segment of paragraph.segments) {
		if (segment.markStyles.length === 0) {
			div.appendChild(document.createTextNode(segment.text));
			continue;
		}

		div.appendChild(buildSegmentElement(segment, colors));
	}

	if (div.childNodes.length === 0) {
		div.appendChild(document.createElement('br'));
	}

	return div;
}

function buildSegmentElement(
	segment: AnnotationTextSegment,
	colors: AnnotationMarkColors
): HTMLElement {
	// Nest one span per style so getClientRects works per-style.
	const inner = document.createTextNode(segment.text);
	let node: HTMLElement | null = null;
	let textHost: Node = inner;

	for (let i = 0; i < segment.markStyles.length; i += 1) {
		const style = segment.markStyles[i];
		const span = document.createElement('span');
		span.setAttribute(ANNOTATION_MARK_ATTRIBUTE, style);
		span.setAttribute('class', 'annotation-band');
		span.style.setProperty('--annotation-color', colors[style]);

		if (i === 0) {
			span.appendChild(textHost);
		} else {
			span.appendChild(node as HTMLElement);
		}

		node = span;
		textHost = span;
	}

	return node ?? document.createElement('span');
}

function serializeParagraphSegments(paragraph: HTMLElement): AnnotationTextSegment[] {
	const segments: AnnotationTextSegment[] = [];
	walkSegments(paragraph, [], segments);
	return coalesce(segments);
}

function walkSegments(
	node: Node,
	styleStack: AnnotationMarkStyle[],
	output: AnnotationTextSegment[]
): void {
	for (const child of Array.from(node.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) {
			appendSegmentText(output, child.textContent ?? '', styleStack);
			continue;
		}

		if (!(child instanceof HTMLElement)) {
			continue;
		}

		if (child.tagName === 'BR') {
			continue;
		}

		const attr = child.getAttribute(ANNOTATION_MARK_ATTRIBUTE) ?? undefined;
		const nextStack = isAnnotationMarkStyle(attr) && !styleStack.includes(attr)
			? [...styleStack, attr]
			: styleStack;

		walkSegments(child, nextStack, output);
	}
}

function appendSegmentText(
	segments: AnnotationTextSegment[],
	text: string,
	markStyles: AnnotationMarkStyle[]
): void {
	if (text.length === 0) {
		return;
	}

	const last = segments[segments.length - 1];

	if (last && stylesEqual(last.markStyles, markStyles)) {
		last.text += text;
		return;
	}

	segments.push({ text, markStyles: [...markStyles] });
}

function stylesEqual(a: AnnotationMarkStyle[], b: AnnotationMarkStyle[]): boolean {
	if (a.length !== b.length) {
		return false;
	}

	for (let i = 0; i < a.length; i += 1) {
		if (a[i] !== b[i]) {
			return false;
		}
	}

	return true;
}

function applyMarkToSegments(
	segments: AnnotationTextSegment[],
	selection: EditorSelection,
	style: AnnotationMarkStyle
): AnnotationTextSegment[] {
	const characters: AnnotationTextSegment[] = [];

	for (const segment of segments) {
		for (const character of segment.text) {
			characters.push({ text: character, markStyles: [...segment.markStyles] });
		}
	}

	const start = Math.max(0, Math.min(selection.start, characters.length));
	const end = Math.max(start, Math.min(selection.end, characters.length));

	if (end === start) {
		return coalesce(characters);
	}

	const allAlreadyStyled = characters
		.slice(start, end)
		.every((character) => character.markStyles.includes(style));

	for (let index = start; index < end; index += 1) {
		const current = characters[index].markStyles;
		const nextStyles = allAlreadyStyled
			? current.filter((existing) => existing !== style)
			: current.includes(style)
				? current
				: [...current, style];

		characters[index] = { text: characters[index].text, markStyles: nextStyles };
	}

	return coalesce(characters);
}

function coalesce(characters: AnnotationTextSegment[]): AnnotationTextSegment[] {
	const result: AnnotationTextSegment[] = [];

	for (const character of characters) {
		const last = result[result.length - 1];

		if (last && stylesEqual(last.markStyles, character.markStyles)) {
			last.text += character.text;
			continue;
		}

		result.push({ text: character.text, markStyles: [...character.markStyles] });
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
	const block = body[paragraphIndex];

	if (!block || block.type !== 'paragraph') {
		return body;
	}

	const left: AnnotationTextSegment[] = [];
	const right: AnnotationTextSegment[] = [];
	let consumed = 0;

	for (const segment of block.segments) {
		const length = segment.text.length;

		if (consumed + length <= offset) {
			left.push({ text: segment.text, markStyles: [...segment.markStyles] });
			consumed += length;
			continue;
		}

		if (consumed >= offset) {
			right.push({ text: segment.text, markStyles: [...segment.markStyles] });
			continue;
		}

		const splitAt = offset - consumed;
		left.push({ text: segment.text.slice(0, splitAt), markStyles: [...segment.markStyles] });
		right.push({ text: segment.text.slice(splitAt), markStyles: [...segment.markStyles] });
		consumed = offset + (length - splitAt);
	}

	const next: AnnotationBody = [
		...body.slice(0, paragraphIndex),
		{ type: 'paragraph', segments: left },
		{ type: 'paragraph', segments: right },
		...body.slice(paragraphIndex + 1)
	];

	return next;
}
