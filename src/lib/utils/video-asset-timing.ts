export function videoAssetPresentationTimestampAt(options: {
	firstTimestamp: number;
	sourceTimeSeconds: number;
}): number {
	const { firstTimestamp, sourceTimeSeconds } = options;
	if (![firstTimestamp, sourceTimeSeconds].every(Number.isFinite)) {
		throw new TypeError('Video asset timestamp inputs must be finite numbers.');
	}
	if (sourceTimeSeconds < 0) {
		throw new RangeError('Video asset Source time must be nonnegative.');
	}
	return firstTimestamp + sourceTimeSeconds;
}
