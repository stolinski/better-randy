<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { FrostedGlassParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<FrostedGlassParams> = $props();

	function handleMeltChange(event: Event): void {
		effect.params.melt = (event.currentTarget as HTMLInputElement).checked
			? {
					center: { x: 0.5, y: 0.5 },
					radius: 0.28,
					softness: 0.08,
					from: 0.42,
					to: 0.68
				}
			: undefined;
	}
</script>

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
	<span>Coverage</span>
	<input bind:value={effect.params.coverage} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Contrast</span>
	<input bind:value={effect.params.contrast} max="1" min="0.05" step="0.01" type="range" />
</label>

<label class="row">
	<span>Roughness</span>
	<input bind:value={effect.params.roughness} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Haze</span>
	<input bind:value={effect.params.haze} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Refraction</span>
	<input bind:value={effect.params.refraction} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Detail scale</span>
	<input bind:value={effect.params.detailScale} max="4" min="0.25" step="0.01" type="range" />
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
	<span>Highlight</span>
	<input bind:value={effect.params.highlight} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Seed</span>
	<input bind:value={effect.params.seed} max="65535" min="0" step="1" type="number" />
</label>

<label class="row">
	<span>Grow from</span>
	<input bind:value={effect.params.growFrom} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Grow to</span>
	<input bind:value={effect.params.growTo} max="1" min="0" step="0.01" type="range" />
</label>

<label class="row">
	<span>Melt</span>
	<input checked={effect.params.melt !== undefined} onchange={handleMeltChange} type="checkbox" />
</label>

{#if effect.params.melt}
	<label class="row">
		<span>Melt center x</span>
		<input bind:value={effect.params.melt.center.x} max="1" min="0" step="0.01" type="range" />
	</label>

	<label class="row">
		<span>Melt center y</span>
		<input bind:value={effect.params.melt.center.y} max="1" min="0" step="0.01" type="range" />
	</label>

	<label class="row">
		<span>Melt radius</span>
		<input bind:value={effect.params.melt.radius} max="1.5" min="0.01" step="0.01" type="range" />
	</label>

	<label class="row">
		<span>Melt softness</span>
		<input
			bind:value={effect.params.melt.softness}
			max="0.5"
			min="0.001"
			step="0.001"
			type="range"
		/>
	</label>

	<label class="row">
		<span>Melt from</span>
		<input bind:value={effect.params.melt.from} max="1" min="0" step="0.01" type="range" />
	</label>

	<label class="row">
		<span>Melt to</span>
		<input bind:value={effect.params.melt.to} max="1" min="0" step="0.01" type="range" />
	</label>
{/if}
