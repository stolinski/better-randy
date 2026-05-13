<script lang="ts">
	import AnnotationTextEditor from '$lib/annotations/AnnotationTextEditor.svelte';
	import ControlGroup from '$lib/platform/ControlGroup.svelte';
	import {
		CAMERA_MOTION_OPTIONS,
		ENGINE_FONT_FAMILIES,
		type FontDefinition,
		type FontFamily
	} from '$lib/platform/engine-schema';
	import {
		EDITOR_MARK_COLORS,
		engineState,
		getQuoteFocusSurface
	} from '$lib/platform/engine-state.svelte';

	const surface = $derived(getQuoteFocusSurface());

	const fontFamilyOptions = Object.entries(ENGINE_FONT_FAMILIES) as [
		FontFamily,
		FontDefinition
	][];
</script>

<ControlGroup title="Source">
	<div class="row">
		<span>Body</span>
		<AnnotationTextEditor
			bind:body={surface.content.body}
			colors={EDITOR_MARK_COLORS}
			label="Body"
			rows={8}
		/>
	</div>

	<label class="row">
		<span>Author</span>
		<input bind:value={surface.content.author} type="text" />
	</label>

	<label class="row">
		<span>Source</span>
		<input bind:value={surface.content.source} type="text" />
	</label>

	<label class="row">
		<span>Date</span>
		<input bind:value={surface.content.dateLabel} type="text" />
	</label>

	<label class="row">
		<input bind:checked={surface.showSourceMetadata} type="checkbox" />
		<span>Show attribution</span>
	</label>
</ControlGroup>

<ControlGroup title="Appearance">
	<label class="row">
		<span>Font</span>
		<select bind:value={engineState.typography.fontFamily}>
			{#each fontFamilyOptions as [value, option] (value)}
				<option {value}>{option.label}</option>
			{/each}
		</select>
	</label>

	<label class="row">
		<span>Paper</span>
		<input bind:value={engineState.typography.paperColor} type="color" />
	</label>

	<label class="row">
		<span>Ink</span>
		<input bind:value={engineState.typography.inkColor} type="color" />
	</label>

	<label class="row">
		<span>Background</span>
		<input
			bind:value={surface.backgroundVisibility}
			max="1"
			min="0"
			step="0.01"
			type="range"
		/>
	</label>

	<label class="row">
		<span>Camera</span>
		<select bind:value={surface.camera}>
			{#each CAMERA_MOTION_OPTIONS as option (option.value)}
				<option value={option.value}>{option.label}</option>
			{/each}
		</select>
	</label>
</ControlGroup>
