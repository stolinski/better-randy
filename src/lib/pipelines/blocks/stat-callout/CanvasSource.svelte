<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import type { DiagramStatCallout } from '$lib/platform/engine-schema';
	import { slotMachineRollCounter } from '$lib/pipelines/overlays/counter/variants/slot-machine';

	interface Props {
		block: DiagramStatCallout;
	}

	let { block }: Props = $props();

	// The count rides [rollStart, rollStart + rollWindow] of the clip and then
	// HOLDS the landed value — counter-roll semantics (the counter overlay's
	// proven behaviour), with the window defaulting to the element's own enter
	// start (never a Zod .default(): read with ?? at the consumer).
	const rollStart = $derived(block.rollStart ?? block.enter?.start ?? 0.08);
	const rollWindow = $derived(block.rollWindow ?? 0.5);
	const rollProgress = $derived(
		Math.max(0, Math.min(1, (animState.globalProgress - rollStart) / Math.max(rollWindow, 0.0001)))
	);
	const eased = $derived(slotMachineRollCounter.motionShape(0, rollProgress));
	const currentValue = $derived(block.from + (block.to - block.from) * eased);

	function formatTokens(value: number): string[] {
		switch (block.format ?? 'integer') {
			case 'currency': {
				return `$${Math.round(value).toLocaleString('en-US')}`.split('');
			}
			case 'percent': {
				return `${Math.round(value)}%`.split('');
			}
			case 'timecode': {
				const total = Math.max(0, Math.round(value));
				const min = String(Math.floor(total / 60)).padStart(2, '0');
				const sec = String(total % 60).padStart(2, '0');
				return `${min}:${sec}`.split('');
			}
			default: {
				return Math.round(value).toLocaleString('en-US').split('');
			}
		}
	}

	// Per-digit place-value roll, straight from the counter overlay's audit:
	// vertical slide derived purely from `currentValue` — no CSS transition, no
	// clipped strips (both fail the HTML-in-canvas capture). Frame-deterministic.
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

	function rollOffsetEm(rightIndex: number): number {
		if (rightIndex < 0 || block.format === 'timecode') return 0;
		const place = currentValue / 10 ** rightIndex;
		const frac = place - Math.floor(place);
		// Damp by the remaining roll so every digit settles to EXACTLY 0 at the
		// landing — otherwise a landed value like 97 holds its "9" displaced by
		// frac(9.7) forever (the odometer never closing its carry).
		return -frac * 0.14 * (1 - eased);
	}
</script>

<span class="stat-callout" data-diagram-stat={block.id}>
	<span class="stat-callout__value">
		{#each digitTokens as token, i (i)}
			{#if token.isDigit}
				<!-- Roll offset rides `top`, not transform: a transformed descendant
				     span quantizes the ITEM's exit-fade opacity in the HTML-in-canvas
				     capture (the documented capture-opacity defect family). -->
				<span class="stat-callout__digit" style:top={`${rollOffsetEm(token.rightIndex)}em`}>
					{token.char}
				</span>
			{:else}
				<span class="stat-callout__separator">{token.char}</span>
			{/if}
		{/each}
	</span>
	{#if block.label}
		<span class="stat-callout__label">{block.label}</span>
	{/if}
</span>

<style>
	.stat-callout {
		align-items: center;
		display: inline-flex;
		flex-direction: column;
		gap: calc(0.8 * var(--cqmin));
	}

	/* The number that builds — Pack accent (mount-guaranteed, ADR-0024), tabular mono, big. */
	.stat-callout__value {
		color: var(--accent);
		display: inline-flex;
		font-family: var(--font, 'JetBrains Mono', ui-monospace, monospace);
		font-feature-settings: 'tnum' 1;
		font-size: calc(9 * var(--cqmin));
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		line-height: 1;
	}

	.stat-callout__digit {
		display: inline-block;
		inline-size: 0.62em;
		position: relative;
		text-align: center;
	}

	.stat-callout__separator {
		display: inline-block;
		text-align: center;
	}

	/* Caption under the number — the label voice, composition ink. */
	.stat-callout__label {
		color: var(--ink, currentColor);
		font-family: var(--font, 'JetBrains Mono', ui-monospace, monospace);
		font-size: calc(2.2 * var(--cqmin));
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
</style>
