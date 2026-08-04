import type { Text3dVariant } from './types';
import CylinderAxisYCanvasSource from './CylinderAxisYCanvasSource.svelte';
import { cylinderAxisYMotionShape } from './cylinder-axis-y-motion';

export const cylinderAxisY: Text3dVariant = {
	id: 'cylinder-axis-y',
	label: 'Cylinder (axis Y)',
	defaults: {
		rotationDegrees: 90,
		radiusCh: 4
	},
	motionShape: cylinderAxisYMotionShape,
	CanvasSource: CylinderAxisYCanvasSource
};
