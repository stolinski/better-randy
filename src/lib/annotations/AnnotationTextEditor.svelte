<script lang="ts">
	import { tick } from 'svelte';

	import {
		getAnnotationMarkDelimiters,
		type AnnotationMarkColors,
		type AnnotationMarkStyle
	} from '$lib/annotations/annotation-marks';
	import { wrapTextSelection } from '$lib/utils/text-selection';

	interface Props {
		activeMark?: AnnotationMarkStyle;
		colors?: AnnotationMarkColors;
		label?: string;
		rows?: number;
		value?: string;
	}

	const DEFAULT_ANNOTATION_MARK_COLORS: AnnotationMarkColors = {
		circle: '#de263a',
		highlight: '#ffd642',
		strike: '#de263a',
		underline: '#1f5aff'
	};

	let {
		activeMark = $bindable('highlight'),
		colors = DEFAULT_ANNOTATION_MARK_COLORS,
		label = 'Annotation text',
		rows = 10,
		value = $bindable('')
	}: Props = $props();

	let textInput = $state<HTMLTextAreaElement | null>(null);

	function restoreSelection(selectionStart: number, selectionEnd: number): void {
		tick()
			.then(() => {
				textInput?.focus();
				textInput?.setSelectionRange(selectionStart, selectionEnd);
			})
			.catch((error: unknown) => {
				console.error('Unable to restore annotation text selection.', error);
			});
	}

	function applyMark(style: AnnotationMarkStyle): void {
		if (!textInput) {
			return;
		}

		const delimiters = getAnnotationMarkDelimiters(style);
		const edit = wrapTextSelection({
			value,
			selectionStart: textInput.selectionStart,
			selectionEnd: textInput.selectionEnd,
			opener: delimiters.opener,
			closer: delimiters.closer
		});

		value = edit.value;
		activeMark = style;
		restoreSelection(edit.selectionStart, edit.selectionEnd);
	}

	function handleHighlightMark(): void {
		applyMark('highlight');
	}

	function handleUnderlineMark(): void {
		applyMark('underline');
	}

	function handleStrikeMark(): void {
		applyMark('strike');
	}

	function handleCircleMark(): void {
		applyMark('circle');
	}
</script>

<div class="annotation-editor stack">
	<div class="annotation-toolbar cluster" aria-label={`${label} marks`}>
		<button
			aria-pressed={activeMark === 'highlight'}
			onclick={handleHighlightMark}
			style:--annotation-color={colors.highlight}
			title="Highlight selection"
			type="button"
		>
			<span class="annotation-sample annotation-sample--highlight">Highlight</span>
		</button>

		<button
			aria-pressed={activeMark === 'underline'}
			onclick={handleUnderlineMark}
			style:--annotation-color={colors.underline}
			title="Underline selection"
			type="button"
		>
			<span class="annotation-sample annotation-sample--underline">Underline</span>
		</button>

		<button
			aria-pressed={activeMark === 'strike'}
			onclick={handleStrikeMark}
			style:--annotation-color={colors.strike}
			title="Strike selection"
			type="button"
		>
			<span class="annotation-sample annotation-sample--strike">Strike</span>
		</button>

		<button
			aria-pressed={activeMark === 'circle'}
			onclick={handleCircleMark}
			style:--annotation-color={colors.circle}
			title="Circle selection"
			type="button"
		>
			<span class="annotation-sample annotation-sample--circle">Circle</span>
		</button>
	</div>

	<textarea aria-label={label} bind:this={textInput} bind:value {rows} spellcheck="true"></textarea>
</div>

<style>
	.annotation-editor {
		--gap: var(--vs-xs);
		inline-size: 100%;
	}

	.annotation-toolbar {
		--gap: var(--space-2xs);
	}

	.annotation-toolbar button {
		min-inline-size: auto;
		padding-inline: var(--pad-m);
	}

	.annotation-toolbar button[aria-pressed='true'] {
		border-color: var(--annotation-color);
	}

	.annotation-sample {
		display: inline-block;
		line-height: 1;
	}

	.annotation-sample--highlight {
		background: color-mix(in srgb, var(--annotation-color) 72%, transparent);
		border-radius: var(--br-s);
		padding: 0.12em 0.28em;
	}

	.annotation-sample--underline {
		border-block-end: 0.18em solid var(--annotation-color);
		padding-block-end: 0.08em;
	}

	.annotation-sample--strike {
		text-decoration-line: line-through;
		text-decoration-color: var(--annotation-color);
		text-decoration-thickness: 0.16em;
	}

	.annotation-sample--circle {
		border: 0.14em solid var(--annotation-color);
		border-radius: 999px;
		padding: 0.1em 0.42em;
	}
</style>
