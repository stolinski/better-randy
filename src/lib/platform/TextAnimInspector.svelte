<script lang="ts">
	import {
		EFFECT_CATALOG,
		EFFECT_IDS,
		SPLIT_MODES,
		type SplitMode
	} from '$lib/text-animations/catalog';

	import CascadeSection from './CascadeSection.svelte';
	import { engineState, removeTextAnimation } from './engine-state.svelte';
	import {
		ENGINE_EASES,
		type Ease,
		type TextAnimation,
		type TextAnimationParams
	} from './engine-schema';
	import InspectorSection from './InspectorSection.svelte';
	import Field from './Field.svelte';

	interface Props {
		animId: string;
	}

	let { animId }: Props = $props();

	const entry = $derived(engineState.textAnimations.find((e) => e.id === animId) ?? null);

	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];

	const effectsByGroup: { mode: SplitMode; items: { id: string; label: string }[] }[] =
		SPLIT_MODES.map((mode) => ({
			mode,
			items: EFFECT_IDS.map((id) => ({ id, spec: EFFECT_CATALOG.get(id) }))
				.filter(({ spec }) => spec?.target === mode)
				.map(({ id, spec }) => ({ id, label: spec!.displayName }))
		})).filter((g) => g.items.length > 0);

	function setParam(e: TextAnimation, key: keyof TextAnimationParams, value: string): void {
		const n = Number(value);
		if (!Number.isFinite(n) || n < 0) return;
		if (!e.params) e.params = {};
		e.params[key] = n;
	}

	function clearParam(e: TextAnimation, key: keyof TextAnimationParams): void {
		if (e.params) delete e.params[key];
	}

	function describeTarget(e: TextAnimation): string {
		if (e.target.kind === 'surface') return `Surface · ${e.target.slot}`;
		return `Overlay ${e.target.overlayId} · ${e.target.slot}`;
	}
</script>

{#if entry}
	<div class="textanim-inspector">
		<InspectorSection label="Text Motion">
			{#snippet action()}
				<button type="button" class="remove-btn" onclick={() => removeTextAnimation(entry.id)}>
					Remove
				</button>
			{/snippet}
			<p class="target-label">{describeTarget(entry)}</p>
			<Field label="Effect">
				<select
					value={entry.effect}
					onchange={(e) => {
						const v = (e.currentTarget as HTMLSelectElement).value;
						if (EFFECT_CATALOG.has(v)) entry.effect = v;
					}}
				>
					{#each effectsByGroup as group (group.mode)}
						<optgroup label={group.mode}>
							{#each group.items as opt (opt.id)}
								<option value={opt.id}>{opt.label}</option>
							{/each}
						</optgroup>
					{/each}
				</select>
			</Field>
		</InspectorSection>

		<InspectorSection label="Enter">
			<Field label="Start">
				<input
					type="number"
					min="0"
					max="1"
					step="0.001"
					value={entry.enter.start}
					oninput={(e) => {
						const n = Number((e.currentTarget as HTMLInputElement).value);
						if (Number.isFinite(n)) entry.enter.start = Math.max(0, Math.min(1, n));
					}}
				/>
			</Field>
			<Field label="Duration">
				<input
					type="number"
					min="0"
					max="1"
					step="0.001"
					value={entry.enter.duration}
					oninput={(e) => {
						const n = Number((e.currentTarget as HTMLInputElement).value);
						if (Number.isFinite(n)) entry.enter.duration = Math.max(0, Math.min(1, n));
					}}
				/>
			</Field>
			<Field label="Ease">
				<select
					value={entry.enter.ease}
					onchange={(e) => {
						entry.enter.ease = (e.currentTarget as HTMLSelectElement).value as Ease;
					}}
				>
					{#each easeOptions as [value, option] (value)}
						<option {value}>{option.label}</option>
					{/each}
				</select>
			</Field>
		</InspectorSection>

		<InspectorSection label="Parameters">
			<Field label="Speed ×">
				<input
					type="number"
					min="0.1"
					max="10"
					step="0.1"
					value={entry.params?.speedMultiplier ?? ''}
					placeholder="1"
					oninput={(e) =>
						setParam(entry, 'speedMultiplier', (e.currentTarget as HTMLInputElement).value)}
				/>
				<button type="button" class="clear-btn" onclick={() => clearParam(entry, 'speedMultiplier')}
					>×</button
				>
			</Field>
			<Field label="Hold ms">
				<input
					type="number"
					min="0"
					step="10"
					value={entry.params?.holdMs ?? ''}
					placeholder="default"
					oninput={(e) => setParam(entry, 'holdMs', (e.currentTarget as HTMLInputElement).value)}
				/>
				<button type="button" class="clear-btn" onclick={() => clearParam(entry, 'holdMs')}
					>×</button
				>
			</Field>
			<Field label="Gap ms">
				<input
					type="number"
					min="0"
					step="10"
					value={entry.params?.gapMs ?? ''}
					placeholder="default"
					oninput={(e) => setParam(entry, 'gapMs', (e.currentTarget as HTMLInputElement).value)}
				/>
				<button type="button" class="clear-btn" onclick={() => clearParam(entry, 'gapMs')}>×</button
				>
			</Field>
		</InspectorSection>

		<!-- Weld this animation's enter start to another element (ADR-0035 §4). -->
		<CascadeSection
			selfKey={`textAnimation:${entry.id}`}
			getCascade={() => entry.cascade}
			setCascade={(next) => {
				entry.cascade = next;
			}}
		/>
	</div>
{/if}

<style>
	.textanim-inspector {
		display: grid;
		gap: 0;
	}

	.target-label {
		color: var(--fg-6);
		font-size: 0.75rem;
		margin: 0;
	}

	.remove-btn {
		background: transparent;
		border: 0;
		color: #e6322a;
		cursor: pointer;
		font-size: 0.72rem;
		padding: 0;
	}

	.clear-btn {
		background: transparent;
		border: 0;
		color: var(--fg-4);
		cursor: pointer;
		flex: none;
		font-size: 0.85rem;
		line-height: 1;
		padding: 0 var(--vs-xs);
	}

	.clear-btn:hover {
		color: var(--fg);
	}
</style>
