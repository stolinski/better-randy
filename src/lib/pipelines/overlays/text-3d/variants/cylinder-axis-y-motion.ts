export function cylinderAxisYMotionShape(
	_glyphIndex: number,
	_glyphCount: number,
	progress: number,
	rotationDegrees: number,
	spinStart: number,
	spinWindow: number
): number {
	const t = Math.max(0, Math.min(1, progress));
	// Spin IN to the readable hero frame (baseRotation 0 = every glyph
	// front-facing) over the settle window, decelerating into the landing,
	// then HOLD it as the payoff. The word turns to face the camera and
	// locks. The prior shape (smoothstep(t)·rotationDegrees → 0→90) put the
	// readable frame at t=0 where the enter-fade hides it, then spun AWAY,
	// ending half-occluded on "SYN" — the audit's "monotone spin, no hero
	// frame." Now: rotationDegrees → 0 (ease-out cubic), then 0 held. The
	// settle window is composition data (a timeline clip), not hardcoded.
	const settleWindow = Math.max(spinWindow, 0.0001);
	const spinEnd = spinStart + settleWindow;
	const u = Math.max(0, Math.min(1, (t - spinStart) / settleWindow));
	const eased = 1 - Math.pow(1 - u, 3);
	const settled = (1 - eased) * rotationDegrees;
	if (t <= spinEnd) {
		return settled;
	}
	// Living lock: after the word settles to face the camera, a gentle ±2.2°
	// breath keeps the lit cylinder faces subtly shifting (the hero reads as a
	// living logo-lock, not a frozen still) without breaking readability. The
	// breath starts at 0 at SETTLE_END (continuous with `settled`) and is
	// progress-derived, so it stays frame-deterministic. (Pairs with the
	// now-grained backgroundFill; on a near-black field this foreground breath
	// carries most of the hold's life.)
	const holdT = t - spinEnd;
	const BREATH_DEG = 2.2;
	return Math.sin(holdT * Math.PI * 2 * 0.5) * BREATH_DEG;
}
