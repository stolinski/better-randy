<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { YoutubeSubscribeContent } from './index';
	import Field from '$lib/platform/Field.svelte';

	let { overlay = $bindable() }: OverlayEditorProps<YoutubeSubscribeContent> = $props();
</script>

<Field label="Channel">
	<input bind:value={overlay.content.channel} type="text" />
</Field>

<Field label="Handle">
	<input bind:value={overlay.content.handle} type="text" placeholder="@handle" />
</Field>

<Field label="Meta">
	<input bind:value={overlay.content.subscribers} type="text" placeholder="1.2M subscribers" />
</Field>

<Field label="Avatar URL">
	<input bind:value={overlay.content.avatarUrl} type="text" placeholder="silhouette" />
</Field>

<Field label="Theme">
	<select bind:value={overlay.content.theme}>
		<option value="light">Light</option>
		<option value="dark">Dark</option>
	</select>
</Field>

<Field label="Press beat">
	<input bind:value={overlay.content.beat} type="number" min="0" max="1" step="0.01" />
</Field>
