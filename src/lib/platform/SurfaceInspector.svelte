<script lang="ts">
	import { tick } from 'svelte';

	import AnnotationTextEditor from '$lib/annotations/AnnotationTextEditor.svelte';
	import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
	import { DECORATIVE_ANNOTATION_STYLES } from '$lib/annotations/annotation-mark-styles';
	import type { AnnotationBody } from '$lib/annotations/annotation-marks';
	import { defaultItemEnter, defaultStrikeWindow } from '$lib/pipelines/surfaces/checklist/schedule';
	import { defaultMessageEnter } from '$lib/pipelines/surfaces/imessage/schedule';
	import { uploadUserImage } from '$lib/platform/user-image-assets';
	import { requestWebsiteCapture } from '$lib/platform/website-capture';
	import { createEnterBlurCommitDeduper } from '$lib/utils/website-showcase';
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
		WEB_DOCUMENT_SITES,
		type ChatMessage,
		type ChecklistItem,
		type Ease,
		type FontDefinition,
		type FontFamily,
		type SoundOverride,
		type SurfaceState,
		type SurfaceType,
		type TextAnimation,
		type TextAnimationParams
	} from './engine-schema';
	import {
		EDITOR_MARK_COLORS,
		addTextAnimation,
		engineState,
		packState,
		removeTextAnimation
	} from './engine-state.svelte';
	import { getPack } from './packs/registry';
	import { resolveFontTreatment } from './packs/resolve';
	import { PIPELINE_REGISTRY, getSurfaceRenderer } from './pipelines';
	import { inspectorFocus, layerSelection } from './selection.svelte';
	import { formatFractionAsSeconds } from '$lib/utils/string';
	import AddMenu from './AddMenu.svelte';
	import InspectorSection from './InspectorSection.svelte';
	import InspectorToggle from './InspectorToggle.svelte';
	import Field from './Field.svelte';
	import KeyframesSection from './KeyframesSection.svelte';
	import SoundSection from './SoundSection.svelte';
	import TypographyColorInput from './TypographyColorInput.svelte';

	const surfaceRenderers = Object.values(PIPELINE_REGISTRY.surfaces);
	const fontFamilyOptions = Object.entries(ENGINE_FONT_FAMILIES) as [FontFamily, FontDefinition][];
	// A Pack `font-treatment` claim overrides the preset's typography voice
	// everywhere pixels render, so the select must not pretend to edit it.
	const packFontClaim = $derived(resolveFontTreatment(getPack(packState.slug)));
	const easeOptions = Object.entries(ENGINE_EASES) as [Ease, (typeof ENGINE_EASES)[Ease]][];

	const SITE_LABELS: Record<(typeof WEB_DOCUMENT_SITES)[number], string> = {
		twitter: 'Twitter / X',
		reddit: 'Reddit',
		wikipedia: 'Wikipedia',
		hackernews: 'Hacker News',
		github: 'GitHub',
		youtube: 'YouTube',
		news: 'News article'
	};

	// ---- Surface controls derived from the active renderer ----

	const renderer = $derived(getSurfaceRenderer(engineState.surface.type));
	const controls = $derived(renderer?.controls ?? {});

	// ---- Variant (variants-as-data families, ADR-0020) ----
	// Absent `variant` means the family's first id (how type-hero's CanvasSource
	// resolves it), so the select reflects the effective value.

	const variantIds = $derived(renderer?.variantIds ?? []);
	const activeVariant = $derived(engineState.surface.variant ?? variantIds[0]);

	function handleVariantChange(event: Event): void {
		engineState.surface.variant = (event.currentTarget as HTMLSelectElement).value;
	}

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

	// Every string slot a Surface can declare, in display order. `body` stays
	// outside this mechanism — it has its own always/optional semantics.
	const DOCUMENT_SLOTS = [
		'kicker',
		'title',
		'counterpoint',
		'sourceUrl',
		'author',
		'affiliation',
		'avatarUrl',
		'source',
		'dateLabel',
		'bodyLabel'
	] as const;
	type DocumentSlot = (typeof DOCUMENT_SLOTS)[number];

	const DOCUMENT_SLOT_LABELS: Record<DocumentSlot, string> = {
		kicker: 'Kicker',
		title: 'Title',
		counterpoint: 'Counterpoint',
		sourceUrl: 'Source',
		author: 'Author',
		affiliation: 'Affiliation',
		avatarUrl: 'Avatar',
		source: 'Citation',
		dateLabel: 'Date',
		bodyLabel: 'Body label'
	};

	// A slot is declared when the renderer's controls claim it AND the current
	// state renders it: counterpoint only exists on the `pair` variant;
	// web-document limits avatarUrl to its twitter mock, while other renderers
	// that declare the slot can consume it directly.
	function isSlotDeclared(slot: DocumentSlot): boolean {
		if (slot === 'counterpoint') return controls.counterpoint === true && activeVariant === 'pair';
		if (slot === 'avatarUrl')
			return (
				controls.avatarUrl === true &&
				(!controls.site || (engineState.surface.site ?? 'twitter') === 'twitter')
			);
		return controls[slot] === true;
	}

	const documentSlots = $derived({
		title: isSlotDeclared('title') && engineState.surface.content.title !== undefined,
		counterpoint:
			isSlotDeclared('counterpoint') && engineState.surface.content.counterpoint !== undefined,
		sourceUrl: isSlotDeclared('sourceUrl') && engineState.surface.content.sourceUrl !== undefined,
		author: isSlotDeclared('author') && engineState.surface.content.author !== undefined,
		affiliation:
			isSlotDeclared('affiliation') && engineState.surface.content.affiliation !== undefined,
		avatarUrl: isSlotDeclared('avatarUrl') && engineState.surface.content.avatarUrl !== undefined,
		source: isSlotDeclared('source') && engineState.surface.content.source !== undefined,
		dateLabel: isSlotDeclared('dateLabel') && engineState.surface.content.dateLabel !== undefined,
		kicker: isSlotDeclared('kicker') && engineState.surface.content.kicker !== undefined,
		bodyLabel: isSlotDeclared('bodyLabel') && engineState.surface.content.bodyLabel !== undefined
	});

	const documentVisible = $derived(
		documentSlots.title ||
			documentSlots.counterpoint ||
			documentSlots.sourceUrl ||
			documentSlots.author ||
			documentSlots.affiliation ||
			documentSlots.avatarUrl ||
			documentSlots.source ||
			documentSlots.dateLabel ||
			documentSlots.kicker ||
			documentSlots.bodyLabel ||
			showBody
	);

	// Declared-but-absent slots — what the "+ Slot…" select offers so a GUI user
	// can add e.g. an author to a composition that lacks it (parity with agents).
	const absentSlots = $derived(
		DOCUMENT_SLOTS.filter(
			(slot) => isSlotDeclared(slot) && engineState.surface.content[slot] === undefined
		)
	);

	let inspectorEl = $state<HTMLDivElement>();
	let avatarUploadSequence = 0;

	async function handleAvatarFileChange(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const uploadSequence = ++avatarUploadSequence;
		input.setCustomValidity('');
		const file = input.files?.[0];
		if (!file) return;

		try {
			const avatarUrl = await uploadUserImage(file);
			if (uploadSequence === avatarUploadSequence) {
				engineState.surface.content.avatarUrl = avatarUrl;
			}
		} catch (error: unknown) {
			console.error('Avatar image upload failed', error);
			if (uploadSequence === avatarUploadSequence) {
				input.setCustomValidity(error instanceof Error ? error.message : 'Avatar image upload failed');
				input.reportValidity();
			}
		} finally {
			input.value = '';
		}
	}

	let logoUploadSequence = 0;
	let websiteCaptureState = $state<'idle' | 'capturing'>('idle');
	let websiteCaptureSequence = 0;
	const websiteCaptureDeduper = createEnterBlurCommitDeduper();

	function updateSourceUrlOverlay(url: string): void {
		const overlay = engineState.overlays.find((candidate) => candidate.type === 'source-url');
		if (typeof overlay?.content === 'object' && overlay.content !== null && 'url' in overlay.content) {
			(overlay.content as Record<string, unknown>).url = url;
		}
	}

	async function captureWebsite(
		trigger: 'enter' | 'blur',
		input: HTMLInputElement
	): Promise<void> {
		if (!websiteCaptureDeduper.shouldCommit(trigger)) return;
		const value = engineState.surface.content.sourceUrl ?? '';
		const sequence = ++websiteCaptureSequence;
		input.setCustomValidity('');
		websiteCaptureState = 'capturing';
		try {
			const result = await requestWebsiteCapture(value);
			if (sequence !== websiteCaptureSequence) return;
			engineState.surface.content.sourceUrl = result.url;
			engineState.surface.content.imageUrl = result.imageUrl;
			updateSourceUrlOverlay(result.displayUrl);
		} catch (error: unknown) {
			console.error('Website capture failed', error);
			if (sequence === websiteCaptureSequence) {
				input.setCustomValidity(error instanceof Error ? error.message : 'Website capture failed');
				input.reportValidity();
			}
		} finally {
			if (sequence === websiteCaptureSequence) websiteCaptureState = 'idle';
		}
	}

	function handleWebsiteCaptureKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		const input = event.currentTarget as HTMLInputElement;
		void captureWebsite('enter', input);
		input.blur();
	}

	function handleWebsiteCaptureBlur(event: FocusEvent): void {
		void captureWebsite('blur', event.currentTarget as HTMLInputElement);
	}

	async function handleWebsiteImageFileChange(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		input.setCustomValidity('');
		try {
			engineState.surface.content.imageUrl = await uploadUserImage(file);
		} catch (error: unknown) {
			console.error('Website screenshot upload failed', error);
			input.setCustomValidity(error instanceof Error ? error.message : 'Screenshot upload failed');
			input.reportValidity();
		} finally {
			input.value = '';
		}
	}

	async function handleLogoFileChange(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const uploadSequence = ++logoUploadSequence;
		input.setCustomValidity('');
		const file = input.files?.[0];
		if (!file) return;

		try {
			const logoUrl = await uploadUserImage(file);
			if (uploadSequence === logoUploadSequence) {
				engineState.surface.content.logoUrl = logoUrl;
			}
		} catch (error: unknown) {
			console.error('Logo image upload failed', error);
			if (uploadSequence === logoUploadSequence) {
				input.setCustomValidity(error instanceof Error ? error.message : 'Logo image upload failed');
				input.reportValidity();
			}
		} finally {
			input.value = '';
		}
	}

	function addSlot(slot: DocumentSlot): void {
		engineState.surface.content[slot] = '';
		tick()
			.then(() => {
				inspectorEl?.querySelector<HTMLInputElement>(`input[data-slot="${slot}"]`)?.focus();
			})
			.catch((error: unknown) => {
				console.error('addSlot focus failed', error);
			});
	}

	function removeSlot(slot: DocumentSlot): void {
		engineState.surface.content[slot] = undefined;
	}

	const appearanceVisible = $derived(
		Boolean(
			(controls.typography && showBody) || controls.paperColor || (controls.inkColor && showBody)
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
		for (const slot of DOCUMENT_SLOTS) {
			const value = engineState.surface.content[slot];
			if (typeof value === 'string' && value.length > 0) nextDefaults.content[slot] = value;
		}
		engineState.surface = nextDefaults;
	}

	// ---- Chrome mode (ADR-0037) ----

	// Absent means 'window' (canonical) — writing `undefined` back for 'window'
	// keeps saved compositions free of a redundant field. The stored value is
	// shared across chrome-mode surfaces; only the label differs (the
	// checklist's full-chrome presentation is its card, not a window).
	const chromeFullLabel = $derived(engineState.surface.type === 'checklist' ? 'Card' : 'Window');

	function handleChromeChange(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		engineState.surface.chrome = value === 'none' ? 'none' : undefined;
	}

	// ---- Enter / Exit (the surface's transition sugar; ADR-0035 §3 keyframes
	// take the pen when an opacity channel is declared) ----

	const TRANSITION_FIELDS = ['enter', 'exit'] as const;

	function ensureSurfaceTransition(field: 'enter' | 'exit'): NonNullable<SurfaceState['enter']> {
		const existing = engineState.surface[field];
		if (existing) return existing;
		const next =
			field === 'enter'
				? { start: 0, duration: 0.13, ease: 'settled' as Ease }
				: { start: 0.82, duration: 0.16, ease: 'smooth' as Ease };
		engineState.surface[field] = next;
		return next;
	}

	function surfaceTransitionInput(
		field: 'enter' | 'exit',
		key: 'start' | 'duration',
		value: string
	): void {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		ensureSurfaceTransition(field)[key] = Math.max(0, Math.min(1, n));
	}

	function surfaceTransitionEaseChange(field: 'enter' | 'exit', value: string): void {
		ensureSurfaceTransition(field).ease = value as Ease;
	}

	// ---- iMessage conversation (ADR-0031) ----
	// Text / side / tapback / receipt / typing edit here; per-bubble timing
	// stays on the timeline's message tracks (one draggable clip per bubble).

	const TAPBACK_OPTIONS: { value: NonNullable<ChatMessage['tapback']>; label: string }[] = [
		{ value: 'heart', label: 'Heart' },
		{ value: 'like', label: 'Like' },
		{ value: 'dislike', label: 'Dislike' },
		{ value: 'haha', label: 'Haha' },
		{ value: 'emphasize', label: 'Emphasize' },
		{ value: 'question', label: 'Question' }
	];

	const messages = $derived(engineState.surface.content.messages ?? []);

	// ---- Checklist items (ADR-0040) ----
	// Text / checked / static-vs-animated strike edit here; per-item strike
	// timing stays on the timeline's `checklist-{index}` tracks (one draggable
	// clip per animated strike).

	const items = $derived(engineState.surface.content.items ?? []);

	function addItem(): void {
		const list = (engineState.surface.content.items ??= []);
		// In a build-in list, a new item builds in too — staggered after the
		// others — so it animates on and lands on the timeline like its siblings,
		// not a bare item that only appears in the canvas.
		const buildsIn = list.some((item) => item.enter !== undefined);
		list.push({
			text: '',
			checked: false,
			...(buildsIn ? { enter: defaultItemEnter(list.length) } : {})
		});
	}

	function removeItem(index: number): void {
		engineState.surface.content.items?.splice(index, 1);
	}

	// Unchecking strips a stale strike window — an unchecked item carries no
	// strike at all (the schema's contract).
	function itemCheckedToggle(item: ChecklistItem, checked: boolean): void {
		item.checked = checked;
		if (!checked) {
			item.strike = undefined;
		}
	}

	// Static = no window (fully struck from frame 0); Animated materializes the
	// default mid-clip draw-on window, re-timed on the item's timeline track.
	function itemStrikeModeChange(item: ChecklistItem, value: string): void {
		item.strike = value === 'animated' ? (item.strike ?? defaultStrikeWindow()) : undefined;
	}

	// Build-in: the item reveals on its own staggered entrance (the list builds
	// up one item at a time); off = present from the block entrance. Timing is
	// then a draggable clip on the item's timeline row.
	function itemBuildInToggle(item: ChecklistItem, index: number, buildsIn: boolean): void {
		item.enter = buildsIn ? (item.enter ?? defaultItemEnter(index)) : undefined;
	}

	// ---- On-canvas direct selection (epic 0pkzts2c) ----
	// A selected `imessage-N` timeline row (set by a canvas bubble click or the
	// timeline gutter) highlights its message entry; the reveal effect below
	// scrolls to it and places the caret so "click a bubble → edit its text".

	const selectedMessageIndex = $derived.by(() => {
		const match = layerSelection.id?.match(/^imessage-(\d+)$/);
		return match ? parseInt(match[1], 10) : null;
	});

	// A selected `checklist-N` timeline row (canvas item click or timeline
	// gutter) highlights its item entry — the messages pattern, per item.
	const selectedItemIndex = $derived.by(() => {
		const match = layerSelection.id?.match(/^checklist-(\d+)$/);
		return match ? parseInt(match[1], 10) : null;
	});

	function revealTarget(target: string): void {
		if (!inspectorEl) return;
		const [kind, key] = target.split(':');
		if (kind === 'message') {
			const row = inspectorEl.querySelector<HTMLElement>(`[data-message-row="${key}"]`);
			row?.querySelector<HTMLElement>('[contenteditable]')?.focus({ preventScroll: true });
			row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		} else if (kind === 'item') {
			const row = inspectorEl.querySelector<HTMLElement>(`[data-item-row="${key}"]`);
			row?.querySelector<HTMLInputElement>('input[type="text"]')?.focus({ preventScroll: true });
			row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		} else if (kind === 'slot') {
			const input =
				key === 'body'
					? inspectorEl.querySelector<HTMLElement>('.body-field [contenteditable]')
					: inspectorEl.querySelector<HTMLElement>(`input[data-slot="${key}"]`);
			input?.focus({ preventScroll: true });
			input?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}

	// Scroll + caret placement is a true DOM side effect — the legitimate $effect
	// case. Runs post-render, so the target row/input already exists.
	$effect(() => {
		void inspectorFocus.seq;
		const target =
			inspectorFocus.target ??
			(selectedMessageIndex !== null
				? `message:${selectedMessageIndex}`
				: selectedItemIndex !== null
					? `item:${selectedItemIndex}`
					: null);
		if (target) revealTarget(target);
	});

	function addMessage(): void {
		const list = (engineState.surface.content.messages ??= []);
		const last = list.at(-1);
		list.push({ from: last?.from === 'them' ? 'me' : 'them', text: parseAnnotationBodyText('') });
	}

	function removeMessage(index: number): void {
		engineState.surface.content.messages?.splice(index, 1);
	}

	function messageFromChange(message: ChatMessage, value: string): void {
		message.from = value === 'me' ? 'me' : 'them';
	}

	function messageTapbackChange(message: ChatMessage, value: string): void {
		message.tapback = value === '' ? undefined : (value as NonNullable<ChatMessage['tapback']>);
	}

	function messageStatusChange(message: ChatMessage, value: string): void {
		message.status = value === '' ? undefined : (value as NonNullable<ChatMessage['status']>);
	}

	function messageTypingToggle(message: ChatMessage, hasTyping: boolean): void {
		message.typing = hasTyping ? { duration: 0.1 } : undefined;
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
		type SurfaceSlot =
			| 'title'
			| 'kicker'
			| 'body'
			| 'sourceUrl'
			| 'author'
			| 'source'
			| 'dateLabel';
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

	// The add-menu's grouped items for a slot — one group per split mode with effects.
	function effectMenuGroupsForSlot(
		slot: string
	): { label: string; items: { value: string; label: string }[] }[] {
		const bySplit = effectsForSlot(slot);
		return SPLIT_MODES.filter((mode) => bySplit[mode].length > 0).map((mode) => ({
			label: mode,
			items: bySplit[mode].map((opt) => ({ value: opt.id, label: opt.label }))
		}));
	}

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

	// This Layer's motion windows for the Sound section (ADR-0033 §5).
	const soundMotions = $derived.by(() => {
		const rows: {
			label: string;
			cueId: string;
			window?: { sound?: SoundOverride };
			ensure?: () => { sound?: SoundOverride };
		}[] = [];
		if (engineState.surface.enter)
			rows.push({ label: 'Enter', cueId: 'surface:enter', window: engineState.surface.enter });
		if (engineState.surface.exit)
			rows.push({ label: 'Exit', cueId: 'surface:exit', window: engineState.surface.exit });
		// Chat bubbles sound too (`message:${index}` cues); a bubble on the default
		// cadence gets its `enter` window materialized on first sound write.
		if (controls.messages) {
			messages.forEach((message, index) => {
				rows.push({
					label: `Message ${index + 1}`,
					cueId: `message:${index}`,
					window: message.enter,
					ensure: () => {
						message.enter ??= defaultMessageEnter(index);
						return message.enter;
					}
				});
			});
		}
		// Animated checklist strikes sound (`mark:${index}` cues — indexed by
		// mark-instance position, i.e. checked-item order; the checklist body
		// carries no other marks). Static strikes have no motion and no cue.
		if (controls.items) {
			let strikeMarkIndex = 0;
			items.forEach((item, index) => {
				if (!item.checked) return;
				const cueId = `mark:${strikeMarkIndex}`;
				strikeMarkIndex += 1;
				if (!item.strike) return;
				rows.push({ label: `Item ${index + 1} strike`, cueId, window: item.strike });
			});
		}
		return rows;
	});
</script>

<div class="surface-inspector" bind:this={inspectorEl}>
	<InspectorSection label="Surface">
		<Field label="Type">
			<select value={engineState.surface.type} onchange={handleSurfaceTypeChange}>
				{#each surfaceRenderers as surface (surface.type)}
					<option value={surface.type}>{surface.label}</option>
				{/each}
			</select>
		</Field>

		{#if variantIds.length > 0}
			<Field label="Variant">
				<select value={activeVariant} onchange={handleVariantChange}>
					{#each variantIds as id (id)}
						<option value={id}>{id}</option>
					{/each}
				</select>
			</Field>
		{/if}

		{#if controls.site}
			<Field label="Site">
				<select
					value={engineState.surface.site ?? 'twitter'}
					onchange={(e) => {
						engineState.surface.site = (e.currentTarget as HTMLSelectElement)
							.value as (typeof WEB_DOCUMENT_SITES)[number];
					}}
				>
					{#each WEB_DOCUMENT_SITES as site (site)}
						<option value={site}>{SITE_LABELS[site]}</option>
					{/each}
				</select>
			</Field>
		{/if}

		{#if controls.websiteCapture}
			<Field label="URL">
				<input
					bind:value={engineState.surface.content.sourceUrl}
					disabled={websiteCaptureState === 'capturing'}
					onblur={handleWebsiteCaptureBlur}
					onkeydown={handleWebsiteCaptureKeydown}
					type="url"
				/>
				{#if websiteCaptureState === 'capturing'}
					<span class="ins-unit">Capturing</span>
				{/if}
			</Field>
			<Field label="Screenshot">
				{#if engineState.surface.content.imageUrl}
					<img
						class="website-capture-preview"
						alt="Captured website preview"
						src={engineState.surface.content.imageUrl}
					/>
				{/if}
				<input
					accept="image/png,image/jpeg,image/webp"
					aria-label="Choose website screenshot"
					onchange={handleWebsiteImageFileChange}
					type="file"
				/>
			</Field>
		{/if}

		{#if documentVisible}
			{#if documentSlots.kicker}
				<Field label="Kicker">
					<input bind:value={engineState.surface.content.kicker} data-slot="kicker" type="text" />
					<button
						type="button"
						class="clear-btn"
						aria-label="Remove kicker"
						onclick={() => removeSlot('kicker')}>×</button
					>
				</Field>
			{/if}
			{#if documentSlots.title}
				<Field label="Title">
					<input bind:value={engineState.surface.content.title} data-slot="title" type="text" />
					<button
						type="button"
						class="clear-btn"
						aria-label="Remove title"
						onclick={() => removeSlot('title')}>×</button
					>
				</Field>
			{/if}
			{#if documentSlots.counterpoint}
				<Field label="Counterpoint">
					<input
						bind:value={engineState.surface.content.counterpoint}
						data-slot="counterpoint"
						type="text"
					/>
					<button
						type="button"
						class="clear-btn"
						aria-label="Remove counterpoint"
						onclick={() => removeSlot('counterpoint')}>×</button
					>
				</Field>
			{/if}
			{#if documentSlots.sourceUrl}
				<Field label="Source">
					<input
						bind:value={engineState.surface.content.sourceUrl}
						data-slot="sourceUrl"
						type="text"
					/>
					<button
						type="button"
						class="clear-btn"
						aria-label="Remove source"
						onclick={() => removeSlot('sourceUrl')}>×</button
					>
				</Field>
			{/if}
			{#if documentSlots.author}
				<Field label="Author">
					<input bind:value={engineState.surface.content.author} data-slot="author" type="text" />
					<button
						type="button"
						class="clear-btn"
						aria-label="Remove author"
						onclick={() => removeSlot('author')}>×</button
					>
				</Field>
			{/if}
			{#if documentSlots.affiliation}
				<Field label="Affiliation">
					<input
						bind:value={engineState.surface.content.affiliation}
						data-slot="affiliation"
						type="text"
					/>
					<button
						type="button"
						class="clear-btn"
						aria-label="Remove affiliation"
						onclick={() => removeSlot('affiliation')}>×</button
					>
				</Field>
			{/if}
			{#if documentSlots.avatarUrl}
				<Field label="Avatar">
					<input
						bind:value={engineState.surface.content.avatarUrl}
						data-slot="avatarUrl"
						type="text"
					/>
					<input
						accept="image/png,image/jpeg,image/webp"
						aria-label="Choose avatar image"
						onchange={handleAvatarFileChange}
						type="file"
					/>
					<button
						type="button"
						class="clear-btn"
						aria-label="Remove avatar"
						onclick={() => removeSlot('avatarUrl')}>×</button
					>
				</Field>
			{/if}
			{#if documentSlots.source}
				<Field label="Citation">
					<input bind:value={engineState.surface.content.source} data-slot="source" type="text" />
					<button
						type="button"
						class="clear-btn"
						aria-label="Remove citation"
						onclick={() => removeSlot('source')}>×</button
					>
				</Field>
			{/if}
			{#if documentSlots.dateLabel}
				<Field label="Date">
					<input
						bind:value={engineState.surface.content.dateLabel}
						data-slot="dateLabel"
						type="text"
					/>
					<button
						type="button"
						class="clear-btn"
						aria-label="Remove date"
						onclick={() => removeSlot('dateLabel')}>×</button
					>
				</Field>
			{/if}
			{#if documentSlots.bodyLabel}
				<Field label="Body label">
					<input
						bind:value={engineState.surface.content.bodyLabel}
						data-slot="bodyLabel"
						type="text"
					/>
					<button
						type="button"
						class="clear-btn"
						aria-label="Remove body label"
						onclick={() => removeSlot('bodyLabel')}>×</button
					>
				</Field>
			{/if}
			{#if showBody}
				<div class="body-field">
					<span class="body-field__label">Body</span>
					<AnnotationTextEditor
						bind:body={engineState.surface.content.body}
						colors={EDITOR_MARK_COLORS}
						label="Body"
						rows={10}
					/>
				</div>
			{/if}
		{/if}

		{#if absentSlots.length > 0}
			<Field label="Add">
				<AddMenu
					label="+ Slot"
					groups={[
						{
							items: absentSlots.map((slot) => ({ value: slot, label: DOCUMENT_SLOT_LABELS[slot] }))
						}
					]}
					onselect={(slot) => addSlot(slot as DocumentSlot)}
				/>
			</Field>
		{/if}

		{#if controls.chrome}
			<Field label="Chrome">
				<select value={engineState.surface.chrome ?? 'window'} onchange={handleChromeChange}>
					<option value="window">{chromeFullLabel}</option>
					<option value="none">None</option>
				</select>
			</Field>
		{/if}

		{#if controls.backgroundVisibility && engineState.surface.backgroundVisibility !== undefined}
			<Field label="Background">
				<input
					bind:value={engineState.surface.backgroundVisibility}
					max="1"
					min="0"
					step="0.01"
					type="range"
				/>
			</Field>
		{/if}
	</InspectorSection>

	{#if controls.messages}
		<InspectorSection label="Messages">
			{#snippet action()}
				<button type="button" class="ins-add" onclick={addMessage}>+ Add</button>
			{/snippet}
			{#each messages as message, index (index)}
				<div
					class="message-entry"
					class:message-entry--selected={selectedMessageIndex === index}
					data-message-row={index}
				>
					<div class="message-entry__header">
						<select
							class="message-entry__from"
							aria-label={`Message ${index + 1} sender`}
							value={message.from}
							onchange={(e) =>
								messageFromChange(message, (e.currentTarget as HTMLSelectElement).value)}
						>
							<option value="them">Received</option>
							<option value="me">Sent</option>
						</select>
						<button
							type="button"
							class="remove-btn"
							aria-label={`Remove message ${index + 1}`}
							onclick={() => removeMessage(index)}>×</button
						>
					</div>
					<AnnotationTextEditor
						bind:body={message.text}
						colors={EDITOR_MARK_COLORS}
						label={`Message ${index + 1}`}
						rows={1}
						styles={DECORATIVE_ANNOTATION_STYLES}
					/>
					<Field label="Tapback">
						<select
							value={message.tapback ?? ''}
							onchange={(e) =>
								messageTapbackChange(message, (e.currentTarget as HTMLSelectElement).value)}
						>
							<option value="">None</option>
							{#each TAPBACK_OPTIONS as opt (opt.value)}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
					</Field>
					{#if message.from === 'me'}
						<Field label="Receipt">
							<select
								value={message.status ?? ''}
								onchange={(e) =>
									messageStatusChange(message, (e.currentTarget as HTMLSelectElement).value)}
							>
								<option value="">None</option>
								<option value="delivered">Delivered</option>
								<option value="read">Read</option>
							</select>
						</Field>
					{:else}
						<Field label="Typing">
							<InspectorToggle
								checked={message.typing !== undefined}
								label={`Message ${index + 1} typing indicator`}
								onchange={(checked) => messageTypingToggle(message, checked)}
							/>
						</Field>
					{/if}
				</div>
			{/each}
		</InspectorSection>
	{/if}

	{#if controls.items}
		<InspectorSection label="Checklist">
			{#snippet action()}
				<button type="button" class="ins-add" onclick={addItem}>+ Add</button>
			{/snippet}
			<Field label="Logo">
				<input
					accept="image/png,image/jpeg,image/webp"
					aria-label="Choose logo image"
					onchange={handleLogoFileChange}
					type="file"
				/>
				{#if engineState.surface.content.logoUrl}
					<button
						type="button"
						class="clear-btn"
						aria-label="Remove logo"
						onclick={() => (engineState.surface.content.logoUrl = undefined)}>×</button
					>
				{/if}
			</Field>
			{#each items as item, index (index)}
				<div
					class="item-entry"
					class:item-entry--selected={selectedItemIndex === index}
					data-item-row={index}
				>
					<div class="item-entry__header">
						<span class="item-entry__num">{index + 1}</span>
						<input
							type="text"
							aria-label={`Item ${index + 1} text`}
							bind:value={item.text}
						/>
						<button
							type="button"
							class="remove-btn"
							aria-label={`Remove item ${index + 1}`}
							onclick={() => removeItem(index)}>×</button
						>
					</div>
					<Field label="Build in">
						<InspectorToggle
							checked={item.enter !== undefined}
							label={`Item ${index + 1} builds in`}
							onchange={(buildsIn) => itemBuildInToggle(item, index, buildsIn)}
						/>
					</Field>
					<Field label="Checked">
						<InspectorToggle
							checked={item.checked}
							label={`Item ${index + 1} checked`}
							onchange={(checked) => itemCheckedToggle(item, checked)}
						/>
					</Field>
					{#if item.checked}
						<Field label="Strike">
							<select
								value={item.strike ? 'animated' : 'static'}
								onchange={(e) =>
									itemStrikeModeChange(item, (e.currentTarget as HTMLSelectElement).value)}
							>
								<option value="static">Static (struck at open)</option>
								<option value="animated">Animated (draws on cue)</option>
							</select>
						</Field>
					{/if}
				</div>
			{/each}
		</InspectorSection>
	{/if}

	{#if appearanceVisible}
		<InspectorSection label="Appearance">
			{#if controls.typography && showBody}
				<Field label="Font">
					<select
						bind:value={engineState.typography.fontFamily}
						disabled={packFontClaim !== null}
						title={packFontClaim !== null
							? `Type voice set by the ${getPack(packState.slug).label} Pack`
							: undefined}
					>
						{#each fontFamilyOptions as [value, option] (value)}
							<option {value}>{option.label}</option>
						{/each}
					</select>
				</Field>
			{/if}
			{#if controls.paperColor}
				<Field label="Paper">
					<TypographyColorInput field="paperColor" />
				</Field>
			{/if}
			{#if controls.inkColor && showBody}
				<Field label="Ink">
					<TypographyColorInput field="inkColor" />
				</Field>
			{/if}
		</InspectorSection>
	{/if}

	{#if controls.enterExit}
		{#each TRANSITION_FIELDS as field (field)}
			<InspectorSection label={field === 'enter' ? 'Enter' : 'Exit'}>
				{#snippet action()}
					<InspectorToggle
						checked={engineState.surface[field] !== undefined}
						label={field === 'enter' ? 'Enter transition' : 'Exit transition'}
						onchange={(checked) => {
							if (checked) {
								ensureSurfaceTransition(field);
							} else {
								engineState.surface[field] = undefined;
							}
						}}
					/>
				{/snippet}
				{#if engineState.surface[field]}
					{@const transition = engineState.surface[field]}
					<Field label="Start">
						<input
							type="number"
							min="0"
							max="1"
							step="any"
							value={transition.start}
							oninput={(e) =>
								surfaceTransitionInput(field, 'start', (e.currentTarget as HTMLInputElement).value)}
						/>
						<span class="ins-unit"
							>{formatFractionAsSeconds(
								transition.start,
								engineState.transport.durationSeconds
							)}</span
						>
					</Field>
					<Field label="Duration">
						<input
							type="number"
							min="0"
							max="1"
							step="any"
							value={transition.duration}
							oninput={(e) =>
								surfaceTransitionInput(
									field,
									'duration',
									(e.currentTarget as HTMLInputElement).value
								)}
						/>
						<span class="ins-unit"
							>{formatFractionAsSeconds(
								transition.duration,
								engineState.transport.durationSeconds
							)}</span
						>
					</Field>
					<Field label="Ease">
						<select
							value={transition.ease}
							onchange={(e) =>
								surfaceTransitionEaseChange(field, (e.currentTarget as HTMLSelectElement).value)}
						>
							{#each easeOptions as [value, option] (value)}
								<option {value}>{option.label}</option>
							{/each}
						</select>
					</Field>
				{/if}
			</InspectorSection>
		{/each}
	{/if}

	<InspectorSection label="Text Motion" defaultOpen={false}>
		{#each activeSlots as { slot, label } (slot)}
			<Field {label}>
				<AddMenu
					label="+ Effect"
					groups={effectMenuGroupsForSlot(slot)}
					onselect={(id) => handleAddTextAnimation(slot, id)}
				/>
			</Field>
		{/each}

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
						onclick={() => removeTextAnimation(entry.id)}>×</button
					>
				</div>

				<Field label="Effect">
					<select
						value={entry.effect}
						onchange={(e) =>
							textAnimEffectChange(entry, (e.currentTarget as HTMLSelectElement).value)}
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
						step="any"
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
						step="any"
						value={entry.enter.duration}
						placeholder="dur"
						oninput={(e) => {
							const n = Number((e.currentTarget as HTMLInputElement).value);
							if (Number.isFinite(n)) entry.enter.duration = Math.max(0, Math.min(1, n));
						}}
					/>
					<select
						value={entry.enter.ease}
						onchange={(e) =>
							textAnimEaseChange(entry, (e.currentTarget as HTMLSelectElement).value)}
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

	<!-- Composition-owned surface opacity (ADR-0035 §3) — the only surface
	     channel; transforms are camera territory. Declaring it takes the pen
	     from the enter/exit sugar. -->
	<KeyframesSection selfKey="surface" channelNames={['opacity']} />

	<SoundSection motions={soundMotions} />
</div>

<style>
	.surface-inspector {
		display: grid;
		gap: 0;
	}

	/* Body is a tall rich-text editor — stack its label above and let it run
	   full width rather than forcing it into the label-left field grid. */
	.body-field {
		display: grid;
		gap: var(--vs-xs);
	}

	.body-field__label {
		color: var(--chrome-muted);
		font-size: 0.8125rem;
	}

	.website-capture-preview {
		aspect-ratio: 16 / 10;
		inline-size: 5rem;
		object-fit: cover;
	}

	/* A message entry: a sub-group separated by a hairline (not a card), same
	   vocabulary as .anim-entry. */
	.message-entry {
		border-block-start: 1px solid var(--chrome-hairline);
		/* Constant transparent selection rail — coloring it on select (canvas
		   bubble click / timeline row) can't shift the layout. */
		border-inline-start: 2px solid transparent;
		display: grid;
		gap: var(--vs-xs);
		padding-block-start: var(--vs-s);
		padding-inline-start: var(--vs-xs);
	}

	.message-entry--selected {
		border-inline-start-color: #ffd608;
	}

	.message-entry__header {
		align-items: center;
		display: flex;
		gap: var(--vs-xs);
		justify-content: space-between;
	}

	.message-entry__from {
		flex: 0 1 auto;
		font-size: 0.8rem;
	}

	/* A checklist item entry: the message-entry vocabulary, per task. */
	.item-entry {
		border-block-start: 1px solid var(--chrome-hairline);
		border-inline-start: 2px solid transparent;
		display: grid;
		gap: var(--vs-xs);
		padding-block-start: var(--vs-s);
		padding-inline-start: var(--vs-xs);
	}

	.item-entry--selected {
		border-inline-start-color: #ffd608;
	}

	.item-entry__header {
		align-items: center;
		display: flex;
		gap: var(--vs-xs);
	}

	.item-entry__header input {
		flex: 1 1 auto;
	}

	.item-entry__num {
		color: var(--chrome-muted);
		flex: none;
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}

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
