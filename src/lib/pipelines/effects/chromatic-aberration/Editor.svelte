<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { ChromaticAberrationParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<ChromaticAberrationParams> = $props();
</script>

<label class="row">
	<span>Strength</span>
	<input
		bind:value={effect.params.strength}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Radial</span>
	<input
		bind:value={effect.params.radial}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>
