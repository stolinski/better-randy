<script lang="ts">
	import { animState } from '$lib/platform/anim-state.svelte';
	import type { Text3dContent } from '../index';
	import { cylinderAxisY } from './cylinder-axis-y';

	interface Props {
		content: Text3dContent;
	}

	let { content }: Props = $props();

	const progress = $derived(animState.globalProgress);
	const chars = $derived(Array.from(content.text));
	const count = $derived(chars.length);

	// Eased spin around the vertical axis (degrees), from the variant's pure
	// motion shape. Each character sits on an equal angular slice of the cylinder.
	const baseRotation = $derived(
		cylinderAxisY.motionShape(
			0,
			count,
			progress,
			content.rotationDegrees,
			content.spinStart ?? 0,
			content.spinWindow ?? 0.42
		)
	);
	const angleStep = $derived(count > 0 ? 360 / Math.max(count, 12) : 0);

	// A vertical-axis cylinder projected to 2D by hand. CSS 3D (perspective,
	// preserve-3d, rotateY/translateZ) is NOT captured by HTML-in-canvas — it
	// rasterizes flat layout, so a 3D rig collapses to nothing. So each glyph's
	// screen position, horizontal foreshortening, depth scale, and front/back
	// visibility are computed from its cylinder angle and applied with capture-safe
	// 2D transforms (translateX + scaleX + scale) and opacity only.
	interface GlyphProjection {
		readonly ch: string;
		readonly xCh: number; // horizontal screen offset from center, in ch
		readonly scaleX: number; // foreshortening as the face turns away
		readonly scale: number; // perspective depth scale (front larger)
		readonly opacity: number; // front-facing lighting
		readonly zIndex: number; // front glyphs paint over back ones
		readonly front: boolean;
	}

	function project(index: number): GlyphProjection {
		const localAngle = (index - (count - 1) / 2) * angleStep;
		const rad = ((localAngle + baseRotation) * Math.PI) / 180;
		const sin = Math.sin(rad);
		const cos = Math.cos(rad);
		const front = cos > 0;
		return {
			ch: chars[index],
			xCh: content.radiusCh * sin,
			scaleX: front ? cos : 0,
			scale: 0.82 + 0.18 * Math.max(0, cos),
			// Ambient + diffuse lighting (not a bare cos opacity fade): a lit
			// cylinder keeps its turned-away faces dimmer but still PRESENT, the
			// way a real surface under fill+key light reads — instead of edge
			// glyphs fading to nothing ("opacity-faded letters, not a lit 3D
			// surface"). Foreshortening (scaleX→0 at the edge) still vanishes a
			// glyph cleanly as it crosses to back, so no pop from the floor.
			opacity: front ? 0.5 + 0.5 * cos : 0,
			zIndex: Math.round((cos + 1) * 100),
			front
		};
	}

	const glyphs = $derived(chars.map((_, i) => project(i)));
</script>

<aside class="text-3d-overlay" data-overlay="text-3d" data-variant="cylinder-axis-y">
	<div class="text-3d-overlay__cylinder">
		{#each glyphs as glyph, i (i)}
			{#if glyph.front}
				<span
					class="text-3d-overlay__glyph"
					data-text-anim-slot={i === 0 ? 'title' : undefined}
					style:transform={`translate(-50%, -50%) translateX(${glyph.xCh}ch) scale(${glyph.scale}) scaleX(${glyph.scaleX})`}
					style:opacity={glyph.opacity}
					style:z-index={glyph.zIndex}
				>{glyph.ch === ' ' ? ' ' : glyph.ch}</span>
			{/if}
		{/each}
	</div>
</aside>

<style>
	.text-3d-overlay {
		font-family: var(--font, 'Inter', 'Helvetica Neue', system-ui, sans-serif);
		font-size: calc(14 * var(--cqmin));
		/* Pack FORM dress (ADR-0023): the display weight (`text-3d.weight`) — the one
		   form lever that fits. No plate → no border/pad/radius; letter-spacing is
		   NOT exposed because each glyph is JS-positioned (translateX in ch) and
		   centre-translated, so tracking would only miscentre the glyphs, not track
		   them; casing is already uppercase. Silent → 800. */
		font-weight: var(--weight, 800);
		letter-spacing: -0.01em;
		line-height: 1;
		text-transform: uppercase;
	}

	.text-3d-overlay__cylinder {
		block-size: 1em;
		inline-size: 1em;
		position: relative;
	}

	.text-3d-overlay__glyph {
		color: var(--ink);
		display: inline-block;
		inset-block-start: 50%;
		inset-inline-start: 50%;
		position: absolute;
		transform-origin: center center;
		white-space: pre;
	}
</style>
