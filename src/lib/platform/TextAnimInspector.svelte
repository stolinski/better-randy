<script lang="ts">
	import { EFFECT_CATALOG, EFFECT_IDS, SPLIT_MODES, type SplitMode } from '$lib/text-animations/catalog';

	import { engineState, removeTextAnimation } from './engine-state.svelte';
	import {
		ENGINE_EASES,
		type Ease,
		type TextAnimation,
		type TextAnimationParams
	} from './engine-schema';

	interface Props {
		animId: string;
	}

	let { animId }: Props = $props();

	const entry = $derived(engineState.textAnimations.find((e) => e.id === animId) ?? null);

	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];

	const effectsByGroup: { mode: SplitMode; items: { id: string; label: string }[] }[] =
		SPLIT_MODES.map((mode) => ({
			mode,
			items: EFFECT_IDS
				.map((id) => ({ id, spec: EFFECT_CATALOG.get(id) }))
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
		<!-- EFFECT -->
		<div class="section">
			<div class="section__header">
				<span class="section__label">Text Motion</span>
				<button
					type="button"
					class="remove-btn"
					onclick={() => removeTextAnimation(entry.id)}
				>Remove</button>
			</div>
			<div class="target-label">{describeTarget(entry)}</div>
			<div class="field-row">
				<span class="field-label">Effect</span>
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
			</div>
		</div>

		<!-- ENTER -->
		<div class="section">
			<div class="section__header"><span class="section__label">Enter</span></div>
			<div class="field-row">
				<span class="field-label">Start</span>
				<input
					type="number" min="0" max="1" step="0.001"
					value={entry.enter.start}
					oninput={(e) => {
						const n = Number((e.currentTarget as HTMLInputElement).value);
						if (Number.isFinite(n)) entry.enter.start = Math.max(0, Math.min(1, n));
					}}
				/>
			</div>
			<div class="field-row">
				<span class="field-label">Duration</span>
				<input
					type="number" min="0" max="1" step="0.001"
					value={entry.enter.duration}
					oninput={(e) => {
						const n = Number((e.currentTarget as HTMLInputElement).value);
						if (Number.isFinite(n)) entry.enter.duration = Math.max(0, Math.min(1, n));
					}}
				/>
			</div>
			<div class="field-row">
				<span class="field-label">Ease</span>
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
			</div>
		</div>

		<!-- PARAMS -->
		<div class="section">
			<div class="section__header"><span class="section__label">Parameters</span></div>
			<div class="param-row">
				<span class="field-label">Speed ×</span>
				<input
					type="number" min="0.1" max="10" step="0.1"
					value={entry.params?.speedMultiplier ?? ''}
					placeholder="1"
					oninput={(e) => setParam(entry, 'speedMultiplier', (e.currentTarget as HTMLInputElement).value)}
				/>
				<button type="button" class="clear-btn" onclick={() => clearParam(entry, 'speedMultiplier')}>×</button>
			</div>
			<div class="param-row">
				<span class="field-label">Hold ms</span>
				<input
					type="number" min="0" step="10"
					value={entry.params?.holdMs ?? ''}
					placeholder="default"
					oninput={(e) => setParam(entry, 'holdMs', (e.currentTarget as HTMLInputElement).value)}
				/>
				<button type="button" class="clear-btn" onclick={() => clearParam(entry, 'holdMs')}>×</button>
			</div>
			<div class="param-row">
				<span class="field-label">Gap ms</span>
				<input
					type="number" min="0" step="10"
					value={entry.params?.gapMs ?? ''}
					placeholder="default"
					oninput={(e) => setParam(entry, 'gapMs', (e.currentTarget as HTMLInputElement).value)}
				/>
				<button type="button" class="clear-btn" onclick={() => clearParam(entry, 'gapMs')}>×</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.textanim-inspector {
		display: grid;
		gap: 0;
	}

	.section {
		border-block-end: var(--border-1);
		display: grid;
		gap: var(--vs-xs);
		padding: var(--vs-s) var(--vs-base);
	}

	.section__header {
		align-items: center;
		display: flex;
		justify-content: space-between;
		padding-block-end: var(--vs-xs);
	}

	.section__label {
		color: var(--fg-5);
		font-size: 0.7rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.target-label {
		color: var(--fg-6);
		font-size: 0.75rem;
	}

	.field-row {
		align-items: center;
		display: grid;
		gap: var(--vs-xs);
		grid-template-columns: 5rem 1fr;
	}

	.param-row {
		align-items: center;
		display: grid;
		gap: var(--vs-xs);
		grid-template-columns: 5rem 1fr auto;
	}

	.field-label {
		color: var(--fg-6);
		font-size: 0.8rem;
	}

	.remove-btn {
		background: transparent;
		border: 0;
		color: #E6322A;
		cursor: pointer;
		font-size: 0.75rem;
		padding: 0;
	}

	.clear-btn {
		background: transparent;
		border: 0;
		color: var(--fg-4);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0;
	}

	.clear-btn:hover {
		color: var(--fg);
	}
</style>
