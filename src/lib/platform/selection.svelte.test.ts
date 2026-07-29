import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'vitest';

import {
	createTimelineTrackId,
	createVideoClipSelectionId,
	type VideoClipSelectionId
} from './timeline-entity-identity.ts';
import {
	deselectLayer,
	inspectorFocus,
	keyframeSelection,
	layerSelection,
	requestInspectorFocus,
	selectKeyframe,
	selectVideoClip
} from './selection.svelte.ts';

describe('timeline selection', () => {
	afterEach(() => {
		deselectLayer();
	});

	it('selects a video clip by typed identity and clears entity-specific state', () => {
		const trackId = createTimelineTrackId({ kind: 'overlay', overlayId: 'hero' });
		selectKeyframe(trackId, 'opacity', 2);
		requestInspectorFocus('slot:title');
		const expectedSelectionId: VideoClipSelectionId = createVideoClipSelectionId('clip:launch/β');

		selectVideoClip('clip:launch/β');

		assert.equal(layerSelection.id, expectedSelectionId);
		assert.equal(keyframeSelection.id, null);
		assert.equal(inspectorFocus.target, null);
	});

	it('deselects a selected video clip and clears related selection state', () => {
		const trackId = createTimelineTrackId({ kind: 'block', blockId: 'quote' });
		selectVideoClip('opening-clip');
		selectKeyframe(trackId, 'scale', 1);
		requestInspectorFocus('slot:quote');

		deselectLayer();

		assert.equal(layerSelection.id, null);
		assert.equal(keyframeSelection.id, null);
		assert.equal(inspectorFocus.target, null);
	});
});
