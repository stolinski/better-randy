import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { beforeAll, describe, it } from 'vitest';

const COMPONENT_FILES = {
	rootInspector: 'RootInspector.svelte',
	videoClipInspector: 'VideoClipInspector.svelte',
	inspector: 'Inspector.svelte',
	mediaInspector: 'MediaInspector.svelte',
	timelineOutline: 'TimelineOutline.svelte',
	videoTimelineTrack: 'VideoTimelineTrack.svelte'
} as const;

type ComponentSource = Record<keyof typeof COMPONENT_FILES, string>;

let source: ComponentSource;

beforeAll(async () => {
	source = Object.fromEntries(
		await Promise.all(
			Object.entries(COMPONENT_FILES).map(async ([key, filename]) => [
				key,
				await readFile(new URL(filename, import.meta.url), 'utf8')
			])
		)
	) as ComponentSource;
});

function assertIncludes(haystack: string, needle: string, message: string): void {
	assert.ok(haystack.includes(needle), message);
}

function assertExcludes(haystack: string, needle: string, message: string): void {
	assert.ok(!haystack.includes(needle), message);
}

describe('media right rail source contract', () => {
	it('keeps composition transport and canonical Video clip guards in RootInspector', () => {
		assertIncludes(
			source.rootInspector,
			'<InspectorSection label="Transport">',
			'RootInspector must retain the composition Transport section'
		);
		assertIncludes(
			source.rootInspector,
			'<Field label="Duration">',
			'RootInspector Transport must retain composition Duration'
		);
		assertIncludes(
			source.rootInspector,
			'<Field label="Rate">',
			'RootInspector Transport must retain composition Rate'
		);
		assert.ok(
			source.rootInspector.split('engineState.media.videoTrack.clips.length > 0').length - 1 >= 3,
			'RootInspector must retain canonical active Video clip guards for incompatible composition controls'
		);
	});

	it('limits VideoClipInspector to clip identity, audio, gain, and removal', () => {
		for (const label of [
			'<Field label="Name">',
			'<Field label="Identity">',
			'<Field label="Audio">',
			'<Field label="Gain">'
		]) {
			assertIncludes(
				source.videoClipInspector,
				label,
				`VideoClipInspector must expose the ${label.match(/"([^"]+)"/)?.[1] ?? label} contract`
			);
		}
		assertIncludes(
			source.videoClipInspector,
			'setSelectedVideoClipAudioEnabled',
			'VideoClipInspector must write clip audio enabled state through the media API'
		);
		assertIncludes(
			source.videoClipInspector,
			'setSelectedVideoClipAudioGain',
			'VideoClipInspector must write clip gain through the media API'
		);
		assertIncludes(
			source.videoClipInspector,
			'removeSelectedVideoClip',
			'VideoClipInspector must remove clips through the safe media API'
		);
		assertIncludes(
			source.videoClipInspector,
			'type="range"',
			'VideoClipInspector gain must remain a range control'
		);

		for (const temporalField of ['timelineStartFrame', 'durationFrames', 'sourceStartSeconds']) {
			assertExcludes(
				source.videoClipInspector,
				temporalField,
				`VideoClipInspector must not expose temporal field ${temporalField}`
			);
		}
		assertExcludes(
			source.videoClipInspector,
			'type="number"',
			'VideoClipInspector must not expose numeric clip authoring inputs'
		);
	});

	it('dispatches accessible Inspector and Media rail modes and Video clip selection', () => {
		assertIncludes(
			source.inspector,
			'<nav class="inspector__modes" aria-label="Inspector mode">',
			'Inspector rail modes must be grouped in an accessible labelled nav'
		);
		assert.ok(
			source.inspector.split('aria-pressed=').length - 1 >= 2,
			'Inspector and Media mode controls must both expose aria-pressed state'
		);
		assertIncludes(
			source.inspector,
			"inspectorRailMode.mode === 'media'",
			'Inspector must dispatch the Media rail mode'
		);
		assertIncludes(
			source.inspector,
			'<MediaInspector />',
			'Inspector must render MediaInspector in Media mode'
		);
		assertIncludes(
			source.inspector,
			"resolved.kind === 'video-clip'",
			'Inspector must dispatch canonical Video clip selections'
		);
		assertIncludes(
			source.inspector,
			'<VideoClipInspector clipId={resolved.clipId} />',
			'Inspector must pass the selected clip identity to VideoClipInspector'
		);
	});

	it('keeps native upload, errors, drag transfer, and safe removal in MediaInspector', () => {
		const fileInput = source.mediaInspector.match(/<input\s+[\s\S]*?type="file"[\s\S]*?\/>/)?.[0];
		assert.ok(fileInput, 'MediaInspector must include a native file input');
		assertIncludes(fileInput, 'video/mp4', 'Media upload must accept MP4 video');
		assertIncludes(fileInput, 'video/quicktime', 'Media upload must accept QuickTime video');
		assertIncludes(fileInput, 'video/webm', 'Media upload must accept WebM video');
		assertIncludes(
			source.mediaInspector,
			'role="alert"',
			'Media upload errors must be announced with role=alert'
		);
		assertIncludes(source.mediaInspector, 'draggable="true"', 'Media assets must remain draggable');
		assertIncludes(
			source.mediaInspector,
			'writeMediaLibraryAssetDragTransfer(event.dataTransfer, assetId)',
			'Media drag start must use the typed media-library transfer writer'
		);
		assertIncludes(
			source.mediaInspector,
			'removeCompositionMediaAsset(engineState.media, assetId)',
			'Media removal must use the safe composition media removal function'
		);
		assertIncludes(
			source.mediaInspector,
			"result.status === 'removed'",
			'Media removal cleanup must only run after confirmed removal'
		);
	});

	it('keeps Media and Video authoring out of the Timeline Add layer menu', () => {
		const menuStart = source.timelineOutline.indexOf('id="timeline-add-menu"');
		assert.notEqual(menuStart, -1, 'TimelineOutline must retain the canonical Add layer menu');
		const menuEnd = source.timelineOutline.indexOf('</footer>', menuStart);
		assert.notEqual(menuEnd, -1, 'Timeline Add layer menu must remain bounded by its footer');
		const addMenuMarkup = source.timelineOutline.slice(menuStart, menuEnd);

		for (const forbidden of [
			'>Media<',
			'>Video<',
			'pickMedia',
			'pickVideo',
			'type="file"',
			'ondrag',
			'DataTransfer',
			'writeMediaLibraryAssetDragTransfer',
			'uploadUserVideo'
		]) {
			assertExcludes(
				addMenuMarkup,
				forbidden,
				`Timeline Add layer menu must not contain Media/Video authoring wiring: ${forbidden}`
			);
		}
	});

	it('wires the fixed Video row to accessible direct timeline authoring', () => {
		assertIncludes(
			source.timelineOutline,
			'<VideoTimelineTrack {track} {timeline} />',
			'TimelineOutline must delegate the fixed Video row to its focused component'
		);
		assertIncludes(
			source.timelineOutline,
			"target?.closest('.track-transition, [data-video-timeline-clip]')",
			'Video clip gestures must not fall through to timeline seeking'
		);
		assertIncludes(
			source.videoTimelineTrack,
			'background: #1f5aff',
			'Video clips must use the DESIGN media blue'
		);
		assertIncludes(
			source.videoTimelineTrack,
			'0 0 0 1px #ffd608',
			'Selected Video clips must use the DESIGN selection yellow'
		);
		assertIncludes(
			source.videoTimelineTrack,
			'aria-label={`Move ${clip.label} video clip. Hold Alt or Option to slip source.`}',
			'Video clip interiors must expose an accessible direct-manipulation name'
		);
		assert.ok(
			source.videoTimelineTrack.split('type="button"').length - 1 >= 3,
			'Video clips must expose accessible interior and trim handle buttons'
		);
		assertIncludes(
			source.videoTimelineTrack,
			'selectVideoClip(clip.clipId)',
			'Existing Video clip selection must use the canonical selection API'
		);
		assertIncludes(
			source.videoTimelineTrack,
			'inspectorRailMode.switchToInspector()',
			'Video clip selection must restore Inspector rail mode'
		);
		assertIncludes(
			source.videoTimelineTrack,
			'function handlePointerCancel(event: PointerEvent): void',
			'Video clip pointer cancellation must have an explicit cleanup path'
		);
		assertIncludes(
			source.videoTimelineTrack,
			'finishPointerDrag(true)',
			'Video clip cancellation must roll back to the immutable drag origin'
		);
		assertIncludes(
			source.videoTimelineTrack,
			"event.altKey ? 'slip' : 'move'",
			'Alt or Option must lock slip mode at pointer origin'
		);
		assertIncludes(
			source.videoTimelineTrack,
			'originMedia: Media',
			'Video gestures must retain the originating composition Media identity'
		);
		assertIncludes(
			source.videoTimelineTrack,
			'engineState.media !== state.originMedia',
			'Video pointer movement must stop before writing after a composition switch'
		);
		assertIncludes(
			source.videoTimelineTrack,
			'engineState.media === state.originMedia',
			'Video commit and rollback cleanup must verify the originating Media identity'
		);
		assertExcludes(
			source.videoTimelineTrack,
			'$effect',
			'Video timeline event handling must not use effects'
		);
	});
});
