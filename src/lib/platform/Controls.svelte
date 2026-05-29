<script lang="ts">
	import AnnotationTextEditor from '$lib/annotations/AnnotationTextEditor.svelte';
	import type { AnnotationBody } from '$lib/annotations/annotation-marks';

	import { PIPELINE_REGISTRY, getSurfaceRenderer } from './pipelines';
	import ControlGroup from './ControlGroup.svelte';
	import {
		CAMERA_MOTION_OPTIONS,
		ENGINE_EASES,
		ENGINE_FONT_FAMILIES,
		type Ease,
		type Effect,
		type FontDefinition,
		type FontFamily,
		type Overlay,
		type SurfaceType,
		type TextAnimation,
		type Transition
	} from './engine-schema';
	import {
		EDITOR_MARK_COLORS,
		addEffect,
		addOverlay,
		addTextAnimation,
		engineState,
		removeEffect,
		removeOverlay,
		removeTextAnimation
	} from './engine-state.svelte';
	import type { OverlayRenderer, EffectRenderer } from './pipelines/types';
	import { EFFECT_CATALOG, EFFECT_IDS, SPLIT_MODES, type SplitMode } from '$lib/text-animations/catalog';

	const fontFamilyOptions = Object.entries(ENGINE_FONT_FAMILIES) as [FontFamily, FontDefinition][];
	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];
	const surfaceRenderers = Object.values(PIPELINE_REGISTRY.surfaces);
	const overlayRenderers = Object.values(PIPELINE_REGISTRY.overlays);
	const effectRenderers = Object.values(PIPELINE_REGISTRY.effects);
	const EFFECT_CHAIN_LIMIT = 3;

	let editorBody = $state<AnnotationBody>(engineState.surface.content.body);

	$effect(() => {
		editorBody = engineState.surface.content.body;
	});

	$effect(() => {
		engineState.surface.content.body = editorBody;
	});

	function hasAnyBodyText(body: AnnotationBody): boolean {
		for (const block of body) {
			if (block.type === 'paragraph') {
				for (const segment of block.segments) {
					if (segment.text.length > 0) {
						return true;
					}
				}
			}
		}
		return false;
	}

	const renderer = $derived(getSurfaceRenderer(engineState.surface.type));
	const controls = $derived(renderer?.controls ?? {});

	const showBody = $derived(
		controls.body === 'always' || (controls.body === 'optional' && hasAnyBodyText(editorBody))
	);

	const documentSlots = $derived({
		title: controls.title === true && engineState.surface.content.title !== undefined,
		sourceUrl: controls.sourceUrl === true && engineState.surface.content.sourceUrl !== undefined,
		author: controls.author === true && engineState.surface.content.author !== undefined,
		source: controls.source === true && engineState.surface.content.source !== undefined,
		dateLabel: controls.dateLabel === true && engineState.surface.content.dateLabel !== undefined,
		kicker: controls.kicker === true && engineState.surface.content.kicker !== undefined
	});

	const documentVisible = $derived(
		documentSlots.title ||
			documentSlots.sourceUrl ||
			documentSlots.author ||
			documentSlots.source ||
			documentSlots.dateLabel ||
			documentSlots.kicker ||
			showBody
	);

	const appearanceVisible = $derived(
		Boolean(
			(controls.typography && showBody) ||
				controls.paperColor ||
				(controls.inkColor && showBody) ||
				(controls.camera && engineState.surface.camera !== undefined) ||
				(controls.backgroundVisibility && engineState.surface.backgroundVisibility !== undefined)
		)
	);

	function findOverlayRenderer(type: string): OverlayRenderer | null {
		for (const candidate of overlayRenderers) {
			if (candidate.type === type) {
				return candidate as OverlayRenderer;
			}
		}
		return null;
	}

	function findEffectRenderer(type: string): EffectRenderer | null {
		for (const candidate of effectRenderers) {
			if (candidate.type === type) {
				return candidate as EffectRenderer;
			}
		}
		return null;
	}

	function handleSurfaceTypeChange(event: Event): void {
		const nextType = (event.currentTarget as HTMLSelectElement).value as SurfaceType;
		if (nextType === engineState.surface.type) return;

		const nextRenderer = getSurfaceRenderer(nextType);
		if (!nextRenderer) return;

		const nextDefaults = nextRenderer.defaults();
		// Carry body across (both surfaces have body).
		nextDefaults.content.body = engineState.surface.content.body;
		// Carry text-shaped slots where the new surface admits them.
		for (const slot of ['title', 'sourceUrl', 'author', 'source', 'dateLabel', 'kicker'] as const) {
			const value = engineState.surface.content[slot];
			if (typeof value === 'string' && value.length > 0) {
				nextDefaults.content[slot] = value;
			}
		}
		engineState.surface = nextDefaults;
	}

	function handleAddOverlay(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const type = select.value;
		select.value = '';
		if (!type) return;

		const overlayRenderer = findOverlayRenderer(type);
		if (!overlayRenderer) return;

		const def = overlayRenderer.defaults();
		addOverlay({ type, content: def.content, position: def.position, enter: def.enter, exit: def.exit });
	}

	function handleAddEffect(event: Event): void {
		const select = event.currentTarget as HTMLSelectElement;
		const type = select.value;
		select.value = '';
		if (!type) return;

		const effectRenderer = findEffectRenderer(type);
		if (!effectRenderer) return;

		const def = effectRenderer.defaults();
		addEffect({ type, params: def.params });
	}

	function ensureTransition(overlay: Overlay, field: 'enter' | 'exit'): Transition {
		const existing = overlay[field];
		if (existing) return existing;

		const next: Transition =
			field === 'enter'
				? { start: 0.1, duration: 0.16, ease: 'settled' }
				: { start: 0.82, duration: 0.16, ease: 'smooth' };
		overlay[field] = next;
		return next;
	}

	function transitionStartInput(overlay: Overlay, field: 'enter' | 'exit', value: string): void {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		const transition = ensureTransition(overlay, field);
		transition.start = Math.max(0, Math.min(1, numeric));
	}

	function transitionDurationInput(overlay: Overlay, field: 'enter' | 'exit', value: string): void {
		const numeric = Number(value);
		if (!Number.isFinite(numeric)) return;
		const transition = ensureTransition(overlay, field);
		transition.duration = Math.max(0, Math.min(1, numeric));
	}

	function transitionEaseChange(overlay: Overlay, field: 'enter' | 'exit', value: string): void {
		const transition = ensureTransition(overlay, field);
		transition.ease = value as Ease;
	}

	// ---- Text Motion (ADR-0011) ----
	// Effect IDs grouped by split mode so the picker presents per-character
	// effects under "Per-character" and so on. Keeps the dropdown short.
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

	function handleAddTextAnimation(slot: 'title' | 'kicker' | 'body' | 'sourceUrl' | 'author' | 'source' | 'dateLabel', effectId: string): void {
		if (!effectId) return;
		const spec = EFFECT_CATALOG.get(effectId);
		if (!spec) return;
		addTextAnimation({
			target: { kind: 'surface', slot },
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

	function describeTarget(entry: TextAnimation): string {
		if (entry.target.kind === 'surface') {
			return `Surface · ${entry.target.slot}`;
		}
		return `Overlay ${entry.target.overlayId} · ${entry.target.slot}`;
	}

</script>

<div class="controls-stack">
	<!-- Surface -->
	<ControlGroup title="Surface">
		<label class="row">
			<span>Type</span>
			<select value={engineState.surface.type} onchange={handleSurfaceTypeChange}>
				{#each surfaceRenderers as surface (surface.type)}
					<option value={surface.type}>{surface.label}</option>
				{/each}
			</select>
		</label>
	</ControlGroup>

	<!-- Document + Body -->
	{#if documentVisible}
		<ControlGroup title="Document">
			{#if documentSlots.kicker}
				<label class="row">
					<span>Kicker</span>
					<input bind:value={engineState.surface.content.kicker} type="text" />
				</label>
			{/if}

			{#if documentSlots.title}
				<label class="row">
					<span>Title</span>
					<input bind:value={engineState.surface.content.title} type="text" />
				</label>
			{/if}

			{#if documentSlots.sourceUrl}
				<label class="row">
					<span>Source</span>
					<input bind:value={engineState.surface.content.sourceUrl} type="url" />
				</label>
			{/if}

			{#if documentSlots.author}
				<label class="row">
					<span>Author</span>
					<input bind:value={engineState.surface.content.author} type="text" />
				</label>
			{/if}

			{#if documentSlots.source}
				<label class="row">
					<span>Citation</span>
					<input bind:value={engineState.surface.content.source} type="text" />
				</label>
			{/if}

			{#if documentSlots.dateLabel}
				<label class="row">
					<span>Date</span>
					<input bind:value={engineState.surface.content.dateLabel} type="text" />
				</label>
			{/if}

			{#if showBody}
				<div class="row">
					<span>Body</span>
					<AnnotationTextEditor
						bind:body={editorBody}
						colors={EDITOR_MARK_COLORS}
						label="Body"
						rows={10}
					/>
				</div>
			{/if}
		</ControlGroup>
	{/if}

	<!-- Appearance -->
	{#if appearanceVisible}
		<ControlGroup title="Appearance">
			{#if controls.typography && showBody}
				<label class="row">
					<span>Font</span>
					<select bind:value={engineState.typography.fontFamily}>
						{#each fontFamilyOptions as [value, option] (value)}
							<option {value}>{option.label}</option>
						{/each}
					</select>
				</label>
			{/if}

			{#if controls.paperColor}
				<label class="row">
					<span>Paper</span>
					<input bind:value={engineState.typography.paperColor} type="color" />
				</label>
			{/if}

			{#if controls.inkColor && showBody}
				<label class="row">
					<span>Ink</span>
					<input bind:value={engineState.typography.inkColor} type="color" />
				</label>
			{/if}

			{#if controls.camera && engineState.surface.camera !== undefined}
				<label class="row">
					<span>Camera</span>
					<select bind:value={engineState.surface.camera}>
						{#each CAMERA_MOTION_OPTIONS as option (option.value)}
							<option value={option.value}>{option.label}</option>
						{/each}
					</select>
				</label>
			{/if}

			{#if controls.backgroundVisibility && engineState.surface.backgroundVisibility !== undefined}
				<label class="row">
					<span>Background</span>
					<input
						bind:value={engineState.surface.backgroundVisibility}
						max="1"
						min="0"
						step="0.01"
						type="range"
					/>
				</label>
			{/if}
		</ControlGroup>
	{/if}

	<!-- Overlays -->
	<ControlGroup title="Overlays">
		<label class="row">
			<span>Add</span>
			<select value="" onchange={handleAddOverlay}>
				<option value="" disabled>+ Add overlay…</option>
				{#each overlayRenderers as overlay (overlay.type)}
					<option value={overlay.type}>{overlay.label}</option>
				{/each}
			</select>
		</label>

		{#each engineState.overlays as overlay, index (overlay.id)}
			{@const overlayRenderer = findOverlayRenderer(overlay.type)}
			{#if overlayRenderer}
				{@const OverlayEditor = overlayRenderer.Editor}
				<div class="overlay-entry">
					<div class="overlay-entry__header">
						<span class="overlay-entry__label">{overlayRenderer.label}</span>
						<button
							class="overlay-entry__remove"
							onclick={() => removeOverlay(overlay.id)}
							type="button"
							aria-label={`Remove ${overlayRenderer.label}`}
						>
							Remove
						</button>
					</div>
					<OverlayEditor overlay={overlay as never} />
					<div class="transition-rows">
						<div class="transition-row">
							<span class="transition-row__label">Enter</span>
							<input
								type="number"
								min="0"
								max="1"
								step="0.01"
								value={overlay.enter?.start ?? ''}
								placeholder="start"
								oninput={(e) =>
									transitionStartInput(overlay, 'enter', (e.currentTarget as HTMLInputElement).value)}
							/>
							<input
								type="number"
								min="0"
								max="1"
								step="0.01"
								value={overlay.enter?.duration ?? ''}
								placeholder="dur"
								oninput={(e) =>
									transitionDurationInput(
										overlay,
										'enter',
										(e.currentTarget as HTMLInputElement).value
									)}
							/>
							<select
								value={overlay.enter?.ease ?? 'settled'}
								onchange={(e) =>
									transitionEaseChange(overlay, 'enter', (e.currentTarget as HTMLSelectElement).value)}
							>
								{#each easeOptions as [value, option] (value)}
									<option {value}>{option.label}</option>
								{/each}
							</select>
						</div>
						<div class="transition-row">
							<span class="transition-row__label">Exit</span>
							<input
								type="number"
								min="0"
								max="1"
								step="0.01"
								value={overlay.exit?.start ?? ''}
								placeholder="start"
								oninput={(e) =>
									transitionStartInput(overlay, 'exit', (e.currentTarget as HTMLInputElement).value)}
							/>
							<input
								type="number"
								min="0"
								max="1"
								step="0.01"
								value={overlay.exit?.duration ?? ''}
								placeholder="dur"
								oninput={(e) =>
									transitionDurationInput(
										overlay,
										'exit',
										(e.currentTarget as HTMLInputElement).value
									)}
							/>
							<select
								value={overlay.exit?.ease ?? 'smooth'}
								onchange={(e) =>
									transitionEaseChange(overlay, 'exit', (e.currentTarget as HTMLSelectElement).value)}
							>
								{#each easeOptions as [value, option] (value)}
									<option {value}>{option.label}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>
				{void index}
			{/if}
		{/each}
	</ControlGroup>

	<!-- Text Motion (ADR-0011) -->
	<ControlGroup title="Text Motion">
		<div class="text-motion-add">
			<label class="row">
				<span>Title</span>
				<select
					value=""
					onchange={(e) => {
						const v = (e.currentTarget as HTMLSelectElement).value;
						(e.currentTarget as HTMLSelectElement).value = '';
						if (v) handleAddTextAnimation('title', v);
					}}
				>
					<option value="" disabled>+ Effect…</option>
					<optgroup label="Whole">
						{#each effectsBySplit.whole as opt (opt.id)}
							<option value={opt.id}>{opt.label}</option>
						{/each}
					</optgroup>
					<optgroup label="Per-character">
						{#each effectsBySplit['per-character'] as opt (opt.id)}
							<option value={opt.id}>{opt.label}</option>
						{/each}
					</optgroup>
					<optgroup label="Per-word">
						{#each effectsBySplit['per-word'] as opt (opt.id)}
							<option value={opt.id}>{opt.label}</option>
						{/each}
					</optgroup>
					<optgroup label="Per-line">
						{#each effectsBySplit['per-line'] as opt (opt.id)}
							<option value={opt.id}>{opt.label}</option>
						{/each}
					</optgroup>
				</select>
			</label>
			<label class="row">
				<span>Body</span>
				<select
					value=""
					onchange={(e) => {
						const v = (e.currentTarget as HTMLSelectElement).value;
						(e.currentTarget as HTMLSelectElement).value = '';
						if (v) handleAddTextAnimation('body', v);
					}}
				>
					<option value="" disabled>+ Effect…</option>
					<optgroup label="Whole">
						{#each effectsBySplit.whole as opt (opt.id)}
							<option value={opt.id}>{opt.label}</option>
						{/each}
					</optgroup>
					<optgroup label="Per-word">
						{#each effectsBySplit['per-word'] as opt (opt.id)}
							<option value={opt.id}>{opt.label}</option>
						{/each}
					</optgroup>
					<optgroup label="Per-line">
						{#each effectsBySplit['per-line'] as opt (opt.id)}
							<option value={opt.id}>{opt.label}</option>
						{/each}
					</optgroup>
				</select>
			</label>
		</div>

		{#each engineState.textAnimations as entry (entry.id)}
			<div class="overlay-entry">
				<div class="overlay-entry__header">
					<span class="overlay-entry__label">{describeTarget(entry)}</span>
					<button
						class="overlay-entry__remove"
						onclick={() => removeTextAnimation(entry.id)}
						type="button"
						aria-label={`Remove text animation ${entry.id}`}
					>
						Remove
					</button>
				</div>
				<label class="row">
					<span>Effect</span>
					<select
						value={entry.effect}
						onchange={(e) => textAnimationEffectChange(entry, (e.currentTarget as HTMLSelectElement).value)}
					>
						{#each SPLIT_MODES as mode (mode)}
							<optgroup label={mode}>
								{#each effectsBySplit[mode] as opt (opt.id)}
									<option value={opt.id}>{opt.label}</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</label>
				<div class="transition-row">
					<span class="transition-row__label">Enter</span>
					<input
						type="number"
						min="0"
						max="1"
						step="0.01"
						value={entry.enter.start}
						placeholder="start"
						oninput={(e) => textAnimationEnterStartInput(entry, (e.currentTarget as HTMLInputElement).value)}
					/>
					<input
						type="number"
						min="0"
						max="1"
						step="0.01"
						value={entry.enter.duration}
						placeholder="dur"
						oninput={(e) => textAnimationEnterDurationInput(entry, (e.currentTarget as HTMLInputElement).value)}
					/>
					<select
						value={entry.enter.ease}
						onchange={(e) => textAnimationEnterEaseChange(entry, (e.currentTarget as HTMLSelectElement).value)}
					>
						{#each easeOptions as [value, option] (value)}
							<option {value}>{option.label}</option>
						{/each}
					</select>
				</div>
			</div>
		{/each}
	</ControlGroup>

	<!-- Effects -->
	<ControlGroup title="Effects">
		{@const chainFull = engineState.effects.length >= EFFECT_CHAIN_LIMIT}
		<div class="effect-chain__header">
			<select
				value=""
				onchange={handleAddEffect}
				disabled={chainFull}
				title={chainFull ? `Chain is full (max ${EFFECT_CHAIN_LIMIT})` : ''}
			>
				<option value="" disabled>{chainFull ? 'Chain full' : '+ Add…'}</option>
				{#each effectRenderers as effect (effect.type)}
					<option value={effect.type}>{effect.label}</option>
				{/each}
			</select>
		</div>

		{#each engineState.effects as effect (effect.id)}
			{@const effectRenderer = findEffectRenderer(effect.type)}
			{#if effectRenderer}
				<div class="effect-entry">
					<div class="effect-entry__header">
						<span>{effectRenderer.label}</span>
						<button
							type="button"
							onclick={() => removeEffect(effect.id)}
							aria-label={`Remove ${effectRenderer.label}`}
						>
							Remove
						</button>
					</div>
					{#if effectRenderer.Editor}
						{@const EffectEditor = effectRenderer.Editor}
						<EffectEditor effect={effect as Effect & { params: unknown }} />
					{/if}
				</div>
			{/if}
		{/each}
	</ControlGroup>
</div>

<style>
	.controls-stack {
		display: grid;
		gap: var(--vs-base);
	}

	.overlay-entry,
	.effect-entry {
		border: var(--border-1);
		border-radius: var(--br-s);
		display: grid;
		gap: var(--vs-xs);
		padding: var(--pad-s);
	}

	.overlay-entry__header,
	.effect-entry__header,
	.effect-chain__header {
		align-items: center;
		display: flex;
		gap: var(--vs-s);
		justify-content: space-between;
	}

	.overlay-entry__label {
		color: var(--fg-7);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.overlay-entry__remove,
	.effect-entry__header button {
		background: transparent;
		border: var(--border-1);
		border-radius: var(--br-xs);
		color: var(--fg-6);
		cursor: pointer;
		font-size: 0.75rem;
		padding: 2px 8px;
	}

	.overlay-entry__remove:hover,
	.effect-entry__header button:hover {
		color: var(--fg);
	}

	.transition-rows {
		display: grid;
		gap: var(--vs-xs);
	}

	.transition-row {
		align-items: center;
		display: grid;
		gap: var(--pad-xs);
		grid-template-columns: 4rem 1fr 1fr 1fr;
	}

	.transition-row__label {
		color: var(--fg-6);
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.transition-row input,
	.transition-row select {
		font-size: 0.85rem;
		min-inline-size: 0;
	}


	.text-motion-add {
		display: grid;
		gap: var(--vs-xs);
	}
</style>
