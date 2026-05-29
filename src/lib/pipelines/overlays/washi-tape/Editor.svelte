<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { WashiTapeContent } from './index';
	import { WASHI_TAPE_DEFAULTS } from './index';

	let { overlay = $bindable() }: OverlayEditorProps<WashiTapeContent> = $props();
</script>

<label class="row">
	<span>Color</span>
	<input
		bind:value={overlay.content.color}
		type="color"
	/>
</label>

<label class="row">
	<span>Rotation</span>
	<input
		bind:value={overlay.content.rotation}
		type="number"
		min={WASHI_TAPE_DEFAULTS.rotationMin}
		max={WASHI_TAPE_DEFAULTS.rotationMax}
		step="1"
	/>
</label>

<label class="row">
	<span>Length</span>
	<input
		bind:value={overlay.content.length}
		type="number"
		min="60"
		max="800"
		step="10"
	/>
</label>

<label class="row">
	<span>Anchor</span>
	<select bind:value={overlay.position.anchor}>
		<option value="top-left">Top left</option>
		<option value="top-right">Top right</option>
		<option value="bottom-left">Bottom left</option>
		<option value="bottom-right">Bottom right</option>
	</select>
</label>

<div class="row">
	<span>Offset</span>
	<div class="offset-fields">
		<label>
			<span class="offset-fields__label">X</span>
			<input
				type="number"
				step="0.005"
				min="0"
				max="1"
				value={overlay.position.offset?.x ?? 0}
				oninput={(e) => {
					const value = Number((e.currentTarget as HTMLInputElement).value);
					overlay.position.offset = {
						x: Number.isFinite(value) ? value : 0,
						y: overlay.position.offset?.y ?? 0
					};
				}}
			/>
		</label>
		<label>
			<span class="offset-fields__label">Y</span>
			<input
				type="number"
				step="0.005"
				min="0"
				max="1"
				value={overlay.position.offset?.y ?? 0}
				oninput={(e) => {
					const value = Number((e.currentTarget as HTMLInputElement).value);
					overlay.position.offset = {
						x: overlay.position.offset?.x ?? 0,
						y: Number.isFinite(value) ? value : 0
					};
				}}
			/>
		</label>
	</div>
</div>

<style>
	.offset-fields {
		display: grid;
		gap: var(--vs-xs);
		grid-template-columns: 1fr 1fr;
	}

	.offset-fields__label {
		color: var(--fg-6);
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.offset-fields label {
		display: grid;
		gap: 2px;
	}
</style>
