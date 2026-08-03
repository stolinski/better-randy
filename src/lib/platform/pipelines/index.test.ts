import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

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
import { shaderFillOverlayRenderer } from '$lib/pipelines/overlays/shader-fill';
import { sourceUrlOverlayRenderer } from '$lib/pipelines/overlays/source-url';
import { text3dOverlayRenderer } from '$lib/pipelines/overlays/text-3d';
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
import { syntaxPack } from '$lib/packs/syntax/manifest';
import { PACK_REGISTRY } from '$lib/platform/packs/registry';

import { PIPELINE_REGISTRY, resolveSurfaceTypographyColors } from './index';
import {
	IDENTITY_REGISTRY,
	PACK_IMMUNE_PIPELINE_KEYS,
	filterPackAppearanceVarsForImmunity,
	isAppearanceSlotPackClaimable,
	isPackImmune,
	validateIdentityRegistry
} from './identity-registry';

const EXPECTED_PIPELINE_TYPE_IDS = [
	'paper',
	'plain',
	'newspaper',
	'pullquote-on-photo',
	'chapter-card',
	'title-sequence',
	'type-hero',
	'web-document',
	'website-screenshot',
	'imessage',
	'checklist',
	'paragraph',
	'node',
	'edge-arrow',
	'label',
	'stat-callout',
	'timeline-segment',
	'highlight',
	'underline',
	'strike',
	'circle',
	'box',
	'side-note',
	'magnify',
	'lift-out',
	'tear-out',
	'isolate',
	'lower-third',
	'washi-tape',
	'watermark',
	'shader-fill',
	'cursor-trail',
	'counter',
	'instance-stack',
	'text-3d',
	'youtube-subscribe',
	'instagram-follow',
	'achievement',
	'source-url',
	'paper-grain',
	'chromatic-aberration',
	'crt-screen',
	'crt-tube',
	'ntsc-signal',
	'dithering',
	'halftone-dots',
	'halftone-cmyk',
	'water',
	'fluted-glass',
	'refractive-lens',
	'frosted-glass',
	'fluid-ripple',
	'cloth-bend',
	'tiled-deformation',
	'heatmap'
] as const;

describe('Pipeline Registry', () => {
	it('wires each Layer key to its qualified renderer export', () => {
		assert.strictEqual(PIPELINE_REGISTRY.surfaces.paper, paperSurfaceRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.surfaces.plain, plainSurfaceRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.surfaces.newspaper, newspaperSurfaceRenderer);
		assert.strictEqual(
			PIPELINE_REGISTRY.surfaces.pullquoteOnPhoto,
			pullquoteOnPhotoSurfaceRenderer
		);
		assert.strictEqual(PIPELINE_REGISTRY.surfaces.chapterCard, chapterCardSurfaceRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.surfaces.titleSequence, titleSequenceSurfaceRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.surfaces.typeHero, typeHeroSurfaceRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.surfaces.webDocument, webDocumentSurfaceRenderer);
		assert.strictEqual(
			PIPELINE_REGISTRY.surfaces.websiteScreenshot,
			websiteScreenshotSurfaceRenderer
		);
		assert.strictEqual(PIPELINE_REGISTRY.surfaces.imessage, imessageSurfaceRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.surfaces.checklist, checklistSurfaceRenderer);

		assert.strictEqual(PIPELINE_REGISTRY.blocks.paragraph, paragraphBlockRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.blocks.node, nodeBlockRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.blocks.edgeArrow, edgeArrowBlockRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.blocks.label, labelBlockRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.blocks.statCallout, statCalloutBlockRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.blocks.timelineSegment, timelineSegmentBlockRenderer);

		assert.strictEqual(PIPELINE_REGISTRY.annotations.highlight, highlightAnnotationRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.annotations.underline, underlineAnnotationRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.annotations.strike, strikeAnnotationRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.annotations.circle, circleAnnotationRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.annotations.box, boxAnnotationRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.annotations.sideNote, sideNoteAnnotationRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.annotations.magnify, magnifyAnnotationRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.annotations.liftOut, liftOutAnnotationRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.annotations.tearOut, tearOutAnnotationRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.annotations.isolate, isolateAnnotationRenderer);

		assert.strictEqual(PIPELINE_REGISTRY.overlays.lowerThird, lowerThirdOverlayRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.overlays.washiTape, washiTapeOverlayRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.overlays.watermark, watermarkOverlayRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.overlays.shaderFill, shaderFillOverlayRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.overlays.cursorTrail, cursorTrailOverlayRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.overlays.counter, counterOverlayRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.overlays.instanceStack, instanceStackOverlayRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.overlays.text3d, text3dOverlayRenderer);
		assert.strictEqual(
			PIPELINE_REGISTRY.overlays.youtubeSubscribe,
			youtubeSubscribeOverlayRenderer
		);
		assert.strictEqual(PIPELINE_REGISTRY.overlays.instagramFollow, instagramFollowOverlayRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.overlays.achievement, achievementOverlayRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.overlays.sourceUrl, sourceUrlOverlayRenderer);

		assert.strictEqual(PIPELINE_REGISTRY.effects.paperGrain, paperGrainEffectRenderer);
		assert.strictEqual(
			PIPELINE_REGISTRY.effects.chromaticAberration,
			chromaticAberrationEffectRenderer
		);
		assert.strictEqual(PIPELINE_REGISTRY.effects.crtScreen, crtScreenEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.crtTube, crtTubeEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.ntscSignal, ntscSignalEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.dithering, ditheringEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.halftoneDots, halftoneDotsEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.halftoneCmyk, halftoneCmykEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.water, waterEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.flutedGlass, flutedGlassEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.refractiveLens, refractiveLensEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.frostedGlass, frostedGlassEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.fluidRipple, fluidRippleEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.clothBend, clothBendEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.tiledDeformation, tiledDeformationEffectRenderer);
		assert.strictEqual(PIPELINE_REGISTRY.effects.heatmap, heatmapEffectRenderer);
	});

	it('keeps the complete registered Pipeline type-id set unique', () => {
		const typeIds = [
			...Object.values(PIPELINE_REGISTRY.surfaces).map((renderer) => renderer.type),
			...Object.values(PIPELINE_REGISTRY.blocks).map((renderer) => renderer.type),
			...Object.values(PIPELINE_REGISTRY.annotations).map((renderer) => renderer.style),
			...Object.values(PIPELINE_REGISTRY.overlays).map((renderer) => renderer.type),
			...Object.values(PIPELINE_REGISTRY.effects).map((renderer) => renderer.type)
		];

		assert.deepEqual(typeIds.toSorted(), EXPECTED_PIPELINE_TYPE_IDS.toSorted());
		assert.equal(new Set(typeIds).size, typeIds.length);
	});

	it('keeps every visible registered Pipeline paired with a valid Identity Spec', () => {
		const registeredIdentityKeys = [
			...Object.values(PIPELINE_REGISTRY.surfaces).map((renderer) => `surface:${renderer.type}`),
			...Object.values(PIPELINE_REGISTRY.blocks).map((renderer) => `block:${renderer.type}`),
			...Object.values(PIPELINE_REGISTRY.annotations).map(
				(renderer) => `annotation:${renderer.style}`
			),
			...Object.values(PIPELINE_REGISTRY.overlays).map((renderer) => `overlay:${renderer.type}`)
		];
		const pipelineIdentityKeys = Object.keys(IDENTITY_REGISTRY).filter(
			(key) => key !== 'captions:track'
		);

		assert.deepEqual(registeredIdentityKeys.toSorted(), pipelineIdentityKeys.toSorted());
		assert.deepEqual(validateIdentityRegistry(syntaxPack), []);
	});

	it('derives the complete FULL Pack-immunity set from Identity Specs', () => {
		const expectedImmuneKeys = [
			'overlay:instagram-follow',
			'overlay:shader-fill',
			'overlay:youtube-subscribe',
			'surface:imessage',
			'surface:paper',
			'surface:web-document',
			'surface:website-screenshot'
		];

		assert.deepEqual(PACK_IMMUNE_PIPELINE_KEYS.toSorted(), expectedImmuneKeys);
		for (const pipelineKey of expectedImmuneKeys) assert.equal(isPackImmune(pipelineKey), true);
		assert.equal(isPackImmune('overlay:lower-third'), false);
		// Partial immunity (ADR-0039 §2) is NOT full immunity: the newspaper
		// stays out of the full set so the pack-diff lock keeps demanding its
		// claimable chrome visibly responds.
		assert.equal(isPackImmune('surface:newspaper'), false);
	});

	it('answers per-slot claimability from the immunity declaration (ADR-0039 §2)', () => {
		// Partial (newspaper): exactly the declared chrome slots are claimable.
		assert.equal(isAppearanceSlotPackClaimable('surface:newspaper', 'accent'), true);
		assert.equal(isAppearanceSlotPackClaimable('surface:newspaper', 'kicker-ink'), true);
		assert.equal(isAppearanceSlotPackClaimable('surface:newspaper', 'depth'), true);
		assert.equal(isAppearanceSlotPackClaimable('surface:newspaper', 'fill'), false);
		assert.equal(isAppearanceSlotPackClaimable('surface:newspaper', 'ink'), false);
		assert.equal(isAppearanceSlotPackClaimable('surface:newspaper', 'edge'), false);
		assert.equal(isAppearanceSlotPackClaimable('surface:newspaper', 'print'), false);
		// Full (imessage / paper): nothing is claimable.
		assert.equal(isAppearanceSlotPackClaimable('surface:imessage', 'accent'), false);
		assert.equal(isAppearanceSlotPackClaimable('surface:paper', 'fill'), false);
		// No immunity: everything is claimable.
		assert.equal(isAppearanceSlotPackClaimable('overlay:lower-third', 'fill'), true);

		const vars = { '--fill': '#111111', '--accent': '#22d3ee', '--kicker-ink': '#0f151c' };
		assert.deepEqual(filterPackAppearanceVarsForImmunity('surface:newspaper', vars), {
			'--accent': '#22d3ee',
			'--kicker-ink': '#0f151c'
		});
		assert.deepEqual(filterPackAppearanceVarsForImmunity('surface:imessage', vars), {});
		assert.deepEqual(filterPackAppearanceVarsForImmunity('overlay:lower-third', vars), vars);
	});

	it('resolves surface typography through substrate immunity (ADR-0039 §2)', () => {
		const syntax = PACK_REGISTRY.syntax;
		const cleanLight = PACK_REGISTRY['clean-light'];
		// Authored colours always win — composition content, not pack dress.
		assert.deepEqual(
			resolveSurfaceTypographyColors(cleanLight, 'paper', {
				paperColor: '#fdf9f1',
				inkColor: '#111111'
			}),
			{ paperColor: '#fdf9f1', inkColor: '#111111' }
		);
		// Unauthored on an immune document: intrinsic substrate, never pack cores.
		assert.deepEqual(resolveSurfaceTypographyColors(cleanLight, 'paper', {}), {
			paperColor: '#ffffff',
			inkColor: '#111111'
		});
		assert.deepEqual(resolveSurfaceTypographyColors(cleanLight, 'newspaper', {}), {
			paperColor: '#f0e8d6',
			inkColor: '#1a1612'
		});
		// Non-document surfaces keep the ADR-0038 pack-core chain.
		assert.deepEqual(resolveSurfaceTypographyColors(syntax, 'plain', {}), {
			paperColor: '#f0e8d6',
			inkColor: '#1a1612'
		});
		assert.deepEqual(resolveSurfaceTypographyColors(cleanLight, 'plain', {}), {
			paperColor: '#ffffff',
			inkColor: '#16181d'
		});
	});
});
