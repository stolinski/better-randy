<script lang="ts">
	import AnnotationTextEditor from '$lib/annotations/AnnotationTextEditor.svelte';
	import type { AnnotationBody } from '$lib/annotations/annotation-marks';
	import {
		EFFECT_CATALOG,
		EFFECT_IDS,
		SPLIT_MODES,
		TITLE_SCALE_SLOTS,
		type SplitMode
	} from '$lib/text-animations/catalog';

	import {
		ENGINE_EASES,
		ENGINE_FONT_FAMILIES,
		type Ease,
		type FontDefinition,
		type FontFamily,
		type SurfaceType,
		type TextAnimation,
		type TextAnimationParams
	} from './engine-schema';
	import {
		EDITOR_MARK_COLORS,
		addTextAnimation,
		engineState,
		removeTextAnimation
	} from './engine-state.svelte';
	import { PIPELINE_REGISTRY, getSurfaceRenderer } from './pipelines';

	const surfaceRenderers = Object.values(PIPELINE_REGISTRY.surfaces);
	const fontFamilyOptions = Object.entries(ENGINE_FONT_FAMILIES) as [FontFamily, FontDefinition][];
	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];

	// ---- Surface controls derived from the active renderer ----

	const renderer = $derived(getSurfaceRenderer(engineState.surface.type));
	const controls = $derived(renderer?.controls ?? {});

	function hasAnyBodyText(body: AnnotationBody): boolean {
		for (const block of body) {
			if (block.type === 'paragraph') {
				for (const segment of block.segments) {
					if (segment.text.length > 0) return true;
				}
			}
		}
		return false;
	}

	const showBody = $derived(
		controls.body === 'always' ||
			(controls.body === 'optional' && hasAnyBodyText(engineState.surface.content.body))
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
				(controls.inkColor && showBody)
		)
	);

	// ---- Surface type change ----

	function handleSurfaceTypeChange(event: Event): void {
		const nextType = (event.currentTarget as HTMLSelectElement).value as SurfaceType;
		if (nextType === engineState.surface.type) return;
		const nextRenderer = getSurfaceRenderer(nextType);
		if (!nextRenderer) return;
		const nextDefaults = nextRenderer.defaults();
		nextDefaults.content.body = engineState.surface.content.body;
		for (const slot of ['title', 'sourceUrl', 'author', 'source', 'dateLabel', 'kicker'] as const) {
			const value = engineState.surface.content[slot];
			if (typeof value === 'string' && value.length > 0) nextDefaults.content[slot] = value;
		}
		engineState.surface = nextDefaults;
	}

	// ---- Text Motion (ADR-0011) ----

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

	// Active document slots that can receive a text animation, in display order.
	// Per-character effects are restricted to title-scale slots only (TITLE_SCALE_SLOTS).
	const activeSlots = $derived.by(() => {
		type SurfaceSlot = 'title' | 'kicker' | 'body' | 'sourceUrl' | 'author' | 'source' | 'dateLabel';
		const slots: { slot: SurfaceSlot; label: string }[] = [];
		if (documentSlots.kicker) slots.push({ slot: 'kicker', label: 'Kicker' });
		if (documentSlots.title) slots.push({ slot: 'title', label: 'Title' });
		if (showBody) slots.push({ slot: 'body', label: 'Body' });
		if (documentSlots.sourceUrl) slots.push({ slot: 'sourceUrl', label: 'Source' });
		if (documentSlots.author) slots.push({ slot: 'author', label: 'Author' });
		if (documentSlots.source) slots.push({ slot: 'source', label: 'Citation' });
		if (documentSlots.dateLabel) slots.push({ slot: 'dateLabel', label: 'Date' });
		return slots;
	});

	function effectsForSlot(slot: string): Record<SplitMode, { id: string; label: string }[]> {
		const isTitleScale = TITLE_SCALE_SLOTS.has(slot);
		return {
			whole: effectsBySplit.whole,
			'per-character': isTitleScale ? effectsBySplit['per-character'] : [],
			'per-word': effectsBySplit['per-word'],
			'per-line': effectsBySplit['per-line']
		};
	}

	function handleAddTextAnimation(
		slot: 'title' | 'kicker' | 'body' | 'sourceUrl' | 'author' | 'source' | 'dateLabel',
		effectId: string
	): void {
		if (!effectId) return;
		if (!EFFECT_CATALOG.has(effectId)) return;
		addTextAnimation({
			target: { kind: 'surface', slot },
			effect: effectId,
			enter: { start: 0.04, duration: 0.1, ease: 'smooth' }
		});
	}

	const surfaceTextAnims = $derived(
		engineState.textAnimations.filter((e) => e.target.kind === 'surface')
	);

	function textAnimEffectChange(entry: TextAnimation, value: string): void {
		if (!EFFECT_CATALOG.has(value)) return;
		entry.effect = value;
	}

	function textAnimEaseChange(entry: TextAnimation, value: string): void {
		entry.enter.ease = value as Ease;
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

<div class="surface-inspector">
	<!-- SURFACE: type picker + document content fields + backgroundVisibility -->
	<div class="section">
		<div class="section__header">
			<span class="section__label">Surface</span>
		</div>

		<label class="row">
			<span>Type</span>
			<select value={engineState.surface.type} onchange={handleSurfaceTypeChange}>
				{#each surfaceRenderers as surface (surface.type)}
					<option value={surface.type}>{surface.label}</option>
				{/each}
			</select>
		</label>

		{#if documentVisible}
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
						bind:body={engineState.surface.content.body}
						colors={EDITOR_MARK_COLORS}
						label="Body"
						rows={10}
					/>
				</div>
			{/if}
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
	</div>

	<!-- APPEARANCE: font, paper color, ink color -->
	{#if appearanceVisible}
		<div class="section">
			<div class="section__header">
				<span class="section__label">Appearance</span>
			</div>

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
		</div>
	{/if}

	<!-- TEXT MOTION: per-slot add pickers + active animation editors -->
	<div class="section">
		<div class="section__header">
			<span class="section__label">Text Motion</span>
		</div>

		{#if activeSlots.length > 0}
			<div class="slot-pickers">
				{#each activeSlots as { slot, label } (slot)}
					{@const slotEffects = effectsForSlot(slot)}
					<label class="row">
						<span>{label}</span>
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
								{#if slotEffects[mode].length > 0}
									<optgroup label={mode}>
										{#each slotEffects[mode] as opt (opt.id)}
											<option value={opt.id}>{opt.label}</option>
										{/each}
									</optgroup>
								{/if}
							{/each}
						</select>
					</label>
				{/each}
			</div>
		{/if}

		{#each surfaceTextAnims as entry (entry.id)}
			<div class="anim-entry">
				<div class="anim-entry__header">
					<span class="anim-entry__label">
						{entry.target.kind === 'surface' ? entry.target.slot : ''}
					</span>
					<button
						type="button"
						class="remove-btn"
						aria-label="Remove text animation"
						onclick={() => removeTextAnimation(entry.id)}
					>Remove</button>
				</div>

				<label class="row">
					<span>Effect</span>
					<select
						value={entry.effect}
						onchange={(e) => textAnimEffectChange(entry, (e.currentTarget as HTMLSelectElement).value)}
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

				<div class="timing-row">
					<span class="timing-row__label">Enter</span>
					<input
						type="number"
						min="0"
						max="1"
						step="0.001"
						value={entry.enter.start}
						placeholder="start"
						oninput={(e) => {
							const n = Number((e.currentTarget as HTMLInputElement).value);
							if (Number.isFinite(n)) entry.enter.start = Math.max(0, Math.min(1, n));
						}}
					/>
					<input
						type="number"
						min="0"
						max="1"
						step="0.001"
						value={entry.enter.duration}
						placeholder="dur"
						oninput={(e) => {
							const n = Number((e.currentTarget as HTMLInputElement).value);
							if (Number.isFinite(n)) entry.enter.duration = Math.max(0, Math.min(1, n));
						}}
					/>
					<select
						value={entry.enter.ease}
						onchange={(e) => textAnimEaseChange(entry, (e.currentTarget as HTMLSelectElement).value)}
					>
						{#each easeOptions as [value, option] (value)}
							<option {value}>{option.label}</option>
						{/each}
					</select>
				</div>

				<div class="timing-row">
					<span class="timing-row__label">Speed ×</span>
					<input
						type="number"
						min="0.1"
						max="10"
						step="0.1"
						value={entry.params?.speedMultiplier ?? ''}
						placeholder="1"
						oninput={(e) => setTextAnimParam(entry, 'speedMultiplier', (e.currentTarget as HTMLInputElement).value)}
					/>
					<button type="button" class="clear-btn" onclick={() => clearTextAnimParam(entry, 'speedMultiplier')}>×</button>
				</div>

				<div class="timing-row">
					<span class="timing-row__label">Hold ms</span>
					<input
						type="number"
						min="0"
						step="10"
						value={entry.params?.holdMs ?? ''}
						placeholder="default"
						oninput={(e) => setTextAnimParam(entry, 'holdMs', (e.currentTarget as HTMLInputElement).value)}
					/>
					<button type="button" class="clear-btn" onclick={() => clearTextAnimParam(entry, 'holdMs')}>×</button>
				</div>

				<div class="timing-row">
					<span class="timing-row__label">Gap ms</span>
					<input
						type="number"
						min="0"
						step="10"
						value={entry.params?.gapMs ?? ''}
						placeholder="default"
						oninput={(e) => setTextAnimParam(entry, 'gapMs', (e.currentTarget as HTMLInputElement).value)}
					/>
					<button type="button" class="clear-btn" onclick={() => clearTextAnimParam(entry, 'gapMs')}>×</button>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.surface-inspector {
		display: grid;
		gap: var(--vs-base);
	}

	.section {
		display: grid;
		gap: var(--vs-s);
	}

	.section__header {
		border-block-end: var(--border-1);
		padding-block-end: var(--vs-xs);
	}

	.section__label {
		color: var(--fg-5);
		font-size: 0.65rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.slot-pickers {
		display: grid;
		gap: var(--vs-xs);
	}

	.anim-entry {
		border: var(--border-1);
		border-radius: var(--br-s);
		display: grid;
		gap: var(--vs-xs);
		padding: var(--pad-s);
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
		text-transform: uppercase;
	}

	.remove-btn {
		background: transparent;
		border: var(--border-1);
		border-radius: var(--br-xs);
		color: var(--fg-6);
		cursor: pointer;
		font-size: 0.75rem;
		padding: 2px 8px;
	}

	.remove-btn:hover {
		color: var(--fg);
	}

	.timing-row {
		align-items: center;
		display: grid;
		gap: var(--pad-xs);
		grid-template-columns: 4rem 1fr 1fr 1fr;
	}

	.timing-row__label {
		color: var(--fg-6);
		font-size: 0.75rem;
		text-transform: uppercase;
	}

	.timing-row input,
	.timing-row select {
		font-size: 0.85rem;
		min-inline-size: 0;
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
