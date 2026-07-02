<script lang="ts">
	import { listSoundAssets } from './audio-assets';
	import type { SoundOverride } from './engine-schema';
	import { engineState } from './engine-state.svelte';
	import { deriveSoundCues, resolveCueSample } from './sound-cues';

	/**
	 * The one per-motion sound control (ADR-0033 §5): a single select that
	 * leads with the OUTCOME — "Auto — Marker swipe" is the motion's
	 * engine-default sound — plus "None" (mute) and a direct sample lock.
	 * Event swaps stay a JSON hatch; the GUI picks real sounds.
	 */
	interface MotionWindow {
		sound?: SoundOverride;
	}

	interface Props {
		/** Derived-cue id for this motion (`mark:0`, `surface:enter`, …). */
		cueId: string;
		/** The schema object carrying `sound`, when it already exists. */
		window?: MotionWindow;
		/** Creates + returns the window on first write (e.g. mark timings). */
		ensure?: () => MotionWindow;
	}

	let { cueId, window: motionWindow, ensure }: Props = $props();

	const sampleSlugs = listSoundAssets();

	const cue = $derived(deriveSoundCues(engineState).find((c) => c.id === cueId));

	// What Auto plays: the cue resolved as if no per-motion override existed.
	const autoSample = $derived(
		cue ? resolveCueSample({ ...cue, sample: undefined, muted: false }) : null
	);

	const value = $derived(
		motionWindow?.sound?.mute === true ? 'none' : (motionWindow?.sound?.sample ?? '')
	);

	function humanize(slug: string): string {
		const text = slug.replace(/-/g, ' ');
		return text.charAt(0).toUpperCase() + text.slice(1);
	}

	function handleChange(event: Event): void {
		const next = (event.currentTarget as HTMLSelectElement).value;
		const target = motionWindow ?? ensure?.();
		if (!target) return;
		if (next === '') {
			target.sound = undefined;
		} else if (next === 'none') {
			target.sound = { mute: true };
		} else {
			target.sound = { sample: next };
		}
	}
</script>

<select {value} onchange={handleChange}>
	<option value="">Auto — {autoSample ? humanize(autoSample) : 'silent'}</option>
	<option value="none">None</option>
	<optgroup label="Samples">
		{#each sampleSlugs as slug (slug)}
			<option value={slug}>{humanize(slug)}</option>
		{/each}
	</optgroup>
</select>
