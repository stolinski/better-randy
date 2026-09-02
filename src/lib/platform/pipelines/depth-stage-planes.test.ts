import assert from 'node:assert/strict';
import { describe, it } from 'vitest';

import { STAGE_BACKDROP_DEPTH, STAGE_CAM_Z, stagePlaneHalfExtents } from './depth-stage-camera';
import {
	assertStagePlaneCeilings,
	createBackdropStagePlaneBasis,
	createFrontalStagePlaneBasis,
	selectStagePlaneCasters,
	sortStagePlanesBackToFront,
	STAGE_PLANE_CEILINGS,
	StagePlaneCeilingError,
	stagePlaneAxialDistance,
	stagePlaneHalfLengths,
	stagePlaneModelMatrix,
	stagePlaneTextureBytes,
	stageOverlayPlaneDepth
} from './depth-stage-planes';

const ASPECT = 16 / 9;
const EYE: [number, number, number] = [0, 0, STAGE_CAM_Z];
const FORWARD: [number, number, number] = [0, 0, -1];
// The shipped key light travels mostly into the scene (upper-left key).
const LIGHT: [number, number, number] = [0.14, -0.16, -0.977];

describe('frontal stage plane bases', () => {
	it('fills the frame at its own distance and faces the camera', () => {
		const surface = createFrontalStagePlaneBasis(ASPECT, 0);
		const { halfW, halfH } = stagePlaneHalfExtents(STAGE_CAM_Z, ASPECT);
		assert.deepEqual(surface, {
			origin: [0, 0, -0],
			u: [halfW, 0, 0],
			v: [0, halfH, 0],
			normal: [0, 0, 1]
		});
		assert.deepEqual(stagePlaneHalfLengths(surface), { halfW, halfH });
	});

	it('oversizes the backdrop by the cover and sits it behind the Surface', () => {
		const backdrop = createBackdropStagePlaneBasis(ASPECT, 1.2);
		const fill = stagePlaneHalfExtents(STAGE_CAM_Z + STAGE_BACKDROP_DEPTH, ASPECT);
		assert.equal(backdrop.origin[2], -STAGE_BACKDROP_DEPTH);
		assert.equal(backdrop.u[0], fill.halfW * 1.2);
		assert.equal(backdrop.v[1], fill.halfH * 1.2);
	});

	it('builds the same model matrix the shipped translate-then-scale produced', () => {
		const backdrop = createBackdropStagePlaneBasis(ASPECT, 1.2);
		const matrix = stagePlaneModelMatrix(backdrop);
		assert.equal(matrix[0], Math.fround(backdrop.u[0]));
		assert.equal(matrix[5], Math.fround(backdrop.v[1]));
		assert.equal(matrix[10], 1);
		assert.equal(matrix[14], Math.fround(-STAGE_BACKDROP_DEPTH));
		assert.equal(matrix[15], 1);
	});
});

describe('plane ordering and casters', () => {
	const backdrop = { id: 'backdrop', basis: createBackdropStagePlaneBasis(ASPECT, 1.2) };
	const surface = { id: 'surface', basis: createFrontalStagePlaneBasis(ASPECT, 0) };
	const overlayBehind = {
		id: 'overlay',
		basis: createFrontalStagePlaneBasis(ASPECT, stageOverlayPlaneDepth(0.45))
	};
	const overlayAtSurface = { id: 'overlay', basis: createFrontalStagePlaneBasis(ASPECT, 0) };

	it('sorts back to front and keeps Layer order at equal depth', () => {
		const behind = sortStagePlanesBackToFront([backdrop, surface, overlayBehind], EYE, FORWARD);
		assert.deepEqual(
			behind.map((plane) => plane.id),
			['backdrop', 'overlay', 'surface']
		);
		const level = sortStagePlanesBackToFront([backdrop, surface, overlayAtSurface], EYE, FORWARD);
		assert.deepEqual(
			level.map((plane) => plane.id),
			['backdrop', 'surface', 'overlay']
		);
		assert.ok(stagePlaneAxialDistance(backdrop.basis, EYE, FORWARD) > STAGE_CAM_Z);
	});

	it('selects upstream planes as casters, nearest first, and never the receiver', () => {
		const ontoBackdrop = selectStagePlaneCasters(
			backdrop.basis,
			[backdrop, surface, overlayBehind],
			LIGHT
		);
		assert.deepEqual(
			ontoBackdrop.map((plane) => plane.id),
			['overlay', 'surface']
		);
		const ontoOverlay = selectStagePlaneCasters(
			overlayBehind.basis,
			[backdrop, surface, overlayBehind],
			LIGHT
		);
		assert.deepEqual(
			ontoOverlay.map((plane) => plane.id),
			['surface']
		);
		assert.deepEqual(
			selectStagePlaneCasters(surface.basis, [backdrop, surface, overlayAtSurface], LIGHT),
			[]
		);
	});

	it('caps casters at the ceiling', () => {
		const receiver = createBackdropStagePlaneBasis(ASPECT, 1.2);
		const many = Array.from({ length: 6 }, (_, index) => ({
			basis: createFrontalStagePlaneBasis(ASPECT, index * 0.2)
		}));
		assert.equal(
			selectStagePlaneCasters(receiver, many, LIGHT).length,
			STAGE_PLANE_CEILINGS.maxCasters
		);
	});
});

describe('stage plane ceilings', () => {
	it('accepts the shipped three-plane frame', () => {
		assertStagePlaneCeilings({
			planeCount: 3,
			mippedPlaneCount: 0,
			textureBytes: stagePlaneTextureBytes(3840, 2160, 8, true) * 2,
			mipPasses: 12
		});
	});

	it('fails correctively on the first exceeded ceiling', () => {
		assert.throws(
			() =>
				assertStagePlaneCeilings({
					planeCount: 9,
					mippedPlaneCount: 0,
					textureBytes: 0,
					mipPasses: 0
				}),
			(error: unknown) => error instanceof StagePlaneCeilingError && error.ceiling === 'maxPlanes'
		);
		assert.throws(
			() =>
				assertStagePlaneCeilings({
					planeCount: 3,
					mippedPlaneCount: 3,
					textureBytes: STAGE_PLANE_CEILINGS.maxPlaneTextureBytes + 1,
					mipPasses: 0
				}),
			(error: unknown) =>
				error instanceof StagePlaneCeilingError && error.ceiling === 'maxPlaneTextureBytes'
		);
	});

	it('counts a mip chain as a third more', () => {
		assert.equal(stagePlaneTextureBytes(100, 100, 8, false), 80_000);
		assert.equal(stagePlaneTextureBytes(100, 100, 8, true), Math.ceil(80_000 * (4 / 3)));
	});
});
