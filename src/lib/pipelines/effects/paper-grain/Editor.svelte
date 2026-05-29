<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { PaperGrainParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<PaperGrainParams> = $props();
</script>

<label class="row">
	<span>Warmth</span>
	<input
		bind:value={effect.params.warmth}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Density</span>
	<input
		bind:value={effect.params.density}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>
