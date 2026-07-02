<script lang="ts">
	import type { SoundOverride } from './engine-schema';
	import { listSoundKits } from './sound-kits/registry';
	import Field from './Field.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import SoundPicker from './SoundPicker.svelte';

	/**
	 * The per-Layer Sound section (ADR-0033 §3/§5, ADR-0034 §9). Leads with the
	 * OUTCOME: one row per motion showing the sound it actually plays (via
	 * SoundPicker — "Auto — Marker swipe" / "None" / a locked sample). The Kit
	 * sits beneath as the source Auto resolves through — swapping it re-sounds
	 * this Layer's Auto rows; "Silent" removes the kit entirely.
	 */
	interface MotionRow {
		label: string;
		/** Derived-cue id for this motion (`mark:0`, `surface:enter`, …). */
		cueId: string;
		window?: { sound?: SoundOverride };
		/** Creates + returns the window on first write (e.g. mark timings). */
		ensure?: () => { sound?: SoundOverride };
	}

	interface Props {
		/** The Layer object carrying `soundKit` (surface / overlay / marks). */
		host: { soundKit?: string };
		/** This Layer's motion windows. */
		motions: MotionRow[];
	}

	let { host, motions }: Props = $props();

	const kits = listSoundKits();

	function setKit(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		host.soundKit = value === '' ? undefined : value;
	}
</script>

<InspectorSection label="Sound">
	{#each motions as motion (motion.cueId)}
		<Field label={motion.label}>
			<SoundPicker cueId={motion.cueId} window={motion.window} ensure={motion.ensure} />
		</Field>
	{/each}

	<Field label="Palette">
		<select value={host.soundKit ?? ''} onchange={setKit}>
			<option value="">Silent</option>
			{#each kits as kit (kit.slug)}
				<option value={kit.slug}>{kit.label}</option>
			{/each}
		</select>
	</Field>
</InspectorSection>
