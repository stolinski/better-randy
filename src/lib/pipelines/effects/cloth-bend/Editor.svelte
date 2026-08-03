<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { ClothBendParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<ClothBendParams> = $props();
</script>

<label class="row">
	<span>Seed</span>
	<input bind:value={effect.params.seed} max="65535" min="0" step="1" type="number" />
</label>

<label class="row">
	<span>Pinned edge</span>
	<select bind:value={effect.params.pinnedEdge}>
		<option value="top">Top</option>
		<option value="left">Left</option>
		<option value="both">Top and left</option>
	</select>
</label>

<label class="row">
	<span>Gust time</span>
	<input bind:value={effect.params.gustAtSeconds} max="600" min="0" step="0.01" type="number" />
</label>

<label class="row">
	<span>Gust</span>
	<input bind:value={effect.params.gust} max="1" min="-1" step="0.01" type="range" />
</label>

<label class="row">
	<span>Stiffness</span>
	<input bind:value={effect.params.stiffness} max="20" min="0.5" step="0.1" type="range" />
</label>

<label class="row">
	<span>Damping</span>
	<input bind:value={effect.params.damping} max="10" min="0.1" step="0.1" type="range" />
</label>

<label class="row">
	<span>Folds</span>
	<input bind:value={effect.params.folds} max="16" min="1" step="0.1" type="range" />
</label>

<label class="row">
	<span>Perspective</span>
	<input bind:value={effect.params.perspective} max="0.3" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Shadow</span>
	<input bind:value={effect.params.shadow} max="1" min="0" step="0.01" type="range" />
</label>
