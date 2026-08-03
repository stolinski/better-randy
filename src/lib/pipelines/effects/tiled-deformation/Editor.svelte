<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { TiledDeformationParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<TiledDeformationParams> = $props();
</script>

<label class="row">
	<span>Topology</span>
	<select bind:value={effect.params.topology}>
		<option value="grid">Grid</option>
		<option value="hex">Hex</option>
	</select>
</label>

<label class="row">
	<span>Seed</span>
	<input bind:value={effect.params.seed} max="65535" min="0" step="1" type="number" />
</label>

<label class="row">
	<span>Columns</span>
	<input bind:value={effect.params.columns} max="48" min="3" step="1" type="range" />
</label>

<label class="row">
	<span>Lift</span>
	<input bind:value={effect.params.lift} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Bevel</span>
	<input bind:value={effect.params.bevel} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Perspective</span>
	<input bind:value={effect.params.perspective} max="0.2" min="0" step="0.001" type="range" />
</label>

<label class="row">
	<span>Reveal from</span>
	<input bind:value={effect.params.revealFrom} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Reveal to</span>
	<input bind:value={effect.params.revealTo} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Light angle</span>
	<input bind:value={effect.params.lightAngle} max="180" min="-180" step="1" type="range" />
</label>
