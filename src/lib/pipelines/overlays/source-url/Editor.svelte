<script lang="ts">
	import Field from '$lib/platform/Field.svelte';
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';

	import type { SourceUrlContent } from './index';

	let { overlay = $bindable() }: OverlayEditorProps<SourceUrlContent> = $props();
</script>

<Field label="URL">
	<input bind:value={overlay.content.url} type="text" />
</Field>
