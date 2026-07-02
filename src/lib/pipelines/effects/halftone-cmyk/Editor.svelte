<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { HalftoneCmykParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<HalftoneCmykParams> = $props();
</script>

<label class="row">
	<span>Style</span>
	<select bind:value={effect.params.cmykType}>
		<option value="dots">Dots</option>
		<option value="ink">Ink</option>
		<option value="sharp">Sharp</option>
	</select>
</label>

<label class="row">
	<span>Size</span>
	<input
		bind:value={effect.params.size}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Contrast</span>
	<input
		bind:value={effect.params.contrast}
		max="2"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Softness</span>
	<input
		bind:value={effect.params.softness}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Grid noise</span>
	<input
		bind:value={effect.params.gridNoise}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Paper</span>
	<input bind:value={effect.params.colorBack} type="color" />
</label>

<label class="row">
	<span>Cyan ink</span>
	<input bind:value={effect.params.colorC} type="color" />
</label>

<label class="row">
	<span>Magenta ink</span>
	<input bind:value={effect.params.colorM} type="color" />
</label>

<label class="row">
	<span>Yellow ink</span>
	<input bind:value={effect.params.colorY} type="color" />
</label>

<label class="row">
	<span>Black ink</span>
	<input bind:value={effect.params.colorK} type="color" />
</label>

<label class="row">
	<span>Flood C</span>
	<input
		bind:value={effect.params.floodC}
		max="1"
		min="-1"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Flood M</span>
	<input
		bind:value={effect.params.floodM}
		max="1"
		min="-1"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Flood Y</span>
	<input
		bind:value={effect.params.floodY}
		max="1"
		min="-1"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Flood K</span>
	<input
		bind:value={effect.params.floodK}
		max="1"
		min="-1"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Gain C</span>
	<input
		bind:value={effect.params.gainC}
		max="1"
		min="-1"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Gain M</span>
	<input
		bind:value={effect.params.gainM}
		max="1"
		min="-1"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Gain Y</span>
	<input
		bind:value={effect.params.gainY}
		max="1"
		min="-1"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Gain K</span>
	<input
		bind:value={effect.params.gainK}
		max="1"
		min="-1"
		step="0.01"
		type="range"
	/>
</label>
