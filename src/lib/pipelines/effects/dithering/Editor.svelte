<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { DitheringParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<DitheringParams> = $props();
</script>

<label class="row">
	<span>Pattern</span>
	<select bind:value={effect.params.mode}>
		<option value="random">Random</option>
		<option value="2x2">Bayer 2×2</option>
		<option value="4x4">Bayer 4×4</option>
		<option value="8x8">Bayer 8×8</option>
	</select>
</label>

<label class="row">
	<span>Cell size</span>
	<input
		bind:value={effect.params.pxSize}
		max="64"
		min="1"
		step="1"
		type="range"
	/>
</label>

<label class="row">
	<span>Steps</span>
	<input
		bind:value={effect.params.colorSteps}
		max="7"
		min="1"
		step="1"
		type="range"
	/>
</label>

<label class="row">
	<span>Original colors</span>
	<input bind:checked={effect.params.originalColors} type="checkbox" />
</label>

<label class="row">
	<span>Inverted</span>
	<input bind:checked={effect.params.inverted} type="checkbox" />
</label>

{#if !effect.params.originalColors}
	<label class="row">
		<span>Front</span>
		<input bind:value={effect.params.colorFront} type="color" />
	</label>

	<label class="row">
		<span>Back</span>
		<input bind:value={effect.params.colorBack} type="color" />
	</label>

	<label class="row">
		<span>Highlight</span>
		<input bind:value={effect.params.colorHighlight} type="color" />
	</label>
{/if}
