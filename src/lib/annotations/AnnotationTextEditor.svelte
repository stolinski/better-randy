<script lang="ts">
	import { tick } from 'svelte';

	import {
		ANNOTATION_MARK_ATTRIBUTE,
		ANNOTATION_MARK_STYLES,
		DECORATIVE_ANNOTATION_STYLES,
		FOCAL_ANNOTATION_STYLES,
		isAnnotationMarkStyle,
		type AnnotationMarkStyle
	} from '$lib/annotations/annotation-mark-styles';
	import type {
		AnnotationBody,
		AnnotationMarkColors
	} from '$lib/annotations/annotation-marks';
	import {
		getEditorSelection,
		renderEditorBody,
		serializeEditorBody,
		setEditorSelection,
		splitParagraphAt,
		toggleMarkInBody,
		type EditorSelection
	} from '$lib/annotations/annotation-text-dom';

	interface Props {
		body?: AnnotationBody;
		colors?: AnnotationMarkColors;
		label?: string;
		rows?: number;
	}

	const DEFAULT_ANNOTATION_MARK_COLORS: AnnotationMarkColors = {
		circle: '#de263a',
		highlight: '#ffd642',
		strike: '#de263a',
		underline: '#1f5aff',
		box: '#1f5aff',
		'side-note': '#1f5aff',
		magnify: '#1f5aff',
		'lift-out': '#1f5aff',
		'tear-out': '#1f5aff',
		isolate: '#1f5aff'
	};

	const MARK_TITLES: Record<AnnotationMarkStyle, string> = {
		highlight: 'Highlight selection',
		underline: 'Underline selection',
		strike: 'Strike selection',
		circle: 'Circle selection',
		box: 'Box selection',
		'side-note': 'Side note',
		magnify: 'Magnify selection',
		'lift-out': 'Lift selection out',
		'tear-out': 'Tear selection out',
		isolate: 'Isolate selection'
	};

	const DECORATIVE_BUTTONS = DECORATIVE_ANNOTATION_STYLES;
	const FOCAL_BUTTONS = FOCAL_ANNOTATION_STYLES;

	let {
		body = $bindable<AnnotationBody>([]),
		colors = DEFAULT_ANNOTATION_MARK_COLORS,
		label = 'Annotation text',
		rows = 10
	}: Props = $props();

	let editor = $state<HTMLDivElement | null>(null);
	let activeMarkStyle = $state<AnnotationMarkStyle | null>(null);
	let lastRenderedBody: AnnotationBody | null = null;
	let pendingSelection: EditorSelection | null = null;

	$effect(() => {
		function update(): void {
			activeMarkStyle = computeActiveMarkStyle();
		}

		document.addEventListener('selectionchange', update);

		return () => {
			document.removeEventListener('selectionchange', update);
		};
	});

	function computeActiveMarkStyle(): AnnotationMarkStyle | null {
		if (!editor) {
			return null;
		}

		const selection = window.getSelection();

		if (!selection || selection.rangeCount === 0) {
			return null;
		}

		const range = selection.getRangeAt(0);

		if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
			return null;
		}

		const startSpan = findMarkAncestor(range.startContainer);
		const endSpan = findMarkAncestor(range.endContainer);

		if (!startSpan || startSpan !== endSpan) {
			return null;
		}

		const style = startSpan.dataset.annotationMark;

		return isAnnotationMarkStyle(style) ? style : null;
	}

	function findMarkAncestor(node: Node): HTMLElement | null {
		let current: Node | null = node;

		while (current && current !== editor) {
			if (current.nodeType === Node.ELEMENT_NODE) {
				const element = current as HTMLElement;

				if (element.hasAttribute(ANNOTATION_MARK_ATTRIBUTE)) {
					return element;
				}
			}

			current = current.parentNode;
		}

		return null;
	}

	function handleEditorClick(event: MouseEvent): void {
		if (!editor) {
			return;
		}

		const target = event.target;

		if (!(target instanceof Element)) {
			return;
		}

		const band = target.closest<HTMLElement>(`[${ANNOTATION_MARK_ATTRIBUTE}]`);

		if (!band || !editor.contains(band)) {
			return;
		}

		const selection = window.getSelection();

		if (!selection) {
			return;
		}

		if (selection.rangeCount > 0 && !selection.getRangeAt(0).collapsed) {
			return;
		}

		const range = document.createRange();
		range.selectNodeContents(band);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	$effect(() => {
		const incoming = body;
		for (const style of ANNOTATION_MARK_STYLES) {
			void colors[style];
		}

		if (!editor) {
			return;
		}

		if (incoming === lastRenderedBody && editor.childNodes.length > 0) {
			refreshExistingBandColors();
			return;
		}

		renderEditorBody(editor, incoming, colors);
		lastRenderedBody = incoming;
	});

	function refreshExistingBandColors(): void {
		if (!editor) {
			return;
		}

		const bands = editor.querySelectorAll<HTMLElement>('[data-annotation-mark]');

		for (const band of bands) {
			const style = band.dataset.annotationMark;

			if (isAnnotationMarkStyle(style)) {
				band.style.setProperty('--annotation-color', colors[style]);
			}
		}
	}

	function handleInput(): void {
		if (!editor) {
			return;
		}

		const next = serializeEditorBody(editor);

		lastRenderedBody = next;
		body = next;
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			splitCurrentParagraph();
			return;
		}

		if ((event.ctrlKey || event.metaKey) && ['b', 'i', 'u'].includes(event.key.toLowerCase())) {
			event.preventDefault();
		}
	}

	function splitCurrentParagraph(): void {
		if (!editor) {
			return;
		}

		const current = getEditorSelection(editor);

		if (!current) {
			return;
		}

		const currentBody = serializeEditorBody(editor);
		const next = splitParagraphAt(currentBody, current.paragraphIndex, current.start);

		renderEditorBody(editor, next, colors);
		lastRenderedBody = next;
		body = next;

		const targetSelection: EditorSelection = {
			paragraphIndex: current.paragraphIndex + 1,
			start: 0,
			end: 0
		};
		pendingSelection = targetSelection;

		tick()
			.then(() => {
				if (!editor) {
					return;
				}

				editor.focus();
				setEditorSelection(editor, targetSelection);
			})
			.catch((error: unknown) => {
				console.error('Unable to restore annotation editor selection.', error);
			});
	}

	function handlePaste(event: ClipboardEvent): void {
		event.preventDefault();
		const text = event.clipboardData?.getData('text/plain') ?? '';

		if (text.length === 0) {
			return;
		}

		insertTextAtSelection(text);
		handleInput();
	}

	function insertTextAtSelection(text: string): void {
		const selection = window.getSelection();

		if (!selection || selection.rangeCount === 0) {
			return;
		}

		const range = selection.getRangeAt(0);
		range.deleteContents();
		const node = document.createTextNode(text);
		range.insertNode(node);
		range.setStartAfter(node);
		range.collapse(true);
		selection.removeAllRanges();
		selection.addRange(range);
	}

	function rememberSelection(): void {
		if (!editor) {
			return;
		}

		const current = getEditorSelection(editor);

		if (current) {
			pendingSelection = current;
		}
	}

	function applyMark(style: AnnotationMarkStyle): void {
		if (!editor) {
			return;
		}

		const current = getEditorSelection(editor) ?? pendingSelection;

		if (!current || current.start === current.end) {
			return;
		}

		const next = toggleMarkInBody(body, current, style);

		renderEditorBody(editor, next.body, colors);
		lastRenderedBody = next.body;
		body = next.body;
		pendingSelection = next.selection;

		tick()
			.then(() => {
				if (!editor) {
					return;
				}

				editor.focus();
				setEditorSelection(editor, next.selection);
			})
			.catch((error: unknown) => {
				console.error('Unable to restore annotation editor selection.', error);
			});
	}

	function handleMarkButtonMousedown(event: MouseEvent): void {
		event.preventDefault();
		rememberSelection();
	}
</script>

{#snippet markButton(style: AnnotationMarkStyle)}
	<span class="tooltip">
	<button
		aria-label={MARK_TITLES[style]}
		class="annotation-mark-button"
		class:active={activeMarkStyle === style}
		onclick={() => applyMark(style)}
		onmousedown={handleMarkButtonMousedown}
		style:--annotation-color={colors[style]}
		type="button"
	>
		{#if style === 'highlight'}
			<svg aria-hidden="true" focusable="false" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
				<g fill="currentColor">
					<path d="m5.3813,15.1196l-2-2c-.1953-.1953-.5117-.1953-.707,0l-1.5269,1.5269c-.123.123-.1733.3018-.1323.4712.041.1689.167.3052.333.3584l3.0269.9731c.0498.0161.1016.0239.1528.0239.1304,0,.2583-.0513.3535-.1465l.5-.5c.1953-.1953.1953-.5117,0-.707Z" stroke-width="0" />
					<path d="m16.3799,4.71l-2.5869-2.5879c-.8496-.8501-2.333-.8525-3.1826-.0005l-4.2949,4.2954c-.4199.4199-.6973.9751-.7803,1.5645l-.1152.8311-1.293,1.293c-.4873.4873-.4873,1.2803,0,1.7676l2.501,2.5024c.2432.2437.5635.3657.8838.3657s.6406-.1221.8838-.3657l1.2881-1.2881.8418-.1201c.5859-.0835,1.1396-.3599,1.5566-.7783l4.2988-4.2979c.875-.8774.875-2.3042-.001-3.1812Z" opacity=".4" stroke-width="0" />
					<path d="m10.4424,8.8091c-.1924,0-.3838-.0732-.5303-.2197-.293-.293-.293-.7676,0-1.0605l4.1172-4.1182c.293-.293.7676-.293,1.0605,0s.293.7676,0,1.0605l-4.1172,4.1182c-.1465.1465-.3379.2197-.5303.2197Z" stroke-width="0" />
				</g>
			</svg>
		{:else if style === 'underline'}
			<svg aria-hidden="true" focusable="false" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
				<g fill="currentColor">
					<path clip-rule="evenodd" d="M5.25 2C5.66421 2 6 2.33579 6 2.75V8.5C6 10.1558 7.34336 11.5 9 11.5C10.6566 11.5 12 10.1558 12 8.5V2.75C12 2.33579 12.3358 2 12.75 2C13.1642 2 13.5 2.33579 13.5 2.75V8.5C13.5 10.984 11.4854 13 9 13C6.51464 13 4.5 10.984 4.5 8.5V2.75C4.5 2.33579 4.83579 2 5.25 2Z" fill-rule="evenodd" />
					<path clip-rule="evenodd" d="M2 15.25C2 14.8358 2.33579 14.5 2.75 14.5H15.25C15.6642 14.5 16 14.8358 16 15.25C16 15.6642 15.6642 16 15.25 16H2.75C2.33579 16 2 15.6642 2 15.25Z" fill-opacity="0.4" fill-rule="evenodd" />
				</g>
			</svg>
		{:else if style === 'strike'}
			<svg aria-hidden="true" focusable="false" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
				<g fill="currentColor">
					<path d="M6.20644 2.27445C7.22098 1.66875 8.41002 1.5 9.07898 1.5C10.4917 1.5 12.4859 2.01915 13.4649 4.33832C13.626 4.71992 13.4473 5.15986 13.0657 5.32096C12.684 5.48205 12.2441 5.30329 12.083 4.92168C11.424 3.36065 10.1442 3 9.07898 3C8.58977 3 7.69007 3.13568 6.97535 3.56238C6.62805 3.76972 6.34709 4.03194 6.16345 4.35919C5.98337 4.6801 5.87111 5.10866 5.92783 5.69898C6.00062 6.45653 6.37892 6.96692 6.94255 7.345C7.60986 7.79262 8.39976 7.99388 9.1808 8.13427L9.18082 8.13428C9.37888 8.16988 9.61364 8.21208 9.85488 8.27239C10.2567 8.37285 10.501 8.78006 10.4006 9.1819C10.3001 9.58375 10.0103 9.69846 9.60845 9.598C9.41892 9.55062 9.11682 9.64693 8.91336 9.61026L8.84691 9.59827C7.96558 9.44061 6.94743 9.15449 6.10695 8.5907C5.23998 8.00914 4.55792 7.12489 4.43471 5.84244C4.35154 4.97683 4.51179 4.23735 4.85533 3.62513C5.19532 3.01927 5.68912 2.5833 6.20644 2.27445Z" fill-opacity="0.4" />
					<path clip-rule="evenodd" d="M13.0672 11.2533C13.4795 11.214 13.8456 11.5165 13.8849 11.9288C13.8943 12.0276 13.9003 12.1288 13.9028 12.2325C13.9676 14.8775 11.5979 16.5 9.07897 16.5C7.90936 16.5 6.84447 16.273 5.97291 15.7286C5.08698 15.1753 4.46412 14.3332 4.12753 13.2286C4.00678 12.8324 4.2301 12.4133 4.62633 12.2926C5.02255 12.1718 5.44164 12.3951 5.56238 12.7914C5.80479 13.5868 6.22044 14.1147 6.76751 14.4564C7.32896 14.807 8.09157 15 9.07897 15C11.074 15 12.4403 13.7834 12.4032 12.2684C12.4016 12.2003 12.3976 12.134 12.3916 12.071C12.3524 11.6586 12.6548 11.2925 13.0672 11.2533Z" fill-opacity="0.4" fill-rule="evenodd" />
					<path clip-rule="evenodd" d="M1.25 9C1.25 8.58579 1.58579 8.25 2 8.25H16C16.4142 8.25 16.75 8.58579 16.75 9C16.75 9.41421 16.4142 9.75 16 9.75H2C1.58579 9.75 1.25 9.41421 1.25 9Z" fill-rule="evenodd" />
				</g>
			</svg>
		{:else if style === 'circle'}
			<svg aria-hidden="true" focusable="false" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
				<circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.75" />
			</svg>
		{:else if style === 'box'}
			<svg aria-hidden="true" focusable="false" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
				<rect x="3" y="3" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.75" />
			</svg>
		{:else if style === 'side-note'}
			<svg aria-hidden="true" focusable="false" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
				<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
					<path d="M2 5h7" />
					<path d="M2 9h5" />
					<path d="M11 4l4 4-4 4" />
					<path d="M9 14h7" />
				</g>
			</svg>
		{:else if style === 'magnify'}
			<svg aria-hidden="true" focusable="false" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
				<g fill="currentColor">
					<path fill-rule="evenodd" clip-rule="evenodd" d="M4.75 3.5C4.05921 3.5 3.5 4.05921 3.5 4.75V6.75C3.5 7.16421 3.16421 7.5 2.75 7.5C2.33579 7.5 2 7.16421 2 6.75V4.75C2 3.23079 3.23079 2 4.75 2H6.75C7.16421 2 7.5 2.33579 7.5 2.75C7.5 3.16421 7.16421 3.5 6.75 3.5H4.75Z" fill-opacity="0.4" />
					<path fill-rule="evenodd" clip-rule="evenodd" d="M10.5 2.75C10.5 2.33579 10.8358 2 11.25 2H13.25C14.7692 2 16 3.23079 16 4.75V6.75C16 7.16421 15.6642 7.5 15.25 7.5C14.8358 7.5 14.5 7.16421 14.5 6.75V4.75C14.5 4.05921 13.9408 3.5 13.25 3.5H11.25C10.8358 3.5 10.5 3.16421 10.5 2.75Z" fill-opacity="0.4" />
					<path fill-rule="evenodd" clip-rule="evenodd" d="M2.75 10.5C3.16421 10.5 3.5 10.8358 3.5 11.25V13.25C3.5 13.9408 4.05921 14.5 4.75 14.5H6.75C7.16421 14.5 7.5 14.8358 7.5 15.25C7.5 15.6642 7.16421 16 6.75 16H4.75C3.23079 16 2 14.7692 2 13.25V11.25C2 10.8358 2.33579 10.5 2.75 10.5Z" fill-opacity="0.4" />
					<path fill-rule="evenodd" clip-rule="evenodd" d="M9 5C6.79077 5 5 6.7909 5 9C5 11.2091 6.79077 13 9 13C9.83355 13 10.6075 12.745 11.2482 12.3089L13.9697 15.0303C14.2626 15.3232 14.7374 15.3232 15.0303 15.0303C15.3232 14.7374 15.3232 14.2626 15.0303 13.9697L12.3089 11.2482C12.7451 10.6075 13 9.83352 13 9C13 6.7909 11.2092 5 9 5ZM6.5 9C6.5 7.6193 7.61923 6.5 9 6.5C10.3808 6.5 11.5 7.6193 11.5 9C11.5 10.3807 10.3808 11.5 9 11.5C7.61923 11.5 6.5 10.3807 6.5 9Z" />
				</g>
			</svg>
		{:else if style === 'lift-out'}
			<svg aria-hidden="true" focusable="false" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
				<g fill="currentColor">
					<rect x="1" y="2.5" width="16" height="13" rx="2.75" ry="2.75" opacity=".4" stroke-width="0" />
					<path d="m9.5303,5.7197c-.293-.293-.7676-.293-1.0605,0l-2.5,2.5c-.293.293-.293.7676,0,1.0605s.7676.293,1.0605,0l1.2197-1.2197v3.9395c0,.4141.3359.75.75.75s.75-.3359.75-.75v-3.9395l1.2197,1.2197c.1465.1465.3379.2197.5303.2197s.3838-.0732.5303-.2197c.293-.293.293-.7676,0-1.0605l-2.5-2.5Z" stroke-width="0" />
				</g>
			</svg>
		{:else if style === 'tear-out'}
			<svg aria-hidden="true" focusable="false" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
				<g fill="currentColor">
					<path d="M2.5 2.97739H15.5V16.25C15.5 16.5147 15.3605 16.7598 15.1328 16.8949C14.9052 17.0301 14.6232 17.0352 14.3909 16.9084L11.9849 15.5961L9.33541 16.9208C9.12426 17.0264 8.87574 17.0264 8.66459 16.9208L6.0151 15.5961L3.60914 16.9084C3.37676 17.0352 3.09477 17.0301 2.86715 16.8949C2.63953 16.7598 2.5 16.5147 2.5 16.25V2.97739Z" fill-opacity="0.4" />
					<path fill-rule="evenodd" clip-rule="evenodd" d="M11 11.25C11 10.8358 11.3358 10.5 11.75 10.5H12.25C12.6642 10.5 13 10.8358 13 11.25C13 11.6642 12.6642 12 12.25 12H11.75C11.3358 12 11 11.6642 11 11.25Z" />
					<path fill-rule="evenodd" clip-rule="evenodd" d="M1 2.75C1 2.33579 1.33579 2 1.75 2H16.25C16.6642 2 17 2.33579 17 2.75C17 3.16421 16.6642 3.5 16.25 3.5H1.75C1.33579 3.5 1 3.16421 1 2.75Z" />
					<path fill-rule="evenodd" clip-rule="evenodd" d="M5 11.25C5 10.8358 5.33579 10.5 5.75 10.5H9.25C9.66421 10.5 10 10.8358 10 11.25C10 11.6642 9.66421 12 9.25 12H5.75C5.33579 12 5 11.6642 5 11.25Z" />
					<path fill-rule="evenodd" clip-rule="evenodd" d="M5 8.25C5 7.83579 5.33579 7.5 5.75 7.5H9.25C9.66421 7.5 10 7.83579 10 8.25C10 8.66421 9.66421 9 9.25 9H5.75C5.33579 9 5 8.66421 5 8.25Z" />
					<path fill-rule="evenodd" clip-rule="evenodd" d="M11 8.25C11 7.83579 11.3358 7.5 11.75 7.5H12.25C12.6642 7.5 13 7.83579 13 8.25C13 8.66421 12.6642 9 12.25 9H11.75C11.3358 9 11 8.66421 11 8.25Z" />
				</g>
			</svg>
		{:else if style === 'isolate'}
			<svg aria-hidden="true" focusable="false" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
				<g fill="currentColor">
					<path opacity="0.4" d="M2.75012 5.5C3.16422 5.5 3.50012 5.1641 3.50012 4.75C3.50012 4.0605 4.06062 3.5 4.75012 3.5C5.16422 3.5 5.50012 3.1641 5.50012 2.75C5.50012 2.3359 5.16422 2 4.75012 2C3.23352 2 2.00012 3.2334 2.00012 4.75C2.00012 5.1641 2.33602 5.5 2.75012 5.5Z" />
					<path opacity="0.4" d="M13.2501 2C12.836 2 12.5001 2.3359 12.5001 2.75C12.5001 3.1641 12.836 3.5 13.2501 3.5C13.9396 3.5 14.5001 4.0605 14.5001 4.75C14.5001 5.1641 14.836 5.5 15.2501 5.5C15.6642 5.5 16.0001 5.1641 16.0001 4.75C16.0001 3.2334 14.7667 2 13.2501 2Z" />
					<path opacity="0.4" d="M15.2501 12.5C14.836 12.5 14.5001 12.8359 14.5001 13.25C14.5001 13.9395 13.9396 14.5 13.2501 14.5C12.836 14.5 12.5001 14.8359 12.5001 15.25C12.5001 15.6641 12.836 16 13.2501 16C14.7667 16 16.0001 14.7666 16.0001 13.25C16.0001 12.8359 15.6642 12.5 15.2501 12.5Z" />
					<path opacity="0.4" d="M4.75012 14.5C4.06062 14.5 3.50012 13.9395 3.50012 13.25C3.50012 12.8359 3.16422 12.5 2.75012 12.5C2.33602 12.5 2.00012 12.8359 2.00012 13.25C2.00012 14.7666 3.23352 16 4.75012 16C5.16422 16 5.50012 15.6641 5.50012 15.25C5.50012 14.8359 5.16422 14.5 4.75012 14.5Z" />
					<path opacity="0.4" d="M7.75012 3.5H10.2501C10.6642 3.5 11.0001 3.1641 11.0001 2.75C11.0001 2.3359 10.6642 2 10.2501 2H7.75012C7.33602 2 7.00012 2.3359 7.00012 2.75C7.00012 3.1641 7.33602 3.5 7.75012 3.5Z" />
					<path opacity="0.4" d="M10.2501 14.5H7.75012C7.33602 14.5 7.00012 14.8359 7.00012 15.25C7.00012 15.6641 7.33602 16 7.75012 16H10.2501C10.6642 16 11.0001 15.6641 11.0001 15.25C11.0001 14.8359 10.6642 14.5 10.2501 14.5Z" />
					<path opacity="0.4" d="M15.2501 7C14.836 7 14.5001 7.3359 14.5001 7.75V10.25C14.5001 10.6641 14.836 11 15.2501 11C15.6642 11 16.0001 10.6641 16.0001 10.25V7.75C16.0001 7.3359 15.6642 7 15.2501 7Z" />
					<path opacity="0.4" d="M2.75012 11C3.16422 11 3.50012 10.6641 3.50012 10.25V7.75C3.50012 7.3359 3.16422 7 2.75012 7C2.33602 7 2.00012 7.3359 2.00012 7.75V10.25C2.00012 10.6641 2.33602 11 2.75012 11Z" />
					<path d="M12.2501 5H5.75012C5.33591 5 5.00012 5.33579 5.00012 5.75V12.25C5.00012 12.6642 5.33591 13 5.75012 13H12.2501C12.6643 13 13.0001 12.6642 13.0001 12.25V5.75C13.0001 5.33579 12.6643 5 12.2501 5Z" />
				</g>
			</svg>
		{/if}
	</button>
	<span class="tooltip-content">{MARK_TITLES[style]}</span>
	</span>
{/snippet}

<div class="annotation-editor stack">
	<div class="annotation-toolbar stack" aria-label={`${label} marks`}>
		<div class="annotation-toolbar-row cluster" aria-label="Decorative marks">
			{#each DECORATIVE_BUTTONS as style (style)}
				{@render markButton(style)}
			{/each}
		</div>
		<div class="annotation-toolbar-row cluster" aria-label="Focal marks">
			{#each FOCAL_BUTTONS as style (style)}
				{@render markButton(style)}
			{/each}
		</div>
	</div>

	<div
		aria-label={label}
		bind:this={editor}
		class="annotation-input fluid"
		contenteditable="true"
		onclick={handleEditorClick}
		oninput={handleInput}
		onkeydown={handleKeydown}
		onpaste={handlePaste}
		role="textbox"
		spellcheck="true"
		style:min-block-size={`${Math.max(2, rows) * 1.5}em`}
		tabindex="0"
	></div>
</div>

<style>
	.annotation-editor {
		--gap: var(--vs-xs);
		inline-size: 100%;
	}

	.annotation-toolbar {
		--gap: var(--vs-s);
	}

	.annotation-toolbar-row {
		background: var(--fg-05);
		border: var(--border-1);
		border-radius: var(--br-s);
		display: inline-flex;
		gap: 2px;
		padding: 3px;
	}

	.annotation-mark-button {
		align-items: center;
		background: transparent;
		border: 0;
		border-radius: var(--br-xs);
		color: var(--fg-9);
		display: inline-flex;
		inline-size: 28px;
		block-size: 28px;
		justify-content: center;
		min-inline-size: auto;
		padding: 0;
		transition: background-color 120ms ease;
	}

	.annotation-mark-button:hover {
		background: var(--fg-2);
	}

	.annotation-mark-button:active {
		background: var(--fg-3, var(--fg-2));
	}

	.annotation-mark-button.active {
		background: var(--fg-2);
		color: var(--annotation-color);
	}

	.annotation-mark-button svg {
		display: block;
	}

	.annotation-input {
		--fl: -1;
		background-color: var(--fg-05);
		border: var(--border-1);
		border-radius: var(--br-m);
		color: var(--fg);
		padding: var(--pad-s) var(--pad-m);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.annotation-input:focus-visible {
		outline: 2px solid var(--fg);
		outline-offset: 2px;
	}

	.annotation-input :global(.paragraph + .paragraph) {
		margin-block-start: 0.7em;
	}

	.annotation-input :global(.annotation-band) {
		background: color-mix(in srgb, var(--annotation-color) 32%, transparent);
		border-radius: var(--br-xs);
		box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--annotation-color) 60%, transparent);
		padding: 0 0.12em;
	}
</style>
