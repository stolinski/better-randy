<script lang="ts">
	import { engineState, addTextAnimation, removeTextAnimation } from './engine-state.svelte';
	import {
		ENGINE_EASES,
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
		EFFECT_CATALOG,
		EFFECT_IDS,
		SPLIT_MODES,
		type SplitMode
	} from '$lib/text-animations/catalog';
	import InspectorSection from './InspectorSection.svelte';
	import Field from './Field.svelte';
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
		const out: Record<SplitMode, { id: string; label: string }[]> = {
			whole: [],
			'per-character': [],
			'per-word': [],
			'per-line': []
		};
		for (const id of EFFECT_IDS) {
			const spec = EFFECT_CATALOG.get(id);
			if (!spec) continue;
			out[spec.target].push({ id, label: spec.displayName });
		}
		return out;
	});

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

	function setOverlayScale(ov: Overlay, value: string): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		ov.position.scale = Math.max(0.1, Math.min(8, n));
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
		const spec = EFFECT_CATALOG.get(effectId);
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
		if (!EFFECT_CATALOG.has(value)) return;
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
					step="0.01"
					value={ov.position.offset?.x ?? 0}
					oninput={(e) => setOverlayOffsetX(ov, (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Offset Y">
				<input
					type="number"
					min="0"
					max="1"
					step="0.01"
					value={ov.position.offset?.y ?? 0}
					oninput={(e) => setOverlayOffsetY(ov, (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
		{/if}
		<Field label="Scale">
			<input
				type="number"
				min="0.1"
				max="8"
				step="0.05"
				value={ov.position.scale ?? 1}
				oninput={(e) => setOverlayScale(ov, (e.currentTarget as HTMLInputElement).value)}
			/>
		</Field>
	</InspectorSection>

	<InspectorSection label="Enter">
		{#snippet action()}
			<input
				type="checkbox"
				checked={ov.enter !== undefined}
				onchange={(e) => {
					if ((e.currentTarget as HTMLInputElement).checked) {
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
					step="0.001"
					value={ov.enter.start}
					oninput={(e) =>
						transitionStartInput(ov, 'enter', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Duration">
				<input
					type="number"
					min="0"
					max="1"
					step="0.001"
					value={ov.enter.duration}
					oninput={(e) =>
						transitionDurationInput(ov, 'enter', (e.currentTarget as HTMLInputElement).value)}
				/>
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
			<input
				type="checkbox"
				checked={ov.exit !== undefined}
				onchange={(e) => {
					if ((e.currentTarget as HTMLInputElement).checked) {
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
					step="0.001"
					value={ov.exit.start}
					oninput={(e) =>
						transitionStartInput(ov, 'exit', (e.currentTarget as HTMLInputElement).value)}
				/>
			</Field>
			<Field label="Duration">
				<input
					type="number"
					min="0"
					max="1"
					step="0.001"
					value={ov.exit.duration}
					oninput={(e) =>
						transitionDurationInput(ov, 'exit', (e.currentTarget as HTMLInputElement).value)}
				/>
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

	<SoundSection
		host={ov}
		motions={[
			...(ov.enter ? [{ label: 'Enter', window: ov.enter }] : []),
			...(ov.exit ? [{ label: 'Exit', window: ov.exit }] : [])
		]}
	/>

	<InspectorSection label="Text Motion">
		{#each ['kicker', 'title', 'subtitle'] as const as slot (slot)}
			<Field label={slot}>
				<select
					value=""
					onchange={(e) => {
						const v = (e.currentTarget as HTMLSelectElement).value;
						(e.currentTarget as HTMLSelectElement).value = '';
						if (v) handleAddTextAnimation(slot, v);
					}}
				>
					<option value="" disabled>+ Effect…</option>
					{#each SPLIT_MODES as mode (mode)}
						{#if effectsBySplit[mode].length > 0}
							<optgroup label={mode}>
								{#each effectsBySplit[mode] as opt (opt.id)}
									<option value={opt.id}>{opt.label}</option>
								{/each}
							</optgroup>
						{/if}
					{/each}
				</select>
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
						{#each SPLIT_MODES as mode (mode)}
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
						step="0.001"
						value={entry.enter.start}
						placeholder="start"
						oninput={(e) =>
							textAnimationEnterStartInput(entry, (e.currentTarget as HTMLInputElement).value)}
					/>
					<input
						type="number"
						min="0"
						max="1"
						step="0.001"
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
						step="0.1"
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
			</div>
		{/each}
	</InspectorSection>
{/if}

<style>
	/* A text-animation entry: a sub-group separated by a hairline (not a card). */
	.anim-entry {
		border-block-start: var(--border-1);
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
		color: var(--fg-7);
		font-size: 0.75rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.04em;
		text-transform: capitalize;
	}

	.remove-btn,
	.clear-btn {
		background: transparent;
		border: 0;
		color: var(--fg-4);
		cursor: pointer;
		flex: none;
		font-size: 1rem;
		line-height: 1;
		padding: 0 var(--vs-xs);
	}

	.remove-btn:hover,
	.clear-btn:hover {
		color: #e6322a;
	}
</style>
