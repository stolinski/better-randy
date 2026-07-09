<script lang="ts">
	import type { OverlayEditorProps } from '$lib/platform/pipelines/types';
	import type { InstagramFollowContent } from './index';
	import Field from '$lib/platform/Field.svelte';

	let { overlay = $bindable() }: OverlayEditorProps<InstagramFollowContent> = $props();
</script>

<Field label="Username">
	<input bind:value={overlay.content.username} type="text" />
</Field>

<Field label="Name">
	<input bind:value={overlay.content.name} type="text" />
</Field>

<Field label="Meta">
	<input bind:value={overlay.content.meta} type="text" placeholder="482K followers" />
</Field>

<Field label="Verified">
	<input bind:checked={overlay.content.verified} type="checkbox" />
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
