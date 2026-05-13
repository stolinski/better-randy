<script lang="ts">
	import { tick } from 'svelte';

	import {
		ANNOTATION_MARK_ATTRIBUTE,
		isAnnotationMarkStyle,
		type AnnotationBody,
		type AnnotationMarkColors,
		type AnnotationMarkStyle
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
		underline: '#1f5aff'
	};

	const MARK_BUTTONS: { style: AnnotationMarkStyle; title: string }[] = [
		{ style: 'highlight', title: 'Highlight selection' },
		{ style: 'underline', title: 'Underline selection' },
		{ style: 'strike', title: 'Strike selection' },
		{ style: 'circle', title: 'Circle selection' }
	];

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
		const highlightColor = colors.highlight;
		const underlineColor = colors.underline;
		const strikeColor = colors.strike;
		const circleColor = colors.circle;
		void highlightColor;
		void underlineColor;
		void strikeColor;
		void circleColor;

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

			if (style === 'highlight' || style === 'underline' || style === 'strike' || style === 'circle') {
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

<div class="annotation-editor stack">
	<div class="annotation-toolbar cluster" aria-label={`${label} marks`}>
		{#each MARK_BUTTONS as { style, title } (style)}
			<button
				class="annotation-mark-button"
				class:active={activeMarkStyle === style}
				onclick={() => applyMark(style)}
				onmousedown={handleMarkButtonMousedown}
				style:--annotation-color={colors[style]}
				title={title}
				type="button"
			>
				{#if style === 'highlight'}
					<svg
						aria-hidden="true"
						focusable="false"
						height="18"
						viewBox="0 0 18 18"
						width="18"
						xmlns="http://www.w3.org/2000/svg"
					>
						<g fill="currentColor">
							<path
								d="m5.3813,15.1196l-2-2c-.1953-.1953-.5117-.1953-.707,0l-1.5269,1.5269c-.123.123-.1733.3018-.1323.4712.041.1689.167.3052.333.3584l3.0269.9731c.0498.0161.1016.0239.1528.0239.1304,0,.2583-.0513.3535-.1465l.5-.5c.1953-.1953.1953-.5117,0-.707Z"
								stroke-width="0"
							/>
							<path
								d="m16.3799,4.71l-2.5869-2.5879c-.8496-.8501-2.333-.8525-3.1826-.0005l-4.2949,4.2954c-.4199.4199-.6973.9751-.7803,1.5645l-.1152.8311-1.293,1.293c-.4873.4873-.4873,1.2803,0,1.7676l2.501,2.5024c.2432.2437.5635.3657.8838.3657s.6406-.1221.8838-.3657l1.2881-1.2881.8418-.1201c.5859-.0835,1.1396-.3599,1.5566-.7783l4.2988-4.2979c.875-.8774.875-2.3042-.001-3.1812Z"
								opacity=".4"
								stroke-width="0"
							/>
							<path
								d="m10.4424,8.8091c-.1924,0-.3838-.0732-.5303-.2197-.293-.293-.293-.7676,0-1.0605l4.1172-4.1182c.293-.293.7676-.293,1.0605,0s.293.7676,0,1.0605l-4.1172,4.1182c-.1465.1465-.3379.2197-.5303.2197Z"
								stroke-width="0"
							/>
						</g>
					</svg>
				{:else if style === 'underline'}
					<svg
						aria-hidden="true"
						focusable="false"
						height="18"
						viewBox="0 0 18 18"
						width="18"
						xmlns="http://www.w3.org/2000/svg"
					>
						<g fill="currentColor">
							<path
								clip-rule="evenodd"
								d="M5.25 2C5.66421 2 6 2.33579 6 2.75V8.5C6 10.1558 7.34336 11.5 9 11.5C10.6566 11.5 12 10.1558 12 8.5V2.75C12 2.33579 12.3358 2 12.75 2C13.1642 2 13.5 2.33579 13.5 2.75V8.5C13.5 10.984 11.4854 13 9 13C6.51464 13 4.5 10.984 4.5 8.5V2.75C4.5 2.33579 4.83579 2 5.25 2Z"
								fill-rule="evenodd"
							/>
							<path
								clip-rule="evenodd"
								d="M2 15.25C2 14.8358 2.33579 14.5 2.75 14.5H15.25C15.6642 14.5 16 14.8358 16 15.25C16 15.6642 15.6642 16 15.25 16H2.75C2.33579 16 2 15.6642 2 15.25Z"
								fill-opacity="0.4"
								fill-rule="evenodd"
							/>
						</g>
					</svg>
				{:else if style === 'strike'}
					<svg
						aria-hidden="true"
						focusable="false"
						height="18"
						viewBox="0 0 18 18"
						width="18"
						xmlns="http://www.w3.org/2000/svg"
					>
						<g fill="currentColor">
							<path
								d="M6.20644 2.27445C7.22098 1.66875 8.41002 1.5 9.07898 1.5C10.4917 1.5 12.4859 2.01915 13.4649 4.33832C13.626 4.71992 13.4473 5.15986 13.0657 5.32096C12.684 5.48205 12.2441 5.30329 12.083 4.92168C11.424 3.36065 10.1442 3 9.07898 3C8.58977 3 7.69007 3.13568 6.97535 3.56238C6.62805 3.76972 6.34709 4.03194 6.16345 4.35919C5.98337 4.6801 5.87111 5.10866 5.92783 5.69898C6.00062 6.45653 6.37892 6.96692 6.94255 7.345C7.60986 7.79262 8.39976 7.99388 9.1808 8.13427L9.18082 8.13428C9.37888 8.16988 9.61364 8.21208 9.85488 8.27239C10.2567 8.37285 10.501 8.78006 10.4006 9.1819C10.3001 9.58375 10.0103 9.69846 9.60845 9.598C9.41892 9.55062 9.11682 9.64693 8.91336 9.61026L8.84691 9.59827C7.96558 9.44061 6.94743 9.15449 6.10695 8.5907C5.23998 8.00914 4.55792 7.12489 4.43471 5.84244C4.35154 4.97683 4.51179 4.23735 4.85533 3.62513C5.19532 3.01927 5.68912 2.5833 6.20644 2.27445Z"
								fill-opacity="0.4"
							/>
							<path
								clip-rule="evenodd"
								d="M13.0672 11.2533C13.4795 11.214 13.8456 11.5165 13.8849 11.9288C13.8943 12.0276 13.9003 12.1288 13.9028 12.2325C13.9676 14.8775 11.5979 16.5 9.07897 16.5C7.90936 16.5 6.84447 16.273 5.97291 15.7286C5.08698 15.1753 4.46412 14.3332 4.12753 13.2286C4.00678 12.8324 4.2301 12.4133 4.62633 12.2926C5.02255 12.1718 5.44164 12.3951 5.56238 12.7914C5.80479 13.5868 6.22044 14.1147 6.76751 14.4564C7.32896 14.807 8.09157 15 9.07897 15C11.074 15 12.4403 13.7834 12.4032 12.2684C12.4016 12.2003 12.3976 12.134 12.3916 12.071C12.3524 11.6586 12.6548 11.2925 13.0672 11.2533Z"
								fill-opacity="0.4"
								fill-rule="evenodd"
							/>
							<path
								clip-rule="evenodd"
								d="M1.25 9C1.25 8.58579 1.58579 8.25 2 8.25H16C16.4142 8.25 16.75 8.58579 16.75 9C16.75 9.41421 16.4142 9.75 16 9.75H2C1.58579 9.75 1.25 9.41421 1.25 9Z"
								fill-rule="evenodd"
							/>
						</g>
					</svg>
				{:else}
					<svg
						aria-hidden="true"
						focusable="false"
						height="18"
						viewBox="0 0 18 18"
						width="18"
						xmlns="http://www.w3.org/2000/svg"
					>
						<circle
							cx="9"
							cy="9"
							r="6"
							fill="none"
							stroke="currentColor"
							stroke-width="1.75"
						/>
					</svg>
				{/if}
			</button>
		{/each}
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
		--gap: var(--pad-xs);
	}

	.annotation-mark-button {
		align-items: center;
		background: transparent;
		border: 1px solid var(--fg-3);
		border-radius: var(--br-s);
		color: var(--fg-5);
		display: inline-flex;
		justify-content: center;
		min-inline-size: auto;
		padding: var(--pad-xs);
	}

	.annotation-mark-button.active {
		border-color: var(--annotation-color);
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
