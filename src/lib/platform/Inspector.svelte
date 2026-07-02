<script lang="ts">
	import { layerSelection, deselectLayer } from './selection.svelte';
	import RootInspector from './RootInspector.svelte';
	import SurfaceInspector from './SurfaceInspector.svelte';
	import OverlayInspector from './OverlayInspector.svelte';
	import TextAnimInspector from './TextAnimInspector.svelte';
	import MarkInspector from './MarkInspector.svelte';
	import SoundCueInspector from './SoundCueInspector.svelte';

	interface Props {
		handleExport: () => Promise<void>;
		isExporting: boolean;
		progress: number;
		status: string;
	}

	let { handleExport, isExporting, progress, status }: Props = $props();

	// Parse the selected layer ID to determine which inspector to show.
	// Track IDs follow these patterns (from Workspace.buildTracks()):
	//   'surface'                     → SurfaceInspector
	//   'overlay-{id}'                → OverlayInspector (exact overlay row)
	//   'overlay-{id}-stack/roll/spin/cursor-n' → sub-track, no dedicated inspector
	//   'textanim-{id}'               → TextAnimInspector
	//   'mark-{n}'                    → MarkInspector
	//   'imessage-{n}'                → SurfaceInspector (bubbles edit in its Messages section)
	const resolved = $derived.by(() => {
		const id = layerSelection.id;
		if (!id) return { kind: 'root' as const };

		if (id === 'surface' || /^imessage-\d+$/.test(id)) return { kind: 'surface' as const };

		// A cue selected on the timeline's Sound rail (ADR-0033 §9):
		// 'sound:derived-<cueId>' or 'sound:manual-<cueId>'.
		if (id.startsWith('sound:')) return { kind: 'soundCue' as const, cueRef: id.slice(6) };

		const markMatch = id.match(/^mark-(\d+)$/);
		if (markMatch) return { kind: 'mark' as const, index: parseInt(markMatch[1], 10) };

		const textAnimMatch = id.match(/^textanim-(.+)$/);
		if (textAnimMatch) return { kind: 'textanim' as const, animId: textAnimMatch[1] };

		// Exact overlay row: 'overlay-{id}' but NOT 'overlay-{id}-{suffix}'
		// Suffix sub-tracks: stack, roll, spin, cursor-N
		const overlayMatch = id.match(/^overlay-([^-]+(?:-[^-]+)*)$/);
		if (overlayMatch) {
			// Confirm it's not a known sub-track suffix
			const overlayId = overlayMatch[1];
			const knownSuffixes = ['-stack', '-roll', '-spin'];
			const isSub =
				knownSuffixes.some((s) => overlayId.endsWith(s)) || /^.+-cursor-\d+$/.test(overlayId);
			if (!isSub) return { kind: 'overlay' as const, overlayId };
		}

		// For overlay sub-tracks and imessage rows — generic label
		return { kind: 'generic' as const, id };
	});
</script>

<aside class="inspector">
	<div class="inspector__scroll">
		{#if resolved.kind === 'root'}
			<RootInspector {handleExport} {isExporting} {progress} {status} />
		{:else if resolved.kind === 'surface'}
			<SurfaceInspector />
		{:else if resolved.kind === 'overlay'}
			<OverlayInspector overlayId={resolved.overlayId} />
		{:else if resolved.kind === 'textanim'}
			<TextAnimInspector animId={resolved.animId} />
		{:else if resolved.kind === 'mark'}
			<MarkInspector markIndex={resolved.index} />
		{:else if resolved.kind === 'soundCue'}
			<SoundCueInspector cueRef={resolved.cueRef} />
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
	.inspector {
		background: var(--surface-1);
		block-size: 100%;
		border-inline-start: var(--border-1);
		display: flex;
		flex-direction: column;
		min-block-size: 0;
		overflow: hidden;
	}

	.inspector__scroll {
		flex: 1 1 auto;
		min-block-size: 0;
		overflow-y: auto;
	}

	/* Tool-grade controls: the default Graffiti form inputs are comfortable web
	   inputs (38px tall, 18px text) which read as a bloated form in an inspector.
	   Compact them to a dense, DaVinci-style scale across every inspector. */
	.inspector :global(input:not([type='checkbox']):not([type='range']):not([type='color'])),
	.inspector :global(select),
	.inspector :global(textarea) {
		block-size: auto;
		border-radius: var(--br-xs);
		font-size: 0.78rem;
		line-height: 1.2;
		min-block-size: 0;
		padding-block: 0.28rem;
		padding-inline: 0.5rem;
	}

	.inspector :global(input[type='color']) {
		block-size: 1.6rem;
		inline-size: 2.4rem;
		padding: 2px;
	}

	.inspector :global(input[type='range']) {
		inline-size: 100%;
	}

	/* Checkboxes + sliders take the tool accent (§7) instead of browser blue. */
	.inspector :global(input[type='checkbox']),
	.inspector :global(input[type='range']) {
		accent-color: #ffd608;
	}

	/* Focused control gets the yellow selection accent (§7). */
	.inspector :global(input:focus-visible),
	.inspector :global(select:focus-visible),
	.inspector :global(textarea:focus-visible) {
		border-color: #ffd608;
		outline: none;
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
		color: var(--fg-6);
		font-size: 0.8rem;
	}

	.generic-label {
		align-items: flex-start;
		display: flex;
		flex-direction: column;
		gap: var(--vs-s);
		padding: var(--vs-base);
	}

	.generic-label__id {
		color: var(--fg-6);
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
	}

	.generic-label__back {
		background: transparent;
		border: 0;
		color: var(--fg-5);
		cursor: pointer;
		font-size: 0.8rem;
		padding: 0;
	}

	.generic-label__back:hover {
		color: var(--fg);
	}
</style>
