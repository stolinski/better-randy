import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import { NEWSPRINT_INK_HEX, NEWSPRINT_PAPER_HEX } from './newsprint-substrate';
import type { SurfacePipelineDefinition } from '$lib/platform/pipelines/definition-types';

/**
 * Newspaper Surface — a broadsheet page photographed up close (ADR-0056). The
 * frame is a tight crop INTO the page: the sheet overshoots every frame edge,
 * so no silhouette, tear, or card shadow ever exists — the headline, byline,
 * and justified columns bleed off the frame the way a documentary insert of a
 * real newspaper does (`docs/inspo/newspaper/`). Reuses the `paper` Surface's
 * runtime scaffolding (HTML-in-canvas DOM upload + focal-slot composite +
 * marks textures) so highlighter and other annotation marks work identically.
 *
 * Content slots map onto real page furniture: `dateLabel` and `source` print
 * on the folio line above the heavy masthead rule, `kicker` is the section
 * label over the headline, `title` is the grotesque headline, `author` +
 * `affiliation` form the byline, and `body` flows through justified serif
 * columns separated by column rules.
 *
 * The material physics this Surface owes are declared in `./identity.ts` (per
 * ADR-0015) and implemented across the CanvasSource (page geometry, seeded
 * camera tilt, camera push), the paper compositor (fine grain), and the
 * `newspaperPhysics` ShaderPass (mottling, halftone, ink bleed, camera
 * defocus, lens vignette, scan grain — `shader-passes/newspaper-physics.ts`,
 * dispatched between the DOM upload and the effect chain per ADR-0010).
 */

function defaults(): SurfaceState {
	return {
		type: 'newspaper',
		content: {
			kicker: '',
			title: 'Headline',
			author: 'By STAFF WRITER',
			affiliation: '',
			source: '',
			dateLabel: 'Monday, January 1, 2026',
			body: parseAnnotationBodyText('')
		},
		// Camera-landing enter + push-out exit. At a 2.8 s transport this lands
		// 302 ms enter / 238 ms exit, inside G6 (250–400 / 180–280) with the
		// 20 % shorter-than-enter ratio.
		enter: { start: 0, duration: 0.108, ease: 'settled' },
		exit: { start: 0.915, duration: 0.085, ease: 'smooth' }
	};
}

export const newspaperSurfaceDefinition = {
	type: 'newspaper',
	label: 'Newspaper page',
	controls: {
		title: true,
		kicker: true,
		author: true,
		affiliation: true,
		source: true,
		dateLabel: true,
		body: 'optional',
		typography: false,
		paperColor: false,
		inkColor: false,
		backgroundVisibility: false,
		enterExit: true
	},
	defaults,
	// No edge treatment: the page has no silhouette inside the frame (the sheet
	// overshoots every edge), so the shared edge pass would only ever carve the
	// canvas boundary. Intentionally absent — see `identity.ts` § page-crop.
	substrateColors: { paperHex: NEWSPRINT_PAPER_HEX, inkHex: NEWSPRINT_INK_HEX }
} satisfies SurfacePipelineDefinition;
