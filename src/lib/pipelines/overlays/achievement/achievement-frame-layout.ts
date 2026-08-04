export interface AchievementFrameLayout {
	width: number;
	rightInset: number;
	topInset: number;
}

export function achievementFrameLayout(
	orientation: 'horizontal' | 'vertical',
	frameWidth: number,
	frameHeight: number
): AchievementFrameLayout {
	return {
		width: Math.round(frameWidth * (orientation === 'vertical' ? 0.82 : 0.32)),
		rightInset: Math.round(frameWidth * 0.1),
		topInset: Math.round(frameHeight * 0.08)
	};
}
