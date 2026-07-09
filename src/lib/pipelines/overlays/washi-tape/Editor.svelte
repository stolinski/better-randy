<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { WashiTapeContent } from './index';
	import { WASHI_TAPE_DEFAULTS } from './index';
	import Field from '$lib/platform/Field.svelte';

	let { overlay = $bindable() }: OverlayEditorProps<WashiTapeContent> = $props();
</script>

<Field label="Color">
	<input bind:value={overlay.content.color} type="color" />
</Field>

<!-- The aesthetic's 5–25° is a magnitude — tape lies on either diagonal, so
     the schema bound (and this input) is ±rotationMax, not rotationMin+. -->
<Field label="Rotation°">
	<input
		bind:value={overlay.content.rotation}
		type="number"
		min={-WASHI_TAPE_DEFAULTS.rotationMax}
		max={WASHI_TAPE_DEFAULTS.rotationMax}
		step="any"
	/>
</Field>

<Field label="Length">
	<input bind:value={overlay.content.length} type="number" min="60" max="800" step="any" />
</Field>
