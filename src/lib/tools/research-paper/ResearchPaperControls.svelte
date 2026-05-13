<script lang="ts">
	import AnnotationTextEditor from '$lib/annotations/AnnotationTextEditor.svelte';
	import ControlGroup from '$lib/platform/ControlGroup.svelte';
	import { EDITOR_MARK_COLORS, getResearchPaperSurface } from '$lib/platform/engine-state.svelte';

	const surface = $derived(getResearchPaperSurface());
</script>

<ControlGroup title="Document">
	<label class="row">
		<span>Title</span>
		<input bind:value={surface.content.title} type="text" />
	</label>

	<label class="row">
		<span>Source</span>
		<input bind:value={surface.content.sourceUrl} type="url" />
	</label>

	<div class="row">
		<span>Body</span>
		<AnnotationTextEditor
			bind:body={surface.content.body}
			colors={EDITOR_MARK_COLORS}
			label="Body"
			rows={10}
		/>
	</div>
</ControlGroup>
