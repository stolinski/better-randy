import type { Text3dVariant } from './types';
import CylinderAxisYCanvasSource from './CylinderAxisYCanvasSource.svelte';

export const cylinderAxisY: Text3dVariant = {
	id: 'cylinder-axis-y',
	label: 'Cylinder (axis Y)',
	defaults: {
		rotationDegrees: 90,
		radiusCh: 4
	},
	motionShape: (_glyphIndex, _glyphCount, progress) => {
		const t = Math.max(0, Math.min(1, progress));
		return t * t * (3 - 2 * t) * 90;
	},
	CanvasSource: CylinderAxisYCanvasSource
};
