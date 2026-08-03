import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import { createPaperPipeline } from '$lib/pipelines/surfaces/paper/pipeline';
import type { SurfaceRenderInstance, SurfaceRenderer } from '$lib/platform/pipelines/types';
import { newspaperPhysics } from '$lib/pipelines/shader-passes/newspaper-physics';

import CanvasSource from './CanvasSource.svelte';
import {
	NEWSPRINT_EDGE_TREATMENT,
	NEWSPRINT_INK_HEX,
	NEWSPRINT_PAPER_HEX
} from './newsprint-substrate';

/**
 * Newspaper Surface — aged newsprint clipping. Reuses the `paper` Surface's
 * runtime scaffolding (HTML-in-canvas DOM upload + focal-slot composite +
 * marks textures + drop shadow) so focal annotations and decorative marks
 * work identically. The eight material physics dimensions this Surface owes
 * are declared in `./identity.ts` (per ADR-0015) and implemented as follows:
 *
 *   - **CanvasSource HTML/CSS** — intrinsic newsprint substrate
 *     (`newsprint-substrate.ts`, ADR-0039 §2 partial immunity: sheet/ink/
 *     print/tear are document physics), condensed serif body, heavy
 *     slab/serif display, Pack-claimable mono kicker chip
 *     (`newspaper.accent` / `.kicker-ink`), mono byline + dateline, 1–3°
 *     seeded camera rotation (dim 6 `surface-rotation`). The Pack's
 *     claimable `newspaper.depth` shadow is synthesized by the shared edge
 *     pass against the intrinsic torn silhouette (coexists with the
 *     Pipeline-side `edge-occlusion-shadow`).
 *   - **`shaderPass: newspaperPhysics`** — single fragment pass running
 *     between the surface's DOM upload and the effect chain via the
 *     ShaderPassDispatcher (ADR-0010). Implements dims 1–5, 7, 8 in one
 *     pass — newsprint mottling, halftone screen, ink bleed, edge
 *     occlusion shadow, optical misregistration, camera defocus, lens
 *     vignette. WGSL at `shader-passes/newspaper-physics.ts`; the
 *     saturation-based mask skips overlay pixels (washi tape, kicker
 *     chips) for the substrate-only dimensions.
 *
 * Identity Spec contract: see `./identity.ts`. Wave 6 wires the engine-side
 * registration validator that refuses Pipelines whose dimensions are not
 * all implemented and probed.
 */

function defaults(): SurfaceState {
	return {
		type: 'newspaper',
		content: {
			kicker: 'SECTION',
			title: 'Headline',
			author: 'BY STAFF',
			dateLabel: 'JAN 01 2026',
			body: parseAnnotationBodyText('')
		},
		// Tear-on enter + smooth exit. At a 2.8 s transport this lands
		// 302 ms enter / 238 ms exit, inside G6 (250–400 / 180–280) with
		// the 20 % shorter-than-enter ratio.
		enter: { start: 0, duration: 0.108, ease: 'settled' },
		exit: { start: 0.915, duration: 0.085, ease: 'smooth' }
	};
}

export const newspaperSurfaceRenderer: SurfaceRenderer = {
	type: 'newspaper',
	label: 'Newspaper clipping',
	controls: {
		title: true,
		kicker: true,
		author: true,
		dateLabel: true,
		body: 'optional',
		typography: false,
		paperColor: false,
		inkColor: false,
		backgroundVisibility: false,
		enterExit: true
	},
	CanvasSource,
	defaults,
	shaderPass: newspaperPhysics,
	// The clipping's outer silhouette runs the shared edge pass BEFORE
	// newspaperPhysics so the edge-occlusion shadow and defocus operate on the
	// treated silhouette. Since ADR-0039 §2 the cut character is document
	// physics — the intrinsic tear below applies under EVERY pack (the `edge`
	// slot is absent from the Identity Spec's claimable list), replacing the
	// retired `newspaper.edge` Role.
	edgeTreatment: true,
	intrinsicEdgeTreatment: NEWSPRINT_EDGE_TREATMENT,
	substrateColors: { paperHex: NEWSPRINT_PAPER_HEX, inkHex: NEWSPRINT_INK_HEX },
	createPipeline(opts): SurfaceRenderInstance {
		return createPaperPipeline(opts);
	}
};
