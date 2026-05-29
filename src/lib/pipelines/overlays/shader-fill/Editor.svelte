<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import { SHADER_FILL_DEFAULTS, type ShaderFillContent } from './index';

	let { overlay = $bindable() }: OverlayEditorProps<ShaderFillContent> = $props();

	const color0 = $derived(overlay.content.color0 ?? SHADER_FILL_DEFAULTS.color0);
	const color1 = $derived(overlay.content.color1 ?? SHADER_FILL_DEFAULTS.color1);
	const color2 = $derived(overlay.content.color2 ?? SHADER_FILL_DEFAULTS.color2);
	const flowSpeed = $derived(overlay.content.flowSpeed ?? SHADER_FILL_DEFAULTS.flowSpeed);
	const opacity = $derived(overlay.content.opacity ?? SHADER_FILL_DEFAULTS.opacity);
</script>

<label class="row">
	<span>Color 1</span>
	<input
		type="color"
		value={color0}
		oninput={(e) => (overlay.content.color0 = (e.currentTarget as HTMLInputElement).value)}
	/>
</label>

<label class="row">
	<span>Color 2</span>
	<input
		type="color"
		value={color1}
		oninput={(e) => (overlay.content.color1 = (e.currentTarget as HTMLInputElement).value)}
	/>
</label>

<label class="row">
	<span>Color 3</span>
	<input
		type="color"
		value={color2}
		oninput={(e) => (overlay.content.color2 = (e.currentTarget as HTMLInputElement).value)}
	/>
</label>

<label class="row">
	<span>Flow speed</span>
	<input
		type="range"
		min="0"
		max="4"
		step="0.05"
		value={flowSpeed}
		oninput={(e) =>
			(overlay.content.flowSpeed = Number((e.currentTarget as HTMLInputElement).value))}
	/>
</label>

<label class="row">
	<span>Opacity</span>
	<input
		type="range"
		min="0"
		max="1"
		step="0.01"
		value={opacity}
		oninput={(e) =>
			(overlay.content.opacity = Number((e.currentTarget as HTMLInputElement).value))}
	/>
</label>
