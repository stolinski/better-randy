<script lang="ts">
	import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';

	import {
		engineState,
		packState,
		readMarkColor,
		transitionState,
		addEffect,
		removeEffect
	} from './engine-state.svelte';
	import {
		ENGINE_EASES,
		listMarkInstances,
		resolveMarkForIndex,
		type Ease,
		type Effect,
		type MarkAppearance,
		type Stage
	} from './engine-schema';
	import { listSoundAssets } from './audio-assets';
	import { downloadBlob } from './export-video';
	import { PACK_REGISTRY } from './packs/registry';
	import { PIPELINE_REGISTRY } from './pipelines';
	import { listFixtures, listPresets, resolveTransition } from './preset';
	import { presetBase } from './preset-base.svelte';
	import { presetToWireFormat, serializeCompositionState } from './preset-pure';
	import {
		appendVisualVerificationIssues,
		verifyPresetArtifact,
		type PresetVerificationIssue
	} from './preset-verification';
	import { runVisualAudit } from './runtime-audit';
	import { listSubstrateAssets } from './substrate-textures';
	import type { EffectRenderer } from './pipelines/types';
	import { transitionEffectTypes } from './pipelines/transition-registry';
	import { compositionMeta } from './composition-meta.svelte';
	import {
		rescaleCompositionTimings,
		STANDARD_TRANSPORT_RATES
	} from '$lib/utils/composition-timing';
	import AddMenu from './AddMenu.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import InspectorToggle from './InspectorToggle.svelte';
	import Field from './Field.svelte';

	interface Props {
		handleExport: () => Promise<void>;
		isExporting: boolean;
		progress: number;
		status: string;
		separateWav?: boolean;
	}

	let {
		handleExport,
		isExporting,
		progress,
		status,
		separateWav = $bindable(false)
	}: Props = $props();

	const packOptions = Object.entries(PACK_REGISTRY) as [string, (typeof PACK_REGISTRY)[string]][];
	const effectRenderers = Object.values(PIPELINE_REGISTRY.effects) as EffectRenderer[];
	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];
	const substrateAssets = listSubstrateAssets();
	const EFFECT_CHAIN_LIMIT = 3;

	const liveArtifact = $derived.by(() => {
		const preset = serializeCompositionState(presetBase, engineState, packState.slug);
		const wirePreset = presetToWireFormat(preset);
		return {
			preset,
			wirePreset,
			json: JSON.stringify(wirePreset),
			verification: verifyPresetArtifact(wirePreset)
		};
	});
	let verifiedArtifactJson = $state<string | null>(null);
	let verifiedVisualIssues = $state.raw<PresetVerificationIssue[]>([]);
	let lastVerificationPassed = $state(false);
	const isVerificationCurrent = $derived(verifiedArtifactJson === liveArtifact.json);
	const visibleVerificationIssues = $derived([
		...liveArtifact.verification.issues,
		...(isVerificationCurrent ? verifiedVisualIssues : [])
	]);
	const verificationPassed = $derived(isVerificationCurrent && lastVerificationPassed);

	function exportPresetJson(): void {
		const filename = compositionMeta.userCompositionSlug
			? `${compositionMeta.userCompositionSlug}.json`
			: 'composition.json';
		const blob = new Blob([`${JSON.stringify(liveArtifact.wirePreset, null, '\t')}\n`], {
			type: 'application/json'
		});
		downloadBlob(blob, filename);
	}

	function verifyCurrentComposition(): void {
		const result = appendVisualVerificationIssues(
			liveArtifact.verification,
			runVisualAudit(engineState, liveArtifact.preset.name)
		);
		verifiedVisualIssues = result.issues.filter((issue) => issue.source === 'visual');
		verifiedArtifactJson = liveArtifact.json;
		lastVerificationPassed = result.isValid;
	}

	function verificationIssueKey(issue: PresetVerificationIssue): string {
		return `${issue.source}:${issue.rule ?? ''}:${issue.path}:${issue.message}`;
	}

	function findEffectRenderer(type: string): EffectRenderer | null {
		return effectRenderers.find((r) => r.type === type) ?? null;
	}

	function handleAddEffect(type: string): void {
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

	// The active Pack's chrome recipe, surfaced so the Effects list matches
	// the pixels: the Workspace appends these AFTER the authored chain on
	// opaque pieces (withPackChrome). The Pack supplies INITIAL values — the
	// first param edit materializes an authored override into the
	// composition's own effects[] (the Workspace then skips the pack's copy
	// of that type), and removing the override restores the pack default.
	const packChromeEffects = $derived.by(() => {
		if (!engineState.backgroundFill) return [];
		const role = PACK_REGISTRY[packState.slug]?.roles['chrome'];
		return role && role.kind === 'chrome' ? role.effects : [];
	});
	const packChromeTypes = $derived(new Set(packChromeEffects.map((entry) => entry.type)));
	// Authored effects that occupy a chrome slot render in the chrome rows
	// below (as the override), not in the authored list.
	const authoredEffects = $derived(
		engineState.effects.filter((effect) => !packChromeTypes.has(effect.type))
	);

	function chromeOverrideFor(type: string): Effect | undefined {
		return engineState.effects.find((effect) => effect.type === type);
	}

	// Materialize-on-first-write model for an un-overridden chrome entry: the
	// Editor binds to a proxy over the pack's values; the first set creates
	// the authored override (with that write applied) and every later set —
	// e.g. the rest of an in-flight slider drag, before the prop re-binds —
	// forwards to the authored effect.
	function chromeDraftModel(entry: { type: string; params?: unknown }): Effect {
		const draft = structuredClone((entry.params ?? {}) as Record<string, unknown>);
		let materializedId: string | null = null;
		const params = new Proxy(draft, {
			set(target, prop, value) {
				if (typeof prop !== 'string') return true;
				target[prop] = value;
				if (materializedId === null) {
					materializedId = addEffect({ type: entry.type, params: { ...target } });
				} else {
					const authored = engineState.effects.find((effect) => effect.id === materializedId);
					if (authored) {
						(authored.params as Record<string, unknown>)[prop] = value;
					}
				}
				return true;
			}
		});
		return { type: entry.type, id: `pack-chrome-draft-${entry.type}`, params };
	}

	// ---- Composition-level sound: free-standing cues + the bed (ADR-0033 §5) ----
	// Motion sounds are derived and live on each item's Sound section — this
	// authors only what has no motion to ride: free-standing sounds (placed at
	// the playhead) and the single bed (full-frame pieces only, so "+ Bed"
	// shows only while a background fill is set).
	const soundAssets = listSoundAssets();
	const hasBed = $derived(engineState.audioCues.some((cue) => cue.kind === 'bed'));

	function addAudioCue(kind: 'cue' | 'bed'): void {
		const used = new Set(engineState.audioCues.map((cue) => cue.id));
		let counter = 1;
		let id = kind === 'bed' ? 'bed' : `sound-${counter}`;
		while (used.has(id)) {
			counter += 1;
			id = `${kind === 'bed' ? 'bed' : 'sound'}-${counter}`;
		}
		// A free-standing sound drops at the playhead (the DaVinci gesture); the
		// timeline seam is the same one verification drives.
		const timeline = typeof window !== 'undefined' ? window.__supersTimeline : undefined;
		const playhead =
			timeline && timeline.durationSeconds > 0
				? Math.min(0.98, timeline.time / timeline.durationSeconds)
				: 0.5;
		engineState.audioCues.push(
			kind === 'bed'
				? {
						id,
						kind,
						assetSlug: 'bed-ambient-texture',
						start: 0,
						duration: 1,
						volume: 0.4
					}
				: { id, kind, assetSlug: soundAssets[0] ?? 'core-impact', start: playhead, duration: 0.05 }
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

	// ---- Composition metadata (presetBase) ----

	function setDescription(event: Event): void {
		const value = (event.currentTarget as HTMLInputElement).value;
		// An empty description clears the optional field entirely — it round-trips
		// as an absent key, not an empty string.
		presetBase.description = value === '' ? undefined : value;
	}

	// ---- Transition recipe (ADR-0022) ----
	// `from`/`to` offer every catalogued Preset — deliverables and fixtures alike,
	// since fixtures are valid transition endpoints (transition-wipe-demo proves it).
	const transitionTargets = [...listPresets(), ...listFixtures()];
	const transitionEffects = transitionEffectTypes();

	// Every recipe edit re-resolves through the same path `applyPreset` uses, so
	// the preview switches into/out of transition mode immediately; an
	// unresolvable ref deactivates the transition rather than throwing.
	function syncTransition(): void {
		transitionState.active = resolveTransition(presetBase.transition);
	}

	function toggleTransition(): void {
		if (presetBase.transition) {
			presetBase.transition = undefined;
		} else {
			presetBase.transition = {
				from: transitionTargets[0]?.slug ?? '',
				to: transitionTargets[1]?.slug ?? transitionTargets[0]?.slug ?? '',
				effect: transitionEffects[0] ?? '',
				durationMs: 1200
			};
		}
		syncTransition();
	}

	function setTransitionField(key: 'from' | 'to' | 'effect', event: Event): void {
		if (!presetBase.transition) return;
		presetBase.transition[key] = (event.currentTarget as HTMLSelectElement).value;
		syncTransition();
	}

	function setTransitionDuration(event: Event): void {
		if (!presetBase.transition) return;
		const n = Number((event.currentTarget as HTMLInputElement).value);
		if (!Number.isFinite(n) || n <= 0) return;
		presetBase.transition.durationMs = n;
		syncTransition();
	}

	// ---- Mark default appearance (marks.defaults) ----

	const MARK_STYLE_LABELS: Record<AnnotationMarkStyle, string> = {
		highlight: 'Highlight',
		underline: 'Underline',
		strike: 'Strike',
		circle: 'Circle',
		box: 'Box',
		'side-note': 'Side note',
		magnify: 'Magnify',
		'lift-out': 'Lift out',
		'tear-out': 'Tear out',
		isolate: 'Isolate'
	};

	// Styles present in the composition's body / message texts, in first-use
	// order — the marks.defaults entries worth editing. Empty → no section.
	const markStylesInUse = $derived.by(() => {
		const styles: AnnotationMarkStyle[] = [];
		for (const instance of listMarkInstances(engineState.surface.content)) {
			if (!styles.includes(instance.style)) styles.push(instance.style);
		}
		return styles;
	});

	// The style's effective default appearance. An out-of-range timing index
	// makes resolveMarkForIndex skip per-timing overrides and fall back to
	// marks.defaults[style] (or the engine fallback) — exactly what an
	// unoverridden mark renders with.
	function markDefaultAppearance(style: AnnotationMarkStyle): MarkAppearance {
		const resolved = resolveMarkForIndex(
			style,
			engineState.marks.timings.length,
			engineState.marks,
			readMarkColor(style)
		);
		return { color: resolved.color, intensity: resolved.intensity };
	}

	function setMarkDefault(style: AnnotationMarkStyle, patch: Partial<MarkAppearance>): void {
		engineState.marks.defaults[style] = { ...markDefaultAppearance(style), ...patch };
	}

	// Changing the clip duration PRESERVES the real-time speed of every
	// animation: timing is stored as a fraction of the clip, so a longer clip
	// would otherwise slow everything down. Rescaling the fractions by prev/next
	// keeps a 400ms enter at 400ms — the extra time becomes hold. Absolute-time
	// timing (keyframe atMs, captions, cascade offsets) is left alone.
	function handleDurationChange(event: Event): void {
		const input = event.currentTarget as HTMLInputElement;
		const next = Number(input.value);
		const prev = engineState.transport.durationSeconds;
		if (!Number.isFinite(next) || next <= 0 || next === prev) {
			input.value = String(prev);
			return;
		}
		rescaleCompositionTimings(engineState, prev / next);
		engineState.transport.durationSeconds = next;
	}
</script>

<div class="root-inspector">
	{#if compositionMeta.isUserComposition}
		<div class="fork-indicator">
			<span class="fork-indicator__label">forked</span>
			{#if compositionMeta.revertUserComposition}
				<button
					type="button"
					class="fork-indicator__revert"
					onclick={compositionMeta.revertUserComposition}>Revert</button
				>
			{/if}
		</div>
	{/if}
	{#if compositionMeta.persistenceError}
		<p class="persistence-error" role="alert">
			<span>Persistence / save / composition</span>
			{compositionMeta.persistenceError}
		</p>
	{/if}

	<InspectorSection label="Composition">
		<Field label="Name">
			<input type="text" bind:value={presetBase.name} />
		</Field>
		<Field label="Description">
			<input type="text" value={presetBase.description ?? ''} oninput={setDescription} />
		</Field>
		<Field label="Kind">
			<select bind:value={presetBase.kind}>
				<option value="deliverable">Deliverable</option>
				<option value="fixture">Fixture</option>
			</select>
		</Field>
	</InspectorSection>

	<InspectorSection label="Transport">
		<Field label="Duration">
			<input
				type="number"
				min="1"
				max="60"
				step="0.1"
				value={engineState.transport.durationSeconds}
				onchange={handleDurationChange}
			/>
			<span class="ins-unit">s</span>
		</Field>
		<Field label="Rate">
			<!-- Standard broadcast/web rates only (ADR-0042) — the NTSC fractional
			     literals map to exact rationals in every frame computation, so a
			     free-typed 29.9 has no exact math to run. A loaded legacy value
			     outside the standard set stays selectable, never silently rewritten. -->
			<select bind:value={engineState.transport.fps}>
				{#if !STANDARD_TRANSPORT_RATES.includes(engineState.transport.fps)}
					<option value={engineState.transport.fps}>{engineState.transport.fps} fps</option>
				{/if}
				{#each STANDARD_TRANSPORT_RATES as rate (rate)}
					<option value={rate}>{rate} fps</option>
				{/each}
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
			<AddMenu
				label={chainFull ? 'Full' : '+ Add'}
				disabled={chainFull}
				title={chainFull ? `Chain is full (max ${EFFECT_CHAIN_LIMIT})` : undefined}
				groups={[
					{
						items: effectRenderers.map((renderer) => ({
							value: renderer.type,
							label: renderer.label
						}))
					}
				]}
				onselect={handleAddEffect}
			/>
		{/snippet}
		{#each authoredEffects as effect (effect.id)}
			{@const renderer = findEffectRenderer(effect.type)}
			{#if renderer}
				{@const packInert = renderer.isPackInert?.(PACK_REGISTRY[packState.slug]) ?? false}
				<div
					class="layer-row"
					title={packInert
						? `Inert under the ${PACK_REGISTRY[packState.slug]?.label ?? packState.slug} pack — the authored effect travels with the composition and applies under packs that keep it`
						: undefined}
				>
					<span class="layer-row__label">{renderer.label}</span>
					{#if packInert}
						<span class="layer-row__pack-tag">pack · off</span>
					{/if}
					<button
						type="button"
						class="remove-btn"
						aria-label={`Remove ${renderer.label}`}
						onclick={() => removeEffect(effect.id)}>×</button
					>
				</div>
				{#if renderer.Editor && !packInert}
					{@const EffectEditor = renderer.Editor}
					<EffectEditor effect={effect as Effect & { params: unknown }} />
				{/if}
			{/if}
		{/each}
		{#each packChromeEffects as entry (entry.type)}
			{@const renderer = findEffectRenderer(entry.type)}
			{#if renderer}
				{@const override = chromeOverrideFor(entry.type)}
				<div
					class="layer-row"
					title={override
						? `Overriding the ${PACK_REGISTRY[packState.slug]?.label ?? packState.slug} pack's chrome — × restores the pack default`
						: `${PACK_REGISTRY[packState.slug]?.label ?? packState.slug} pack chrome (opaque pieces) — edits become a composition override`}
				>
					<span class="layer-row__label">{renderer.label}</span>
					<span class="layer-row__pack-tag">{override ? 'pack · overridden' : 'pack'}</span>
					{#if override}
						<button
							type="button"
							class="remove-btn"
							aria-label={`Remove ${renderer.label} override`}
							onclick={() => removeEffect(override.id)}>×</button
						>
					{/if}
				</div>
				{#if renderer.Editor}
					{@const EffectEditor = renderer.Editor}
					<EffectEditor
						effect={(override ?? chromeDraftModel(entry)) as Effect & { params: unknown }}
					/>
				{/if}
			{/if}
		{/each}
	</InspectorSection>

	<InspectorSection label="Background">
		{#snippet action()}
			<InspectorToggle
				checked={engineState.backgroundFill !== undefined}
				label="Background fill"
				onchange={(checked) => {
					engineState.backgroundFill = checked ? '#000000' : undefined;
				}}
			/>
		{/snippet}
		{#if engineState.backgroundFill !== undefined}
			<Field label="Fill">
				<input type="color" bind:value={engineState.backgroundFill} />
			</Field>
		{/if}
	</InspectorSection>

	<InspectorSection label="Transition">
		{#snippet action()}
			<InspectorToggle
				checked={!!presetBase.transition}
				label="Transition"
				onchange={toggleTransition}
			/>
		{/snippet}
		{#if presetBase.transition}
			{@const transition = presetBase.transition}
			<Field label="From">
				<select value={transition.from} onchange={(e) => setTransitionField('from', e)}>
					{#each transitionTargets as entry (entry.slug)}
						<option value={entry.slug}>{entry.preset.name}</option>
					{/each}
				</select>
			</Field>
			<Field label="To">
				<select value={transition.to} onchange={(e) => setTransitionField('to', e)}>
					{#each transitionTargets as entry (entry.slug)}
						<option value={entry.slug}>{entry.preset.name}</option>
					{/each}
				</select>
			</Field>
			<Field label="Effect">
				<select value={transition.effect} onchange={(e) => setTransitionField('effect', e)}>
					{#each transitionEffects as type (type)}
						<option value={type}>{type}</option>
					{/each}
				</select>
			</Field>
			<Field label="Duration">
				<input
					type="number"
					min="100"
					step="10"
					value={transition.durationMs}
					oninput={setTransitionDuration}
				/>
				<span class="ins-unit">ms</span>
			</Field>
		{/if}
	</InspectorSection>

	<InspectorSection label="Depth Stage">
		{#snippet action()}
			<InspectorToggle checked={!!engineState.stage} label="Depth stage" onchange={toggleStage} />
		{/snippet}
		{#if engineState.stage}
			{@const stage = engineState.stage}
			<Field label="Camera">
				<select
					value={stage.camera.move}
					onchange={(e) => {
						ensureStage().camera.move = (e.currentTarget as HTMLSelectElement).value as
							'static' | 'push' | 'drift';
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
						step="any"
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
					step="any"
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
					step="any"
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
					step="any"
					value={stage.focus.band}
					oninput={(e) => {
						ensureStage().focus.band = parseFloat((e.currentTarget as HTMLInputElement).value) || 0;
					}}
				/>
			</Field>
			<Field label="Rack focus">
				<InspectorToggle
					checked={!!stage.focus.pull}
					label="Rack focus"
					onchange={toggleRackFocus}
				/>
			</Field>
			{#if stage.focus.pull}
				{@const pull = stage.focus.pull}
				<Field label="From → To">
					<input
						type="number"
						min="0"
						max="1"
						step="any"
						value={pull.from}
						aria-label="Rack focus from depth"
						oninput={(e) => {
							const n = Number((e.currentTarget as HTMLInputElement).value);
							if (Number.isFinite(n)) pull.from = Math.max(0, Math.min(1, n));
						}}
					/>
					<input
						type="number"
						min="0"
						max="1"
						step="any"
						value={pull.to}
						aria-label="Rack focus to depth"
						oninput={(e) => {
							const n = Number((e.currentTarget as HTMLInputElement).value);
							if (Number.isFinite(n)) pull.to = Math.max(0, Math.min(1, n));
						}}
					/>
				</Field>
				<Field label="Window">
					<input
						type="number"
						min="0"
						max="1"
						step="any"
						value={pull.start}
						aria-label="Rack focus start"
						placeholder="start"
						oninput={(e) => {
							const n = Number((e.currentTarget as HTMLInputElement).value);
							if (Number.isFinite(n)) pull.start = Math.max(0, Math.min(1, n));
						}}
					/>
					<input
						type="number"
						min="0"
						max="1"
						step="any"
						value={pull.duration}
						aria-label="Rack focus duration"
						placeholder="dur"
						oninput={(e) => {
							const n = Number((e.currentTarget as HTMLInputElement).value);
							if (Number.isFinite(n)) pull.duration = Math.max(0, Math.min(1, n));
						}}
					/>
				</Field>
			{/if}
			<Field label="Backdrop">
				<InspectorToggle
					checked={!!stage.backdrop?.image}
					label="Backdrop image"
					onchange={toggleBackdropImage}
				/>
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
				<Field label="Contrast">
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={stage.backdrop.contrast}
						oninput={(e) => {
							const s = ensureStage();
							if (!s.backdrop) s.backdrop = { contrast: 0 };
							s.backdrop.contrast = Number((e.currentTarget as HTMLInputElement).value);
						}}
					/>
				</Field>
			{/if}
		{/if}
	</InspectorSection>

	{#if markStylesInUse.length > 0}
		<InspectorSection label="Marks">
			{#each markStylesInUse as style (style)}
				{@const appearance = markDefaultAppearance(style)}
				<Field label={MARK_STYLE_LABELS[style]}>
					<!-- The swatch value is set client-side only: an SSR'd `value` attribute
					     on a color input makes Svelte's hydration default-removal pass strip
					     it (transiently ""), which Chrome logs as a #rrggbb format warning. -->
					<input
						type="color"
						aria-label={`${MARK_STYLE_LABELS[style]} color`}
						{@attach (el) => {
							el.value = markDefaultAppearance(style).color;
						}}
						oninput={(e) =>
							setMarkDefault(style, { color: (e.currentTarget as HTMLInputElement).value })}
					/>
					<input
						type="range"
						min="0"
						max="1"
						step="0.01"
						value={appearance.intensity}
						aria-label={`${MARK_STYLE_LABELS[style]} intensity`}
						oninput={(e) =>
							setMarkDefault(style, {
								intensity: Number((e.currentTarget as HTMLInputElement).value)
							})}
					/>
				</Field>
			{/each}
		</InspectorSection>
	{/if}

	<InspectorSection label="Sound">
		{#snippet action()}
			<button type="button" class="ins-add" onclick={() => addAudioCue('cue')}>+ Sound</button>
			{#if engineState.backgroundFill !== undefined && !hasBed}
				<button type="button" class="ins-add" onclick={() => addAudioCue('bed')}>+ Bed</button>
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
						step="any"
						value={Math.round(cue.start * 1000) / 1000}
						oninput={(e) =>
							setCueFraction(cue, 'start', (e.currentTarget as HTMLInputElement).value)}
					/>
					<input
						type="number"
						min="0"
						max="1"
						step="any"
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

	<InspectorSection label="Interchange / Validation">
		<div class="interchange-actions">
			<button type="button" class="export-btn" onclick={exportPresetJson}>Export JSON</button>
			<button type="button" class="export-btn" onclick={verifyCurrentComposition}>Verify</button>
		</div>
		{#if verificationPassed}
			<p class="validation-success" role="status">Verified</p>
		{/if}
		{#if visibleVerificationIssues.length > 0}
			<ul class="validation-issues" aria-label="Composition validation issues">
				{#each visibleVerificationIssues as issue (verificationIssueKey(issue))}
					<li class:error={issue.severity === 'error'}>
						<p>
							<span>{issue.source}{issue.rule ? ` / ${issue.rule}` : ''}</span>
							<code>{issue.path}</code>
						</p>
						{issue.message}
					</li>
				{/each}
			</ul>
		{/if}
	</InspectorSection>

	<InspectorSection label="Export">
		<Field label="Format">
			<select bind:value={engineState.transport.format}>
				<option value="webm">WebM VP9</option>
				<option value="prores">MOV ProRes 4444</option>
			</select>
		</Field>
		<Field label="Separate WAV">
			<InspectorToggle
				checked={separateWav}
				label="Separate WAV"
				onchange={(checked) => (separateWav = checked)}
			/>
		</Field>
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

	/* ---- Effect entries (no card: just a row + the effect's own editor) ---- */

	.layer-row {
		align-items: center;
		display: flex;
		gap: var(--vs-s);
		justify-content: space-between;
	}

	.layer-row__label {
		color: var(--chrome-text);
		font-size: 0.8125rem;
	}

	.remove-btn {
		background: transparent;
		border: 0;
		color: var(--chrome-muted);
		cursor: pointer;
		font-size: 1rem;
		padding: 0 var(--vs-xs);
	}

	/* Pack-chrome entry: present in the render, owned by the Pack — tagged,
	   not removable (swap the Pack and it goes with it). */
	.layer-row__pack-tag {
		border: 1px solid var(--chrome-hairline);
		border-radius: var(--br-xs);
		color: var(--chrome-muted);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		padding: 1px 6px;
		text-transform: uppercase;
	}

	.remove-btn:hover {
		color: #f0453d;
	}

	/* A manual cue / bed entry: hairline-separated sub-group, like effect rows. */
	.cue-entry {
		border-block-start: 1px solid var(--chrome-hairline);
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
		color: var(--chrome-muted);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.72rem;
	}

	/* ---- Export ---- */

	.interchange-actions {
		display: grid;
		gap: var(--vs-xs);
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.export-btn {
		background: var(--chrome-raised);
		border: 1px solid var(--chrome-hairline);
		border-radius: var(--br-xs);
		color: var(--chrome-text);
		cursor: pointer;
		font-size: 0.8125rem;
		padding-block: 6px;
		transition:
			border-color 120ms ease,
			background-color 120ms ease;
		width: 100%;
	}

	.export-btn:hover:not(:disabled) {
		background: var(--chrome-hairline);
	}

	.export-btn:focus-visible {
		border-color: #ffd608;
		outline: none;
	}

	.export-btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.export-status {
		color: var(--chrome-muted);
		font-size: 0.75rem;
		margin: 0;
	}

	.persistence-error,
	.validation-success,
	.validation-issues {
		font-size: 0.75rem;
		margin: 0;
	}

	.persistence-error {
		color: #f0453d;
		padding: var(--vs-s);
	}

	.persistence-error span {
		color: var(--chrome-muted);
		display: block;
		font-size: 0.68rem;
		margin-block-end: var(--vs-xs);
		text-transform: uppercase;
	}

	.validation-success {
		color: #3dbf6e;
		font-family: 'JetBrains Mono', monospace;
		font-weight: var(--fw-semibold);
	}

	.validation-issues {
		display: grid;
		gap: var(--vs-xs);
		list-style: none;
		padding: 0;
	}

	.validation-issues li {
		color: var(--chrome-text);
		line-height: 1.35;
	}

	.validation-issues li.error {
		color: #f0453d;
	}

	.validation-issues p {
		display: flex;
		gap: var(--vs-xs);
		margin: 0;
	}

	.validation-issues span,
	.validation-issues code {
		color: var(--chrome-muted);
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.65rem;
	}

	.validation-issues code {
		overflow-wrap: anywhere;
	}

	/* ---- Fork indicator ---- */

	.fork-indicator {
		align-items: center;
		border-block-end: 1px solid var(--chrome-hairline);
		display: flex;
		justify-content: space-between;
		padding: var(--vs-xs) var(--vs-base);
	}

	.fork-indicator__label {
		color: var(--chrome-muted);
		font-size: 0.72rem;
		font-weight: var(--fw-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.fork-indicator__revert {
		background: transparent;
		border: 1px solid var(--chrome-hairline);
		border-radius: var(--br-xs);
		color: var(--chrome-muted);
		cursor: pointer;
		font-size: 0.7rem;
		padding-block: 0.1em;
		padding-inline: 0.4em;
	}

	.fork-indicator__revert:hover {
		color: var(--chrome-text);
	}
</style>
