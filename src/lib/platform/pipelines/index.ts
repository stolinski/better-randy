import type {
	AnnotationRenderer,
	SurfaceRenderer
} from './types';

import { box } from '$lib/pipelines/annotations/box';
import { circle } from '$lib/pipelines/annotations/circle';
import { highlight } from '$lib/pipelines/annotations/highlight';
import { isolate } from '$lib/pipelines/annotations/isolate';
import { liftOut } from '$lib/pipelines/annotations/lift-out';
import { magnify } from '$lib/pipelines/annotations/magnify';
import { sideNote } from '$lib/pipelines/annotations/side-note';
import { strike } from '$lib/pipelines/annotations/strike';
import { tearOut } from '$lib/pipelines/annotations/tear-out';
import { underline } from '$lib/pipelines/annotations/underline';

import { edgeArrow } from '$lib/pipelines/blocks/edge-arrow';
import { label } from '$lib/pipelines/blocks/label';
import { node } from '$lib/pipelines/blocks/node';
import { paragraph } from '$lib/pipelines/blocks/paragraph';
import { statCallout } from '$lib/pipelines/blocks/stat-callout';
import { timelineSegment } from '$lib/pipelines/blocks/timeline-segment';

import { chromaticAberration } from '$lib/pipelines/effects/chromatic-aberration';
import { crtScreen } from '$lib/pipelines/effects/crt-screen';
import { dithering } from '$lib/pipelines/effects/dithering';
import { flutedGlass } from '$lib/pipelines/effects/fluted-glass';
import { halftoneCmyk } from '$lib/pipelines/effects/halftone-cmyk';
import { halftoneDots } from '$lib/pipelines/effects/halftone-dots';
import { heatmap } from '$lib/pipelines/effects/heatmap';
import { paperGrain } from '$lib/pipelines/effects/paper-grain';
import { water } from '$lib/pipelines/effects/water';
import { counter } from '$lib/pipelines/overlays/counter';
import { cursorTrail } from '$lib/pipelines/overlays/cursor-trail';
import { instagramFollow } from '$lib/pipelines/overlays/instagram-follow';
import { instanceStack } from '$lib/pipelines/overlays/instance-stack';
import { lowerThird } from '$lib/pipelines/overlays/lower-third';
import { text3d } from '$lib/pipelines/overlays/text-3d';
import { shaderFill } from '$lib/pipelines/overlays/shader-fill';
import { washiTape } from '$lib/pipelines/overlays/washi-tape';
import { watermark } from '$lib/pipelines/overlays/watermark';
import { youtubeSubscribe } from '$lib/pipelines/overlays/youtube-subscribe';

import { chapterCard } from '$lib/pipelines/surfaces/chapter-card';
import { imessage } from '$lib/pipelines/surfaces/imessage';
import { newspaper } from '$lib/pipelines/surfaces/newspaper';
import { paper } from '$lib/pipelines/surfaces/paper';
import { plain } from '$lib/pipelines/surfaces/plain';
import { pullquoteOnPhoto } from '$lib/pipelines/surfaces/pullquote-on-photo';
import { titleSequence } from '$lib/pipelines/surfaces/title-sequence';
import { typeHero } from '$lib/pipelines/surfaces/type-hero';
import { webDocument } from '$lib/pipelines/surfaces/web-document';

export const PIPELINE_REGISTRY = {
	surfaces: { paper, plain, newspaper, pullquoteOnPhoto, chapterCard, titleSequence, typeHero, webDocument, imessage } satisfies Record<string, SurfaceRenderer>,
	// Like `overlays`, no `satisfies Record<string, BlockRenderer>` — each
	// renderer is generic over its own Block type, and Component props are
	// contravariant, so the specific renderers don't widen. Consumers narrow
	// by `type`.
	blocks: { paragraph, node, edgeArrow, label, statCallout, timelineSegment },
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
		isolate
	} satisfies Record<string, AnnotationRenderer>,
	overlays: { lowerThird, washiTape, watermark, shaderFill, cursorTrail, counter, instanceStack, text3d, youtubeSubscribe, instagramFollow },
	effects: { paperGrain, chromaticAberration, crtScreen, dithering, halftoneDots, halftoneCmyk, water, flutedGlass, heatmap }
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
