<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { LowerThirdContent } from './index';
	import { VARIANT_IDS, VARIANTS } from './variants';

	let { overlay = $bindable() }: OverlayEditorProps<LowerThirdContent> = $props();

	function handleSubtitleInput(event: Event): void {
		const next = (event.currentTarget as HTMLInputElement).value;
		overlay.content.subtitle = next.length > 0 ? next : undefined;
	}

	function handleKickerInput(event: Event): void {
		const next = (event.currentTarget as HTMLInputElement).value;
		overlay.content.kicker = next.length > 0 ? next : undefined;
	}
</script>

<label class="row">
	<span>Variant</span>
	<select bind:value={overlay.content.variant}>
		{#each VARIANT_IDS as id}
			<option value={id}>{VARIANTS[id].label}</option>
		{/each}
	</select>
</label>

<label class="row">
	<span>Kicker</span>
	<input value={overlay.content.kicker ?? ''} oninput={handleKickerInput} type="text" />
</label>

<label class="row">
	<span>Title</span>
	<input bind:value={overlay.content.title} type="text" />
</label>

<label class="row">
	<span>Subtitle</span>
	<input value={overlay.content.subtitle ?? ''} oninput={handleSubtitleInput} type="text" />
</label>

<label class="row">
	<span>Anchor</span>
	<select bind:value={overlay.position.anchor}>
		<option value="top-left">Top left</option>
		<option value="top-center">Top center</option>
		<option value="top-right">Top right</option>
		<option value="center">Center</option>
		<option value="bottom-left">Bottom left</option>
		<option value="bottom-center">Bottom center</option>
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
