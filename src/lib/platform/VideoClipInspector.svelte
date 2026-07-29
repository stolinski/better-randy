<script lang="ts">
	import {
		removeSelectedVideoClip,
		setSelectedVideoClipAudioEnabled,
		setSelectedVideoClipAudioGain
	} from './composition-media-library';
	import { engineState } from './engine-state.svelte';
	import { deselectLayer } from './selection.svelte';
	import Field from './Field.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import InspectorToggle from './InspectorToggle.svelte';

	interface Props {
		clipId: string;
	}

	let { clipId }: Props = $props();

	const resolved = $derived.by(() => {
		const clip = engineState.media.videoTrack.clips.find((candidate) => candidate.id === clipId);
		if (!clip) return null;
		const asset = engineState.media.assets.find((candidate) => candidate.id === clip.assetId);
		return { clip, asset };
	});

	function setAudioEnabled(enabled: boolean): void {
		setSelectedVideoClipAudioEnabled(engineState.media, clipId, enabled);
	}

	function setAudioGain(event: Event): void {
		const gain = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isFinite(gain)) return;
		setSelectedVideoClipAudioGain(engineState.media, clipId, gain);
	}

	function removeClip(): void {
		if (removeSelectedVideoClip(engineState.media, clipId)) deselectLayer();
	}
</script>

{#if resolved}
	<InspectorSection label="Video clip">
		<Field label="Name">
			<span class="clip-name">{resolved.asset?.name ?? 'Missing media'}</span>
		</Field>
		<Field label="Identity">
			<code>{resolved.asset?.assetUrl.split('/').at(-1) ?? resolved.clip.assetId}</code>
		</Field>
		<Field label="Audio">
			<InspectorToggle
				checked={resolved.clip.audio.enabled}
				label="Video clip audio"
				onchange={setAudioEnabled}
			/>
		</Field>
		<Field label="Gain">
			<input
				type="range"
				min="0"
				max="4"
				step="0.01"
				value={resolved.clip.audio.gain}
				aria-label="Video clip audio gain"
				disabled={!resolved.clip.audio.enabled}
				oninput={setAudioGain}
			/>
			<span class="ins-unit">{resolved.clip.audio.gain.toFixed(2)}×</span>
		</Field>
		<button type="button" class="clip-remove" onclick={removeClip}>Remove</button>
	</InspectorSection>
{:else}
	<p class="clip-missing">Video clip unavailable.</p>
{/if}

<style>
	.clip-name {
		color: var(--chrome-text);
		font-size: 0.8125rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	code {
		color: var(--chrome-muted);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.68rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.clip-remove {
		background: transparent;
		border: 1px solid var(--chrome-hairline);
		border-radius: var(--br-xs);
		color: var(--chrome-muted);
		cursor: pointer;
		font-size: 0.75rem;
		padding-block: 4px;
		transition:
			border-color 120ms ease,
			background-color 120ms ease;
	}

	.clip-remove:hover {
		background: var(--chrome-raised);
		color: #f0453d;
	}

	.clip-remove:focus-visible {
		border-color: #ffd608;
		outline: none;
	}

	.clip-missing {
		color: var(--chrome-muted);
		font-size: 0.75rem;
		margin: 0;
		padding: var(--vs-base);
	}
</style>
