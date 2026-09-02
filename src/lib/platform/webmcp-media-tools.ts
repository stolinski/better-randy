/**
 * The `media` family's WebMCP tools: the composition Media library, and the
 * primary Video track cut from it
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §2, §7).
 *
 * There is no path argument, no URL argument, and no picker anywhere in this
 * module. Bytes reach the page one way — the visitor drops a file on the Media
 * rail — and `gfx_media_add_library_entry` names the **grant** that gesture
 * recorded. The tool is not even registered on a page holding no grant, so an
 * agent is never offered a verb whose missing input is a person's consent.
 * Adding an entry is also the one cancellable edit here: it probes the source
 * before it commits, and a caller that walks away should stop that work.
 *
 * Every frame argument is an absolute frame rather than a delta, because an agent
 * knows where it wants a clip and not how far to push it. Frames are counted on
 * the exact rational the composition rate resolves to, so a clip lands on the
 * same frame a render at that frame draws.
 */
import {
	COMPOSITION_VIDEO_CLIP_EDIT_KINDS,
	runAddCompositionMediaLibraryEntryOperation,
	runAddCompositionVideoClipOperation,
	runInspectCompositionMediaOperation,
	runRemoveCompositionMediaLibraryEntryOperation,
	runRemoveCompositionVideoClipOperation,
	runUpdateCompositionVideoClipOperation
} from './composition-media-operations';
import {
	readWebmcpLiteralArgument,
	readWebmcpObservedRevisionArgument,
	readWebmcpOptionalTimeDurationArgument,
	readWebmcpOptionalTimePositionArgument,
	readWebmcpRecordArgument,
	readWebmcpStringArgument,
	readWebmcpTimePositionArgument,
	runWebmcpToolOperation
} from './webmcp-tool-arguments';
import {
	webmcpEntityIdProperty,
	webmcpFrameDurationProperty,
	webmcpFrameTimeProperty,
	webmcpObservedRevisionProperty,
	WEBMCP_NO_ARGUMENTS_SCHEMA
} from './webmcp-derived-tool-schemas';

import type { CompositionVideoClipEdit } from './composition-media-operations';
import type { WebmcpSchemaProperty } from './webmcp-derived-tool-schemas';
import type { WebmcpToolDefinition } from './webmcp-tool-controller';

function timelineFrameProperty(description: string): WebmcpSchemaProperty {
	return webmcpFrameTimeProperty(description);
}

/**
 * The four edits a clip accepts. Each names the absolute frame the edited edge
 * lands on, and each is refused rather than clamped when that frame is not legal
 * — a drag may slide to a stop against a neighbour because a hand is still
 * holding it, and a tool call may not.
 */
function videoClipEditProperty(): WebmcpSchemaProperty {
	return {
		type: 'object',
		description: 'What to change about the clip, and the exact frame it lands on.',
		properties: {
			kind: {
				type: 'string',
				description:
					'move slides the whole clip, trim-start and trim-end move one edge, slip shifts the source under it.',
				enum: COMPOSITION_VIDEO_CLIP_EDIT_KINDS
			},
			timelineStartFrame: timelineFrameProperty(
				'The frame the clip starts on, for move and trim-start.'
			),
			timelineEndFrame: timelineFrameProperty('The frame the clip ends on, for trim-end.'),
			sourceStartFrame: timelineFrameProperty(
				'The frame inside the source the cut starts at, for slip.'
			)
		},
		required: ['kind'],
		additionalProperties: false
	};
}

function readVideoClipEdit(args: unknown): CompositionVideoClipEdit {
	const edit = readWebmcpRecordArgument(args, 'edit');
	const kind = readWebmcpLiteralArgument(edit, 'kind', COMPOSITION_VIDEO_CLIP_EDIT_KINDS);
	switch (kind) {
		case 'move':
		case 'trim-start':
			return {
				kind,
				timelineStartFrame: readWebmcpTimePositionArgument(edit, 'timelineStartFrame')
			};
		case 'trim-end':
			return { kind, timelineEndFrame: readWebmcpTimePositionArgument(edit, 'timelineEndFrame') };
		case 'slip':
			return { kind, sourceStartFrame: readWebmcpTimePositionArgument(edit, 'sourceStartFrame') };
	}
}

export function listWebmcpMediaToolDefinitions(): readonly WebmcpToolDefinition[] {
	return [
		{
			operationId: 'media.inspect-library',
			inputSchema: WEBMCP_NO_ARGUMENTS_SCHEMA,
			run: () => runInspectCompositionMediaOperation()
		},
		{
			operationId: 'media.add-library-entry',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					grantId: webmcpEntityIdProperty(
						'A video the visitor already granted this page. Read the grants this page holds from gfx_media_inspect_library.'
					)
				},
				required: ['expectedRevision', 'grantId'],
				additionalProperties: false
			},
			run: (args, signal) =>
				runWebmcpToolOperation('media.add-library-entry', () =>
					runAddCompositionMediaLibraryEntryOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						grantId: readWebmcpStringArgument(args, 'grantId'),
						signal
					})
				)
		},
		{
			operationId: 'media.remove-library-entry',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					assetId: webmcpEntityIdProperty('The Media library entry to remove.')
				},
				required: ['expectedRevision', 'assetId'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('media.remove-library-entry', () =>
					runRemoveCompositionMediaLibraryEntryOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						assetId: readWebmcpStringArgument(args, 'assetId')
					})
				)
		},
		{
			operationId: 'media.add-video-clip',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					assetId: webmcpEntityIdProperty('The Media library entry to cut from.'),
					timelineStartFrame: timelineFrameProperty('The frame the clip starts on.'),
					durationFrames: webmcpFrameDurationProperty(
						'How long to cut, as legacy whole frames, seconds, milliseconds, or frames. Omit it to take as much as legally fits.'
					),
					sourceStartFrame: timelineFrameProperty(
						'Where the cut starts inside the source. Omit it to start at the head.'
					)
				},
				required: ['expectedRevision', 'assetId', 'timelineStartFrame'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('media.add-video-clip', () =>
					runAddCompositionVideoClipOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						assetId: readWebmcpStringArgument(args, 'assetId'),
						timelineStartFrame: readWebmcpTimePositionArgument(args, 'timelineStartFrame'),
						durationFrames: readWebmcpOptionalTimeDurationArgument(args, 'durationFrames'),
						sourceStartFrame: readWebmcpOptionalTimePositionArgument(args, 'sourceStartFrame')
					})
				)
		},
		{
			operationId: 'media.update-video-clip',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					clipId: webmcpEntityIdProperty('The Video clip to edit.'),
					edit: videoClipEditProperty()
				},
				required: ['expectedRevision', 'clipId', 'edit'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('media.update-video-clip', () =>
					runUpdateCompositionVideoClipOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						clipId: readWebmcpStringArgument(args, 'clipId'),
						edit: readVideoClipEdit(args)
					})
				)
		},
		{
			operationId: 'media.remove-video-clip',
			inputSchema: {
				type: 'object',
				properties: {
					expectedRevision: webmcpObservedRevisionProperty(),
					clipId: webmcpEntityIdProperty('The Video clip to remove.')
				},
				required: ['expectedRevision', 'clipId'],
				additionalProperties: false
			},
			run: (args) =>
				runWebmcpToolOperation('media.remove-video-clip', () =>
					runRemoveCompositionVideoClipOperation({
						expectedRevision: readWebmcpObservedRevisionArgument(args),
						clipId: readWebmcpStringArgument(args, 'clipId')
					})
				)
		}
	];
}
