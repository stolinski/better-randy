<script lang="ts">
	import { engineState } from './engine-state.svelte';
	import { layerSelection, deselectLayer } from './selection.svelte';
	import BlockInspector from './BlockInspector.svelte';
	import CaptionsInspector from './CaptionsInspector.svelte';
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

		if (id === 'captions') return { kind: 'captions' as const };

		// A cue selected on the timeline's Sound rail (ADR-0033 §9):
		// 'sound:derived-<cueId>' or 'sound:manual-<cueId>'.
		if (id.startsWith('sound:')) return { kind: 'soundCue' as const, cueRef: id.slice(6) };

		const markMatch = id.match(/^mark-(\d+)$/);
		if (markMatch) return { kind: 'mark' as const, index: parseInt(markMatch[1], 10) };

		const textAnimMatch = id.match(/^textanim-(.+)$/);
		if (textAnimMatch) return { kind: 'textanim' as const, animId: textAnimMatch[1] };

		// Diagram Block row: 'block-{id}' resolves against the live diagram so
		// the roll sub-track ('block-{id}-roll') routes to its parent element.
		if (id.startsWith('block-')) {
			const raw = id.slice('block-'.length);
			const diagram = engineState.surface.diagram ?? [];
			const exact = diagram.find((element) => element.id === raw);
			if (exact) return { kind: 'block' as const, blockId: raw };
			const parent = raw.endsWith('-roll') ? raw.slice(0, -'-roll'.length) : null;
			if (parent && diagram.some((element) => element.id === parent)) {
				return { kind: 'block' as const, blockId: parent };
			}
		}

		// Exact overlay row: 'overlay-{id}' but NOT 'overlay-{id}-{suffix}'
		// Suffix sub-tracks: stack, roll, spin, cursor-N
		const overlayMatch = id.match(/^overlay-([^-]+(?:-[^-]+)*)$/);
		if (overlayMatch) {
			// Confirm it's not a known sub-track suffix
			const overlayId = overlayMatch[1];
			const knownSuffixes = ['-stack', '-roll', '-spin', '-beat'];
			const isSub =
				knownSuffixes.some((s) => overlayId.endsWith(s)) || /^.+-cursor-\d+$/.test(overlayId);
			if (!isSub) return { kind: 'overlay' as const, overlayId };
		}

		// For overlay sub-tracks — generic label
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
		{:else if resolved.kind === 'block'}
			<BlockInspector blockId={resolved.blockId} />
		{:else if resolved.kind === 'captions'}
			<CaptionsInspector />
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
