<script lang="ts">
	import { ENGINE_EASES, type Ease, type Keyframe } from './engine-schema';
	import { engineState } from './engine-state.svelte';
	import InspectorSection from './InspectorSection.svelte';

	// Per-channel keyframe editor (ADR-0035 §5/§7, ADR-0034 progressive
	// disclosure). Rendered for overlays (five channels) and the surface
	// (opacity only) — the generic boundary is the `owner` object carrying
	// `animation.channels`, mutated in place like every other inspector write.
	// Ease stays the constrained enum: the curve INTO a keyframe, none on the
	// first. Declaring any track means the composition takes the pen — the
	// element's intrinsic enter/exit motion-form stops running.

	interface ChannelOwner {
		animation?: { channels?: Partial<Record<string, Keyframe[] | undefined>> };
	}

	interface Props {
		owner: ChannelOwner;
		channelNames: readonly string[];
	}

	let { owner, channelNames }: Props = $props();

	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];

	// Value semantics per channel (ADR-0035 §3): opacity is a 0..1 fraction,
	// x/y signed composition-fraction deltas, scale mirrors the static bounds,
	// rotation absolute degrees. `seed` starts a new track at its rest value.
	const CHANNEL_INPUT: Record<string, { min?: number; max?: number; step: number; seed: number }> =
		{
			opacity: { min: 0, max: 1, step: 0.05, seed: 1 },
			x: { step: 0.005, seed: 0 },
			y: { step: 0.005, seed: 0 },
			scale: { min: 0.1, max: 8, step: 0.01, seed: 1 },
			rotation: { step: 1, seed: 0 }
		};

	const durationMs = $derived(engineState.transport.durationSeconds * 1000);

	function trackFor(channel: string): Keyframe[] | undefined {
		const track = owner.animation?.channels?.[channel];
		return track && track.length > 0 ? track : undefined;
	}

	function addKeyframe(channel: string): void {
		const input = CHANNEL_INPUT[channel] ?? { step: 0.01, seed: 0 };
		if (!owner.animation) owner.animation = {};
		if (!owner.animation.channels) owner.animation.channels = {};
		const track = owner.animation.channels[channel];
		if (!track || track.length === 0) {
			owner.animation.channels[channel] = [{ atMs: 0, value: input.seed }];
			return;
		}
		const last = track[track.length - 1];
		track.push({
			atMs: Math.min(last.atMs + 200, durationMs),
			value: last.value,
			ease: 'smooth'
		});
	}

	function removeKeyframe(channel: string, index: number): void {
		const channels = owner.animation?.channels;
		const track = channels?.[channel];
		if (!channels || !track) return;
		track.splice(index, 1);
		if (index === 0 && track.length > 0) {
			// The new first keyframe carries no ease — nothing precedes it.
			delete track[0].ease;
		}
		if (track.length === 0) {
			delete channels[channel];
		}
	}

	// atMs writes clamp between neighbours so tracks stay strictly ascending
	// through any edit — same rule as the timeline diamond drag.
	function setAtMs(channel: string, index: number, value: string): void {
		const track = trackFor(channel);
		const frame = track?.[index];
		if (!track || !frame) return;
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		const min = index > 0 ? track[index - 1].atMs + 1 : 0;
		const max = index < track.length - 1 ? track[index + 1].atMs - 1 : durationMs;
		frame.atMs = Math.max(min, Math.min(Math.max(min, max), n));
	}

	function setValue(channel: string, index: number, value: string): void {
		const frame = trackFor(channel)?.[index];
		if (!frame) return;
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		const input = CHANNEL_INPUT[channel];
		frame.value = Math.max(input?.min ?? -Infinity, Math.min(input?.max ?? Infinity, n));
	}

	function setEase(channel: string, index: number, value: string): void {
		const frame = trackFor(channel)?.[index];
		if (!frame || index === 0) return;
		frame.ease = value as Ease;
	}
</script>

<InspectorSection label="Keyframes">
	{#each channelNames as channel (channel)}
		{@const track = trackFor(channel)}
		<div class="channel">
			<div class="channel__header">
				<span class="channel__name">{channel}</span>
				<button
					type="button"
					class="channel__add"
					aria-label="Add {channel} keyframe"
					onclick={() => addKeyframe(channel)}>+</button
				>
			</div>
			{#if track}
				<div class="channel__rows">
					{#each track as frame, index (index)}
						<div class="keyframe-row">
							<input
								aria-label="{channel} keyframe {index + 1} time (ms)"
								type="number"
								min="0"
								step="10"
								value={Math.round(frame.atMs)}
								oninput={(e) =>
									setAtMs(channel, index, (e.currentTarget as HTMLInputElement).value)}
							/>
							<input
								aria-label="{channel} keyframe {index + 1} value"
								type="number"
								min={CHANNEL_INPUT[channel]?.min}
								max={CHANNEL_INPUT[channel]?.max}
								step={CHANNEL_INPUT[channel]?.step ?? 0.01}
								value={frame.value}
								oninput={(e) =>
									setValue(channel, index, (e.currentTarget as HTMLInputElement).value)}
							/>
							{#if index === 0}
								<span class="keyframe-row__no-ease" title="The first keyframe carries no ease"
									>—</span
								>
							{:else}
								<select
									aria-label="{channel} keyframe {index + 1} ease"
									value={frame.ease ?? 'smooth'}
									onchange={(e) =>
										setEase(channel, index, (e.currentTarget as HTMLSelectElement).value)}
								>
									{#each easeOptions as [value, option] (value)}
										<option {value}>{option.label}</option>
									{/each}
								</select>
							{/if}
							<button
								type="button"
								class="keyframe-row__remove"
								aria-label="Remove {channel} keyframe {index + 1}"
								onclick={() => removeKeyframe(channel, index)}>×</button
							>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
</InspectorSection>

<style>
	.channel {
		display: grid;
		gap: var(--vs-xs);
	}

	.channel__header {
		align-items: center;
		display: flex;
		justify-content: space-between;
	}

	.channel__name {
		color: var(--fg-6);
		font-size: 0.7rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.channel__add {
		background: transparent;
		border: 0;
		color: var(--fg-4);
		cursor: pointer;
		font-size: 0.9rem;
		line-height: 1;
		padding: 0 var(--vs-xs);
	}

	.channel__add:hover {
		color: var(--fg);
	}

	.channel__rows {
		display: grid;
		gap: 2px;
	}

	/* ms · value · ease · remove — one compact row per keyframe. */
	.keyframe-row {
		align-items: center;
		display: grid;
		gap: var(--vs-xs);
		grid-template-columns: 1fr 1fr 1fr auto;
	}

	.keyframe-row__no-ease {
		color: var(--fg-3);
		font-size: 0.75rem;
		text-align: center;
	}

	.keyframe-row__remove {
		background: transparent;
		border: 0;
		color: var(--fg-4);
		cursor: pointer;
		font-size: 0.9rem;
		line-height: 1;
		padding: 0 2px;
	}

	.keyframe-row__remove:hover {
		color: #e6322a;
	}
</style>
