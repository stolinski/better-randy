<script lang="ts">
	import { annotationBodyPlainText } from '$lib/annotations/annotation-body-text';
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import type { DeterministicNonReadableTextReason } from '$lib/platform/pipelines/types';
	import { isDarkSurfaceColor } from '$lib/utils/color';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	import DocumentBody from '../web-document/DocumentBody.svelte';
	import {
		messageEnter,
		messageTyping,
		TAPBACK_DELAY,
		RECEIPT_DELIVERED_DELAY,
		RECEIPT_READ_DELAY
	} from './schedule';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	// A transparent-overlay Messages thread: works in LIGHT or DARK theme, chosen
	// from the preset's `paperColor` luminance (which also flips the highlight —
	// light multiplies, dark punches to ink). The whole conversation is
	// choreographed off the global timeline progress so it is frame-deterministic
	// (preview == export). Every bubble reserves its final space from frame 0, so
	// nothing reflows as messages arrive — the highlight mark stays pinned to its
	// phrase. NO CSS filter/glow (it pixelates the HTML-in-Canvas capture). See
	// docs/adr/0031-imessage-interactive-surface.md.
	// The window fills ~90% of the canvas HEIGHT (minimal top/bottom margin); width
	// is a separate prominence knob. Fixed size — every bubble + the receipt
	// reserve their space, so it never grows as messages pop in; the conversation
	// is anchored to the bottom of the screen.
	// `chrome: 'none'` (docs/adr/0037-imessage-chrome-mode.md) is the film-insert
	// mode: no header / timestamp / composer / page background — bare bubbles over
	// footage, with a substrate-darken vignette riding the visibility ramp. The
	// paperColor luminance still picks the light/dark theme; in chromeless mode it
	// only affects bubble/meta colors (the page itself is never painted).
	const CARD_WIDTH_RATIO_H = 0.42;
	const CARD_WIDTH_RATIO_V = 0.86;
	const CARD_HEIGHT_RATIO = 0.9;
	const ENTER_TRAVEL_RATIO = 0.05;
	const VERTICAL_CENTER_OFFSET_RATIO = -0.035;
	// Substrate-darken vignette budget (chromeless only): the visible darkening
	// (the gradient is fully transparent by its 72% stop) stays ≤ 30% of the FRAME
	// in both orientations — the width clamp is what holds the vertical reflow
	// (86%-wide thread) under the budget.
	const VIGNETTE_WIDTH_RATIO = 0.62;
	const VIGNETTE_MAX_WIDTH_FRAME_RATIO = 0.45;
	const VIGNETTE_HEIGHT_FRAME_RATIO = 0.34;
	const VIGNETTE_CENTER_Y_RATIO = 0.82;
	const VIGNETTE_MAX_ALPHA = 0.45;

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const isVertical = $derived(frame.height > frame.width);
	const content = $derived(engineState.surface.content);
	const messages = $derived(content.messages ?? []);
	const contact = $derived((content.author ?? '').trim());
	const contactInitial = $derived(contact.charAt(0).toUpperCase() || '?');
	const avatarUrl = $derived((content.avatarUrl ?? '').trim());
	let failedAvatarUrl = $state('');
	// Pack-immune (ADR-0038): the iMessage artifact must stay pixel-faithful, so
	// no Pack colour is routed in. The optional paperColor override only selects
	// the dark/light theme; absent → light, identical to pre-ADR-0038 behaviour.
	const theme = $derived(
		isDarkSurfaceColor(engineState.typography?.paperColor ?? '#ffffff') ? 'dark' : 'light'
	);
	// Read with `?? 'window'` — a schema `.default()` is NOT reliably applied at
	// runtime for pre-existing presets/state, so absence must mean window here.
	const isChromeless = $derived((engineState.surface.chrome ?? 'window') === 'none');
	const p = $derived(Math.max(0, Math.min(1, animState.globalProgress)));

	const layout = $derived.by(() => {
		const widthRatio = isVertical ? CARD_WIDTH_RATIO_V : CARD_WIDTH_RATIO_H;
		const width = frame.width * widthRatio;
		const height = frame.height * CARD_HEIGHT_RATIO;
		const x = Math.round((frame.width - width) / 2);
		const visibility = Math.max(0, Math.min(1, animState.paperVisibility));
		const enterOffsetPx = Math.round((1 - visibility) * frame.height * ENTER_TRAVEL_RATIO);
		const centerOffsetPx = Math.round(isVertical ? frame.height * VERTICAL_CENTER_OFFSET_RATIO : 0);
		return { x, width, height, enterOffsetPx, centerOffsetPx, visibility };
	});

	// The vignette ellipse is sized in FRAME pixels (not card fractions) so the
	// ≤ 30%-of-frame budget holds across the horizontal/vertical reflow. Plain
	// radial-gradient — NO CSS filter (it pixelates the HTML-in-Canvas capture).
	const vignetteBackground = $derived.by(() => {
		const rx = Math.min(
			layout.width * VIGNETTE_WIDTH_RATIO,
			frame.width * VIGNETTE_MAX_WIDTH_FRAME_RATIO
		);
		const ry = frame.height * VIGNETTE_HEIGHT_FRAME_RATIO;
		const cy = layout.height * VIGNETTE_CENTER_Y_RATIO;
		return `radial-gradient(${Math.round(rx)}px ${Math.round(ry)}px at 50% ${Math.round(cy)}px, rgba(0, 0, 0, ${VIGNETTE_MAX_ALPHA}), rgba(0, 0, 0, 0) 72%)`;
	});

	const bodyFontPx = $derived(layout.width * 0.044);
	const nameFontPx = $derived(layout.width * 0.032);
	const metaFontPx = $derived(layout.width * 0.028);
	const avatarPx = $derived(layout.width * 0.08);
	const iconPx = $derived(layout.width * 0.052);
	const inputFontPx = $derived(layout.width * 0.04);

	const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
	function easeOutBack(t: number): number {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
	}
	// Per-message timing comes from the composition (message.enter, with a default
	// staggered cadence) — the same descriptors the timeline draws + edits.
	const appearAt = (i: number): number => messageEnter(messages[i], i).start;
	const popDuration = (i: number): number => messageEnter(messages[i], i).duration;

	function bubbleStyle(i: number): { opacity: number; scale: number } {
		const local = clamp01((p - appearAt(i)) / popDuration(i));
		// Opacity is binary at appearAt (the bubble pops in opaque, scale-only) so
		// there is no blank gap at the typing→bubble handoff; the spring carries
		// the motion.
		return { opacity: p >= appearAt(i) ? 1 : 0, scale: 0.6 + 0.4 * easeOutBack(local) };
	}
	function isTyping(i: number): boolean {
		const win = messageTyping(messages[i], i);
		return win !== null && p >= win.start && p < win.start + win.duration;
	}
	function dotOpacity(k: number): number {
		return 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (p * 26 + k * 0.16)));
	}
	function tapbackScale(i: number): number {
		const local = clamp01((p - (appearAt(i) + TAPBACK_DELAY)) / 0.05);
		return local <= 0 ? 0 : Math.max(0, easeOutBack(local));
	}
	function receiptLabel(i: number, status: 'delivered' | 'read'): string {
		if (status === 'read' && p >= appearAt(i) + RECEIPT_READ_DELAY) {
			return 'Read';
		}
		return p >= appearAt(i) + RECEIPT_DELIVERED_DELAY ? 'Delivered' : '';
	}
	// A bubble shows its tail only when it's the last in a consecutive same-sender
	// run (iMessage grouping); group starts get extra spacing above.
	const showTail = (i: number): boolean =>
		i === messages.length - 1 || messages[i + 1]?.from !== messages[i].from;
	const startsGroup = (i: number): boolean => i === 0 || messages[i - 1]?.from !== messages[i].from;

	const decorativeSymbolReason: DeterministicNonReadableTextReason = 'decorative-symbol';
	const TAPBACK_GLYPH: Record<string, string> = {
		heart: '♥',
		like: '👍',
		dislike: '👎',
		haha: 'haha',
		emphasize: '‼',
		question: '?'
	};
</script>

<article
	bind:this={element}
	class="imessage surface"
	class:imessage--chromeless={isChromeless}
	data-theme={theme}
	style:inline-size={`${layout.width}px`}
	style:block-size={`${layout.height}px`}
	style:left={`${layout.x}px`}
	style:transform={`translateY(calc(-50% + ${layout.enterOffsetPx + layout.centerOffsetPx}px))`}
	style:opacity={layout.visibility}
>
	{#if isChromeless}
		<!-- Substrate-darken vignette (aesthetic.md § Motion Vocabulary): a
		     localized radial darkening under the thread so the bubbles read over
		     any footage grade. Rides the surface visibility ramp, so it rises with
		     the enter and eases out with the exit — frame-deterministic. -->
		<div
			class="im-vignette"
			style:background={vignetteBackground}
			style:opacity={layout.visibility}
		></div>
	{:else}
		<!-- Messages conversation header. -->
		<header class="im-header" style:padding={`${layout.width * 0.02}px ${layout.width * 0.028}px`}>
			<span class="im-header-side" aria-hidden="true"></span>
			<span class="im-contact" style:gap={`${layout.width * 0.004}px`}>
				<span
					class="im-avatar"
					style:inline-size={`${avatarPx}px`}
					style:block-size={`${avatarPx}px`}
					style:font-size={`${avatarPx * 0.5}px`}
					aria-hidden="true"
					data-gfx-non-readable-reason={decorativeSymbolReason}>{contactInitial}</span
				>
				<span class="im-name" style:font-size={`${nameFontPx}px`}
					><span
						data-gfx-readable-id="surface:imessage:author"
						data-gfx-readable-text={contact}
						data-gfx-text-role="found-document-metadata">{contact}</span
					><span aria-hidden="true" data-gfx-non-readable-reason={decorativeSymbolReason}>
						›</span
					></span
				>
			</span>
			<svg
				class="im-facetime"
				style:inline-size={`${iconPx}px`}
				style:block-size={`${iconPx}px`}
				viewBox="0 0 24 24"
				aria-hidden="true"
				><path
					fill="#0a84ff"
					d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"
				/></svg
			>
		</header>
	{/if}

	<!-- Thread: every bubble reserves space; visibility is scheduled. -->
	<div class="im-thread" style:padding={`${layout.width * 0.028}px ${layout.width * 0.03}px`}>
		{#if !isChromeless}
			<div
				class="im-timestamp"
				data-gfx-readable-id="surface:imessage:chrome:timestamp"
				data-gfx-readable-text="Today 2:14 PM"
				data-gfx-text-role="found-document-metadata"
				style:font-size={`${metaFontPx}px`}
			>
				<span>Today</span> 2:14 PM
			</div>
		{/if}

		{#each messages as message, i (i)}
			{@const style = bubbleStyle(i)}
			{@const typing = isTyping(i)}
			{@const renderedStatus = message.status ? receiptLabel(i, message.status) : ''}
			<div
				class="im-row"
				data-from={message.from}
				style:--group-avatar-size={`${avatarPx}px`}
				style:--group-avatar-gap={`${layout.width * 0.012}px`}
				style:margin-block-start={`${startsGroup(i) ? layout.width * 0.018 : layout.width * 0.005}px`}
			>
				{#if typing}
					<div
						class="im-bubble im-bubble--tail im-typing"
						data-from="them"
						data-message-index={i}
						style:font-size={`${bodyFontPx}px`}
						style:padding={`${bodyFontPx * 0.62}px ${bodyFontPx * 0.7}px`}
						style:gap={`${bodyFontPx * 0.26}px`}
					>
						{#each [0, 1, 2] as k (k)}
							<span
								class="im-dot"
								style:inline-size={`${bodyFontPx * 0.42}px`}
								style:block-size={`${bodyFontPx * 0.42}px`}
								style:opacity={dotOpacity(k)}
							></span>
						{/each}
					</div>
				{/if}
				<!--
					The bubble and its tapback are siblings inside a wrap: the tapback
					(which animates every frame) is NOT a child of the mark-bearing
					bubble, so the bubble's DOM stays static while the highlight draws —
					no per-frame texture/geometry desync flash.
				-->
				{#if isChromeless && message.from === 'them' && showTail(i)}
					<span
						class="im-group-avatar"
						style:font-size={`${avatarPx * 0.5}px`}
						style:opacity={typing ? 1 : style.opacity}
						aria-hidden="true"
						data-gfx-non-readable-reason={decorativeSymbolReason}
					>
						{contactInitial}
						{#if avatarUrl && failedAvatarUrl !== avatarUrl}
							<img
								src={avatarUrl}
								alt=""
								crossorigin="anonymous"
								onerror={() => (failedAvatarUrl = avatarUrl)}
							/>
						{/if}
					</span>
				{/if}
				<div class="im-bubblewrap">
					<div
						class="im-bubble"
						class:im-bubble--tail={showTail(i)}
						data-from={message.from}
						data-message-index={i}
						style:font-size={`${bodyFontPx}px`}
						style:padding={`${bodyFontPx * 0.44}px ${bodyFontPx * 0.66}px`}
						style:opacity={typing ? 0 : style.opacity}
						style:transform={`scale(${typing ? 0.6 : style.scale})`}
					>
						{#key annotationBodyPlainText(message.text)}
							<DocumentBody
								body={message.text}
								fontSize={bodyFontPx}
								readablePrefix={`surface:imessage:message:${i}`}
							/>
						{/key}
					</div>
					{#if message.tapback}
						<span
							class="im-tapback"
							data-from={message.from}
							data-gfx-readable-id={`surface:imessage:message:${i}:tapback`}
							data-gfx-readable-text={TAPBACK_GLYPH[message.tapback]}
							data-gfx-text-role="found-document-metadata"
							style:inline-size={`${bodyFontPx * 1.6}px`}
							style:block-size={`${bodyFontPx * 1.6}px`}
							style:font-size={`${bodyFontPx * 0.78}px`}
							style:transform={`scale(${tapbackScale(i)})`}>{TAPBACK_GLYPH[message.tapback]}</span
						>
					{/if}
				</div>
				{#if message.from === 'me' && message.status}
					<!-- Always rendered (nbsp fallback) so the Delivered→Read receipt
					     reserves its line and the window height stays stable. -->
					<div class="im-receipt" style:font-size={`${metaFontPx}px`}>
						{#if renderedStatus}<span
								data-gfx-readable-id={`surface:imessage:message:${i}:status`}
								data-gfx-readable-text={renderedStatus}
								data-gfx-text-role="found-document-metadata">{renderedStatus}</span
							>{:else}<span aria-hidden="true">&nbsp;</span>{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	{#if !isChromeless}
		<!-- Composer bar — the modern Messages tell. -->
		<div
			class="im-inputbar"
			style:padding={`${layout.width * 0.018}px ${layout.width * 0.026}px`}
			style:gap={`${layout.width * 0.016}px`}
		>
			<span
				class="im-plus"
				style:inline-size={`${iconPx}px`}
				style:block-size={`${iconPx}px`}
				style:font-size={`${iconPx * 0.8}px`}
				aria-hidden="true"
				data-gfx-non-readable-reason={decorativeSymbolReason}>+</span
			>
			<span
				class="im-field"
				data-gfx-readable-id="surface:imessage:chrome:composer"
				data-gfx-readable-text="iMessage"
				data-gfx-text-role="found-document-metadata"
				style:font-size={`${inputFontPx}px`}
				style:padding={`${inputFontPx * 0.5}px ${inputFontPx * 0.8}px`}>iMessage</span
			>
		</div>
	{/if}
</article>

<style>
	/*
	 * Messages thread — theme-able (light or dark, chosen from paperColor in the
	 * component). The card is the only opaque element; the frame around it stays
	 * transparent. The hero highlight lands on a received bubble; the page
	 * luminance picks multiply (light) vs ink-punch (dark) so it stays readable
	 * either way.
	 */
	.imessage {
		box-sizing: border-box;
		border-radius: 1.4em;
		display: grid;
		font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
		grid-template-rows: auto 1fr auto;
		overflow: hidden;
		position: absolute;
		top: 50%;
		transform-origin: center;
	}
	.imessage[data-theme='light'] {
		--im-page: #ffffff;
		--im-received: #e9e9eb;
		--im-received-text: #000000;
		--im-meta: #8e8e93;
		--im-rule: #d1d1d6;
		--im-header-bg: #f7f7f7;
		--im-tapback-bg: #e9e9eb;
		--im-field-bg: #ffffff;
		--im-field-border: #d1d1d6;
	}
	.imessage[data-theme='dark'] {
		--im-page: #1c1c1e;
		--im-received: #3b3b3d;
		--im-received-text: #ffffff;
		--im-meta: #8e8e93;
		--im-rule: #3a3a3c;
		--im-header-bg: #2c2c2e;
		--im-tapback-bg: #3b3b3d;
		--im-field-bg: #1c1c1e;
		--im-field-border: #48484a;
	}
	.imessage {
		--im-sent: #0a84ff;
		--im-sent-text: #ffffff;
		background-color: var(--im-page);
		color: var(--im-received-text);
	}

	.im-header {
		align-items: center;
		background-color: var(--im-header-bg);
		border-block-end: 1px solid var(--im-rule);
		display: grid;
		grid-template-columns: 1fr auto 1fr;
	}
	.im-contact {
		align-items: center;
		display: grid;
		justify-items: center;
	}
	.im-avatar {
		align-items: center;
		background: linear-gradient(#b8b8c0, #8e8e96);
		border-radius: 50%;
		color: #ffffff;
		display: flex;
		font-weight: 500;
		justify-content: center;
	}
	.im-name {
		color: var(--im-received-text);
		font-weight: 500;
	}
	.im-facetime {
		display: block;
		justify-self: end;
	}

	.im-thread {
		/* Anchor the conversation to the bottom of the fixed-height screen, so it
		   fills upward as messages arrive (and overflow clips at the top). */
		align-content: end;
		display: grid;
		overflow: hidden;
	}
	.im-timestamp {
		color: var(--im-meta);
		margin-block-end: 0.4em;
		text-align: center;
	}
	.im-timestamp span {
		font-weight: 600;
	}

	.im-row {
		display: grid;
		justify-items: start;
		position: relative;
	}
	.im-row[data-from='me'] {
		justify-items: end;
	}

	/* Wrap = the tapback's positioning context, sized to the bubble's natural box. */
	.im-bubblewrap {
		inline-size: fit-content;
		max-inline-size: 76%;
		position: relative;
	}
	.im-bubble {
		border-radius: 1.25em;
		line-height: 1.32;
		position: relative;
		transform-origin: bottom left;
		inline-size: fit-content;
	}
	.im-bubble[data-from='them'] {
		background-color: var(--im-received);
		color: var(--im-received-text);
	}
	.im-bubble[data-from='me'] {
		background-color: var(--im-sent);
		color: var(--im-sent-text);
		transform-origin: bottom right;
	}
	/* Tail curls (classic two-pseudo technique), only on the last bubble of a run. */
	.im-bubble--tail::before,
	.im-bubble--tail::after {
		block-size: 0.85em;
		content: '';
		position: absolute;
		inset-block-end: 0;
		z-index: -1;
	}
	.im-bubble--tail::after {
		background-color: var(--im-page);
		inline-size: 0.9em;
	}
	.im-bubble--tail::before {
		inline-size: 0.7em;
	}
	.im-bubble--tail[data-from='them']::before {
		background-color: var(--im-received);
		border-end-end-radius: 0.8em;
		inset-inline-start: -0.24em;
	}
	.im-bubble--tail[data-from='them']::after {
		border-end-end-radius: 0.5em;
		inset-inline-start: -0.9em;
	}
	.im-bubble--tail[data-from='me']::before {
		background-color: var(--im-sent);
		border-end-start-radius: 0.8em;
		inset-inline-end: -0.24em;
	}
	.im-bubble--tail[data-from='me']::after {
		border-end-start-radius: 0.5em;
		inset-inline-end: -0.9em;
	}

	/* Tapback badge — pink heart on a theme circle, at the bubble's inner-top corner. */
	.im-tapback {
		align-items: center;
		background-color: var(--im-tapback-bg);
		border: 0.14em solid var(--im-page);
		border-radius: 50%;
		color: #ff375f;
		display: flex;
		inset-block-start: -0.85em;
		justify-content: center;
		position: absolute;
		transform-origin: bottom right;
	}
	.im-tapback[data-from='them'] {
		inset-inline-end: -0.55em;
		transform-origin: bottom left;
	}
	.im-tapback[data-from='me'] {
		inset-inline-start: -0.55em;
	}

	/*
	 * Typing indicator — the same received bubble shell (gray + tail, via the
	 * .im-bubble classes), positioned as an absolute overlay in the row so it does
	 * NOT add height: the real bubble keeps its reserved slot, so removing the
	 * indicator never shifts the (centered) card.
	 */
	.im-typing {
		align-items: center;
		display: inline-flex;
		inset-block-start: 0;
		inset-inline-start: 0;
		position: absolute;
		z-index: 1;
	}
	.im-dot {
		background-color: #8e8e93;
		border-radius: 50%;
		display: block;
	}

	.im-receipt {
		color: var(--im-meta);
		font-weight: 500;
		margin-block-start: 0.3em;
		text-align: end;
	}

	.im-inputbar {
		align-items: center;
		border-block-start: 1px solid var(--im-rule);
		display: flex;
	}
	.im-plus {
		align-items: center;
		color: var(--im-meta);
		display: flex;
		flex: 0 0 auto;
		justify-content: center;
		line-height: 1;
	}
	.im-field {
		border: 1px solid var(--im-field-border);
		border-radius: 2em;
		color: var(--im-meta);
		flex: 1 1 auto;
	}

	/* The bubble body inherits the bubble's colour (white on sent, theme on received). */
	.im-bubble :global(.document-body) {
		color: inherit;
	}

	/*
	 * Chromeless (`chrome: 'none'`) — the film-insert mode per ADR-0037. No page
	 * background, no border-radius, no header/timestamp/composer (dropped in the
	 * template): bare bubbles floating directly over footage. The thread keeps
	 * its bottom anchor and width knobs; only the window around it is gone.
	 */
	.imessage--chromeless {
		background-color: transparent;
		border-radius: 0;
		grid-template-rows: 1fr;
	}
	.imessage--chromeless .im-row[data-from='them'] {
		padding-inline-start: calc(var(--group-avatar-size) + var(--group-avatar-gap));
	}
	.im-group-avatar {
		align-items: center;
		background: #8e8e93;
		block-size: var(--group-avatar-size);
		border-radius: 50%;
		color: #ffffff;
		display: flex;
		font-weight: 500;
		inline-size: var(--group-avatar-size);
		inset-block-end: 0;
		inset-inline-start: 0;
		justify-content: center;
		overflow: hidden;
		position: absolute;
	}
	.im-group-avatar img {
		block-size: 100%;
		inline-size: 100%;
		inset: 0;
		object-fit: cover;
		position: absolute;
	}
	.imessage--chromeless .im-row[data-from='them'] .im-typing {
		inset-inline-start: calc(var(--group-avatar-size) + var(--group-avatar-gap));
	}

	/*
	 * Substrate-darken vignette behind the thread. z-index -2 so the tail curls
	 * (z-index -1 within the article's stacking context) still paint ABOVE the
	 * darkening, exactly like the bubbles they belong to.
	 */
	.im-vignette {
		inset: 0;
		pointer-events: none;
		position: absolute;
		z-index: -2;
	}

	/*
	 * Transparent tail curls. The window-mode two-pseudo technique paints its
	 * concave cutout with `background-color: var(--im-page)` — over transparent
	 * footage that is an opaque page-colored block. Chromeless keeps the curl
	 * pseudo's exact window-mode box (0.7em wide, 0.24em past the bubble edge,
	 * rounded bottom-outer corner) and rebuilds "curl pseudo minus cover pseudo"
	 * as two sized background layers with real transparency instead of the
	 * cover-paint: a solid strip fills the join under the bubble's own corner
	 * radius (the visible region the cover never reached), and a 0.5em carve
	 * circle — the cover pseudo's rounded-corner arc, same center, same radius —
	 * cuts the concave curl. The upper strip beside the bubble edge (fully
	 * cover-painted in window mode) stays unpainted. No mask, no filter —
	 * plain gradients the HTML-in-Canvas capture rasterizes faithfully.
	 */
	.imessage--chromeless .im-bubble--tail::after {
		content: none;
	}
	.imessage--chromeless .im-bubble--tail::before {
		background-color: transparent;
		background-repeat: no-repeat;
		/* Reach the bubble's 1.25em corner radius: the solid strip fills the
		   corner cutout so the tail-side edge runs straight into the flick —
		   how real iOS draws the tail-side silhouette (no dimple at the join). */
		block-size: 1.25em;
	}
	/*
	 * Carve-tile geometry: the cover pseudo's rounding only cuts within its
	 * 0.5em corner square (the bottom 0.5em of the tail column) — everything
	 * above that square is covered unconditionally. So the carve tile spans
	 * ONLY that bottom 0.5em (circle centered on its top edge, transparent
	 * inside = the concave curl, bubble color outside = the flick), and the
	 * column above stays unpainted (transparent), exactly like the cover.
	 */
	.imessage--chromeless .im-bubble--tail[data-from='them']::before {
		background-image:
			radial-gradient(0.5em circle at -0.26em 0, transparent 0.49em, var(--im-received) 0.5em),
			linear-gradient(var(--im-received), var(--im-received));
		background-position:
			0 0.75em,
			0.24em 0;
		background-size:
			0.24em 0.5em,
			0.46em 100%;
	}
	.imessage--chromeless .im-bubble--tail[data-from='me']::before {
		background-image:
			radial-gradient(0.5em circle at 0.5em 0, transparent 0.49em, var(--im-sent) 0.5em),
			linear-gradient(var(--im-sent), var(--im-sent));
		background-position:
			0.46em 0.75em,
			0 0;
		background-size:
			0.24em 0.5em,
			0.46em 100%;
	}

	/*
	 * Tapback ring: window mode separates the badge from its bubble with a
	 * page-colored ring — an opaque block over footage. Chromeless keeps the
	 * ring's geometry (identical badge size/position) but cuts it to transparent.
	 */
	.imessage--chromeless .im-tapback {
		border-color: transparent;
	}
</style>
