<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import Field from '$lib/platform/Field.svelte';
	import type { ShaderFillContent } from './index';
	import { SHADER_FILL_DEFAULTS } from './shader-fill-defaults';

	let { overlay = $bindable() }: OverlayEditorProps<ShaderFillContent> = $props();

	const color0 = $derived(overlay.content.color0 ?? SHADER_FILL_DEFAULTS.color0);
	const color1 = $derived(overlay.content.color1 ?? SHADER_FILL_DEFAULTS.color1);
	const color2 = $derived(overlay.content.color2 ?? SHADER_FILL_DEFAULTS.color2);
	const flowSpeed = $derived(overlay.content.flowSpeed ?? SHADER_FILL_DEFAULTS.flowSpeed);
	const opacity = $derived(overlay.content.opacity ?? SHADER_FILL_DEFAULTS.opacity);
</script>

<Field label="Color 1">
	<input
		type="color"
		value={color0}
		oninput={(e) => (overlay.content.color0 = (e.currentTarget as HTMLInputElement).value)}
	/>
</Field>

<Field label="Color 2">
	<input
		type="color"
		value={color1}
		oninput={(e) => (overlay.content.color1 = (e.currentTarget as HTMLInputElement).value)}
	/>
</Field>

<Field label="Color 3">
	<input
		type="color"
		value={color2}
		oninput={(e) => (overlay.content.color2 = (e.currentTarget as HTMLInputElement).value)}
	/>
</Field>

<Field label="Flow speed">
	<input
		type="range"
		min="0"
		max="4"
		step="0.05"
		value={flowSpeed}
		oninput={(e) => (overlay.content.flowSpeed = Number((e.currentTarget as HTMLInputElement).value))}
	/>
</Field>

<Field label="Opacity">
	<input
		type="range"
		min="0"
		max="1"
		step="0.01"
		value={opacity}
		oninput={(e) => (overlay.content.opacity = Number((e.currentTarget as HTMLInputElement).value))}
	/>
</Field>
