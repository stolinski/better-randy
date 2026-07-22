<script lang="ts">
	import { engineState, addTextAnimation, removeTextAnimation } from './engine-state.svelte';
	import {
		ENGINE_EASES,
		type Cascade,
		type Ease,
		type Overlay,
		type OverlayPosition,
		type TextAnimation,
		type TextAnimationParams,
		type Transition
	} from './engine-schema';
	import { PIPELINE_REGISTRY } from './pipelines';
	import type { OverlayRenderer } from './pipelines/types';
	import {
		TEXT_EFFECT_CATALOG,
		TEXT_EFFECT_IDS,
		TEXT_EFFECT_SPLIT_MODES,
		type TextEffectSplitMode
	} from '$lib/text-animations/catalog';
	import { formatFractionAsSeconds } from '$lib/utils/string';
	import AddMenu from './AddMenu.svelte';
	import CascadeSection from './CascadeSection.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import InspectorToggle from './InspectorToggle.svelte';
	import Field from './Field.svelte';
	import KeyframesSection from './KeyframesSection.svelte';
	import SoundSection from './SoundSection.svelte';

	interface Props {
		overlayId: string;
	}

	let { overlayId }: Props = $props();

	const OVERLAY_ANCHORS = [
		'top-left',
		'top-center',
		'top-right',
		'bottom-left',
		'bottom-center',
		'bottom-right',
		'center',
		'normalized-rect'
	] as const;

	const overlayRenderers = Object.values(PIPELINE_REGISTRY.overlays);
	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];

	function findOverlayRenderer(type: string): OverlayRenderer | null {
		for (const candidate of overlayRenderers) {
			if (candidate.type === type) return candidate as OverlayRenderer;
		}
		return null;
	}

	const overlay = $derived(engineState.overlays.find((o) => o.id === overlayId) ?? null);
	const overlayRenderer = $derived(overlay ? findOverlayRenderer(overlay.type) : null);

	const overlayTextAnimations = $derived(
		engineState.textAnimations.filter(
			(entry) => entry.target.kind === 'overlay' && entry.target.overlayId === overlayId
		)
	);

	const effectsBySplit = $derived.by(() => {
		const out: Record<TextEffectSplitMode, { id: string; label: string }[]> = {
			whole: [],
			'per-character': [],
			'per-word': [],
			'per-line': []
		};
		for (const id of TEXT_EFFECT_IDS) {
			const spec = TEXT_EFFECT_CATALOG.get(id);
			if (!spec) continue;
			out[spec.target].push({ id, label: spec.displayName });
		}
		return out;
	});

	// The add-menu's grouped items — one group per split mode with effects.
	const effectMenuGroups = $derived(
		TEXT_EFFECT_SPLIT_MODES.filter((mode) => effectsBySplit[mode].length > 0).map((mode) => ({
			label: mode,
			items: effectsBySplit[mode].map((opt) => ({ value: opt.id, label: opt.label }))
		}))
	);

	function setOverlayAnchor(ov: Overlay, value: string): void {
		(ov.position as OverlayPosition).anchor = value as OverlayPosition['anchor'];
	}

	function setOverlayOffsetX(ov: Overlay, value: string): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		if (!ov.position.offset) ov.position.offset = { x: 0, y: 0 };
		ov.position.offset.x = Math.max(0, Math.min(1, n));
	}

	function setOverlayOffsetY(ov: Overlay, value: string): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		if (!ov.position.offset) ov.position.offset = { x: 0, y: 0 };
		ov.position.offset.y = Math.max(0, Math.min(1, n));
	}

	// Normalized-rect placement (fractions of the composition; unclamped on
	// purpose — offscreen rects are how shader overlays park outside the frame).
	function setOverlayRect(ov: Overlay, key: 'x' | 'y' | 'width' | 'height', value: string): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		if (!ov.position.rect) ov.position.rect = { x: 0, y: 0, width: 1, height: 1 };
		ov.position.rect[key] = n;
	}

	function setOverlayScale(ov: Overlay, value: string): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		ov.position.scale = Math.max(0.1, Math.min(8, n));
	}

	function setOverlayRotation(ov: Overlay, value: string): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		ov.position.rotation = Math.max(-360, Math.min(360, n));
	}

	// Keyframeable overlay channels (ADR-0035 §3), in inspector order.
	const OVERLAY_CHANNELS = ['opacity', 'x', 'y', 'scale', 'rotation'] as const;

	// Focal-plane z (ADR-0021 semantics / ADR-0027 v1): 0 = focal plane (sharp),
	// 1 = max defocus; absent → the Overlay-Layer default 0.7 at render. Only
	// consulted by the depth stage (ADR-0028) and the depth-of-field Effect
	// (rack focus rides its focusPull params), so the row only shows then.
	const depthActive = $derived(
		engineState.stage !== undefined ||
			engineState.effects.some((effect) => effect.type === 'depth-of-field')
	);

	function setOverlayZ(ov: Overlay, value: string): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		ov.z = Math.max(0, Math.min(1, n));
	}

	function clearOverlayZ(ov: Overlay): void {
		ov.z = undefined;
	}

	function setOverlayCascade(ov: Overlay, next: Cascade | undefined): void {
		if (next === undefined) {
			if (!ov.animation) return;
			ov.animation.cascade = undefined;
			// Keep the serialized form clean: an animation block with nothing in
			// it disappears entirely.
			if (!ov.animation.channels || Object.keys(ov.animation.channels).length === 0) {
				ov.animation = undefined;
			}
			return;
		}
		if (!ov.animation) ov.animation = {};
		ov.animation.cascade = next;
	}

	function ensureTransition(ov: Overlay, field: 'enter' | 'exit'): Transition {
		const existing = ov[field];
		if (existing) return existing;
		const next: Transition =
			field === 'enter'
				? { start: 0.1, duration: 0.16, ease: 'settled' }
				: { start: 0.82, duration: 0.16, ease: 'smooth' };
		ov[field] = next;
		return next;
	}

	function transitionStartInput(ov: Overlay, field: 'enter' | 'exit', value: string): void {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		const transition = ensureTransition(ov, field);
		transition.start = Math.max(0, Math.min(1, numeric));
	}

	function transitionDurationInput(ov: Overlay, field: 'enter' | 'exit', value: string): void {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		const transition = ensureTransition(ov, field);
		transition.duration = Math.max(0, Math.min(1, numeric));
	}

	function transitionEaseChange(ov: Overlay, field: 'enter' | 'exit', value: string): void {
		const transition = ensureTransition(ov, field);
		transition.ease = value as Ease;
	}

	function handleAddTextAnimation(slot: 'kicker' | 'title' | 'subtitle', effectId: string): void {
		if (!effectId) return;
		const spec = TEXT_EFFECT_CATALOG.get(effectId);
		if (!spec) return;
		addTextAnimation({
			target: { kind: 'overlay', overlayId, slot },
			effect: effectId,
			enter: { start: 0.04, duration: 0.1, ease: 'smooth' }
		});
	}

	function textAnimationEnterStartInput(entry: TextAnimation, value: string): void {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		entry.enter.start = Math.max(0, Math.min(1, numeric));
	}

	function textAnimationEnterDurationInput(entry: TextAnimation, value: string): void {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		entry.enter.duration = Math.max(0, Math.min(1, numeric));
	}

	function textAnimationEnterEaseChange(entry: TextAnimation, value: string): void {
		entry.enter.ease = value as Ease;
	}

	function textAnimationEffectChange(entry: TextAnimation, value: string): void {
		if (!TEXT_EFFECT_CATALOG.has(value)) return;
		entry.effect = value;
	}

	function setTextAnimParam(
		entry: TextAnimation,
		key: keyof TextAnimationParams,
		value: string
	): void {
		const n = Number(value);
		if (!Number.isFinite(n) || n < 0) return;
		if (!entry.params) entry.params = {};
		entry.params[key] = n;
	}

	function clearTextAnimParam(entry: TextAnimation, key: keyof TextAnimationParams): void {
		if (entry.params) delete entry.params[key];
	}
</script>

{#if overlay && overlayRenderer}
	{@const ov = overlay}
	{@const renderer = overlayRenderer}

	<InspectorSection label={renderer.label}>
		{#if renderer.Inspector}
			{@const OverlayInspectorComponent = renderer.Inspector}
			<OverlayInspectorComponent overlay={ov as never} />
		{:else}
			{@const OverlayEditor = renderer.Editor}
			<OverlayEditor overlay={ov as never} />
		{/if}
	</InspectorSection>

	<InspectorSection label="Position">
		<Field label="Anchor">
			<select
				value={ov.position.anchor}
				onchange={(e) => setOverlayAnchor(ov, (e.currentTarget as HTMLSelectElement).value)}
			>
				{#each OVERLAY_ANCHORS as anchor (anchor)}
					<option value={anchor}>{anchor}</option>
				{/each}
			</select>
		</Field>
		{#if ov.position.anchor !== 'normalized-rect'}
			<Field label="Offset X">
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={ov.position.offset?.x ?? 0}
					oninput={(e) => setOverlayOffsetX(ov, (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Offset Y">
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={ov.position.offset?.y ?? 0}
					oninput={(e) => setOverlayOffsetY(ov, (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
		{:else}
			<Field label="Rect X">
				<input
					type="number"
					step="any"
					value={ov.position.rect?.x ?? 0}
					oninput={(e) => setOverlayRect(ov, 'x', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Rect Y">
				<input
					type="number"
					step="any"
					value={ov.position.rect?.y ?? 0}
					oninput={(e) => setOverlayRect(ov, 'y', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Width">
				<input
					type="number"
					step="any"
					value={ov.position.rect?.width ?? 1}
					oninput={(e) => setOverlayRect(ov, 'width', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Height">
				<input
					type="number"
					step="any"
					value={ov.position.rect?.height ?? 1}
					oninput={(e) => setOverlayRect(ov, 'height', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
		{/if}
		<Field label="Scale">
			<input
				type="number"
				min="0.1"
				max="8"
				step="any"
				value={ov.position.scale ?? 1}
				oninput={(e) => setOverlayScale(ov, (e.currentTarget as HTMLInputElement).value)}
			/>
		</Field>
		<Field label="Rotation°">
			<input
				type="number"
				min="-360"
				max="360"
				step="any"
				value={ov.position.rotation ?? 0}
				oninput={(e) => setOverlayRotation(ov, (e.currentTarget as HTMLInputElement).value)}
			/>
		</Field>
		{#if depthActive}
			<Field label="Z">
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={ov.z ?? ''}
					placeholder="0.7"
					oninput={(e) => setOverlayZ(ov, (e.currentTarget as HTMLInputElement).value)}
				/>
				<button type="button" class="clear-btn" onclick={() => clearOverlayZ(ov)}>×</button>
			</Field>
		{/if}
	</InspectorSection>

	<InspectorSection label="Enter">
		{#snippet action()}
			<InspectorToggle
				checked={ov.enter !== undefined}
				label="Enter transition"
				onchange={(checked) => {
					if (checked) {
						ensureTransition(ov, 'enter');
					} else {
						ov.enter = undefined;
					}
				}}
			/>
		{/snippet}
		{#if ov.enter}
			<Field label="Start">
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={ov.enter.start}
					oninput={(e) =>
						transitionStartInput(ov, 'enter', (e.currentTarget as HTMLInputElement).value)}
				/>
				<span class="ins-unit"
					>{formatFractionAsSeconds(ov.enter.start, engineState.transport.durationSeconds)}</span
				>
			</Field>
			<Field label="Duration">
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={ov.enter.duration}
					oninput={(e) =>
						transitionDurationInput(ov, 'enter', (e.currentTarget as HTMLInputElement).value)}
				/>
				<span class="ins-unit"
					>{formatFractionAsSeconds(ov.enter.duration, engineState.transport.durationSeconds)}</span
				>
			</Field>
			<Field label="Ease">
				<select
					value={ov.enter.ease}
					onchange={(e) =>
						transitionEaseChange(ov, 'enter', (e.currentTarget as HTMLSelectElement).value)}
				>
					{#each easeOptions as [value, option] (value)}
						<option {value}>{option.label}</option>
					{/each}
				</select>
			</Field>
		{/if}
	</InspectorSection>

	<InspectorSection label="Exit">
		{#snippet action()}
			<InspectorToggle
				checked={ov.exit !== undefined}
				label="Exit transition"
				onchange={(checked) => {
					if (checked) {
						ensureTransition(ov, 'exit');
					} else {
						ov.exit = undefined;
					}
				}}
			/>
		{/snippet}
		{#if ov.exit}
			<Field label="Start">
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={ov.exit.start}
					oninput={(e) =>
						transitionStartInput(ov, 'exit', (e.currentTarget as HTMLInputElement).value)}
				/>
				<span class="ins-unit"
					>{formatFractionAsSeconds(ov.exit.start, engineState.transport.durationSeconds)}</span
				>
			</Field>
			<Field label="Duration">
				<input
					type="number"
					min="0"
					max="1"
					step="any"
					value={ov.exit.duration}
					oninput={(e) =>
						transitionDurationInput(ov, 'exit', (e.currentTarget as HTMLInputElement).value)}
				/>
				<span class="ins-unit"
					>{formatFractionAsSeconds(ov.exit.duration, engineState.transport.durationSeconds)}</span
				>
			</Field>
			<Field label="Ease">
				<select
					value={ov.exit.ease}
					onchange={(e) =>
						transitionEaseChange(ov, 'exit', (e.currentTarget as HTMLSelectElement).value)}
				>
					{#each easeOptions as [value, option] (value)}
						<option {value}>{option.label}</option>
					{/each}
				</select>
			</Field>
		{/if}
	</InspectorSection>

	<KeyframesSection selfKey={`overlay:${ov.id}`} channelNames={OVERLAY_CHANNELS} />

	<CascadeSection
		selfKey={`overlay:${ov.id}`}
		getCascade={() => ov.animation?.cascade}
		setCascade={(next) => setOverlayCascade(ov, next)}
	/>

	<SoundSection
		motions={[
			...(ov.enter ? [{ label: 'Enter', cueId: `overlay:${ov.id}:enter`, window: ov.enter }] : []),
			...(ov.exit ? [{ label: 'Exit', cueId: `overlay:${ov.id}:exit`, window: ov.exit }] : [])
		]}
	/>

	<InspectorSection label="Text Motion" defaultOpen={false}>
		{#each ['kicker', 'title', 'subtitle'] as const as slot (slot)}
			<Field label={slot.charAt(0).toUpperCase() + slot.slice(1)}>
				<AddMenu
					label="+ Effect"
					groups={effectMenuGroups}
					onselect={(id) => handleAddTextAnimation(slot, id)}
				/>
			</Field>
		{/each}

		{#each overlayTextAnimations as entry (entry.id)}
			<div class="anim-entry">
				<div class="anim-entry__header">
					<span class="anim-entry__label">{entry.target.slot}</span>
					<button
						type="button"
						class="remove-btn"
						aria-label={`Remove text animation ${entry.id}`}
						onclick={() => removeTextAnimation(entry.id)}>×</button
					>
				</div>
				<Field label="Effect">
					<select
						value={entry.effect}
						onchange={(e) =>
							textAnimationEffectChange(entry, (e.currentTarget as HTMLSelectElement).value)}
					>
						{#each TEXT_EFFECT_SPLIT_MODES as mode (mode)}
							<optgroup label={mode}>
								{#each effectsBySplit[mode] as opt (opt.id)}
									<option value={opt.id}>{opt.label}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</Field>
				<Field label="Enter">
					<input
						type="number"
						min="0"
						max="1"
						step="any"
						value={entry.enter.start}
						placeholder="start"
						oninput={(e) =>
							textAnimationEnterStartInput(entry, (e.currentTarget as HTMLInputElement).value)}
					/>
					<input
						type="number"
						min="0"
						max="1"
						step="any"
						value={entry.enter.duration}
						placeholder="dur"
						oninput={(e) =>
							textAnimationEnterDurationInput(entry, (e.currentTarget as HTMLInputElement).value)}
					/>
					<select
						value={entry.enter.ease}
						onchange={(e) =>
							textAnimationEnterEaseChange(entry, (e.currentTarget as HTMLSelectElement).value)}
					>
						{#each easeOptions as [value, option] (value)}
							<option {value}>{option.label}</option>
						{/each}
					</select>
				</Field>
				<Field label="Speed ×">
					<input
						type="number"
						min="0.1"
						max="10"
						step="any"
						value={entry.params?.speedMultiplier ?? ''}
						placeholder="1"
						oninput={(e) =>
							setTextAnimParam(
								entry,
								'speedMultiplier',
								(e.currentTarget as HTMLInputElement).value
							)}
					/>
					<button
						type="button"
						class="clear-btn"
						onclick={() => clearTextAnimParam(entry, 'speedMultiplier')}>×</button
					>
				</Field>
				<Field label="Hold ms">
					<input
						type="number"
						min="0"
						step="10"
						value={entry.params?.holdMs ?? ''}
						placeholder="default"
						oninput={(e) =>
							setTextAnimParam(entry, 'holdMs', (e.currentTarget as HTMLInputElement).value)}
					/>
					<button
						type="button"
						class="clear-btn"
						onclick={() => clearTextAnimParam(entry, 'holdMs')}>×</button
					>
				</Field>
				<Field label="Gap ms">
					<input
						type="number"
						min="0"
						step="10"
						value={entry.params?.gapMs ?? ''}
						placeholder="default"
						oninput={(e) =>
							setTextAnimParam(entry, 'gapMs', (e.currentTarget as HTMLInputElement).value)}
					/>
					<button type="button" class="clear-btn" onclick={() => clearTextAnimParam(entry, 'gapMs')}
						>×</button
					>
				</Field>
				<Field label="Y travel ×">
					<input
						type="number"
						min="0"
						max="3"
						step="any"
						value={entry.params?.yTravelMultiplier ?? ''}
						placeholder="1"
						oninput={(e) =>
							setTextAnimParam(
								entry,
								'yTravelMultiplier',
								(e.currentTarget as HTMLInputElement).value
							)}
					/>
					<button
						type="button"
						class="clear-btn"
						onclick={() => clearTextAnimParam(entry, 'yTravelMultiplier')}>×</button
					>
				</Field>
				<Field label="Delay ms">
					<input
						type="number"
						min="0"
						step="10"
						value={entry.params?.initialDelayMs ?? ''}
						placeholder="default"
						oninput={(e) =>
							setTextAnimParam(
								entry,
								'initialDelayMs',
								(e.currentTarget as HTMLInputElement).value
							)}
					/>
					<button
						type="button"
						class="clear-btn"
						onclick={() => clearTextAnimParam(entry, 'initialDelayMs')}>×</button
					>
				</Field>
			</div>
		{/each}
	</InspectorSection>
{/if}

<style>
	/* A text-animation entry: a sub-group separated by a hairline (not a card). */
	.anim-entry {
		border-block-start: 1px solid var(--chrome-hairline);
		display: grid;
		gap: var(--vs-s);
		padding-block-start: var(--vs-s);
	}

	.anim-entry__header {
		align-items: center;
		display: flex;
		justify-content: space-between;
	}

	.anim-entry__label {
		color: var(--chrome-text);
		font-size: 0.75rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.04em;
		text-transform: capitalize;
	}

	.remove-btn,
	.clear-btn {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		flex: none;
		font-size: 1rem;
		line-height: 1;
		padding: 0 var(--vs-xs);
	}

	.remove-btn:hover,
	.clear-btn:hover {
		color: #f0453d;
	}
</style>
