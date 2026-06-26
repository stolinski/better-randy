<script lang="ts">
	import { annotationBodyPlainText } from '$lib/annotations/annotation-body-text';
	import { animState } from '$lib/platform/anim-state.svelte';
	import { engineState } from '$lib/platform/engine-state.svelte';
	import { getVideoFrameSize } from '$lib/utils/video-frame';

	import DocumentBody from '../web-document/DocumentBody.svelte';

	interface Props {
		element?: HTMLElement | null;
	}

	let { element = $bindable<HTMLElement | null>(null) }: Props = $props();

	// A transparent-overlay iMessage thread: white card, centred. The whole
	// conversation is choreographed off the global timeline progress so it is
	// frame-deterministic (preview == export). Every bubble reserves its final
	// space from frame 0, so nothing reflows as messages arrive — the highlight
	// mark stays pinned to its phrase. NO CSS filter/glow (it pixelates the
	// HTML-in-Canvas capture). See docs/adr/0031-imessage-interactive-surface.md.
	const CARD_WIDTH_RATIO_H = 0.52;
	const CARD_WIDTH_RATIO_V = 0.9;
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
	const p = $derived(Math.max(0, Math.min(1, animState.globalProgress)));

	const layout = $derived.by(() => {
		const widthRatio = isVertical ? CARD_WIDTH_RATIO_V : CARD_WIDTH_RATIO_H;
		const width = frame.width * widthRatio;
		const x = Math.round((frame.width - width) / 2);
		const visibility = Math.max(0, Math.min(1, animState.paperVisibility));
		const enterOffsetPx = Math.round((1 - visibility) * frame.height * ENTER_TRAVEL_RATIO);
		return { x, width, enterOffsetPx, visibility };
	});

	const bodyFontPx = $derived(layout.width * 0.038);
	const nameFontPx = $derived(layout.width * 0.022);
	const metaFontPx = $derived(layout.width * 0.02);
	const avatarPx = $derived(layout.width * 0.07);
	const chevronPx = $derived(layout.width * 0.05);
	const iconPx = $derived(layout.width * 0.04);

	const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));
	function easeOutBack(t: number): number {
		const c1 = 1.70158;
		const c3 = c1 + 1;
		return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
	}
	const appearAt = (i: number): number => START + i * STEP;

	// Per-message visual state at the current progress.
	function bubbleStyle(i: number): { opacity: number; scale: number } {
		const local = clamp01((p - appearAt(i)) / POP);
		return { opacity: clamp01(local * 1.6), scale: 0.6 + 0.4 * easeOutBack(local) };
	}
	function isTyping(i: number, from: 'me' | 'them'): boolean {
		if (from !== 'them' || i === 0) {
			return false;
		}
		return p >= appearAt(i) - TYPING_LEAD && p < appearAt(i);
	}
	// Three-dot wave for the typing indicator, phased per dot off progress.
	function dotOpacity(k: number): number {
		return 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(2 * Math.PI * (p * 26 + k * 0.16)));
	}
	function tapbackScale(i: number): number {
		const local = clamp01((p - (appearAt(i) + 0.05)) / 0.05);
		return local <= 0 ? 0 : 0.4 + 0.6 * easeOutBack(local);
	}
	function receiptLabel(i: number, status: 'delivered' | 'read'): string {
		if (status === 'read' && p >= appearAt(i) + 0.14) {
			return 'Read';
		}
		return p >= appearAt(i) + 0.05 ? 'Delivered' : '';
	}

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
	style:inline-size={`${layout.width}px`}
	style:left={`${layout.x}px`}
	style:transform={`translateY(calc(-50% + ${layout.enterOffsetPx}px))`}
	style:opacity={layout.visibility}
>
	<!-- iOS Messages conversation header. -->
	<header class="im-header" style:padding={`${layout.width * 0.022}px ${layout.width * 0.03}px`}>
		<span class="im-back" style:font-size={`${chevronPx}px`} aria-hidden="true">‹</span>
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
	<div class="im-thread" style:padding={`${layout.width * 0.03}px`} style:gap={`${layout.width * 0.016}px`}>
		<div class="im-timestamp" style:font-size={`${metaFontPx}px`}>
			<span>Today</span> 2:14 PM
		</div>

		{#each messages as message, i (i)}
			{@const style = bubbleStyle(i)}
			{@const typing = isTyping(i, message.from)}
			<div class="im-row" data-from={message.from}>
				{#if typing}
					<div class="im-typing" style:padding={`${bodyFontPx * 0.55}px ${bodyFontPx * 0.7}px`}>
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
				<div
					class="im-bubble"
					data-from={message.from}
					style:font-size={`${bodyFontPx}px`}
					style:padding={`${bodyFontPx * 0.42}px ${bodyFontPx * 0.62}px`}
					style:opacity={typing ? 0 : style.opacity}
					style:transform={`scale(${typing ? 0.6 : style.scale})`}
				>
					{#key annotationBodyPlainText(message.text)}
						<DocumentBody body={message.text} fontSize={bodyFontPx} />
					{/key}
					{#if message.tapback}
						<span
							class="im-tapback"
							data-from={message.from}
							style:inline-size={`${bodyFontPx * 1.5}px`}
							style:block-size={`${bodyFontPx * 1.5}px`}
							style:font-size={`${bodyFontPx * 0.8}px`}
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
</article>

<style>
	/*
	 * iMessage thread — iOS Messages (light). The card is the only opaque element;
	 * the frame around it stays transparent. Palette: page #ffffff · received
	 * #e9e9eb (black text) · sent #0b93f6 (white text) · header rule #d1d1d6 ·
	 * meta #8e8e93 · accent #0a84ff. The hero highlight lands on a received
	 * (gray, dark-ink) bubble so the multiply blend stays readable.
	 */
	.imessage {
		--im-page: #ffffff;
		--im-received: #e9e9eb;
		--im-sent: #0b93f6;
		--im-rule: #d1d1d6;
		--im-meta: #8e8e93;
		background-color: var(--im-page);
		border-radius: 1.4em;
		box-sizing: border-box;
		color: #000000;
		display: grid;
		font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
		grid-template-rows: auto 1fr;
		overflow: hidden;
		position: absolute;
		top: 50%;
		transform-origin: center;
	}

	.im-header {
		align-items: center;
		background-color: #f7f7f7cc;
		border-block-end: 1px solid var(--im-rule);
		display: grid;
		grid-template-columns: 1fr auto 1fr;
	}
	.im-back {
		color: #0a84ff;
		font-weight: 500;
		justify-self: start;
		line-height: 0.6;
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
		color: #000000;
		font-weight: 500;
	}
	.im-facetime {
		display: block;
		justify-self: end;
	}

	.im-thread {
		align-content: start;
		display: grid;
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
	}
	.im-row[data-from='me'] {
		justify-items: end;
	}

	.im-bubble {
		border-radius: 1.1em;
		line-height: 1.3;
		max-inline-size: 74%;
		position: relative;
		transform-origin: bottom left;
		inline-size: fit-content;
	}
	.im-bubble[data-from='them'] {
		background-color: var(--im-received);
		border-end-start-radius: 0.3em;
		color: #000000;
	}
	.im-bubble[data-from='me'] {
		background-color: var(--im-sent);
		border-end-end-radius: 0.3em;
		color: #ffffff;
		transform-origin: bottom right;
	}
	/* Tail curls (classic two-pseudo technique), scaled in em. */
	.im-bubble::before {
		block-size: 0.85em;
		content: '';
		inline-size: 0.7em;
		position: absolute;
		inset-block-end: 0;
		z-index: -1;
	}
	.im-bubble::after {
		background-color: var(--im-page);
		block-size: 0.85em;
		content: '';
		inline-size: 0.9em;
		position: absolute;
		inset-block-end: 0;
		z-index: -1;
	}
	.im-bubble[data-from='them']::before {
		background-color: var(--im-received);
		border-end-end-radius: 0.8em;
		inset-inline-start: -0.24em;
	}
	.im-bubble[data-from='them']::after {
		border-end-end-radius: 0.5em;
		inset-inline-start: -0.9em;
	}
	.im-bubble[data-from='me']::before {
		background-color: var(--im-sent);
		border-end-start-radius: 0.8em;
		inset-inline-end: -0.24em;
	}
	.im-bubble[data-from='me']::after {
		border-end-start-radius: 0.5em;
		inset-inline-end: -0.9em;
	}

	.im-tapback {
		align-items: center;
		background-color: var(--im-received);
		border: 0.12em solid var(--im-page);
		border-radius: 50%;
		color: #ff3b30;
		display: flex;
		inset-block-start: -0.7em;
		inset-inline-start: -0.5em;
		justify-content: center;
		position: absolute;
		transform-origin: bottom right;
	}
	.im-tapback[data-from='me'] {
		inset-inline-end: -0.5em;
		inset-inline-start: auto;
		transform-origin: bottom left;
	}

	.im-typing {
		align-items: center;
		background-color: var(--im-received);
		border-end-start-radius: 0.3em;
		border-radius: 1.1em;
		display: inline-flex;
		gap: 0.28em;
		inline-size: fit-content;
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

	/* The bubble body inherits the bubble's font + colour (white on sent). */
	.im-bubble :global(.document-body) {
		color: inherit;
	}
</style>
