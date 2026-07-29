<script lang="ts">
	import { onMount } from 'svelte';

	import {
		removeCompositionMediaAsset,
		renameCompositionMediaAsset,
		uploadNativeVideoToCompositionMedia
	} from './composition-media-library';
	import { compositionMediaInspection } from './composition-media-inspection.svelte';
	import { engineState } from './engine-state.svelte';
	import { writeMediaLibraryAssetDragTransfer } from './media-library-drag-transfer';
	import type { UserVideoAssetDescriptor } from './user-video-asset';
	import { uploadUserVideo } from './user-video-upload-transport';
	import Field from './Field.svelte';
	import InspectorSection from './InspectorSection.svelte';

	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);

	onMount(() => {
		for (const asset of engineState.media.assets) {
			void compositionMediaInspection.ensure(asset.assetUrl);
		}
	});

	async function handleUpload(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const uploadCapture: { descriptor?: UserVideoAssetDescriptor } = {};
		isUploading = true;
		uploadError = null;
		try {
			const result = await uploadNativeVideoToCompositionMedia(
				file,
				() => engineState.media,
				async (uploadFile) => {
					const descriptor = await uploadUserVideo(uploadFile);
					uploadCapture.descriptor = descriptor;
					return descriptor;
				}
			);
			if (result.status === 'committed' && uploadCapture.descriptor) {
				compositionMediaInspection.seed(uploadCapture.descriptor);
			}
		} catch (error) {
			uploadError = error instanceof Error ? error.message : 'Video upload failed.';
		} finally {
			input.value = '';
			isUploading = false;
		}
	}

	function handleRename(assetId: string, event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		try {
			renameCompositionMediaAsset(engineState.media, assetId, input.value);
		} catch {
			const asset = engineState.media.assets.find((candidate) => candidate.id === assetId);
			if (asset) input.value = asset.name;
		}
	}

	function isReferenced(assetId: string): boolean {
		return engineState.media.videoTrack.clips.some((clip) => clip.assetId === assetId);
	}

	function handleRemove(assetId: string): void {
		const result = removeCompositionMediaAsset(engineState.media, assetId);
		if (
			result.status === 'removed' &&
			!engineState.media.assets.some((asset) => asset.assetUrl === result.asset.assetUrl)
		) {
			compositionMediaInspection.forget(result.asset.assetUrl);
		}
	}

	function handleDragStart(event: DragEvent, assetId: string): void {
		if (!event.dataTransfer) return;
		writeMediaLibraryAssetDragTransfer(event.dataTransfer, assetId);
	}
</script>

<InspectorSection label="Media">
	<Field label="Upload">
		<input
			type="file"
			accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
			aria-label="Upload video to composition media"
			disabled={isUploading}
			onchange={handleUpload}
		/>
	</Field>
	{#if uploadError}
		<p class="media-error" role="alert">{uploadError}</p>
	{/if}
	<ul class="media-list" aria-label="Composition media">
		{#each engineState.media.assets as asset (asset.id)}
			{@const inspection = compositionMediaInspection.read(asset.assetUrl)}
			<li draggable="true" ondragstart={(event) => handleDragStart(event, asset.id)}>
				<div class="media-row">
					<input
						type="text"
						value={asset.name}
						aria-label={`Name ${asset.name}`}
						onchange={(event) => handleRename(asset.id, event)}
					/>
					<button
						type="button"
						class="media-remove"
						aria-label={`Remove ${asset.name} from composition media`}
						disabled={isReferenced(asset.id)}
						onclick={() => handleRemove(asset.id)}>×</button
					>
				</div>
				<code>{asset.assetUrl.split('/').at(-1) ?? asset.assetUrl}</code>
				{#if inspection.status === 'ready'}
					<p class="media-details">
						{inspection.metadata.displayWidth}×{inspection.metadata.displayHeight} ·
						{inspection.metadata.durationSeconds.toFixed(2)}s ·
						{inspection.metadata.averageFrameRate.toFixed(2)} fps ·
						{inspection.metadata.videoCodec}{inspection.metadata.audioCodec
							? ` / ${inspection.metadata.audioCodec}`
							: inspection.metadata.hasAudio
								? ''
								: ' / silent'}
					</p>
				{:else if inspection.status === 'error'}
					<p class="media-error">{inspection.message}</p>
				{:else}
					<p class="media-status">{inspection.status === 'probing' ? 'Probing…' : 'Pending'}</p>
				{/if}
			</li>
		{:else}
			<li class="media-empty">No media.</li>
		{/each}
	</ul>
</InspectorSection>

<style>
	.media-list {
		display: grid;
		gap: var(--vs-s);
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.media-list li:not(.media-empty) {
		border-block-start: 1px solid var(--chrome-hairline);
		display: grid;
		gap: var(--vs-xs);
		min-inline-size: 0;
		padding-block-start: var(--vs-s);
	}

	.media-list li[draggable='true'] {
		cursor: grab;
	}

	.media-row {
		align-items: center;
		display: flex;
		gap: var(--vs-xs);
		min-inline-size: 0;
	}

	.media-row input {
		flex: 1 1 auto;
		min-inline-size: 0;
	}

	.media-remove {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		font-size: 1rem;
		padding: 0 var(--vs-xs);
	}

	.media-remove:hover:not(:disabled) {
		color: #f0453d;
	}

	.media-remove:focus-visible {
		color: var(--chrome-text);
		outline: none;
	}

	.media-remove:disabled {
		cursor: default;
		opacity: 0.45;
	}

	.media-list code,
	.media-details,
	.media-status,
	.media-error {
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		line-height: 1.35;
		margin: 0;
	}

	.media-list code {
		color: var(--chrome-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.media-details,
	.media-status,
	.media-empty {
		color: var(--chrome-muted);
	}

	.media-error {
		color: #f0453d;
	}

	.media-empty {
		font-size: 0.75rem;
	}
</style>
