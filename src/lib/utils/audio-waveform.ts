/**
 * Peak amplitudes of an AudioBuffer downsampled to `buckets` columns — the
 * data behind a timeline clip's waveform. Each bucket is the max |sample|
 * across all channels in its span, 0–1.
 */
export function waveformPeaksFromAudioBuffer(buffer: AudioBuffer, buckets: number): Float32Array {
	if (!Number.isInteger(buckets) || buckets <= 0) {
		throw new TypeError(`Waveform buckets must be a positive integer, got ${buckets}.`);
	}
	const peaks = new Float32Array(buckets);
	const { length, numberOfChannels } = buffer;
	if (length === 0 || numberOfChannels === 0) return peaks;
	const samplesPerBucket = length / buckets;
	for (let channel = 0; channel < numberOfChannels; channel++) {
		const samples = buffer.getChannelData(channel);
		for (let bucket = 0; bucket < buckets; bucket++) {
			const start = Math.floor(bucket * samplesPerBucket);
			const end = Math.min(length, Math.max(start + 1, Math.floor((bucket + 1) * samplesPerBucket)));
			let peak = peaks[bucket];
			for (let i = start; i < end; i++) {
				const magnitude = Math.abs(samples[i]);
				if (magnitude > peak) peak = magnitude;
			}
			peaks[bucket] = peak;
		}
	}
	return peaks;
}
