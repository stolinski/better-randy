<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { CrtScreenParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<CrtScreenParams> = $props();
</script>

<label class="row">
	<span>Line pitch</span>
	<input bind:value={effect.params.scanlinePitchPx} max="24" min="2" step="1" type="range" />
</label>

<label class="row">
	<span>Scanline</span>
	<input bind:value={effect.params.scanlineStrength} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Bloom threshold</span>
	<input bind:value={effect.params.bloomThreshold} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Bloom</span>
	<input bind:value={effect.params.bloomStrength} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Vignette</span>
	<input bind:value={effect.params.vignette} max="1" min="0" step="0.01" type="range" />
</label>
