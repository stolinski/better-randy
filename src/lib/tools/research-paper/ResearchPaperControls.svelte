<script lang="ts">
	import AnnotationTextEditor from '$lib/annotations/AnnotationTextEditor.svelte';
	import ControlGroup from '$lib/platform/ControlGroup.svelte';

	import {
		RESEARCH_PAPER_EDITOR_MARK_COLORS,
		researchPaperState
	} from './research-paper-state.svelte';
</script>

<ControlGroup title="Document">
	<label class="row">
		<span>Title</span>
		<input bind:value={researchPaperState.title} type="text" />
	</label>

	<label class="row">
		<span>Source</span>
		<input bind:value={researchPaperState.sourceUrl} type="url" />
	</label>

	<div class="row">
		<span>Body</span>
		<AnnotationTextEditor
			bind:value={researchPaperState.body}
			colors={RESEARCH_PAPER_EDITOR_MARK_COLORS}
			label="Body"
			rows={10}
		/>
	</div>
</ControlGroup>
