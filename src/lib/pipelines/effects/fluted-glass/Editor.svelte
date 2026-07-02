<script lang="ts">
	import type { EffectEditorProps } from '$lib/platform/pipelines/types';
	import type { FlutedGlassParams } from './index';

	let { effect = $bindable() }: EffectEditorProps<FlutedGlassParams> = $props();
</script>

<label class="row">
	<span>Shape</span>
	<select bind:value={effect.params.shape}>
		<option value="lines">Lines</option>
		<option value="linesIrregular">Lines irregular</option>
		<option value="wave">Wave</option>
		<option value="zigzag">Zigzag</option>
		<option value="pattern">Pattern</option>
	</select>
</label>

<label class="row">
	<span>Profile</span>
	<select bind:value={effect.params.distortionShape}>
		<option value="prism">Prism</option>
		<option value="lens">Lens</option>
		<option value="contour">Contour</option>
		<option value="cascade">Cascade</option>
		<option value="flat">Flat</option>
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
	<span>Angle</span>
	<input
		bind:value={effect.params.angle}
		max="180"
		min="0"
		step="1"
		type="range"
	/>
</label>

<label class="row">
	<span>Distortion</span>
	<input
		bind:value={effect.params.distortion}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Shift</span>
	<input
		bind:value={effect.params.shift}
		max="1"
		min="-1"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Stretch</span>
	<input
		bind:value={effect.params.stretch}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Blur</span>
	<input
		bind:value={effect.params.blur}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Edges</span>
	<input
		bind:value={effect.params.edges}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Shadows</span>
	<input
		bind:value={effect.params.shadows}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Highlights</span>
	<input
		bind:value={effect.params.highlights}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Margin left</span>
	<input
		bind:value={effect.params.marginLeft}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Margin right</span>
	<input
		bind:value={effect.params.marginRight}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Margin top</span>
	<input
		bind:value={effect.params.marginTop}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Margin bottom</span>
	<input
		bind:value={effect.params.marginBottom}
		max="1"
		min="0"
		step="0.01"
		type="range"
	/>
</label>

<label class="row">
	<span>Shadow</span>
	<input bind:value={effect.params.colorShadow} type="color" />
</label>

<label class="row">
	<span>Highlight</span>
	<input bind:value={effect.params.colorHighlight} type="color" />
</label>
