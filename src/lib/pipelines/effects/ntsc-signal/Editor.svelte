<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { NtscSignalParams } from './index';

	import InspectorToggle from '$lib/platform/InspectorToggle.svelte';

	let { effect = $bindable() }: EffectEditorProps<NtscSignalParams> = $props();
</script>

<label class="row">
	<span>Lines</span>
	<input bind:value={effect.params.lines} max="1080" min="160" step="10" type="range" />
</label>

<label class="row">
	<span>Luma MHz</span>
	<input bind:value={effect.params.lumaBandwidthMhz} max="6" min="1" step="0.05" type="range" />
</label>

<label class="row">
	<span>Chroma MHz</span>
	<input
		bind:value={effect.params.chromaBandwidthMhz}
		max="1.5"
		min="0.1"
		step="0.05"
		type="range"
	/>
</label>

<label class="row">
	<span>Separation</span>
	<input bind:value={effect.params.separation} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Chroma lag</span>
	<input bind:value={effect.params.chromaDelayUs} max="0.8" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Hue jitter</span>
	<input bind:value={effect.params.phaseJitter} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Ghost</span>
	<input bind:value={effect.params.ghost} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Ghost delay</span>
	<input bind:value={effect.params.ghostDelayUs} max="3" min="0" step="0.05" type="range" />
</label>

<label class="row">
	<span>Noise</span>
	<input bind:value={effect.params.noise} max="1" min="0" step="0.01" type="range" />
</label>

<div class="row">
	<span>480i</span>
	<InspectorToggle
		checked={effect.params.interlace}
		label="480i"
		onchange={(checked) => (effect.params.interlace = checked)}
	/>
</div>
