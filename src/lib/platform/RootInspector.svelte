<script lang="ts">
	import { engineState, packState, addEffect, removeEffect } from './engine-state.svelte';
	import { ENGINE_EASES, type Ease, type Effect, type Stage } from './engine-schema';
	import { listSoundAssets } from './audio-assets';
	import { PACK_REGISTRY } from './packs/registry';
	import { PIPELINE_REGISTRY } from './pipelines';
	import { listSubstrateAssets } from './substrate-textures';
	import type { EffectRenderer } from './pipelines/types';
	import { compositionMeta } from './composition-meta.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import Field from './Field.svelte';

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

	// ---- Manual audio cues + the bed (ADR-0033 §5) ----
	// Automatic cues are derived from motion and never appear here — this
	// authors only the free-standing cues and the single bed (full-frame
	// pieces only, so "+ Bed" shows only while a background fill is set).
	const soundAssets = listSoundAssets();
	const hasBed = $derived(engineState.audioCues.some((cue) => cue.kind === 'bed'));

	function addAudioCue(kind: 'cue' | 'bed'): void {
		const used = new Set(engineState.audioCues.map((cue) => cue.id));
		let counter = 1;
		let id = kind === 'bed' ? 'bed' : `cue-${counter}`;
		while (used.has(id)) {
			counter += 1;
			id = `${kind === 'bed' ? 'bed' : 'cue'}-${counter}`;
		}
		engineState.audioCues.push(
			kind === 'bed'
				? {
						id,
						kind,
						assetSlug: soundAssets[0] ?? 'core-sub-drop',
						start: 0,
						duration: 1,
						volume: 0.4
					}
				: { id, kind, assetSlug: soundAssets[0] ?? 'core-impact', start: 0.5, duration: 0.05 }
		);
	}

	function setCueFraction(
		cue: { start: number; duration: number },
		key: 'start' | 'duration',
		value: string
	): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		cue[key] = Math.max(0, Math.min(1, n));
	}
</script>

<div class="root-inspector">
	{#if compositionMeta.isUserComp}
		<div class="fork-indicator">
			<span class="fork-indicator__label">forked</span>
			{#if compositionMeta.revert}
				<button type="button" class="fork-indicator__revert" onclick={compositionMeta.revert}
					>Revert</button
				>
			{/if}
		</div>
	{/if}

	<InspectorSection label="Transport">
		<Field label="Duration">
			<input
				type="number"
				min="1"
				max="60"
				step="0.5"
				bind:value={engineState.transport.durationSeconds}
			/>
			<span class="unit">s</span>
		</Field>
		<Field label="FPS">
			<input type="number" min="12" max="60" step="1" bind:value={engineState.transport.fps} />
		</Field>
		<Field label="Format">
			<select bind:value={engineState.transport.format}>
				<option value="webm">WebM VP9</option>
				<option value="prores">MOV ProRes</option>
			</select>
		</Field>
	</InspectorSection>

	<InspectorSection label="Pack">
		<Field label="Pack">
			<select bind:value={packState.slug}>
				{#each packOptions as [slug, pack] (slug)}
					<option value={slug}>{pack.label}</option>
				{/each}
			</select>
		</Field>
	</InspectorSection>

	<InspectorSection label="Effects">
		{#snippet action()}
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
		{/snippet}
		{#each engineState.effects as effect (effect.id)}
			{@const renderer = findEffectRenderer(effect.type)}
			{#if renderer}
				<div class="layer-row">
					<span class="layer-row__label">{renderer.label}</span>
					<button
						type="button"
						class="remove-btn"
						aria-label={`Remove ${renderer.label}`}
						onclick={() => removeEffect(effect.id)}>×</button
					>
				</div>
				{#if renderer.Editor}
					{@const EffectEditor = renderer.Editor}
					<EffectEditor effect={effect as Effect & { params: unknown }} />
				{/if}
			{/if}
		{/each}
	</InspectorSection>

	<InspectorSection label="Background">
		<Field label="Fill">
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
		</Field>
	</InspectorSection>

	<InspectorSection label="Depth Stage">
		{#snippet action()}
			<input type="checkbox" checked={!!engineState.stage} onchange={toggleStage} />
		{/snippet}
		{#if engineState.stage}
			{@const stage = engineState.stage}
			<Field label="Camera">
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
			</Field>
			{#if stage.camera.move !== 'static'}
				<Field label="Amount">
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
				</Field>
				<Field label="Ease">
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
				</Field>
			{/if}
			<Field label="Focus Z">
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
			</Field>
			<Field label="Aperture">
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
			</Field>
			<Field label="Band">
				<input
					type="number"
					min="0"
					max="1"
					step="0.01"
					value={stage.focus.band}
					oninput={(e) => {
						ensureStage().focus.band = parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
					}}
				/>
			</Field>
			<Field label="Rack focus">
				<input type="checkbox" checked={!!stage.focus.pull} onchange={toggleRackFocus} />
			</Field>
			<Field label="Backdrop">
				<input type="checkbox" checked={!!stage.backdrop?.image} onchange={toggleBackdropImage} />
			</Field>
			{#if stage.backdrop?.image}
				<Field label="Asset">
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
				</Field>
			{/if}
		{/if}
	</InspectorSection>

	<InspectorSection label="Audio Cues">
		{#snippet action()}
			<button type="button" class="add-cue" onclick={() => addAudioCue('cue')}>+ Cue</button>
			{#if engineState.backgroundFill !== undefined && !hasBed}
				<button type="button" class="add-cue" onclick={() => addAudioCue('bed')}>+ Bed</button>
			{/if}
		{/snippet}
		{#each engineState.audioCues as cue, index (cue.id)}
			<div class="cue-entry">
				<div class="cue-entry__header">
					<span class="cue-entry__label">{cue.kind === 'bed' ? 'bed' : cue.id}</span>
					<button
						type="button"
						class="remove-btn"
						aria-label="Remove audio cue"
						onclick={() => engineState.audioCues.splice(index, 1)}>×</button
					>
				</div>
				<Field label="Sample">
					<select bind:value={cue.assetSlug}>
						{#each soundAssets as slug (slug)}
							<option value={slug}>{slug}</option>
						{/each}
					</select>
				</Field>
				<Field label="Window">
					<!-- Display rounded to the drag grain — a rail drag writes raw floats
					     (0.0498735…) that would otherwise spill into the input. -->
					<input
						type="number"
						min="0"
						max="1"
						step="0.001"
						value={Math.round(cue.start * 1000) / 1000}
						oninput={(e) =>
							setCueFraction(cue, 'start', (e.currentTarget as HTMLInputElement).value)}
					/>
					<input
						type="number"
						min="0"
						max="1"
						step="0.001"
						value={Math.round(cue.duration * 1000) / 1000}
						oninput={(e) =>
							setCueFraction(cue, 'duration', (e.currentTarget as HTMLInputElement).value)}
					/>
				</Field>
				<Field label="Volume">
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={cue.volume ?? 1}
						oninput={(e) => {
							cue.volume = Number((e.currentTarget as HTMLInputElement).value);
						}}
					/>
				</Field>
			</div>
		{/each}
	</InspectorSection>

	<InspectorSection label="Export">
		<button class="export-btn" type="button" disabled={isExporting} onclick={handleExport}>
			{isExporting ? `Exporting ${progressPercent}%…` : 'Export'}
		</button>
		{#if isExporting}
			<progress aria-label="Export progress" max="1" value={progress}></progress>
		{/if}
		{#if status}
			<p class="export-status">{status}</p>
		{/if}
	</InspectorSection>
</div>

<style>
	.root-inspector {
		display: grid;
		gap: 0;
	}

	.unit {
		color: var(--fg-5);
		flex: none;
		font-size: 0.75rem;
	}

	/* ---- Effect entries (no card: just a row + the effect's own editor) ---- */

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

	.add-cue {
		background: transparent;
		border: 0;
		color: var(--fg-5);
		cursor: pointer;
		font-size: 0.72rem;
		padding: 0;
	}

	.add-cue:hover {
		color: var(--fg);
	}

	/* A manual cue / bed entry: hairline-separated sub-group, like effect rows. */
	.cue-entry {
		border-block-start: var(--border-1);
		display: grid;
		gap: var(--vs-xs);
		padding-block-start: var(--vs-xs);
	}

	.cue-entry__header {
		align-items: center;
		display: flex;
		justify-content: space-between;
	}

	.cue-entry__label {
		color: var(--fg-7);
		font-family: ui-monospace, monospace;
		font-size: 0.72rem;
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
