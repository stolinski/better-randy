<script lang="ts">
	import { listSoundAssets } from './audio-assets';
	import { SOUND_EVENTS, type SoundOverride } from './engine-schema';
	import { listSoundKits } from './sound-kits/registry';
	import Field from './Field.svelte';
	import InspectorSection from './InspectorSection.svelte';

	/**
	 * The per-Layer Sound section (ADR-0033 §3/§5, ADR-0034 §9): the kit picker
	 * ("choose a sound style" — re-sounds THIS Layer; no kit = silent) and one
	 * override row per motion window (mute / swap event / lock sample). Shared
	 * by the Surface, Overlay, and Mark inspectors — each passes its own Layer
	 * object and that Layer's motion windows.
	 */
	interface MotionWindow {
		sound?: SoundOverride;
	}

	interface Props {
		/** The Layer object carrying `soundKit` (surface / overlay / marks). */
		host: { soundKit?: string };
		/** This Layer's motion windows, label → the schema object carrying `sound`. */
		motions: { label: string; window: MotionWindow }[];
	}

	let { host, motions }: Props = $props();

	const kits = listSoundKits();
	const sampleSlugs = listSoundAssets();

	function setKit(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		host.soundKit = value === '' ? undefined : value;
	}

	// Overrides stay minimal on the wire: a window with no active override
	// carries no `sound` key at all (lossless round-trip stays clean).
	function patchSound(window: MotionWindow, patch: Partial<SoundOverride>): void {
		const next: SoundOverride = { ...(window.sound ?? {}), ...patch };
		if (next.mute !== true) delete next.mute;
		if (!next.event) delete next.event;
		if (!next.sample) delete next.sample;
		window.sound = Object.keys(next).length > 0 ? next : undefined;
	}
</script>

<InspectorSection label="Sound">
	<Field label="Kit">
		<select value={host.soundKit ?? ''} onchange={setKit}>
			<option value="">Silent</option>
			{#each kits as kit (kit.slug)}
				<option value={kit.slug}>{kit.label}</option>
			{/each}
		</select>
	</Field>

	{#if host.soundKit !== undefined}
		{#each motions as motion (motion.label)}
			<Field label={motion.label}>
				<select
					class="event"
					value={motion.window.sound?.event ?? ''}
					onchange={(e) =>
						patchSound(motion.window, {
							event: ((e.currentTarget as HTMLSelectElement).value ||
								undefined) as SoundOverride['event']
						})}
				>
					<option value="">auto</option>
					{#each SOUND_EVENTS as soundEvent (soundEvent)}
						<option value={soundEvent}>{soundEvent}</option>
					{/each}
				</select>
				<select
					class="sample"
					value={motion.window.sound?.sample ?? ''}
					onchange={(e) =>
						patchSound(motion.window, {
							sample: (e.currentTarget as HTMLSelectElement).value || undefined
						})}
				>
					<option value="">kit</option>
					{#each sampleSlugs as slug (slug)}
						<option value={slug}>{slug}</option>
					{/each}
				</select>
				<label class="mute">
					<input
						type="checkbox"
						checked={motion.window.sound?.mute === true}
						onchange={(e) =>
							patchSound(motion.window, { mute: (e.currentTarget as HTMLInputElement).checked })}
					/>
					mute
				</label>
			</Field>
		{/each}
	{/if}
</InspectorSection>

<style>
	.mute {
		align-items: center;
		color: var(--fg-6);
		display: flex;
		flex: none;
		font-size: 0.72rem;
		gap: 0.25rem;
	}

	.event,
	.sample {
		min-inline-size: 0;
	}
</style>
