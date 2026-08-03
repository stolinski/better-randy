<script lang="ts">
	import { engineState } from './engine-state.svelte';
	import { listSoundAssets } from './audio-assets';
	import InspectorSection from './InspectorSection.svelte';
	import Field from './Field.svelte';

	// Composition-level sound: free-standing cues + the bed (ADR-0033 §5).
	// Motion sounds are derived and live on each item's Sound section — this
	// authors only what has no motion to ride: free-standing sounds (placed at
	// the playhead) and the single bed (full-frame pieces only, so "+ Bed"
	// shows only while a background fill or Video clip is present).
	const soundAssets = listSoundAssets();
	const hasBed = $derived(engineState.audioCues.some((cue) => cue.kind === 'bed'));

	function addAudioCue(kind: 'cue' | 'bed'): void {
		const used = new Set(engineState.audioCues.map((cue) => cue.id));
		let counter = 1;
		let id = kind === 'bed' ? 'bed' : `sound-${counter}`;
		while (used.has(id)) {
			counter += 1;
			id = `${kind === 'bed' ? 'bed' : 'sound'}-${counter}`;
		}
		// A free-standing sound drops at the playhead (the DaVinci gesture); the
		// timeline seam is the same one verification drives.
		const timeline = typeof window !== 'undefined' ? window.__supersTimeline : undefined;
		const playhead =
			timeline && timeline.durationSeconds > 0
				? Math.min(0.98, timeline.time / timeline.durationSeconds)
				: 0.5;
		engineState.audioCues.push(
			kind === 'bed'
				? {
						id,
						kind,
						assetSlug: 'bed-ambient-texture',
						start: 0,
						duration: 1,
						volume: 0.4
					}
				: { id, kind, assetSlug: soundAssets[0] ?? 'core-impact', start: playhead, duration: 0.05 }
		);
	}

	function setCueFraction(
		cue: { start: number; duration: number },
		key: 'start' | 'duration',
		value: string
	): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		cue[key] = Math.max(0, Math.min(1, n));
	}
</script>

<InspectorSection
	label="Sound"
	summary={engineState.audioCues.length > 0
		? `${engineState.audioCues.length} ${engineState.audioCues.length === 1 ? 'cue' : 'cues'}`
		: 'None'}
>
	{#each engineState.audioCues as cue, index (cue.id)}
		<div class="cue-entry">
			<div class="cue-entry__header">
				<span class="cue-entry__label">{cue.kind === 'bed' ? 'bed' : cue.id}</span>
				<button
					type="button"
					class="remove-btn"
					aria-label="Remove audio cue"
					onclick={() => engineState.audioCues.splice(index, 1)}>×</button
				>
			</div>
			<Field label="Sample">
				<select bind:value={cue.assetSlug}>
					{#each soundAssets as slug (slug)}
						<option value={slug}>{slug}</option>
					{/each}
				</select>
			</Field>
			<Field label="Window">
				<!-- Display rounded to the drag grain — a rail drag writes raw floats
				     (0.0498735…) that would otherwise spill into the input. -->
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={Math.round(cue.start * 1000) / 1000}
					oninput={(e) => setCueFraction(cue, 'start', (e.currentTarget as HTMLInputElement).value)}
				/>
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={Math.round(cue.duration * 1000) / 1000}
					oninput={(e) =>
						setCueFraction(cue, 'duration', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Volume">
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={cue.volume ?? 1}
					oninput={(e) => {
						cue.volume = Number((e.currentTarget as HTMLInputElement).value);
					}}
				/>
			</Field>
		</div>
	{/each}
	<!-- Add slots trail the entries, keeping the header side free for the
	     collapsed-state summary. -->
	<button type="button" class="ins-add" onclick={() => addAudioCue('cue')}>+ Sound</button>
	{#if (engineState.backgroundFill !== undefined || engineState.media.videoTrack.clips.length > 0) && !hasBed}
		<button type="button" class="ins-add" onclick={() => addAudioCue('bed')}>+ Bed</button>
	{/if}
</InspectorSection>

<style>
	/* A manual cue / bed entry: hairline-separated sub-group, like effect rows. */
	.cue-entry {
		border-block-start: 1px solid var(--chrome-hairline);
		display: grid;
		gap: var(--vs-xs);
		padding-block-start: var(--vs-xs);
	}

	.cue-entry__header {
		align-items: center;
		display: flex;
		justify-content: space-between;
	}

	.cue-entry__label {
		color: var(--chrome-muted);
		font-family: 'Paper Mono', monospace;
		font-size: 0.72rem;
	}

	.remove-btn {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		font-size: 1rem;
		padding: 0 var(--vs-xs);
	}

	.remove-btn:hover {
		color: #f0453d;
	}
</style>
