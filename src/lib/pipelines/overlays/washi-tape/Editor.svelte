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

<Field label="Rotation">
	<input
		bind:value={overlay.content.rotation}
		type="number"
		min={WASHI_TAPE_DEFAULTS.rotationMin}
		max={WASHI_TAPE_DEFAULTS.rotationMax}
		step="1"
	/>
</Field>

<Field label="Length">
	<input bind:value={overlay.content.length} type="number" min="60" max="800" step="10" />
</Field>
