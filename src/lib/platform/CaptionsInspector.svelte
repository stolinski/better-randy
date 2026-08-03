<script lang="ts">
	import { engineState } from './engine-state.svelte';
	import Field from './Field.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import { cuesToSrt, parseSrt } from '$lib/utils/srt';

	// Captions inspector: the style knobs plus the SRT editor — the GUI lane
	// of the captions domain. The editor IS the import affordance: paste any
	// .srt and it parses into cues on change; the same box round-trips the
	// current cues back to standard SRT, so timing edits made on the timeline
	// rail show up here in subtitle form. Per-cue timing is the rail's job
	// (draggable clips); this panel owns text and style.

	const captions = $derived(engineState.captions ?? null);

	let srtError = $state<string | null>(null);

	function applySrt(text: string): void {
		if (!captions) return;
		try {
			const cues = parseSrt(text);
			if (cues.length === 0) {
				srtError = 'No cues found — paste standard SRT (index, timing line, text).';
				return;
			}
			srtError = null;
			captions.cues = cues;
		} catch (error) {
			srtError = error instanceof Error ? error.message : String(error);
		}
	}

	function setAccent(value: string): void {
		if (!captions) return;
		captions.accent = value;
	}

	function setFraction(key: 'y' | 'scale', raw: string, min: number, max: number): void {
		if (!captions) return;
		const n = Number(raw);
		if (!Number.isFinite(n)) return;
		captions[key] = Math.max(min, Math.min(max, n));
	}
</script>

{#if captions}
	<InspectorSection label="Captions">
		<Field label="Style">
			<select bind:value={captions.style}>
				<option value="karaoke">Karaoke highlight</option>
				<option value="word-pop">Word pop</option>
				<option value="pack">Pack styled</option>
			</select>
		</Field>
		{#if captions.style !== 'pack'}
			<Field label="Accent">
				<input
					type="color"
					value={captions.accent ?? '#ffd608'}
					oninput={(e) => setAccent((e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
		{/if}
		<Field label="Band Y">
			<input
				type="number"
				min="0"
				max="1"
				step="any"
				value={captions.y ?? 0.8}
				oninput={(e) => setFraction('y', (e.currentTarget as HTMLInputElement).value, 0, 1)}
			/>
		</Field>
		<Field label="Scale">
			<input
				type="number"
				min="0.25"
				max="4"
				step="any"
				value={captions.scale ?? 1}
				oninput={(e) => setFraction('scale', (e.currentTarget as HTMLInputElement).value, 0.25, 4)}
			/>
		</Field>
	</InspectorSection>

	<InspectorSection label="SRT">
		<textarea
			class="captions-srt"
			rows="12"
			spellcheck="false"
			value={cuesToSrt(captions.cues)}
			onchange={(e) => applySrt((e.currentTarget as HTMLTextAreaElement).value)}
		></textarea>
		{#if srtError}
			<p class="captions-srt__error">{srtError}</p>
		{/if}
	</InspectorSection>
{/if}

<style>
	.captions-srt {
		font-family: 'Paper Mono', monospace;
		font-size: 0.72rem;
		inline-size: 100%;
		line-height: 1.45;
		resize: vertical;
	}

	.captions-srt__error {
		color: #f0453d;
		font-size: 0.72rem;
		line-height: 1.4;
		margin: 0;
	}
</style>
