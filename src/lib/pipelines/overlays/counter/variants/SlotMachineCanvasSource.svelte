<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import type { CounterContent } from '../index';
	import { slotMachineRollCounter } from './slot-machine';

	interface Props {
		content: CounterContent;
	}

	let { content }: Props = $props();

	// The roll lands on its target by ROLL_END of the timeline and then HOLDS
	// the milestone, instead of rolling right up to the final frame (which never
	// shows the landed value — the whole point of a milestone counter is the
	// payoff hold). Compressing globalProgress into [0, ROLL_END] makes the count
	// reach `to` at ROLL_END and stay there through the overlay's exit, so the
	// settled number is on screen for a beat. motionShape's ease-out still
	// decelerates the roll into the landing.
	const ROLL_END = 0.78;
	const rollProgress = $derived(Math.min(1, animState.globalProgress / ROLL_END));
	const eased = $derived(slotMachineRollCounter.motionShape(0, rollProgress));
	const currentValue = $derived(content.from + (content.to - content.from) * eased);

	function formatTokens(value: number): string[] {
		switch (content.format) {
			case 'currency': {
				const rounded = Math.round(value);
				return `$${rounded.toLocaleString('en-US')}`.split('');
			}
			case 'percent': {
				const rounded = Math.round(value);
				return `${rounded}%`.split('');
			}
			case 'timecode': {
				const total = Math.max(0, Math.round(value));
				const min = String(Math.floor(total / 60)).padStart(2, '0');
				const sec = String(total % 60).padStart(2, '0');
				return `${min}:${sec}`.split('');
			}
			case 'integer':
			default: {
				const rounded = Math.round(value);
				return rounded.toLocaleString('en-US').split('');
			}
		}
	}

	// Each token carries its right-anchored digit index (separators excluded) so a
	// digit's roll speed scales with its place value: the ones place rolls fast,
	// high places barely move. The vertical slide is derived purely from
	// `currentValue` — no CSS transition, no clipped/absolute strips (both fail
	// the HTML-in-canvas capture; see the counter render audit). Preview and
	// export resolve to identical pixels at the same `progress`.
	interface DigitToken {
		readonly char: string;
		readonly isDigit: boolean;
		readonly rightIndex: number;
	}

	const digitTokens = $derived.by<DigitToken[]>(() => {
		const tokens = formatTokens(currentValue);
		let digitsToRight = 0;
		const out: DigitToken[] = new Array(tokens.length);
		for (let i = tokens.length - 1; i >= 0; i -= 1) {
			const char = tokens[i];
			const isDigit = /[0-9]/.test(char);
			out[i] = { char, isDigit, rightIndex: isDigit ? digitsToRight : -1 };
			if (isDigit) digitsToRight += 1;
		}
		return out;
	});

	// Fractional part of this digit's place value, in em of vertical slide. Only
	// the actively-changing low places move perceptibly; everything settles to 0
	// as the count completes.
	function rollOffsetEm(rightIndex: number): number {
		if (rightIndex < 0 || content.format === 'timecode') return 0;
		const place = currentValue / 10 ** rightIndex;
		const frac = place - Math.floor(place);
		return -frac * 0.14;
	}
</script>

<aside class="counter-overlay" data-overlay="counter" data-variant="slot-machine-roll">
	{#each digitTokens as token, i (i)}
		{#if token.isDigit}
			<span
				class="counter-overlay__digit"
				data-text-anim-slot={i === 0 ? 'title' : undefined}
				style:transform={`translateY(${rollOffsetEm(token.rightIndex)}em)`}
			>
				{token.char}
			</span>
		{:else}
			<span class="counter-overlay__separator">{token.char}</span>
		{/if}
	{/each}
</aside>

<style>
	.counter-overlay {
		color: var(--ink, #fabf47);
		display: inline-flex;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-feature-settings: 'tnum' 1;
		font-size: calc(12 * var(--cqmin));
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		gap: 0;
		line-height: 1;
	}

	.counter-overlay__digit {
		display: inline-block;
		inline-size: 0.62em;
		text-align: center;
	}

	.counter-overlay__separator {
		display: inline-block;
		text-align: center;
	}
</style>
