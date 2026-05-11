export interface WrappedTextSelection {
	value: string;
	selectionStart: number;
	selectionEnd: number;
}

interface WrapTextSelectionOptions {
	closer: string;
	opener: string;
	selectionEnd: number;
	selectionStart: number;
	value: string;
}

export function wrapTextSelection({
	closer,
	opener,
	selectionEnd,
	selectionStart,
	value
}: WrapTextSelectionOptions): WrappedTextSelection {
	const start = Math.min(selectionStart, selectionEnd);
	const end = Math.max(selectionStart, selectionEnd);
	const before = value.slice(0, start);
	const selected = value.slice(start, end);
	const after = value.slice(end);
	const nextValue = `${before}${opener}${selected}${closer}${after}`;
	const nextSelectionStart = start + opener.length;
	const nextSelectionEnd = nextSelectionStart + selected.length;

	return {
		value: nextValue,
		selectionStart: nextSelectionStart,
		selectionEnd: nextSelectionEnd
	};
}
