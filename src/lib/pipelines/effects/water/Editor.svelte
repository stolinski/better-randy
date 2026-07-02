<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { WaterParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<WaterParams> = $props();
</script>

<label class="row">
	<span>Size</span>
	<input
		bind:value={effect.params.size}
		max="7"
		min="0.01"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Caustic</span>
	<input
		bind:value={effect.params.caustic}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Waves</span>
	<input
		bind:value={effect.params.waves}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Layering</span>
	<input
		bind:value={effect.params.layering}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Edges</span>
	<input
		bind:value={effect.params.edges}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Highlights</span>
	<input
		bind:value={effect.params.highlights}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Speed</span>
	<input
		bind:value={effect.params.speed}
		max="3"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Highlight</span>
	<input bind:value={effect.params.colorHighlight} type="color" />
</label>
