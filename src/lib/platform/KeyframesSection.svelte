<script lang="ts">
	import { animState } from './anim-state.svelte';
	import { resolveCascadeTimings } from './cascade-timing';
	import { ENGINE_EASES, type Ease, type Keyframe } from './engine-schema';
	import { engineState } from './engine-state.svelte';
	import { keyframeSelection, selectKeyframe } from './selection.svelte';
	import { timelineHandle } from './timeline-handle.svelte';
	import InspectorSection from './InspectorSection.svelte';

	// DaVinci-style keyframe rows (ADR-0035 §7): one row per property showing
	// the value AT THE PLAYHEAD, with ◀ (jump to previous keyframe) · ◆ (add or
	// remove a keyframe at the playhead — filled when the playhead sits on one)
	// · ▶ (jump to next). Never a raw keyframe list. Editing the value upserts
	// a keyframe at the playhead; the ◆ on an empty property starts its track.
	// Ease-into (constrained enum) appears only while parked on a keyframe.

	interface ChannelOwner {
		animation?: { channels?: Partial<Record<string, Keyframe[] | undefined>> };
	}

	interface Props {
		/** Cascade node key: 'surface' or `overlay:<id>` — resolves the owner,
		 *  the clip start, and the timeline row this section mirrors. */
		selfKey: string;
		channelNames: readonly string[];
	}

	let { selfKey, channelNames }: Props = $props();

	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];

	// Clamps only — steps are `any` because the schema's floats carry arbitrary
	// precision; a coarser step would flag stored values :invalid and quantize
	// agent-authored numbers on nudge.
	const CHANNEL_INPUT: Record<string, { min?: number; max?: number }> = {
		opacity: { min: 0, max: 1 },
		scale: { min: 0.1, max: 8 }
	};

	const overlayIndex = $derived(
		selfKey === 'surface'
			? -1
			: engineState.overlays.findIndex((overlay) => selfKey === `overlay:${overlay.id}`)
	);
	const overlay = $derived(overlayIndex >= 0 ? engineState.overlays[overlayIndex] : null);
	// Diagram Block elements (ADR-0036) are channel owners too — `block:{id}`.
	const blockId = $derived(selfKey.startsWith('block:') ? selfKey.slice('block:'.length) : null);
	const blockElement = $derived(
		blockId
			? ((engineState.surface.diagram ?? []).find((element) => element.id === blockId) ?? null)
			: null
	);
	const owner = $derived<ChannelOwner | null>(
		selfKey === 'surface' ? engineState.surface : (blockElement ?? overlay ?? null)
	);
	const trackRowId = $derived(
		selfKey === 'surface'
			? 'surface'
			: blockId
				? `block-${blockId}`
				: `overlay-${selfKey.slice('overlay:'.length)}`
	);

	const durationMs = $derived(engineState.transport.durationSeconds * 1000);
	// Half a frame of tolerance: the playhead "sits on" a keyframe when within it.
	const halfFrameMs = $derived(500 / engineState.transport.fps);

	const clipStartMs = $derived.by(() => {
		try {
			return (resolveCascadeTimings(engineState).get(selfKey)?.startFraction ?? 0) * durationMs;
		} catch {
			return 0;
		}
	});

	const playheadMs = $derived((timelineHandle.current?.time ?? 0) * 1000);
	/** Playhead in clip-local keyframe time. */
	const localMs = $derived(playheadMs - clipStartMs);

	function trackFor(channel: string): Keyframe[] | undefined {
		const track = owner?.animation?.channels?.[channel];
		return track && track.length > 0 ? track : undefined;
	}

	function keyframeIndexAtPlayhead(channel: string): number {
		const track = trackFor(channel);
		if (!track) return -1;
		return track.findIndex((frame) => Math.abs(frame.atMs - localMs) <= halfFrameMs);
	}

	// The value shown is the LIVE evaluated value at the playhead — the same
	// number the render used this frame (animState) — falling back to the
	// static seed for properties with no track.
	function liveValue(channel: string): number {
		if (selfKey === 'surface') {
			return round(trackFor(channel) ? animState.paperVisibility : 1);
		}
		if (blockId) {
			const slot = animState.blockChannels[blockId];
			if (slot) {
				return round(slot[channel as keyof typeof slot] ?? 0);
			}
			if (channel === 'scale') {
				return blockElement && 'scale' in blockElement ? (blockElement.scale ?? 1) : 1;
			}
			return channel === 'opacity' ? 1 : channel === 'rotation' ? 0 : 0;
		}
		const slot = overlayIndex >= 0 ? animState.overlayChannels[overlayIndex] : null;
		if (slot) {
			return round(slot[channel as keyof typeof slot] ?? 0);
		}
		if (channel === 'scale') return overlay?.position.scale ?? 1;
		if (channel === 'rotation') return overlay?.position.rotation ?? 0;
		return channel === 'opacity' ? 1 : 0;
	}

	function round(value: number): number {
		return Math.round(value * 1000) / 1000;
	}

	function ensureChannels(): Partial<Record<string, Keyframe[] | undefined>> {
		if (!owner) throw new Error(`KeyframesSection: no element for "${selfKey}"`);
		if (!owner.animation) owner.animation = {};
		if (!owner.animation.channels) owner.animation.channels = {};
		return owner.animation.channels;
	}

	// Insert sorted by atMs; the first keyframe of a track never carries an
	// ease (nothing precedes it), every later one defaults to `smooth`.
	function upsertKeyframe(channel: string, value: number): void {
		const channels = ensureChannels();
		const atMs = Math.max(0, Math.min(localMs, durationMs - clipStartMs));
		const track = channels[channel] ?? [];
		const existing = keyframeIndexAtPlayhead(channel);
		if (existing >= 0 && track[existing]) {
			track[existing].value = value;
			channels[channel] = track;
			return;
		}
		track.push({ atMs, value });
		track.sort((a, b) => a.atMs - b.atMs);
		normalizeEases(track);
		channels[channel] = track;
	}

	function normalizeEases(track: Keyframe[]): void {
		track.forEach((frame, index) => {
			if (index === 0) {
				delete frame.ease;
			} else if (frame.ease === undefined) {
				frame.ease = 'smooth';
			}
		});
	}

	function toggleKeyframe(channel: string): void {
		const track = trackFor(channel);
		const at = keyframeIndexAtPlayhead(channel);
		if (track && at >= 0) {
			track.splice(at, 1);
			normalizeEases(track);
			if (track.length === 0) {
				const channels = owner?.animation?.channels;
				if (channels) delete channels[channel];
			}
			return;
		}
		upsertKeyframe(channel, liveValue(channel));
		const index = keyframeIndexAtPlayhead(channel);
		if (index >= 0) selectKeyframe(trackRowId, channel, index);
	}

	function jump(channel: string, direction: -1 | 1): void {
		const track = trackFor(channel);
		const transport = timelineHandle.current;
		if (!track || !transport) return;
		const candidates =
			direction === -1
				? track.filter((frame) => frame.atMs < localMs - halfFrameMs)
				: track.filter((frame) => frame.atMs > localMs + halfFrameMs);
		if (candidates.length === 0) return;
		const target = direction === -1 ? candidates[candidates.length - 1] : candidates[0];
		transport.seek((clipStartMs + target.atMs) / 1000);
		selectKeyframe(trackRowId, channel, track.indexOf(target));
	}

	function hasPrev(channel: string): boolean {
		return (trackFor(channel) ?? []).some((frame) => frame.atMs < localMs - halfFrameMs);
	}

	function hasNext(channel: string): boolean {
		return (trackFor(channel) ?? []).some((frame) => frame.atMs > localMs + halfFrameMs);
	}

	function setValue(channel: string, raw: string): void {
		const n = Number(raw);
		if (!Number.isFinite(n)) return;
		const input = CHANNEL_INPUT[channel];
		upsertKeyframe(channel, Math.max(input?.min ?? -Infinity, Math.min(input?.max ?? Infinity, n)));
	}

	function setEase(channel: string, value: string): void {
		const track = trackFor(channel);
		const at = keyframeIndexAtPlayhead(channel);
		if (!track || at <= 0) return;
		track[at].ease = value as Ease;
	}
</script>

<InspectorSection label="Keyframes" defaultOpen={false}>
	{#each channelNames as channel (channel)}
		{@const track = trackFor(channel)}
		{@const atIndex = keyframeIndexAtPlayhead(channel)}
		{@const onKeyframe = atIndex >= 0}
		<div class="kf-row" class:kf-row--keyed={track !== undefined}>
			<span class="kf-row__name">{channel === 'rotation' ? 'rotation°' : channel}</span>
			<input
				class="kf-row__value"
				aria-label="{channel} value at playhead"
				type="number"
				min={CHANNEL_INPUT[channel]?.min}
				max={CHANNEL_INPUT[channel]?.max}
				step="any"
				value={liveValue(channel)}
				onchange={(e) => setValue(channel, (e.currentTarget as HTMLInputElement).value)}
			/>
			<div class="kf-row__nav">
				<button
					type="button"
					class="kf-row__jump"
					aria-label="Previous {channel} keyframe"
					disabled={!hasPrev(channel)}
					onclick={() => jump(channel, -1)}
				>
					<svg width="7" height="9" viewBox="0 0 7 9" aria-hidden="true">
						<path d="M6 .8v7.4L.8 4.5z" fill="currentColor" />
					</svg>
				</button>
				<button
					type="button"
					class="kf-row__toggle"
					class:kf-row__toggle--on={onKeyframe}
					aria-label={onKeyframe
						? `Remove ${channel} keyframe at playhead`
						: `Add ${channel} keyframe at playhead`}
					aria-pressed={onKeyframe}
					onclick={() => toggleKeyframe(channel)}
				>
					<svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true">
						<rect
							x="2.4"
							y="2.4"
							width="5.2"
							height="5.2"
							transform="rotate(45 5 5)"
							fill={onKeyframe ? 'currentColor' : 'none'}
							stroke="currentColor"
							stroke-width="1.2"
						/>
					</svg>
				</button>
				<button
					type="button"
					class="kf-row__jump"
					aria-label="Next {channel} keyframe"
					disabled={!hasNext(channel)}
					onclick={() => jump(channel, 1)}
				>
					<svg width="7" height="9" viewBox="0 0 7 9" aria-hidden="true">
						<path d="M1 .8v7.4l5.2-3.7z" fill="currentColor" />
					</svg>
				</button>
			</div>
		</div>
		{#if onKeyframe && atIndex > 0}
			<div
				class="kf-ease"
				data-selected={keyframeSelection.key === `${trackRowId}:${channel}:${atIndex}` || undefined}
			>
				<span class="kf-ease__label">ease into</span>
				<select
					aria-label="{channel} keyframe ease"
					value={track?.[atIndex]?.ease ?? 'smooth'}
					onchange={(e) => setEase(channel, (e.currentTarget as HTMLSelectElement).value)}
				>
					{#each easeOptions as [value, option] (value)}
						<option {value}>{option.label}</option>
					{/each}
				</select>
			</div>
		{/if}
	{/each}
</InspectorSection>

<style>
	/* name · value-at-playhead · ◀ ◆ ▶ — the DaVinci row, on the shared
	   field grid (§9): label column, control edge, nav flush right. */
	.kf-row {
		align-items: center;
		column-gap: var(--vs-s);
		display: grid;
		grid-template-columns: var(--ins-label-w, 5.5rem) minmax(0, 1fr) auto;
	}

	.kf-row__name {
		color: var(--chrome-muted);
		font-size: 0.72rem;
		overflow: hidden;
		text-overflow: ellipsis;
		text-transform: capitalize;
		white-space: nowrap;
	}

	/* A property that carries keyframes reads as "authored" — primary text,
	   never yellow (yellow means selection, and the ◆ already lights when
	   the playhead parks on a keyframe). */
	.kf-row--keyed .kf-row__name {
		color: var(--chrome-text);
	}

	.kf-row__value {
		min-inline-size: 0;
	}

	.kf-row__nav {
		align-items: center;
		display: flex;
		gap: 2px;
	}

	.kf-row__jump,
	.kf-row__toggle {
		align-items: center;
		background: transparent;
		block-size: 20px;
		border: 0;
		border-radius: var(--br-xs);
		color: var(--chrome-muted);
		cursor: pointer;
		display: flex;
		inline-size: 20px;
		justify-content: center;
		padding: 0;
		transition:
			color 120ms ease,
			background-color 120ms ease;
	}

	.kf-row__jump:hover:not(:disabled),
	.kf-row__toggle:hover {
		background: var(--chrome-raised);
		color: var(--chrome-text);
	}

	/* Disabled stays visibly present — a rest state, not a hole in the row. */
	.kf-row__jump:disabled {
		color: var(--chrome-muted);
		cursor: default;
		opacity: 0.4;
	}

	/* Playhead parked on a keyframe → the diamond lights. */
	.kf-row__toggle--on {
		color: #ffd608;
	}

	/* Ease-into for the keyframe under the playhead — only visible parked;
	   sits on the same grid so the select shares the control edges. */
	.kf-ease {
		align-items: center;
		column-gap: var(--vs-s);
		display: grid;
		grid-template-columns: var(--ins-label-w, 5.5rem) minmax(0, 1fr);
	}

	.kf-ease__label {
		color: var(--chrome-muted);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		overflow: hidden;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
	}
</style>
