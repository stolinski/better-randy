<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { HalftoneDotsParams } from './index';

	import InspectorToggle from '$lib/platform/InspectorToggle.svelte';

	let { effect = $bindable() }: EffectEditorProps<HalftoneDotsParams> = $props();
</script>

<label class="row">
	<span>Dot style</span>
	<select bind:value={effect.params.dotType}>
		<option value="classic">Classic</option>
		<option value="gooey">Gooey</option>
		<option value="holes">Holes</option>
		<option value="soft">Soft</option>
	</select>
</label>

<label class="row">
	<span>Grid</span>
	<select bind:value={effect.params.grid}>
		<option value="square">Square</option>
		<option value="hex">Hex</option>
	</select>
</label>

<label class="row">
	<span>Size</span>
	<input bind:value={effect.params.size} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Radius</span>
	<input bind:value={effect.params.radius} max="2" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Contrast</span>
	<input bind:value={effect.params.contrast} max="1" min="0" step="0.01" type="range" />
</label>

<div class="row">
	<span>Original colors</span>
	<InspectorToggle
		checked={effect.params.originalColors}
		label="Original colors"
		onchange={(checked) => (effect.params.originalColors = checked)}
	/>
</div>

<div class="row">
	<span>Inverted</span>
	<InspectorToggle
		checked={effect.params.inverted}
		label="Inverted"
		onchange={(checked) => (effect.params.inverted = checked)}
	/>
</div>

{#if !effect.params.originalColors}
	<label class="row">
		<span>Front</span>
		<input bind:value={effect.params.colorFront} type="color" />
	</label>
{/if}

<label class="row">
	<span>Back</span>
	<input bind:value={effect.params.colorBack} type="color" />
</label>
