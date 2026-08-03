import type { AnnotationRenderer, SurfaceRenderer } from './types';
import { isAppearanceSlotPackClaimable } from './identity-registry';
import type { PackManifest } from '$lib/platform/packs/types';
import { resolveTypographyColors } from '$lib/platform/packs/resolve';

import { boxAnnotationRenderer } from '$lib/pipelines/annotations/box';
import { circleAnnotationRenderer } from '$lib/pipelines/annotations/circle';
import { highlightAnnotationRenderer } from '$lib/pipelines/annotations/highlight';
import { isolateAnnotationRenderer } from '$lib/pipelines/annotations/isolate';
import { liftOutAnnotationRenderer } from '$lib/pipelines/annotations/lift-out';
import { magnifyAnnotationRenderer } from '$lib/pipelines/annotations/magnify';
import { sideNoteAnnotationRenderer } from '$lib/pipelines/annotations/side-note';
import { strikeAnnotationRenderer } from '$lib/pipelines/annotations/strike';
import { tearOutAnnotationRenderer } from '$lib/pipelines/annotations/tear-out';
import { underlineAnnotationRenderer } from '$lib/pipelines/annotations/underline';

import { edgeArrowBlockRenderer } from '$lib/pipelines/blocks/edge-arrow';
import { labelBlockRenderer } from '$lib/pipelines/blocks/label';
import { nodeBlockRenderer } from '$lib/pipelines/blocks/node';
import { paragraphBlockRenderer } from '$lib/pipelines/blocks/paragraph';
import { statCalloutBlockRenderer } from '$lib/pipelines/blocks/stat-callout';
import { timelineSegmentBlockRenderer } from '$lib/pipelines/blocks/timeline-segment';

import { chromaticAberrationEffectRenderer } from '$lib/pipelines/effects/chromatic-aberration';
import { clothBendEffectRenderer } from '$lib/pipelines/effects/cloth-bend';
import { crtScreenEffectRenderer } from '$lib/pipelines/effects/crt-screen';
import { crtTubeEffectRenderer } from '$lib/pipelines/effects/crt-tube';
import { ditheringEffectRenderer } from '$lib/pipelines/effects/dithering';
import { flutedGlassEffectRenderer } from '$lib/pipelines/effects/fluted-glass';
import { fluidRippleEffectRenderer } from '$lib/pipelines/effects/fluid-ripple';
import { frostedGlassEffectRenderer } from '$lib/pipelines/effects/frosted-glass';
import { halftoneCmykEffectRenderer } from '$lib/pipelines/effects/halftone-cmyk';
import { halftoneDotsEffectRenderer } from '$lib/pipelines/effects/halftone-dots';
import { heatmapEffectRenderer } from '$lib/pipelines/effects/heatmap';
import { ntscSignalEffectRenderer } from '$lib/pipelines/effects/ntsc-signal';
import { paperGrainEffectRenderer } from '$lib/pipelines/effects/paper-grain';
import { refractiveLensEffectRenderer } from '$lib/pipelines/effects/refractive-lens';
import { tiledDeformationEffectRenderer } from '$lib/pipelines/effects/tiled-deformation';
import { waterEffectRenderer } from '$lib/pipelines/effects/water';
import { achievementOverlayRenderer } from '$lib/pipelines/overlays/achievement';
import { counterOverlayRenderer } from '$lib/pipelines/overlays/counter';
import { cursorTrailOverlayRenderer } from '$lib/pipelines/overlays/cursor-trail';
import { instagramFollowOverlayRenderer } from '$lib/pipelines/overlays/instagram-follow';
import { instanceStackOverlayRenderer } from '$lib/pipelines/overlays/instance-stack';
import { lowerThirdOverlayRenderer } from '$lib/pipelines/overlays/lower-third';
import { text3dOverlayRenderer } from '$lib/pipelines/overlays/text-3d';
import { shaderFillOverlayRenderer } from '$lib/pipelines/overlays/shader-fill';
import { sourceUrlOverlayRenderer } from '$lib/pipelines/overlays/source-url';
import { washiTapeOverlayRenderer } from '$lib/pipelines/overlays/washi-tape';
import { watermarkOverlayRenderer } from '$lib/pipelines/overlays/watermark';
import { youtubeSubscribeOverlayRenderer } from '$lib/pipelines/overlays/youtube-subscribe';

import { chapterCardSurfaceRenderer } from '$lib/pipelines/surfaces/chapter-card';
import { checklistSurfaceRenderer } from '$lib/pipelines/surfaces/checklist';
import { imessageSurfaceRenderer } from '$lib/pipelines/surfaces/imessage';
import { newspaperSurfaceRenderer } from '$lib/pipelines/surfaces/newspaper';
import { paperSurfaceRenderer } from '$lib/pipelines/surfaces/paper';
import { plainSurfaceRenderer } from '$lib/pipelines/surfaces/plain';
import { pullquoteOnPhotoSurfaceRenderer } from '$lib/pipelines/surfaces/pullquote-on-photo';
import { titleSequenceSurfaceRenderer } from '$lib/pipelines/surfaces/title-sequence';
import { typeHeroSurfaceRenderer } from '$lib/pipelines/surfaces/type-hero';
import { webDocumentSurfaceRenderer } from '$lib/pipelines/surfaces/web-document';
import { websiteScreenshotSurfaceRenderer } from '$lib/pipelines/surfaces/website-screenshot';

export const PIPELINE_REGISTRY = {
	surfaces: {
		paper: paperSurfaceRenderer,
		plain: plainSurfaceRenderer,
		newspaper: newspaperSurfaceRenderer,
		pullquoteOnPhoto: pullquoteOnPhotoSurfaceRenderer,
		chapterCard: chapterCardSurfaceRenderer,
		titleSequence: titleSequenceSurfaceRenderer,
		typeHero: typeHeroSurfaceRenderer,
		webDocument: webDocumentSurfaceRenderer,
		websiteScreenshot: websiteScreenshotSurfaceRenderer,
		imessage: imessageSurfaceRenderer,
		checklist: checklistSurfaceRenderer
	} satisfies Record<string, SurfaceRenderer>,
	// Like `overlays`, no `satisfies Record<string, BlockRenderer>` — each
	// renderer is generic over its own Block type, and Component props are
	// contravariant, so the specific renderers don't widen. Consumers narrow
	// by `type`.
	blocks: {
		paragraph: paragraphBlockRenderer,
		node: nodeBlockRenderer,
		edgeArrow: edgeArrowBlockRenderer,
		label: labelBlockRenderer,
		statCallout: statCalloutBlockRenderer,
		timelineSegment: timelineSegmentBlockRenderer
	},
	annotations: {
		highlight: highlightAnnotationRenderer,
		underline: underlineAnnotationRenderer,
		strike: strikeAnnotationRenderer,
		circle: circleAnnotationRenderer,
		box: boxAnnotationRenderer,
		sideNote: sideNoteAnnotationRenderer,
		magnify: magnifyAnnotationRenderer,
		liftOut: liftOutAnnotationRenderer,
		tearOut: tearOutAnnotationRenderer,
		isolate: isolateAnnotationRenderer
	} satisfies Record<string, AnnotationRenderer>,
	overlays: {
		lowerThird: lowerThirdOverlayRenderer,
		washiTape: washiTapeOverlayRenderer,
		watermark: watermarkOverlayRenderer,
		shaderFill: shaderFillOverlayRenderer,
		cursorTrail: cursorTrailOverlayRenderer,
		counter: counterOverlayRenderer,
		instanceStack: instanceStackOverlayRenderer,
		text3d: text3dOverlayRenderer,
		youtubeSubscribe: youtubeSubscribeOverlayRenderer,
		instagramFollow: instagramFollowOverlayRenderer,
		achievement: achievementOverlayRenderer,
		sourceUrl: sourceUrlOverlayRenderer
	},
	effects: {
		paperGrain: paperGrainEffectRenderer,
		chromaticAberration: chromaticAberrationEffectRenderer,
		crtScreen: crtScreenEffectRenderer,
		crtTube: crtTubeEffectRenderer,
		ntscSignal: ntscSignalEffectRenderer,
		dithering: ditheringEffectRenderer,
		halftoneDots: halftoneDotsEffectRenderer,
		halftoneCmyk: halftoneCmykEffectRenderer,
		water: waterEffectRenderer,
		flutedGlass: flutedGlassEffectRenderer,
		refractiveLens: refractiveLensEffectRenderer,
		frostedGlass: frostedGlassEffectRenderer,
		fluidRipple: fluidRippleEffectRenderer,
		clothBend: clothBendEffectRenderer,
		tiledDeformation: tiledDeformationEffectRenderer,
		heatmap: heatmapEffectRenderer
	}
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

/**
 * Resolve the composition's paper/ink AS THE ACTIVE SURFACE PRINTS THEM.
 * Layers ADR-0039 §2 substrate immunity over the ADR-0038 chain: an authored
 * `typography.paperColor` / `inkColor` always wins (composition content);
 * absent, a surface whose `fill` / `ink` slot is immune falls to its own
 * `substrateColors` (the document's physics — newsprint, printer paper) while
 * every other surface falls to the active Pack's core fill/ink-treatment.
 * Every consumer judging or painting the SURFACE body (CanvasSources, rubric
 * contrast lints, highlight dark-surface detection, timeline swatches) must
 * resolve through this; `resolveTypographyColors` alone remains correct only
 * for non-document consumers (captions ink, diagram ink — channel chrome).
 */
export function resolveSurfaceTypographyColors(
	pack: PackManifest,
	surfaceType: string,
	typography: { paperColor?: string; inkColor?: string }
): { paperColor: string; inkColor: string } {
	const substrate = getSurfaceRenderer(surfaceType)?.substrateColors;
	const surfaceKey = `surface:${surfaceType}`;
	const paperImmune = substrate && !isAppearanceSlotPackClaimable(surfaceKey, 'fill');
	const inkImmune = substrate && !isAppearanceSlotPackClaimable(surfaceKey, 'ink');
	const packResolved = resolveTypographyColors(pack, typography);
	return {
		paperColor: typography.paperColor ?? (paperImmune ? substrate.paperHex : packResolved.paperColor),
		inkColor: typography.inkColor ?? (inkImmune ? substrate.inkHex : packResolved.inkColor)
	};
}
