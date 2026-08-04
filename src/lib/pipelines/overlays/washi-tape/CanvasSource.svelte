<script lang="ts">
	import type { WashiTapeContent } from './index';
	import { WASHI_TAPE_DEFAULTS } from './washi-tape-defaults';

	interface Props {
		content: WashiTapeContent;
	}

	let { content }: Props = $props();

	// Tape width is ~30% of strip length so the aspect matches real washi
	// tape (~15–25 mm wide × 40–80 mm long → ratio 0.25–0.35). At 280 px
	// length that's ~84 px wide — substantial enough to read as something
	// that could actually hold a paper down, not a ribbon or a toothpick.
	const TAPE_WIDTH_RATIO = 0.3;

	const length = $derived(content.length ?? WASHI_TAPE_DEFAULTS.length);
	const rotation = $derived(content.rotation ?? WASHI_TAPE_DEFAULTS.rotation);
	// Authored tint wins; unauthored rides the mount-injected Pack chain —
	// `washi-tape.color` Role (`--color`) → mandatory core accent (`--accent`,
	// always emitted for a validated Pack). Never a baked literal (ADR-0024).
	const color = $derived(content.color ?? 'var(--color, var(--accent))');
	const width = $derived(length * TAPE_WIDTH_RATIO);
</script>

<aside
	class="washi-tape"
	data-overlay="washi-tape"
	style:background-color={color}
	style:block-size={`${width}px`}
	style:inline-size={`${length}px`}
	style:transform={`rotate(${rotation}deg)`}
>
	<span class="washi-tape__grain" aria-hidden="true"></span>
</aside>

<style>
	/*
	 * Washi tape — multiply blend at ~0.6 alpha so the underlying card
	 * texture shows through, plus a procedural grain layer (CSS gradient
	 * stack) so the tape doesn't read as flat plastic.
	 * Reference: docs/aesthetic.md § Collage System / Tape.
	 */
	.washi-tape {
		display: block;
		mix-blend-mode: multiply;
		opacity: 0.6;
		position: relative;
		transform-origin: top left;
		/*
		 * Directional cast shadow (identity-spec `directional-shadow`): a soft
		 * offset shadow along an implied upper-left light so the strip reads as
		 * a physical tape with thickness lifting off the substrate, not a flat
		 * translucent rectangle laid flush. Under multiply blend a dark shadow
		 * darkens the substrate beneath it — exactly a cast shadow. drop-shadow
		 * follows the rotated rectangle's alpha shape (HTML-in-canvas captures
		 * the filter; no layer-promotion opacity<1 trap — the element stays
		 * fully painted, only its blend/opacity composite the result).
		 */
		filter: drop-shadow(0.04em 0.06em 0.05em rgba(20, 16, 8, 0.5));
	}

	/* Grain fibre stops ride optional Pack `washi-tape.grain-dark` / `grain-light`
	   Roles. Neutral fallbacks apply when the active Pack makes no grain claim:
	   achromatic, alpha-only, near-invisible grain that carries no chroma and
	   can't leak a channel's palette. */
	.washi-tape__grain {
		background:
			repeating-linear-gradient(
				90deg,
				transparent 0,
				transparent 3px,
				var(--grain-dark, rgba(0, 0, 0, 0.08)) 3px,
				var(--grain-dark, rgba(0, 0, 0, 0.08)) 4px
			),
			repeating-linear-gradient(
				0deg,
				transparent 0,
				transparent 6px,
				var(--grain-light, rgba(255, 255, 255, 0.06)) 6px,
				var(--grain-light, rgba(255, 255, 255, 0.06)) 7px
			);
		display: block;
		inset: 0;
		position: absolute;
	}
</style>
