export interface TweetStackFrameLayout {
	cardWidth: number;
	frameHeight: number;
	frameWidth: number;
	motionSpread: number;
	stackHeight: number;
	stackWidth: number;
}

export function resolveTweetStackFrameLayout(
	orientation: 'horizontal' | 'vertical',
	frameWidth: number,
	frameHeight: number
): TweetStackFrameLayout {
	const cardWidth = Math.round(frameWidth * (orientation === 'vertical' ? 0.88 : 0.4));
	return {
		cardWidth,
		frameHeight,
		frameWidth,
		motionSpread: orientation === 'vertical' ? 0.4 : 1,
		stackHeight: Math.round(cardWidth * (orientation === 'vertical' ? 0.92 : 0.78)),
		stackWidth: Math.round(cardWidth * (orientation === 'vertical' ? 1.08 : 1.42))
	};
}
