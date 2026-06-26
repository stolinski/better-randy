<script lang="ts">
	import { annotationBodyPlainText } from '$lib/annotations/annotation-body-text';
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { isDarkSurfaceColor } from '$lib/utils/color';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	import DocumentBody from '../web-document/DocumentBody.svelte';

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
	// A fixed-size phone-ish window sized off the frame HEIGHT, so it never grows
	// with new messages — the conversation fills from the bottom inside it. The
	// aspect is looser than a real phone (chunkier/wider) on purpose: width drives
	// the type size, so a wider window = larger, more legible text at 4K.
	const WINDOW_ASPECT = 1.5; // height / width (a true iPhone is ~2.16)
	const CARD_HEIGHT_RATIO_H = 0.93;
	const CARD_HEIGHT_RATIO_V = 0.94;
	const ENTER_TRAVEL_RATIO = 0.05;

	// Choreography schedule (fractions of the clip). Each message i fully arrives
	// at appearAt(i); a `them` reply (after the first) is preceded by a typing
	// indicator in the TYPING_LEAD window before it.
	const START = 0.07;
	const STEP = 0.18;
	const POP = 0.06;
	const TYPING_LEAD = 0.1;

	const frame = $derived(getVideoFrameSize(engineState.transport.orientation));
	const isVertical = $derived(frame.height > frame.width);
	const content = $derived(engineState.surface.content);
	const messages = $derived(content.messages ?? []);
	const contact = $derived((content.author ?? '').trim());
	const contactInitial = $derived(contact.charAt(0).toUpperCase() || '?');
	const theme = $derived(isDarkSurfaceColor(engineState.typography?.paperColor ?? '#ffffff') ? 'dark' : 'light');
	const p = $derived(Math.max(0, Math.min(1, animState.globalProgress)));

	const layout = $derived.by(() => {
		const heightRatio = isVertical ? CARD_HEIGHT_RATIO_V : CARD_HEIGHT_RATIO_H;
		let height = frame.height * heightRatio;
		let width = height / WINDOW_ASPECT;
		// Don't let the window get wider than the frame's safe width.
		const maxWidth = frame.width * (isVertical ? 0.92 : 0.56);
		if (width > maxWidth) {
			width = maxWidth;
			height = width * WINDOW_ASPECT;
		}
		const x = Math.round((frame.width - width) / 2);
		const visibility = Math.max(0, Math.min(1, animState.paperVisibility));
		const enterOffsetPx = Math.round((1 - visibility) * frame.height * ENTER_TRAVEL_RATIO);
		return { x, width, height, enterOffsetPx, visibility };
	});

	const bodyFontPx = $derived(layout.width * 0.046);
	const nameFontPx = $derived(layout.width * 0.034);
	const metaFontPx = $derived(layout.width * 0.03);
	const avatarPx = $derived(layout.width * 0.088);
	const iconPx = $derived(layout.width * 0.058);
	const inputFontPx = $derived(layout.width * 0.042);

	const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
	function easeOutBack(t: number): number {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
	}
	const appearAt = (i: number): number => START + i * STEP;

	function bubbleStyle(i: number): { opacity: number; scale: number } {
		const local = clamp01((p - appearAt(i)) / POP);
		// Opacity is binary at appearAt (the bubble pops in opaque, scale-only) so
		// there is no blank gap at the typing→bubble handoff; the spring carries
		// the motion.
		return { opacity: p >= appearAt(i) ? 1 : 0, scale: 0.6 + 0.4 * easeOutBack(local) };
	}
	function isTyping(i: number, from: 'me' | 'them'): boolean {
		if (from !== 'them' || i === 0) {
			return false;
		}
		return p >= appearAt(i) - TYPING_LEAD && p < appearAt(i);
	}
	function dotOpacity(k: number): number {
		return 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (p * 26 + k * 0.16)));
	}
	function tapbackScale(i: number): number {
		const local = clamp01((p - (appearAt(i) + 0.05)) / 0.05);
		return local <= 0 ? 0 : Math.max(0, easeOutBack(local));
	}
	function receiptLabel(i: number, status: 'delivered' | 'read'): string {
		if (status === 'read' && p >= appearAt(i) + 0.14) {
			return 'Read';
		}
		return p >= appearAt(i) + 0.05 ? 'Delivered' : '';
	}
	// A bubble shows its tail only when it's the last in a consecutive same-sender
	// run (iMessage grouping); group starts get extra spacing above.
	const showTail = (i: number): boolean => i === messages.length - 1 || messages[i + 1]?.from !== messages[i].from;
	const startsGroup = (i: number): boolean => i === 0 || messages[i - 1]?.from !== messages[i].from;

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
	data-theme={theme}
	style:inline-size={`${layout.width}px`}
	style:block-size={`${layout.height}px`}
	style:left={`${layout.x}px`}
	style:transform={`translateY(calc(-50% + ${layout.enterOffsetPx}px))`}
	style:opacity={layout.visibility}
>
	<!-- Messages conversation header. -->
	<header class="im-header" style:padding={`${layout.width * 0.02}px ${layout.width * 0.028}px`}>
		<span class="im-header-side" aria-hidden="true"></span>
		<span class="im-contact" style:gap={`${layout.width * 0.004}px`}>
			<span
				class="im-avatar"
				style:inline-size={`${avatarPx}px`}
				style:block-size={`${avatarPx}px`}
				style:font-size={`${avatarPx * 0.5}px`}
				aria-hidden="true">{contactInitial}</span
			>
			<span class="im-name" style:font-size={`${nameFontPx}px`}>{contact} ›</span>
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

	<!-- Thread: every bubble reserves space; visibility is scheduled. -->
	<div class="im-thread" style:padding={`${layout.width * 0.028}px ${layout.width * 0.03}px`}>
		<div class="im-timestamp" style:font-size={`${metaFontPx}px`}>
			<span>Today</span> 2:14 PM
		</div>

		{#each messages as message, i (i)}
			{@const style = bubbleStyle(i)}
			{@const typing = isTyping(i, message.from)}
			<div
				class="im-row"
				data-from={message.from}
				style:margin-block-start={`${startsGroup(i) ? layout.width * 0.018 : layout.width * 0.005}px`}
			>
				{#if typing}
					<div
						class="im-bubble im-bubble--tail im-typing"
						data-from="them"
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
				<div class="im-bubblewrap">
					<div
						class="im-bubble"
						class:im-bubble--tail={showTail(i)}
						data-from={message.from}
						style:font-size={`${bodyFontPx}px`}
						style:padding={`${bodyFontPx * 0.44}px ${bodyFontPx * 0.66}px`}
						style:opacity={typing ? 0 : style.opacity}
						style:transform={`scale(${typing ? 0.6 : style.scale})`}
					>
						{#key annotationBodyPlainText(message.text)}
							<DocumentBody body={message.text} fontSize={bodyFontPx} />
						{/key}
					</div>
					{#if message.tapback}
						<span
							class="im-tapback"
							data-from={message.from}
							style:inline-size={`${bodyFontPx * 1.6}px`}
							style:block-size={`${bodyFontPx * 1.6}px`}
							style:font-size={`${bodyFontPx * 0.78}px`}
							style:transform={`scale(${tapbackScale(i)})`}>{TAPBACK_GLYPH[message.tapback]}</span
						>
					{/if}
				</div>
				{#if message.from === 'me' && message.status && receiptLabel(i, message.status)}
					<div class="im-receipt" style:font-size={`${metaFontPx}px`}>
						{receiptLabel(i, message.status)}
					</div>
				{/if}
			</div>
		{/each}
	</div>

	<!-- Composer bar — the modern Messages tell. -->
	<div class="im-inputbar" style:padding={`${layout.width * 0.018}px ${layout.width * 0.026}px`} style:gap={`${layout.width * 0.016}px`}>
		<span class="im-plus" style:inline-size={`${iconPx}px`} style:block-size={`${iconPx}px`} style:font-size={`${iconPx * 0.8}px`} aria-hidden="true">+</span>
		<span class="im-field" style:font-size={`${inputFontPx}px`} style:padding={`${inputFontPx * 0.5}px ${inputFontPx * 0.8}px`}>iMessage</span>
	</div>
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
</style>
