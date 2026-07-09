<script lang="ts">
	import type { SoundOverride } from './engine-schema';
	import Field from './Field.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import SoundPicker from './SoundPicker.svelte';

	/**
	 * The Sound section (ADR-0033 §5, ADR-0034 §9): one row per motion showing
	 * the sound it actually plays — the motion's engine default ("Auto —
	 * Marker swipe"), "None", or a locked sample. No kit/palette concept:
	 * defaults are engine-level per motion kind; every individual cue is
	 * overridable here or from the timeline's Sound rail.
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
		/** This Layer's motion windows. */
		motions: MotionRow[];
	}

	let { motions }: Props = $props();
</script>

{#if motions.length > 0}
	<InspectorSection label="Sound" defaultOpen={false}>
		{#each motions as motion (motion.cueId)}
			<Field label={motion.label}>
				<SoundPicker cueId={motion.cueId} window={motion.window} ensure={motion.ensure} />
			</Field>
		{/each}
	</InspectorSection>
{/if}
