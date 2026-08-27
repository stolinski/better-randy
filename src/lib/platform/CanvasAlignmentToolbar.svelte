<script lang="ts">
	import CanvasAlignmentIcon from './CanvasAlignmentIcon.svelte';
	import type {
		CanvasAlignmentCommand,
		CanvasAlignmentReference,
		CanvasDistributionCommand
	} from './canvas-alignment';

	interface Props {
		selectedCount: number;
		canDistribute: boolean;
		busy: boolean;
		onAlign: (
			command: CanvasAlignmentCommand,
			reference: CanvasAlignmentReference
		) => Promise<void>;
		onDistribute: (
			command: CanvasDistributionCommand,
			reference: CanvasAlignmentReference
		) => Promise<void>;
	}

	let { selectedCount, canDistribute, busy, onAlign, onDistribute }: Props = $props();
	let alignmentReference = $state<CanvasAlignmentReference>('selection');
</script>

<fieldset class="canvas-alignment-toolbar" disabled={busy}>
	<legend class="visually-hidden">Align {selectedCount} selected canvas elements</legend>
	<select
		class="canvas-alignment-toolbar__reference"
		bind:value={alignmentReference}
		aria-label="Alignment reference"
		data-canvas-alignment-reference
	>
		<option value="selection">Selection</option>
		<option value="canvas">Canvas</option>
	</select>

	<span class="canvas-alignment-toolbar__divider" aria-hidden="true"></span>
	<span class="canvas-alignment-toolbar__group" role="group" aria-label="Horizontal alignment">
		<button
			class="canvas-alignment-toolbar__button tip bottom"
			type="button"
			aria-label="Align left edges"
			data-canvas-alignment-command="left"
			onclick={() => onAlign('left', alignmentReference)}
		>
			<CanvasAlignmentIcon command="left" />
		</button>
		<button
			class="canvas-alignment-toolbar__button tip bottom"
			type="button"
			aria-label="Align horizontal centers"
			data-canvas-alignment-command="horizontal-center"
			onclick={() => onAlign('horizontal-center', alignmentReference)}
		>
			<CanvasAlignmentIcon command="horizontal-center" />
		</button>
		<button
			class="canvas-alignment-toolbar__button tip bottom"
			type="button"
			aria-label="Align right edges"
			data-canvas-alignment-command="right"
			onclick={() => onAlign('right', alignmentReference)}
		>
			<CanvasAlignmentIcon command="right" />
		</button>
	</span>

	<span class="canvas-alignment-toolbar__divider" aria-hidden="true"></span>
	<span class="canvas-alignment-toolbar__group" role="group" aria-label="Vertical alignment">
		<button
			class="canvas-alignment-toolbar__button tip bottom"
			type="button"
			aria-label="Align top edges"
			data-canvas-alignment-command="top"
			onclick={() => onAlign('top', alignmentReference)}
		>
			<CanvasAlignmentIcon command="top" />
		</button>
		<button
			class="canvas-alignment-toolbar__button tip bottom"
			type="button"
			aria-label="Align vertical centers"
			data-canvas-alignment-command="vertical-middle"
			onclick={() => onAlign('vertical-middle', alignmentReference)}
		>
			<CanvasAlignmentIcon command="vertical-middle" />
		</button>
		<button
			class="canvas-alignment-toolbar__button tip bottom"
			type="button"
			aria-label="Align bottom edges"
			data-canvas-alignment-command="bottom"
			onclick={() => onAlign('bottom', alignmentReference)}
		>
			<CanvasAlignmentIcon command="bottom" />
		</button>
	</span>

	{#if canDistribute}
		<span class="canvas-alignment-toolbar__divider" aria-hidden="true"></span>
		<span class="canvas-alignment-toolbar__group" role="group" aria-label="Distribution">
			<button
				class="canvas-alignment-toolbar__button tip bottom"
				type="button"
				aria-label="Distribute horizontal spacing"
				data-canvas-alignment-command="distribute-horizontal"
				onclick={() => onDistribute('horizontal', alignmentReference)}
			>
				<CanvasAlignmentIcon command="horizontal" />
			</button>
			<button
				class="canvas-alignment-toolbar__button tip bottom"
				type="button"
				aria-label="Distribute vertical spacing"
				data-canvas-alignment-command="distribute-vertical"
				onclick={() => onDistribute('vertical', alignmentReference)}
			>
				<CanvasAlignmentIcon command="vertical" />
			</button>
		</span>
	{/if}
</fieldset>

<style>
	.canvas-alignment-toolbar {
		align-items: center;
		background: var(--chrome-deck, #131315);
		border: 1px solid var(--chrome-hairline, #26262a);
		border-radius: 2px;
		display: flex;
		gap: 2px;
		inset-block-start: 8px;
		inset-inline-start: 50%;
		margin: 0;
		min-inline-size: 0;
		padding: 2px;
		pointer-events: all;
		position: absolute;
		transform: translateX(-50%);
		z-index: 900000;
	}

	.canvas-alignment-toolbar__reference,
	.canvas-alignment-toolbar__button {
		background: transparent;
		border: 0;
		border-radius: 2px;
		color: var(--chrome-muted, #8a8a90);
		font-family: Archivo, sans-serif;
		font-size: 0.6875rem;
		font-weight: 500;
		transition:
			background-color 100ms ease,
			color 100ms ease;
	}

	.canvas-alignment-toolbar__reference {
		block-size: 30px;
		cursor: pointer;
		padding-block: 0;
		padding-inline: 8px 22px;
	}

	.canvas-alignment-toolbar__group {
		display: flex;
		gap: 2px;
	}

	.canvas-alignment-toolbar__button {
		align-items: center;
		block-size: 30px;
		cursor: pointer;
		display: inline-flex;
		inline-size: 30px;
		justify-content: center;
		padding: 0;
	}

	.canvas-alignment-toolbar__reference:hover,
	.canvas-alignment-toolbar__button:hover {
		background: var(--chrome-raised, #1a1a1d);
		color: var(--chrome-text, #e8e8ea);
	}

	.canvas-alignment-toolbar__reference:focus-visible,
	.canvas-alignment-toolbar__button:focus-visible {
		outline: 1px solid #ffd608;
		outline-offset: -1px;
	}

	.canvas-alignment-toolbar__reference:disabled,
	.canvas-alignment-toolbar__button:disabled {
		cursor: default;
		opacity: 0.5;
	}

	.canvas-alignment-toolbar__divider {
		background: var(--chrome-hairline, #26262a);
		block-size: 20px;
		inline-size: 1px;
		margin-inline: 3px;
	}

	.canvas-alignment-toolbar :global(.tip[aria-label]::after) {
		background: var(--chrome-raised, #1a1a1d);
		border: 1px solid var(--chrome-hairline, #26262a);
		border-radius: 2px;
		box-shadow: none;
		color: var(--chrome-text, #e8e8ea);
		font-family: Archivo, sans-serif;
		font-size: 0.6875rem;
		font-weight: 500;
	}
</style>
