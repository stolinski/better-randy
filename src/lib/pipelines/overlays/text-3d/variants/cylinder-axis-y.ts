import type { Text3dVariant } from './types';
import CylinderAxisYCanvasSource from './CylinderAxisYCanvasSource.svelte';

export const cylinderAxisY: Text3dVariant = {
	id: 'cylinder-axis-y',
	label: 'Cylinder (axis Y)',
	defaults: {
		rotationDegrees: 90,
		radiusCh: 4
	},
	motionShape: (_glyphIndex, _glyphCount, progress, rotationDegrees) => {
		const t = Math.max(0, Math.min(1, progress));
		// Spin IN to the readable hero frame (baseRotation 0 = every glyph
		// front-facing) over the settle window, decelerating into the landing,
		// then HOLD it as the payoff. The word turns to face the camera and
		// locks. The prior shape (smoothstep(t)·rotationDegrees → 0→90) put the
		// readable frame at t=0 where the enter-fade hides it, then spun AWAY,
		// ending half-occluded on "SYN" — the audit's "monotone spin, no hero
		// frame." Now: rotationDegrees → 0 (ease-out cubic), then 0 held.
		const SETTLE_END = 0.42;
		const u = Math.min(1, t / SETTLE_END);
		const eased = 1 - Math.pow(1 - u, 3);
		return (1 - eased) * rotationDegrees;
	},
	CanvasSource: CylinderAxisYCanvasSource
};
