const SOURCE_VIDEO_TIME_EPSILON_SECONDS = 1e-6;

export function sourceVideoTimestampAt(options: {
	firstTimestamp: number;
	sourceOffsetSeconds: number;
	compositionTimestamp: number;
}): number {
	const { firstTimestamp, sourceOffsetSeconds, compositionTimestamp } = options;
	if (![firstTimestamp, sourceOffsetSeconds, compositionTimestamp].every(Number.isFinite)) {
		throw new TypeError('Source video timestamp inputs must be finite numbers.');
	}
	if (sourceOffsetSeconds < 0 || compositionTimestamp < 0) {
		throw new RangeError('Source video offset and composition timestamp must be nonnegative.');
	}
	return firstTimestamp + sourceOffsetSeconds + compositionTimestamp;
}

export function assertSourceVideoCoverage(options: {
	sourceDurationSeconds: number;
	sourceOffsetSeconds: number;
	compositionDurationSeconds: number;
}): void {
	const { sourceDurationSeconds, sourceOffsetSeconds, compositionDurationSeconds } = options;
	if (
		![sourceDurationSeconds, sourceOffsetSeconds, compositionDurationSeconds].every(Number.isFinite)
	) {
		throw new TypeError('Source video coverage inputs must be finite numbers.');
	}
	if (sourceDurationSeconds <= 0 || sourceOffsetSeconds < 0 || compositionDurationSeconds <= 0) {
		throw new RangeError(
			'Source video coverage requires positive durations and a nonnegative offset.'
		);
	}
	const available = sourceDurationSeconds - sourceOffsetSeconds;
	if (available + SOURCE_VIDEO_TIME_EPSILON_SECONDS < compositionDurationSeconds) {
		throw new RangeError(
			`Source video has ${Math.max(0, available).toFixed(3)}s available after its offset, but the composition requires ${compositionDurationSeconds.toFixed(3)}s.`
		);
	}
}
