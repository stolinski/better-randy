<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { FluidRippleParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<FluidRippleParams> = $props();
</script>

<label class="row">
	<span>Seed</span>
	<input bind:value={effect.params.seed} max="65535" min="0" step="1" type="number" />
</label>

<label class="row">
	<span>Impulse time</span>
	<input bind:value={effect.params.impulseAtSeconds} max="600" min="0" step="0.01" type="number" />
</label>

<label class="row">
	<span>Impulse x</span>
	<input bind:value={effect.params.impulseX} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Impulse y</span>
	<input bind:value={effect.params.impulseY} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Impulse strength</span>
	<input bind:value={effect.params.impulseStrength} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Radius</span>
	<input bind:value={effect.params.radius} max="0.6" min="0.02" step="0.01" type="range" />
</label>

<label class="row">
	<span>Damping</span>
	<input bind:value={effect.params.damping} max="8" min="0.1" step="0.1" type="range" />
</label>

<label class="row">
	<span>Wave speed</span>
	<input bind:value={effect.params.waveSpeed} max="8" min="0.1" step="0.1" type="range" />
</label>

<label class="row">
	<span>Refraction</span>
	<input bind:value={effect.params.refraction} max="0.08" min="0" step="0.001" type="range" />
</label>

<label class="row">
	<span>Highlights</span>
	<input bind:value={effect.params.highlights} max="1" min="0" step="0.01" type="range" />
</label>
