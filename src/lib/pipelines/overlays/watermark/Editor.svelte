<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { WatermarkContent } from './index';
	import Field from '$lib/platform/Field.svelte';

	let { overlay = $bindable() }: OverlayEditorProps<WatermarkContent> = $props();

	function handleLabelInput(event: Event): void {
		const next = (event.currentTarget as HTMLInputElement).value;
		overlay.content.label = next.length > 0 ? next : undefined;
	}
</script>

<Field label="Handle">
	<input bind:value={overlay.content.handle} type="text" />
</Field>

<Field label="Label">
	<input value={overlay.content.label ?? ''} oninput={handleLabelInput} type="text" />
</Field>
