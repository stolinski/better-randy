import { z } from 'zod';

import type { OverlayDefaults, OverlayRenderer } from '$lib/platform/pipelines/types';

import CanvasSource from './CanvasSource.svelte';
import Editor from './Editor.svelte';

/**
 * Washi-tape Overlay (ADR-0009).
 *
 *   - `color`    optional authored tint override. Absent, the tape wears the
 *                active Pack: `washi-tape.color` Role → mandatory core accent
 *                (`var(--color, var(--accent))` via the mount's appearance
 *                vars — no baked literal makes one Pack a de facto base,
 *                ADR-0024; syntax claims its highlighter yellow #fabf47).
 *                Multiply blended at ~0.6 alpha against whatever sits behind
 *                so the tape reads as semi-translucent paper, not a printed
 *                sticker.
 *   - `rotation` degrees, ±5–25° per docs/aesthetic.md § Collage System / Tape
 *                (the aesthetic doc's "5–25°" is magnitude — tape can be applied
 *                at either diagonal). Schema-bounded but not seeded — the slight
 *                rotation is a deliberate authoring choice per overlay instance.
 *   - `length`   strip length in pixels at 4K (mapped via composition's
 *                native frame width). Width is fixed by aesthetic ratio.
 */
const DEFAULT_ROTATION_DEG = 25;
const DEFAULT_LENGTH_PX = 280;
const ROTATION_MIN_DEG = 5;
const ROTATION_MAX_DEG = 25;

const WashiTapeContentSchema = z.object({
	color: z.string().optional(),
	rotation: z.number().min(-ROTATION_MAX_DEG).max(ROTATION_MAX_DEG).optional(),
	length: z.number().positive().optional()
});

export type WashiTapeContent = z.infer<typeof WashiTapeContentSchema>;

function defaults(): OverlayDefaults<WashiTapeContent> {
	return {
		// `color` is deliberately unauthored: a fresh tape wears the active
		// Pack's tint chain until the author overrides it.
		content: {
			rotation: DEFAULT_ROTATION_DEG,
			length: DEFAULT_LENGTH_PX
		},
		// Top-left corner of the card is the canonical placement; the offset
		// here is fractional-of-composition (0.15, 0.25) which lands on the
		// 70%-width × 50%-height card's top-left at 4K when centred. Override
		// per preset if the card geometry changes.
		position: { anchor: 'top-left', offset: { x: 0.15, y: 0.25 } },
		enter: { start: 0.04, duration: 0.108, ease: 'settled' },
		exit: { start: 0.915, duration: 0.085, ease: 'smooth' }
	};
}

export const washiTapeOverlayRenderer: OverlayRenderer<WashiTapeContent> = {
	type: 'washi-tape',
	label: 'Washi tape',
	schema: WashiTapeContentSchema,
	defaults,
	CanvasSource,
	Editor
};

export const WASHI_TAPE_DEFAULTS = {
	rotation: DEFAULT_ROTATION_DEG,
	length: DEFAULT_LENGTH_PX,
	rotationMin: ROTATION_MIN_DEG,
	rotationMax: ROTATION_MAX_DEG
} as const;
