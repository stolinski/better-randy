<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import type { CounterContent } from '../index';

	interface Props {
		content: CounterContent;
	}

	let { content }: Props = $props();

	const progress = $derived(animState.globalProgress);

	function easeInOut(t: number): number {
		const c = Math.max(0, Math.min(1, t));
		return c * c * (3 - 2 * c);
	}

	const t = $derived(easeInOut(progress));
	const currentValue = $derived(content.from + (content.to - content.from) * t);

	function formatTokens(value: number): string[] {
		switch (content.format) {
			case 'currency': {
				const rounded = Math.round(value);
				const str = `$${rounded.toLocaleString('en-US')}`;
				return str.split('');
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

	const tokens = $derived(formatTokens(currentValue));

	// Per-digit slot-machine offset — a fractional digit position drives a
	// vertical roll on its strip. A whole digit is the height of one slot;
	// fractional advance translates the strip proportionally.
	const fractional = $derived(currentValue - Math.floor(currentValue));
</script>

<aside class="counter-overlay" data-overlay="counter" data-variant="slot-machine-roll">
	{#each tokens as token, i (i)}
		{#if /[0-9]/.test(token)}
			<span class="counter-overlay__slot">
				<span
					class="counter-overlay__strip"
					style:transform={`translateY(${-(Number(token) + fractional) * 100}%)`}
				>
					{#each Array.from({ length: 12 }, (_, k) => k % 10) as digit, k (k)}
						<span class="counter-overlay__digit">{digit}</span>
					{/each}
				</span>
			</span>
		{:else}
			<span class="counter-overlay__separator">{token}</span>
		{/if}
	{/each}
</aside>

<style>
	.counter-overlay {
		color: var(--ink, #fffaf2);
		display: inline-flex;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		font-feature-settings: 'tnum' 1;
		font-size: 12cqmin;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		gap: 0;
		line-height: 1;
		overflow: hidden;
	}

	.counter-overlay__slot {
		display: inline-block;
		height: 1em;
		inline-size: 0.62em;
		overflow: hidden;
		position: relative;
		vertical-align: top;
	}

	.counter-overlay__strip {
		display: flex;
		flex-direction: column;
		position: absolute;
		inset-block-start: 0;
		inset-inline-start: 0;
		transition: transform 80ms linear;
	}

	.counter-overlay__digit {
		block-size: 1em;
		display: block;
		inline-size: 0.62em;
		text-align: center;
	}

	.counter-overlay__separator {
		display: inline-block;
		text-align: center;
	}
</style>
