<script lang="ts">
	import AnnotationTextEditor from '$lib/annotations/AnnotationTextEditor.svelte';
	import { engineState, EDITOR_MARK_COLORS } from './engine-state.svelte';
	import { getSurfaceDefinition } from './pipelines/definition-registry';
	import { pipelineRendererRuntime } from './pipelines/runtime-context.svelte';
	import { requestInspectorFocus } from './selection.svelte';
	import { uploadUserImage } from '$lib/platform/user-image-upload-transport';
	import {
		DOCUMENT_SLOT_LABELS,
		isBodyVisible,
		listAbsentDocumentSlots,
		resolveDocumentSlotVisibility,
		type DocumentSlot
	} from '$lib/utils/surface-document-slots';
	import AddMenu from './AddMenu.svelte';
	import Field from './Field.svelte';

	// The Surface's document text slots (kicker / title / … / body label), the
	// rich-text body, and the "+ Slot" menu for declared-but-absent slots.
	// Which rows exist derives from the active renderer's controls.
	const definition = $derived(getSurfaceDefinition(engineState.surface.type));
	const controls = $derived(definition?.controls ?? {});
	const activeVariant = $derived(engineState.surface.variant ?? definition?.variantIds?.[0]);

	const documentSlots = $derived(
		resolveDocumentSlotVisibility(controls, engineState.surface, activeVariant)
	);
	const showBody = $derived(isBodyVisible(controls, engineState.surface));
	const absentSlots = $derived(
		listAbsentDocumentSlots(controls, engineState.surface, activeVariant)
	);
	const documentVisible = $derived(Object.values(documentSlots).some(Boolean) || showBody);

	let avatarUploadSequence = 0;

	async function handleAvatarFileChange(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const uploadSequence = ++avatarUploadSequence;
		input.setCustomValidity('');
		const file = input.files?.[0];
		if (!file) return;

		try {
			const avatarUrl = await uploadUserImage(file);
			if (uploadSequence === avatarUploadSequence) {
				engineState.surface.content.avatarUrl = avatarUrl;
			}
		} catch (error: unknown) {
			console.error('Avatar image upload failed', error);
			if (uploadSequence === avatarUploadSequence) {
				input.setCustomValidity(
					error instanceof Error ? error.message : 'Avatar image upload failed'
				);
				input.reportValidity();
			}
		} finally {
			input.value = '';
		}
	}

	function addSlot(slot: DocumentSlot): void {
		engineState.surface.content[slot] = '';
		// Reveal-and-focus rides the same one-shot channel as canvas direct
		// selection — the inspector's effect scrolls to the new input.
		requestInspectorFocus(`slot:${slot}`);
	}

	function removeSlot(slot: DocumentSlot): void {
		engineState.surface.content[slot] = undefined;
	}
</script>

{#if documentVisible}
	{#if documentSlots.kicker}
		<Field label="Kicker">
			<input bind:value={engineState.surface.content.kicker} data-slot="kicker" type="text" />
			<button
				type="button"
				class="clear-btn"
				aria-label="Remove kicker"
				onclick={() => removeSlot('kicker')}>×</button
			>
		</Field>
	{/if}
	{#if documentSlots.title}
		<Field label="Title">
			<input bind:value={engineState.surface.content.title} data-slot="title" type="text" />
			<button
				type="button"
				class="clear-btn"
				aria-label="Remove title"
				onclick={() => removeSlot('title')}>×</button
			>
		</Field>
	{/if}
	{#if documentSlots.counterpoint}
		<Field label="Counterpoint">
			<input
				bind:value={engineState.surface.content.counterpoint}
				data-slot="counterpoint"
				type="text"
			/>
			<button
				type="button"
				class="clear-btn"
				aria-label="Remove counterpoint"
				onclick={() => removeSlot('counterpoint')}>×</button
			>
		</Field>
	{/if}
	{#if documentSlots.sourceUrl}
		<Field label="Source">
			<input bind:value={engineState.surface.content.sourceUrl} data-slot="sourceUrl" type="text" />
			<button
				type="button"
				class="clear-btn"
				aria-label="Remove source"
				onclick={() => removeSlot('sourceUrl')}>×</button
			>
		</Field>
	{/if}
	{#if documentSlots.author}
		<Field label="Author">
			<input bind:value={engineState.surface.content.author} data-slot="author" type="text" />
			<button
				type="button"
				class="clear-btn"
				aria-label="Remove author"
				onclick={() => removeSlot('author')}>×</button
			>
		</Field>
	{/if}
	{#if documentSlots.affiliation}
		<Field label="Affiliation">
			<input
				bind:value={engineState.surface.content.affiliation}
				data-slot="affiliation"
				type="text"
			/>
			<button
				type="button"
				class="clear-btn"
				aria-label="Remove affiliation"
				onclick={() => removeSlot('affiliation')}>×</button
			>
		</Field>
	{/if}
	{#if documentSlots.avatarUrl}
		<Field label="Avatar">
			<input bind:value={engineState.surface.content.avatarUrl} data-slot="avatarUrl" type="text" />
			<input
				accept="image/png,image/jpeg,image/webp"
				aria-label="Choose avatar image"
				onchange={handleAvatarFileChange}
				type="file"
			/>
			<button
				type="button"
				class="clear-btn"
				aria-label="Remove avatar"
				onclick={() => removeSlot('avatarUrl')}>×</button
			>
		</Field>
	{/if}
	{#if documentSlots.source}
		<Field label="Citation">
			<input bind:value={engineState.surface.content.source} data-slot="source" type="text" />
			<button
				type="button"
				class="clear-btn"
				aria-label="Remove citation"
				onclick={() => removeSlot('source')}>×</button
			>
		</Field>
	{/if}
	{#if documentSlots.dateLabel}
		<Field label="Date">
			<input bind:value={engineState.surface.content.dateLabel} data-slot="dateLabel" type="text" />
			<button
				type="button"
				class="clear-btn"
				aria-label="Remove date"
				onclick={() => removeSlot('dateLabel')}>×</button
			>
		</Field>
	{/if}
	{#if documentSlots.bodyLabel}
		<Field label="Body label">
			<input bind:value={engineState.surface.content.bodyLabel} data-slot="bodyLabel" type="text" />
			<button
				type="button"
				class="clear-btn"
				aria-label="Remove body label"
				onclick={() => removeSlot('bodyLabel')}>×</button
			>
		</Field>
	{/if}
	{#if showBody}
		<div class="body-field">
			<span class="body-field__label">Body</span>
			<AnnotationTextEditor
				bind:body={engineState.surface.content.body}
				colors={EDITOR_MARK_COLORS}
				label="Body"
				prepareMarkStyle={(style) => pipelineRendererRuntime.ensureAnnotation(style)}
				rows={10}
			/>
		</div>
	{/if}
{/if}

{#if absentSlots.length > 0}
	<Field label="Add">
		<AddMenu
			label="+ Slot"
			groups={[
				{
					items: absentSlots.map((slot) => ({ value: slot, label: DOCUMENT_SLOT_LABELS[slot] }))
				}
			]}
			onselect={(slot) => addSlot(slot as DocumentSlot)}
		/>
	</Field>
{/if}

<style>
	/* Body is a tall rich-text editor — stack its label above and let it run
	   full width rather than forcing it into the label-left field grid. */
	.body-field {
		display: grid;
		gap: var(--vs-xs);
	}

	.body-field__label {
		color: var(--chrome-muted);
		font-size: 0.8125rem;
	}

	.clear-btn {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		flex: none;
		font-size: 1rem;
		line-height: 1;
		padding: 0 var(--vs-xs);
	}

	.clear-btn:hover {
		color: #f0453d;
	}
</style>
