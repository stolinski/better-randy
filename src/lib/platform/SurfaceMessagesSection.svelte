<script lang="ts">
	import AnnotationTextEditor from '$lib/annotations/AnnotationTextEditor.svelte';
	import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
	import { DECORATIVE_ANNOTATION_STYLES } from '$lib/annotations/annotation-mark-styles';
	import { engineState, EDITOR_MARK_COLORS } from './engine-state.svelte';
	import type { ChatMessage } from './engine-schema';
	import { pipelineRendererRuntime } from './pipelines/runtime-context.svelte';
	import { layerSelection } from './selection.svelte';
	import { parseTimelineTrackId } from './timeline-entity-identity';
	import InspectorSection from './InspectorSection.svelte';
	import InspectorToggle from './InspectorToggle.svelte';
	import Field from './Field.svelte';

	// The iMessage conversation editor (ADR-0031): per-bubble text / side /
	// tapback / receipt / typing. Per-bubble timing stays on the timeline's
	// message tracks (one draggable clip per bubble).
	const TAPBACK_OPTIONS: { value: NonNullable<ChatMessage['tapback']>; label: string }[] = [
		{ value: 'heart', label: 'Heart' },
		{ value: 'like', label: 'Like' },
		{ value: 'dislike', label: 'Dislike' },
		{ value: 'haha', label: 'Haha' },
		{ value: 'emphasize', label: 'Emphasize' },
		{ value: 'question', label: 'Question' }
	];

	const messages = $derived(engineState.surface.content.messages ?? []);

	// A selected Surface-message timeline row (canvas bubble click or timeline
	// gutter) highlights its message entry.
	const selectedMessageIndex = $derived.by(() => {
		const identity = layerSelection.id ? parseTimelineTrackId(layerSelection.id) : null;
		return identity?.kind === 'surface-message' ? identity.index : null;
	});

	function addMessage(): void {
		const list = (engineState.surface.content.messages ??= []);
		const last = list.at(-1);
		list.push({ from: last?.from === 'them' ? 'me' : 'them', text: parseAnnotationBodyText('') });
	}

	function removeMessage(index: number): void {
		engineState.surface.content.messages?.splice(index, 1);
	}

	function messageFromChange(message: ChatMessage, value: string): void {
		message.from = value === 'me' ? 'me' : 'them';
	}

	function messageTapbackChange(message: ChatMessage, value: string): void {
		message.tapback = value === '' ? undefined : (value as NonNullable<ChatMessage['tapback']>);
	}

	function messageStatusChange(message: ChatMessage, value: string): void {
		message.status = value === '' ? undefined : (value as NonNullable<ChatMessage['status']>);
	}

	function messageTypingToggle(message: ChatMessage, hasTyping: boolean): void {
		message.typing = hasTyping ? { duration: 0.1 } : undefined;
	}
</script>

<InspectorSection label="Messages">
	{#each messages as message, index (index)}
		<div
			class="message-entry"
			class:message-entry--selected={selectedMessageIndex === index}
			data-message-row={index}
		>
			<div class="message-entry__header">
				<select
					class="message-entry__from"
					aria-label={`Message ${index + 1} sender`}
					value={message.from}
					onchange={(e) => messageFromChange(message, (e.currentTarget as HTMLSelectElement).value)}
				>
					<option value="them">Received</option>
					<option value="me">Sent</option>
				</select>
				<button
					type="button"
					class="remove-btn"
					aria-label={`Remove message ${index + 1}`}
					onclick={() => removeMessage(index)}>×</button
				>
			</div>
			<AnnotationTextEditor
				bind:body={message.text}
				colors={EDITOR_MARK_COLORS}
				label={`Message ${index + 1}`}
				prepareMarkStyle={(style) => pipelineRendererRuntime.ensureAnnotation(style)}
				rows={1}
				styles={DECORATIVE_ANNOTATION_STYLES}
			/>
			<Field label="Tapback">
				<select
					value={message.tapback ?? ''}
					onchange={(e) =>
						messageTapbackChange(message, (e.currentTarget as HTMLSelectElement).value)}
				>
					<option value="">None</option>
					{#each TAPBACK_OPTIONS as opt (opt.value)}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</Field>
			{#if message.from === 'me'}
				<Field label="Receipt">
					<select
						value={message.status ?? ''}
						onchange={(e) =>
							messageStatusChange(message, (e.currentTarget as HTMLSelectElement).value)}
					>
						<option value="">None</option>
						<option value="delivered">Delivered</option>
						<option value="read">Read</option>
					</select>
				</Field>
			{:else}
				<Field label="Typing">
					<InspectorToggle
						checked={message.typing !== undefined}
						label={`Message ${index + 1} typing indicator`}
						onchange={(checked) => messageTypingToggle(message, checked)}
					/>
				</Field>
			{/if}
		</div>
	{/each}
	<button type="button" class="ins-add" onclick={addMessage}>+ Add message</button>
</InspectorSection>

<style>
	/* A message entry: a sub-group separated by a hairline (not a card). */
	.message-entry {
		border-block-start: 1px solid var(--chrome-hairline);
		/* Constant transparent selection rail — coloring it on select (canvas
		   bubble click / timeline row) can't shift the layout. */
		border-inline-start: 2px solid transparent;
		display: grid;
		gap: var(--vs-xs);
		padding-block-start: var(--vs-s);
		padding-inline-start: var(--vs-xs);
	}

	.message-entry--selected {
		border-inline-start-color: #ffd608;
	}

	.message-entry__header {
		align-items: center;
		display: flex;
		gap: var(--vs-xs);
		justify-content: space-between;
	}

	.message-entry__from {
		flex: 0 1 auto;
		font-size: 0.8rem;
	}

	.remove-btn {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		flex: none;
		font-size: 1rem;
		line-height: 1;
		padding: 0 var(--vs-xs);
	}

	.remove-btn:hover {
		color: #f0453d;
	}
</style>
