<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { CrtTubeParams } from './index';

	import InspectorToggle from '$lib/platform/InspectorToggle.svelte';

	let { effect = $bindable() }: EffectEditorProps<CrtTubeParams> = $props();
</script>

<label class="row">
	<span>Mask</span>
	<select bind:value={effect.params.mask}>
		<option value="slot">Slot</option>
		<option value="shadow">Shadow</option>
		<option value="grille">Grille</option>
	</select>
</label>

<label class="row">
	<span>Pitch</span>
	<input bind:value={effect.params.maskPitchPx} max="24" min="3" step="0.5" type="range" />
</label>

<label class="row">
	<span>Mask strength</span>
	<input bind:value={effect.params.maskStrength} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Lines</span>
	<input bind:value={effect.params.lines} max="1080" min="160" step="10" type="range" />
</label>

<label class="row">
	<span>Focus</span>
	<input bind:value={effect.params.focus} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Curvature</span>
	<input bind:value={effect.params.curvature} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Bezel</span>
	<input bind:value={effect.params.bezel} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Halation</span>
	<input bind:value={effect.params.halation} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Vignette</span>
	<input bind:value={effect.params.vignette} max="1" min="0" step="0.01" type="range" />
</label>

<div class="row">
	<span>Interlace</span>
	<InspectorToggle
		checked={effect.params.interlace}
		label="Interlace"
		onchange={(checked) => (effect.params.interlace = checked)}
	/>
</div>
