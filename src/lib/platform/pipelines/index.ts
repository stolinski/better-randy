import type {
	AnnotationRenderer,
	BlockRenderer,
	SurfaceRenderer
} from './types';

import { box } from '$lib/pipelines/annotations/box';
import { callout } from '$lib/pipelines/annotations/callout';
import { circle } from '$lib/pipelines/annotations/circle';
import { highlight } from '$lib/pipelines/annotations/highlight';
import { isolate } from '$lib/pipelines/annotations/isolate';
import { liftOut } from '$lib/pipelines/annotations/lift-out';
import { magnify } from '$lib/pipelines/annotations/magnify';
import { sideNote } from '$lib/pipelines/annotations/side-note';
import { strike } from '$lib/pipelines/annotations/strike';
import { tearOut } from '$lib/pipelines/annotations/tear-out';
import { underline } from '$lib/pipelines/annotations/underline';

import { paragraph } from '$lib/pipelines/blocks/paragraph';

import { chromaticAberration } from '$lib/pipelines/effects/chromatic-aberration';
import { paperGrain } from '$lib/pipelines/effects/paper-grain';
import { counter } from '$lib/pipelines/overlays/counter';
import { cursorTrail } from '$lib/pipelines/overlays/cursor-trail';
import { instanceStack } from '$lib/pipelines/overlays/instance-stack';
import { lowerThird } from '$lib/pipelines/overlays/lower-third';
import { text3d } from '$lib/pipelines/overlays/text-3d';
import { shaderFill } from '$lib/pipelines/overlays/shader-fill';
import { washiTape } from '$lib/pipelines/overlays/washi-tape';
import { watermark } from '$lib/pipelines/overlays/watermark';

import { chapterCard } from '$lib/pipelines/surfaces/chapter-card';
import { newspaper } from '$lib/pipelines/surfaces/newspaper';
import { paper } from '$lib/pipelines/surfaces/paper';
import { plain } from '$lib/pipelines/surfaces/plain';
import { pullquoteOnPhoto } from '$lib/pipelines/surfaces/pullquote-on-photo';
import { titleSequence } from '$lib/pipelines/surfaces/title-sequence';
import { typeHero } from '$lib/pipelines/surfaces/type-hero';

export const PIPELINE_REGISTRY = {
	surfaces: { paper, plain, newspaper, pullquoteOnPhoto, chapterCard, titleSequence, typeHero } satisfies Record<string, SurfaceRenderer>,
	blocks: { paragraph } satisfies Record<string, BlockRenderer>,
	annotations: {
		highlight,
		underline,
		strike,
		circle,
		box,
		sideNote,
		magnify,
		liftOut,
		tearOut,
		isolate,
		callout
	} satisfies Record<string, AnnotationRenderer>,
	overlays: { lowerThird, washiTape, watermark, shaderFill, cursorTrail, counter, instanceStack, text3d },
	effects: { paperGrain, chromaticAberration }
};

export const REGISTERED_SURFACE_TYPES = Object.values(PIPELINE_REGISTRY.surfaces).map(
	(renderer) => renderer.type
);
export const REGISTERED_OVERLAY_TYPES = Object.values(PIPELINE_REGISTRY.overlays).map(
	(renderer) => renderer.type
);
export const REGISTERED_EFFECT_TYPES = Object.values(PIPELINE_REGISTRY.effects).map(
	(renderer) => renderer.type
);

export function getAnnotationRenderer(style: string): AnnotationRenderer | null {
	for (const renderer of Object.values(PIPELINE_REGISTRY.annotations)) {
		if (renderer.style === style) {
			return renderer;
		}
	}

	return null;
}

export function getSurfaceRenderer(type: string): SurfaceRenderer | null {
	for (const renderer of Object.values(PIPELINE_REGISTRY.surfaces)) {
		if (renderer.type === type) {
			return renderer;
		}
	}

	return null;
}
