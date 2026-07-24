<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { RefractiveLensParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<RefractiveLensParams> = $props();
</script>

<label class="row">
	<span>Shape</span>
	<select bind:value={effect.params.shape}>
		<option value="circle">Circle</option>
		<option value="rounded-rect">Rounded rectangle</option>
	</select>
</label>

<label class="row">
	<span>Region x</span>
	<input bind:value={effect.params.region.x} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Region y</span>
	<input bind:value={effect.params.region.y} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Region width</span>
	<input bind:value={effect.params.region.width} max="1" min="0.02" step="0.01" type="range" />
</label>

<label class="row">
	<span>Region height</span>
	<input bind:value={effect.params.region.height} max="1" min="0.02" step="0.01" type="range" />
</label>

<label class="row">
	<span>Magnification</span>
	<input bind:value={effect.params.magnification} max="2.4" min="1" step="0.01" type="range" />
</label>

<label class="row">
	<span>Thickness</span>
	<input bind:value={effect.params.thickness} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Refraction</span>
	<input bind:value={effect.params.refraction} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Roughness</span>
	<input bind:value={effect.params.roughness} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Dispersion</span>
	<input bind:value={effect.params.dispersion} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Reflection</span>
	<input bind:value={effect.params.reflection} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Rim light</span>
	<input bind:value={effect.params.rimLight} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Tint</span>
	<input bind:value={effect.params.tint} type="color" />
</label>

<label class="row">
	<span>Tint strength</span>
	<input bind:value={effect.params.tintStrength} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Edge flatness</span>
	<input bind:value={effect.params.edgeFlatness} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Bevel</span>
	<input bind:value={effect.params.bevel} max="1" min="0.02" step="0.01" type="range" />
</label>
