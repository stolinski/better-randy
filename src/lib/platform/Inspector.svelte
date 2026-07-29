<script lang="ts">
	import { layerSelection, deselectLayer } from './selection.svelte';
	import {
		parseSoundRailReferenceId,
		parseTimelineTrackId,
		parseVideoClipSelectionId
	} from './timeline-entity-identity';
	import { inspectorRailMode } from './inspector-rail-mode.svelte';
	import BlockInspector from './BlockInspector.svelte';
	import CaptionsInspector from './CaptionsInspector.svelte';
	import MediaInspector from './MediaInspector.svelte';
	import RootInspector from './RootInspector.svelte';
	import SurfaceInspector from './SurfaceInspector.svelte';
	import OverlayInspector from './OverlayInspector.svelte';
	import TextAnimInspector from './TextAnimInspector.svelte';
	import MarkInspector from './MarkInspector.svelte';
	import SoundCueInspector from './SoundCueInspector.svelte';
	import VideoClipInspector from './VideoClipInspector.svelte';

	interface Props {
		handleExport: () => Promise<void>;
		isExporting: boolean;
		progress: number;
		status: string;
		separateWav?: boolean;
	}

	let {
		handleExport,
		isExporting,
		progress,
		status,
		separateWav = $bindable(false)
	}: Props = $props();

	// Resolve the selected runtime identity to its curated inspector. Main rows
	// and their subtracks intentionally route to the same owning entity.
	const resolved = $derived.by(() => {
		const id = layerSelection.id;
		if (!id) return { kind: 'root' as const };
		const videoClip = parseVideoClipSelectionId(id);
		if (videoClip) return { kind: 'video-clip' as const, clipId: videoClip.clipId };

		const track = parseTimelineTrackId(id);
		if (track) {
			switch (track.kind) {
				case 'surface':
				case 'surface-message':
				case 'checklist-item':
					return { kind: 'surface' as const };
				case 'captions':
					return { kind: 'captions' as const };
				case 'mark':
					return { kind: 'mark' as const, index: track.index };
				case 'text-animation':
					return { kind: 'text-animation' as const, textAnimationId: track.textAnimationId };
				case 'block':
				case 'block-subtrack':
					return { kind: 'block' as const, blockId: track.blockId };
				case 'overlay':
				case 'overlay-subtrack':
					return { kind: 'overlay' as const, overlayId: track.overlayId };
				case 'sound':
				case 'video':
					return { kind: 'generic' as const, id };
			}
		}

		const soundReference = parseSoundRailReferenceId(id);
		if (soundReference) return { kind: 'sound-cue' as const, reference: soundReference };

		return { kind: 'generic' as const, id };
	});
</script>

<aside class="inspector">
	<nav class="inspector__modes" aria-label="Inspector mode">
		<button
			type="button"
			aria-pressed={inspectorRailMode.mode === 'inspector'}
			onclick={() => inspectorRailMode.switchToInspector()}>Inspector</button
		>
		<button
			type="button"
			aria-pressed={inspectorRailMode.mode === 'media'}
			onclick={() => inspectorRailMode.switchToMedia()}>Media</button
		>
	</nav>
	<div class="inspector__scroll">
		{#if inspectorRailMode.mode === 'media'}
			<MediaInspector />
		{:else if resolved.kind === 'root'}
			<RootInspector {handleExport} {isExporting} {progress} {status} bind:separateWav />
		{:else if resolved.kind === 'surface'}
			<SurfaceInspector />
		{:else if resolved.kind === 'overlay'}
			<OverlayInspector overlayId={resolved.overlayId} />
		{:else if resolved.kind === 'block'}
			<BlockInspector blockId={resolved.blockId} />
		{:else if resolved.kind === 'captions'}
			<CaptionsInspector />
		{:else if resolved.kind === 'text-animation'}
			<TextAnimInspector animId={resolved.textAnimationId} />
		{:else if resolved.kind === 'mark'}
			<MarkInspector markIndex={resolved.index} />
		{:else if resolved.kind === 'sound-cue'}
			<SoundCueInspector reference={resolved.reference} />
		{:else if resolved.kind === 'video-clip'}
			<VideoClipInspector clipId={resolved.clipId} />
		{:else}
			<div class="generic-label">
				<span class="generic-label__id">{resolved.id}</span>
				<button type="button" class="generic-label__back" onclick={deselectLayer}>
					← composition
				</button>
			</div>
		{/if}
	</div>
</aside>

<style>
	/* The rail is a deck panel (DESIGN.md elevation): labels engraved in
	   Archivo, values on the LCD in mono, wells recessed below the deck. */
	.inspector {
		background: var(--chrome-deck);
		block-size: 100%;
		border-inline-start: 1px solid var(--chrome-hairline);
		color: var(--chrome-text);
		display: flex;
		flex-direction: column;
		font-family: Archivo, sans-serif;
		min-block-size: 0;
		overflow: hidden;
	}

	/* A stable gutter so selecting a layer never reflows the controls, and a
	   thin ladder-colored scrollbar instead of OS chrome. */
	.inspector__scroll {
		flex: 1 1 auto;
		min-block-size: 0;
		overflow-y: auto;
		scrollbar-color: var(--chrome-hairline) transparent;
		scrollbar-gutter: stable;
		scrollbar-width: thin;
	}

	/* Tool-grade controls: the default Graffiti form inputs are comfortable web
	   inputs (38px tall, 18px text) which read as a bloated form in an inspector.
	   Compact them to a dense, DaVinci-style scale across every inspector, as
	   recessed mono wells per the DESIGN.md input contract. */
	.inspector :global(input:not([type='checkbox']):not([type='range']):not([type='color'])),
	.inspector :global(select),
	.inspector :global(textarea) {
		background: var(--chrome-well);
		block-size: auto;
		border: 1px solid var(--chrome-hairline);
		border-radius: var(--br-xs);
		box-shadow: none;
		color: var(--chrome-text);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8125rem;
		font-weight: var(--fw-semibold);
		line-height: 1.2;
		min-block-size: 0;
		padding-block: 4px;
		padding-inline: var(--vs-s);
		transition:
			border-color 120ms ease,
			background-color 120ms ease;
	}

	.inspector :global(button) {
		font-family: inherit;
	}

	.inspector__modes {
		border-block-end: 1px solid var(--chrome-hairline);
		display: grid;
		flex: none;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		padding: var(--vs-xs);
	}

	.inspector__modes button {
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--br-xs);
		color: var(--chrome-muted);
		cursor: pointer;
		font-size: 0.75rem;
		font-weight: var(--fw-semibold);
		padding-block: 4px;
		transition:
			border-color 120ms ease,
			background-color 120ms ease;
	}

	.inspector__modes button:hover {
		background: var(--chrome-raised);
		color: var(--chrome-text);
	}

	.inspector__modes button[aria-pressed='true'] {
		background: var(--chrome-well);
		border-color: var(--chrome-hairline);
		color: var(--chrome-text);
	}

	.inspector__modes button:focus-visible {
		border-color: #ffd608;
		outline: none;
	}

	.inspector :global(input[type='color']) {
		block-size: 1.6rem;
		inline-size: 2.4rem;
		padding: 2px;
	}

	/* Sliders fill the row and take the tool accent (§7) instead of browser blue. */
	.inspector :global(input[type='range']) {
		accent-color: #ffd608;
		inline-size: 100%;
	}

	/* Focused control gets the yellow selection accent (§7). */
	.inspector :global(input:focus-visible),
	.inspector :global(select:focus-visible),
	.inspector :global(textarea:focus-visible) {
		border-color: #ffd608;
		outline: none;
	}

	/* The one add-action grammar (shared by AddMenu and direct add buttons):
	   a compact raised step with a sans label. */
	.inspector :global(.ins-add) {
		align-items: center;
		background: var(--chrome-raised);
		border: 1px solid var(--chrome-hairline);
		border-radius: var(--br-xs);
		color: var(--chrome-text);
		cursor: pointer;
		display: inline-flex;
		font-family: Archivo, sans-serif;
		font-size: 0.72rem;
		font-weight: var(--fw-semibold);
		line-height: 1;
		min-block-size: 24px;
		padding-block: 0;
		padding-inline: var(--vs-s);
		transition:
			border-color 120ms ease,
			background-color 120ms ease;
	}

	.inspector :global(.ins-add:hover:not(:disabled)) {
		background: var(--chrome-hairline);
	}

	.inspector :global(.ins-add:focus-visible) {
		border-color: #ffd608;
		outline: none;
	}

	.inspector :global(.ins-add:disabled) {
		color: var(--chrome-muted);
		cursor: default;
		opacity: 0.6;
	}

	/* Unit suffix beside a value input (s / ms / derived seconds). */
	.inspector :global(.ins-unit) {
		color: var(--chrome-muted);
		flex: none;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
		white-space: nowrap;
	}

	/* Graffiti's `.row` (used by the per-type content editors) defaults to a
	   stacked, roomy form layout. Pull it onto the same label-left, dense grid as
	   the shared Field so content editors read as one system. (Field-level curation
	   of those editors is a separate pass.) */
	.inspector :global(.row) {
		align-items: center;
		column-gap: var(--vs-s);
		display: grid;
		grid-template-columns: var(--ins-label-w, 5.5rem) minmax(0, 1fr);
		margin: 0;
	}

	.inspector :global(.row > span) {
		color: var(--chrome-muted);
		font-family: Archivo, sans-serif;
		font-size: 0.8125rem;
	}

	.generic-label {
		align-items: flex-start;
		display: flex;
		flex-direction: column;
		gap: var(--vs-s);
		padding: var(--vs-base);
	}

	.generic-label__id {
		color: var(--chrome-muted);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.75rem;
	}

	.generic-label__back {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		font-size: 0.8rem;
		padding: 0;
	}

	.generic-label__back:hover {
		color: var(--chrome-text);
	}
</style>
