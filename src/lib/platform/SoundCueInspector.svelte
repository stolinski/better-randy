<script lang="ts">
	import { listSoundAssets } from './audio-assets';
	import type { SoundOverride } from './engine-schema';
	import { engineState, ensureMarkTimingAtIndex } from './engine-state.svelte';
	import { deselectLayer } from './selection.svelte';
	import { deriveSoundCues, resolveCueSample } from './sound-cues';
	import Field from './Field.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import SoundPicker from './SoundPicker.svelte';

	/**
	 * A cue selected on the timeline's Sound rail (ADR-0033 §9: "selecting a
	 * cue focuses it in the sidebar"). Derived cues edit the SOURCE MOTION's
	 * sound (the same SoundPicker the Layer inspectors use — the cue itself is
	 * never stored); manual cues and the bed edit their audioCues[] entry.
	 */
	interface Props {
		/** `derived-<cueId>` or `manual-<cueId>` — the rail transition id. */
		cueRef: string;
	}

	let { cueRef }: Props = $props();

	const soundAssets = listSoundAssets();

	const derivedCueId = $derived(cueRef.startsWith('derived-') ? cueRef.slice(8) : null);
	const manualCueId = $derived(cueRef.startsWith('manual-') ? cueRef.slice(7) : null);

	const cue = $derived(
		derivedCueId ? deriveSoundCues(engineState).find((c) => c.id === derivedCueId) : undefined
	);
	const resolvedSample = $derived(cue ? resolveCueSample(cue) : null);

	const manualCue = $derived(
		manualCueId ? engineState.audioCues.find((c) => c.id === manualCueId) : undefined
	);

	interface MotionWindow {
		sound?: SoundOverride;
	}

	/**
	 * Map a derived-cue id back to the live schema window that owns its sound
	 * override. Tapbacks are locked per reaction type — info-only.
	 */
	const motion = $derived.by(
		(): { window?: MotionWindow; ensure?: () => MotionWindow; source: string } | null => {
			if (!derivedCueId) return null;
			const parts = derivedCueId.split(':');

			if (parts[0] === 'surface') {
				const phase = parts[1] as 'enter' | 'exit';
				return { window: engineState.surface[phase], source: `Surface ${phase}` };
			}
			if (parts[0] === 'mark') {
				const index = Number(parts[1]);
				return {
					window: engineState.marks.timings[index],
					ensure: () => ensureMarkTimingAtIndex(index),
					source: 'Mark draw-on'
				};
			}
			if (parts[0] === 'overlay') {
				const overlay = engineState.overlays.find((o) => o.id === parts[1]);
				const phase = parts[2] as 'enter' | 'exit';
				return overlay ? { window: overlay[phase], source: `${overlay.type} ${phase}` } : null;
			}
			if (parts[0] === 'text') {
				const entry = engineState.textAnimations.find((t) => t.id === parts[1]);
				const phase = parts[2] as 'enter' | 'exit';
				return entry ? { window: entry[phase], source: `Text · ${entry.effect} ${phase}` } : null;
			}
			if (parts[0] === 'message') {
				if (parts[2] === 'tapback') return { source: 'Tapback' };
				const message = engineState.surface.content.messages?.[Number(parts[1])];
				return message?.enter
					? { window: message.enter, source: 'Message bubble' }
					: { source: 'Message bubble (default cadence)' };
			}
			return null;
		}
	);

	function humanize(slug: string): string {
		const text = slug.replace(/-/g, ' ');
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	function setCueFraction(key: 'start' | 'duration', value: string): void {
		if (!manualCue) return;
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		manualCue[key] = Math.max(0, Math.min(1, n));
	}

	function removeManualCue(): void {
		const index = engineState.audioCues.findIndex((c) => c.id === manualCueId);
		if (index >= 0) engineState.audioCues.splice(index, 1);
		deselectLayer();
	}
</script>

{#if cue && motion}
	<InspectorSection label={motion.source}>
		<Field label="Plays">
			<span class="cue-info">{resolvedSample ? humanize(resolvedSample) : 'Nothing (silent)'}</span>
		</Field>
		<Field label="At">
			<span class="cue-info">
				{(cue.start * engineState.transport.durationSeconds).toFixed(2)}s · {cue.event}
			</span>
		</Field>
		{#if motion.window || motion.ensure}
			<Field label="Sound">
				<SoundPicker cueId={cue.id} window={motion.window} ensure={motion.ensure} />
			</Field>
		{:else}
			<Field label="Sound">
				<span class="cue-info">Fixed per reaction type</span>
			</Field>
		{/if}
	</InspectorSection>
{:else if manualCue}
	<InspectorSection label={manualCue.kind === 'bed' ? 'Bed' : 'Manual cue'}>
		<Field label="Sample">
			<select bind:value={manualCue.assetSlug}>
				{#each soundAssets as slug (slug)}
					<option value={slug}>{humanize(slug)}</option>
				{/each}
			</select>
		</Field>
		<Field label="Window">
			<input
				type="number"
				min="0"
				max="1"
				step="0.001"
				value={Math.round(manualCue.start * 1000) / 1000}
				oninput={(e) => setCueFraction('start', (e.currentTarget as HTMLInputElement).value)}
			/>
			<input
				type="number"
				min="0"
				max="1"
				step="0.001"
				value={Math.round(manualCue.duration * 1000) / 1000}
				oninput={(e) => setCueFraction('duration', (e.currentTarget as HTMLInputElement).value)}
			/>
		</Field>
		<Field label="Volume">
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				value={manualCue.volume ?? 1}
				oninput={(e) => {
					manualCue.volume = Number((e.currentTarget as HTMLInputElement).value);
				}}
			/>
		</Field>
		<button type="button" class="remove-cue" onclick={removeManualCue}>Remove</button>
	</InspectorSection>
{:else}
	<InspectorSection label="Sound">
		<span class="cue-info">This cue no longer exists.</span>
	</InspectorSection>
{/if}

<style>
	.cue-info {
		color: var(--fg-6);
		font-size: 0.8rem;
	}

	.remove-cue {
		background: transparent;
		border: var(--border-1);
		border-radius: var(--br-xs);
		color: var(--fg-5);
		cursor: pointer;
		font-size: 0.75rem;
		justify-self: start;
		padding: 0.2rem 0.6rem;
	}

	.remove-cue:hover {
		border-color: #e6322a;
		color: #e6322a;
	}
</style>
