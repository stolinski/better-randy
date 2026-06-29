<script lang="ts">
	import {
		engineState,
		packState,
		addEffect,
		removeEffect
	} from './engine-state.svelte';
	import {
		ENGINE_EASES,
		type Ease,
		type Effect,
		type Stage
	} from './engine-schema';
	import { PACK_REGISTRY } from './packs/registry';
	import { PIPELINE_REGISTRY } from './pipelines';
	import { listSubstrateAssets } from './substrate-textures';
	import type { EffectRenderer } from './pipelines/types';
	import { compositionMeta } from './composition-meta.svelte';

	interface Props {
		handleExport: () => Promise<void>;
		isExporting: boolean;
		progress: number;
		status: string;
	}

	let { handleExport, isExporting, progress, status }: Props = $props();

	const packOptions = Object.entries(PACK_REGISTRY) as [string, (typeof PACK_REGISTRY)[string]][];
	const effectRenderers = Object.values(PIPELINE_REGISTRY.effects) as EffectRenderer[];
	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];
	const substrateAssets = listSubstrateAssets();
	const EFFECT_CHAIN_LIMIT = 3;

	function findEffectRenderer(type: string): EffectRenderer | null {
		return effectRenderers.find((r) => r.type === type) ?? null;
	}

	function handleAddEffect(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const type = select.value;
		select.value = '';
		if (!type) return;
		const renderer = findEffectRenderer(type);
		if (!renderer) return;
		const def = renderer.defaults();
		addEffect({ type, params: def.params });
	}

	function toggleStage(): void {
		if (engineState.stage) {
			engineState.stage = undefined;
		} else {
			engineState.stage = {
				type: 'depth',
				camera: { move: 'static', amount: 0.5, ease: 'smooth' },
				focus: { focusZ: 0, aperture: 0.6, band: 0 }
			};
		}
	}

	function ensureStage(): Stage {
		if (!engineState.stage) {
			engineState.stage = {
				type: 'depth',
				camera: { move: 'static', amount: 0.5, ease: 'smooth' },
				focus: { focusZ: 0, aperture: 0.6, band: 0 }
			};
		}
		return engineState.stage;
	}

	function toggleRackFocus(): void {
		const stage = ensureStage();
		if (stage.focus.pull) {
			stage.focus.pull = undefined;
		} else {
			stage.focus.pull = { from: 0, to: 1, start: 0.1, duration: 0.3 };
		}
	}

	function toggleBackdropImage(): void {
		const stage = ensureStage();
		if (!stage.backdrop) stage.backdrop = { contrast: 0 };
		if (stage.backdrop.image) {
			stage.backdrop.image = undefined;
		} else {
			stage.backdrop.image = { asset: substrateAssets[0] ?? 'atmosphere-warm' };
		}
	}

	const progressPercent = $derived(Math.round(progress * 100));
	const chainFull = $derived(engineState.effects.length >= EFFECT_CHAIN_LIMIT);
</script>

<div class="root-inspector">
	{#if compositionMeta.isUserComp}
		<div class="fork-indicator">
			<span class="fork-indicator__label">forked</span>
			{#if compositionMeta.revert}
				<button
					type="button"
					class="fork-indicator__revert"
					onclick={compositionMeta.revert}
				>Revert</button>
			{/if}
		</div>
	{/if}

	<!-- TRANSPORT -->
	<div class="section">
		<div class="section__header"><span class="section__label">Transport</span></div>
		<div class="field-row">
			<span class="field-label">Duration</span>
			<input
				type="number"
				min="1"
				max="60"
				step="0.5"
				bind:value={engineState.transport.durationSeconds}
			/>
			<span class="field-unit">s</span>
		</div>
		<div class="field-row">
			<span class="field-label">FPS</span>
			<input
				type="number"
				min="12"
				max="60"
				step="1"
				bind:value={engineState.transport.fps}
			/>
		</div>
		<div class="field-row">
			<span class="field-label">Format</span>
			<select bind:value={engineState.transport.format}>
				<option value="webm">WebM VP9</option>
				<option value="prores">MOV ProRes</option>
			</select>
		</div>
	</div>

	<!-- PACK -->
	<div class="section">
		<div class="section__header"><span class="section__label">Pack</span></div>
		<div class="field-row">
			<span class="field-label">Pack</span>
			<select bind:value={packState.slug}>
				{#each packOptions as [slug, pack] (slug)}
					<option value={slug}>{pack.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<!-- EFFECTS -->
	<div class="section">
		<div class="section__header">
			<span class="section__label">Effects</span>
			<select
				value=""
				onchange={handleAddEffect}
				disabled={chainFull}
				title={chainFull ? `Chain is full (max ${EFFECT_CHAIN_LIMIT})` : ''}
				class="add-select"
			>
				<option value="" disabled>{chainFull ? 'Full' : '+ Add'}</option>
				{#each effectRenderers as renderer (renderer.type)}
					<option value={renderer.type}>{renderer.label}</option>
				{/each}
			</select>
		</div>
		{#each engineState.effects as effect (effect.id)}
			{@const renderer = findEffectRenderer(effect.type)}
			{#if renderer}
				<div class="layer-row">
					<span class="layer-row__label">{renderer.label}</span>
					<button
						type="button"
						class="remove-btn"
						aria-label={`Remove ${renderer.label}`}
						onclick={() => removeEffect(effect.id)}
					>×</button>
				</div>
				{#if renderer.Editor}
					{@const EffectEditor = renderer.Editor}
					<EffectEditor effect={effect as Effect & { params: unknown }} />
				{/if}
			{/if}
		{/each}
	</div>

	<!-- BACKGROUND -->
	<div class="section">
		<div class="section__header"><span class="section__label">Background</span></div>
		<div class="field-row">
			<span class="field-label">Fill</span>
			<input
				type="checkbox"
				checked={engineState.backgroundFill !== undefined}
				onchange={(e) => {
					if ((e.currentTarget as HTMLInputElement).checked) {
						engineState.backgroundFill = '#000000';
					} else {
						engineState.backgroundFill = undefined;
					}
				}}
			/>
			{#if engineState.backgroundFill !== undefined}
				<input type="color" bind:value={engineState.backgroundFill} />
			{/if}
		</div>
	</div>

	<!-- DEPTH STAGE -->
	<div class="section">
		<div class="section__header">
			<span class="section__label">Depth Stage</span>
			<input type="checkbox" checked={!!engineState.stage} onchange={toggleStage} />
		</div>
		{#if engineState.stage}
			{@const stage = engineState.stage}
			<div class="field-row">
				<span class="field-label">Camera</span>
				<select
					value={stage.camera.move}
					onchange={(e) => {
						ensureStage().camera.move = (e.currentTarget as HTMLSelectElement).value as
							| 'static'
							| 'push'
							| 'drift';
					}}
				>
					<option value="static">Static</option>
					<option value="push">Push</option>
					<option value="drift">Drift</option>
				</select>
			</div>
			{#if stage.camera.move !== 'static'}
				<div class="field-row">
					<span class="field-label">Amount</span>
					<input
						type="number"
						min="0"
						max="1"
						step="0.01"
						value={stage.camera.amount ?? 0.15}
						oninput={(e) => {
							ensureStage().camera.amount =
								parseFloat((e.currentTarget as HTMLInputElement).value) || 0.15;
						}}
					/>
				</div>
				<div class="field-row">
					<span class="field-label">Ease</span>
					<select
						value={stage.camera.ease}
						onchange={(e) => {
							ensureStage().camera.ease = (e.currentTarget as HTMLSelectElement).value as Ease;
						}}
					>
						{#each easeOptions as [value, opt] (value)}
							<option {value}>{opt.label}</option>
						{/each}
					</select>
				</div>
			{/if}
			<div class="field-row">
				<span class="field-label">Focus Z</span>
				<input
					type="number"
					min="0"
					max="1"
					step="0.01"
					value={stage.focus.focusZ}
					oninput={(e) => {
						ensureStage().focus.focusZ =
							parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
					}}
				/>
			</div>
			<div class="field-row">
				<span class="field-label">Aperture</span>
				<input
					type="number"
					min="0"
					max="1"
					step="0.01"
					value={stage.focus.aperture}
					oninput={(e) => {
						ensureStage().focus.aperture =
							parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
					}}
				/>
			</div>
			<div class="field-row">
				<span class="field-label">Band</span>
				<input
					type="number"
					min="0"
					max="1"
					step="0.01"
					value={stage.focus.band}
					oninput={(e) => {
						ensureStage().focus.band =
							parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
					}}
				/>
			</div>
			<div class="field-row">
				<span class="field-label">Rack focus</span>
				<input type="checkbox" checked={!!stage.focus.pull} onchange={toggleRackFocus} />
			</div>
			<div class="field-row">
				<span class="field-label">Backdrop img</span>
				<input
					type="checkbox"
					checked={!!stage.backdrop?.image}
					onchange={toggleBackdropImage}
				/>
			</div>
			{#if stage.backdrop?.image}
				<div class="field-row">
					<span class="field-label">Asset</span>
					<select
						value={stage.backdrop.image.asset}
						onchange={(e) => {
							const s = ensureStage();
							if (!s.backdrop) s.backdrop = { contrast: 0 };
							if (!s.backdrop.image) s.backdrop.image = { asset: '' };
							s.backdrop.image.asset = (e.currentTarget as HTMLSelectElement).value;
						}}
					>
						{#each substrateAssets as asset (asset)}
							<option value={asset}>{asset}</option>
						{/each}
					</select>
				</div>
			{/if}
		{/if}
	</div>

	<!-- EXPORT -->
	<div class="section">
		<div class="section__header"><span class="section__label">Export</span></div>
		<button
			class="export-btn"
			type="button"
			disabled={isExporting}
			onclick={handleExport}
		>
			{isExporting ? `Exporting ${progressPercent}%…` : 'Export'}
		</button>
		{#if isExporting}
			<progress aria-label="Export progress" max="1" value={progress}></progress>
		{/if}
		{#if status}
			<p class="export-status">{status}</p>
		{/if}
	</div>
</div>

<style>
	.root-inspector {
		display: grid;
		gap: 0;
	}

	/* ---- Section (ADR-0034 §9): 1px divider + inline all-caps label ---- */

	.section {
		border-block-end: var(--border-1);
		display: grid;
		gap: var(--vs-xs);
		padding: var(--vs-s) var(--vs-base);
	}

	.section__header {
		align-items: center;
		display: flex;
		gap: var(--vs-s);
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

	/* ---- Field rows ---- */

	.field-row {
		align-items: center;
		display: grid;
		gap: var(--vs-xs);
		grid-template-columns: 5rem 1fr auto;
	}

	.field-label {
		color: var(--fg-6);
		font-size: 0.8rem;
	}

	.field-unit {
		color: var(--fg-5);
		font-size: 0.75rem;
	}

	/* ---- Effect entries ---- */

	.layer-row {
		align-items: center;
		display: flex;
		gap: var(--vs-s);
		justify-content: space-between;
	}

	.layer-row__label {
		color: var(--fg-7);
		font-size: 0.8rem;
	}

	.remove-btn {
		background: transparent;
		border: 0;
		color: var(--fg-4);
		cursor: pointer;
		font-size: 1rem;
		padding: 0 var(--vs-xs);
	}

	.remove-btn:hover {
		color: #e6322a;
	}

	.add-select {
		font-size: 0.75rem;
		max-inline-size: 6rem;
	}

	/* ---- Export ---- */

	.export-btn {
		background: var(--fg-1);
		border: var(--border-1);
		border-radius: var(--br-s);
		color: var(--fg);
		cursor: pointer;
		font-size: 0.85rem;
		padding-block: var(--vs-xs);
		width: 100%;
	}

	.export-btn:hover:not(:disabled) {
		background: var(--fg-2);
	}

	.export-btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.export-status {
		color: var(--fg-5);
		font-size: 0.75rem;
		margin: 0;
	}

	/* ---- Fork indicator ---- */

	.fork-indicator {
		align-items: center;
		border-block-end: var(--border-1);
		display: flex;
		justify-content: space-between;
		padding: var(--vs-xs) var(--vs-base);
	}

	.fork-indicator__label {
		color: var(--fg-5);
		font-size: 0.72rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.fork-indicator__revert {
		background: transparent;
		border: var(--border-1);
		border-radius: var(--br-xs);
		color: var(--fg-6);
		cursor: pointer;
		font-size: 0.7rem;
		padding-block: 0.1em;
		padding-inline: 0.4em;
	}

	.fork-indicator__revert:hover {
		color: var(--fg);
	}
</style>
