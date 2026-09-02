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
 * columns separated by column rules. The title accepts the same bracket-tag
 * mark syntax as the body (`titleMarks`), so a highlighter can sweep the
 * headline the way the direction plate's does; its marks index before the
 * body's in `marks.timings[]`.
 *
 * No enter or exit: the page is a cut, a locked-off shot that only carries the
 * slow camera push. The sugar would have nothing to move (`enterExit: false`),
 * so the controls stay hidden rather than inert.
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
		}
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
		enterExit: false
	},
	defaults,
	titleMarks: true,
	// No edge treatment: the page has no silhouette inside the frame (the sheet
	// overshoots every edge), so the shared edge pass would only ever carve the
	// canvas boundary. Intentionally absent — see `identity.ts` § page-crop.
	substrateColors: { paperHex: NEWSPRINT_PAPER_HEX, inkHex: NEWSPRINT_INK_HEX }
} satisfies SurfacePipelineDefinition;
