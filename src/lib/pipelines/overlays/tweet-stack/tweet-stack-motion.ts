export interface TweetStackCardMotionState {
	x: number;
	y: number;
	rotation: number;
	scale: number;
	opacity: number;
	zIndex: number;
}

interface TweetStackMotionInput {
	cardIndex: number;
	cardCount: number;
	globalProgress: number;
	durationSeconds: number;
	pileStart: number;
	pileWindow: number;
	cardArrivalWindow?: number;
	exitStart?: number;
	exitDuration?: number;
	cardExitWindow?: number;
	spread: number;
	orientation?: 'horizontal' | 'vertical';
}

const HORIZONTAL_LANDED_POSES = [
	{ x: -0.5, y: -0.45, rotation: -4.2 },
	{ x: 0.5, y: -0.42, rotation: 3.6 },
	{ x: -0.48, y: -0.14, rotation: -2.8 },
	{ x: 0.48, y: -0.1, rotation: 4.1 },
	{ x: -0.49, y: 0.18, rotation: 2.4 },
	{ x: 0.49, y: 0.2, rotation: -2.2 },
	{ x: -0.47, y: 0.48, rotation: -3.5 },
	{ x: 0.47, y: 0.5, rotation: 1.4 }
] as const;

const VERTICAL_LANDED_POSES = [
	{ x: -0.06, y: -1.35, rotation: -3.2 },
	{ x: 0.06, y: -0.96, rotation: 2.8 },
	{ x: -0.04, y: -0.57, rotation: -2.2 },
	{ x: 0.05, y: -0.19, rotation: 3.1 },
	{ x: -0.05, y: 0.19, rotation: 1.8 },
	{ x: 0.04, y: 0.57, rotation: -1.8 },
	{ x: -0.06, y: 0.96, rotation: -2.7 },
	{ x: 0.05, y: 1.35, rotation: 1.2 }
] as const;

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
}

function smoothOut(value: number): number {
	const inverse = 1 - clamp01(value);
	return 1 - inverse * inverse * inverse;
}

export function resolveTweetStackCardMotion(
	input: TweetStackMotionInput
): TweetStackCardMotionState {
	const count = Math.max(1, input.cardCount);
	const index = Math.max(0, Math.min(count - 1, input.cardIndex));
	const isVertical = input.orientation === 'vertical';
	const landedPoses = isVertical ? VERTICAL_LANDED_POSES : HORIZONTAL_LANDED_POSES;
	const pose = landedPoses[index % landedPoses.length];
	const spread = clamp01(input.spread);
	const finalX = pose.x * spread;
	const finalY = pose.y * spread;
	const finalRotation = pose.rotation * spread;
	const window = Math.max(0.02, input.pileWindow);
	const durationSeconds = Math.max(0.1, input.durationSeconds);
	const sequence = count <= 1 ? 0 : index / (count - 1);
	const arrivalSpan = Math.min(
		window,
		Math.max(0.01, input.cardArrivalWindow ?? 0.26 / durationSeconds)
	);
	const arrivalStart = input.pileStart + sequence * Math.max(0, window - arrivalSpan);
	const arrival = smoothOut((input.globalProgress - arrivalStart) / arrivalSpan);
	const direction = index % 2 === 0 ? -1 : 1;
	const entryX = finalX;
	const entryY = finalY;

	let visibility = arrival;
	let exitTravel = 0;
	if (input.exitStart !== undefined && input.exitDuration !== undefined) {
		const exitDuration = Math.max(0.02, input.exitDuration);
		const reverseSequence = count <= 1 ? 0 : (count - 1 - index) / (count - 1);
		const exitSpan = Math.min(
			exitDuration,
			Math.max(0.01, input.cardExitWindow ?? 0.25 / durationSeconds)
		);
		const exitCardStart = input.exitStart + reverseSequence * Math.max(0, exitDuration - exitSpan);
		exitTravel = smoothOut((input.globalProgress - exitCardStart) / exitSpan);
		visibility *= 1 - exitTravel;
	}

	return {
		x: entryX + (finalX - entryX) * arrival + (entryX - finalX) * 0.75 * exitTravel,
		y: entryY + (finalY - entryY) * arrival + (entryY - finalY) * 0.75 * exitTravel,
		rotation: finalRotation + direction * 2.5 * (1 - arrival) + direction * 5 * exitTravel,
		scale: 0.72 + 0.28 * arrival - 0.03 * exitTravel,
		opacity: clamp01(visibility * 1.7),
		zIndex: index + 1
	};
}
