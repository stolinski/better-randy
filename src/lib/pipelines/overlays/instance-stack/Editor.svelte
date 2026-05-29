<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { InstanceStackContent } from './index';
	import { VARIANT_IDS, VARIANTS } from './variants';

	let { overlay = $bindable() }: OverlayEditorProps<InstanceStackContent> = $props();
</script>

<label class="row">
	<span>Variant</span>
	<select bind:value={overlay.content.variant}>
		{#each VARIANT_IDS as id}
			<option value={id}>{VARIANTS[id].label}</option>
		{/each}
	</select>
</label>

<label class="row">
	<span>Text</span>
	<input bind:value={overlay.content.text} type="text" />
</label>

<label class="row">
	<span>Count</span>
	<input bind:value={overlay.content.count} type="number" min="2" max="40" />
</label>
