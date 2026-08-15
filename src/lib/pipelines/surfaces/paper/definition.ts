import type { SurfaceState } from '$lib/platform/engine-schema';
import { parseAnnotationBodyText } from '$lib/annotations/annotation-body-text';
import { PAPER_INK_HEX, PAPER_SHEET_HEX } from './paper-substrate';
import type { SurfacePipelineDefinition } from '$lib/platform/pipelines/definition-types';

function defaults(): SurfaceState {
	return {
		type: 'paper',
		content: {
			title: 'Untitled paper',
			sourceUrl: '',
			body: parseAnnotationBodyText('')
		},
		enter: { start: 0, duration: 0.18, ease: 'settled' },
		exit: { start: 0.82, duration: 0.18, ease: 'smooth' }
	};
}

export const paperSurfaceDefinition = {
	type: 'paper',
	label: 'Paper',
	controls: {
		title: true,
		sourceUrl: true,
		author: true,
		affiliation: true,
		source: true,
		dateLabel: true,
		bodyLabel: true,
		body: 'always',
		typography: true,
		paperColor: true,
		inkColor: true,
		backgroundVisibility: true,
		enterExit: true
	},
	defaults,
	// Substrate immunity (ADR-0039 §2): the sheet/ink an unauthored
	// composition prints — never the active Pack's cores.
	substrateColors: { paperHex: PAPER_SHEET_HEX, inkHex: PAPER_INK_HEX }
} satisfies SurfacePipelineDefinition;
