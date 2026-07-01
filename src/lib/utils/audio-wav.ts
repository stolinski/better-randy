/**
 * Encode an AudioBuffer as a WAV (RIFF, interleaved 16-bit PCM) byte array.
 * Pure and deterministic — the ProRes export path ships the offline mix to
 * ffmpeg in this container.
 */
export function audioBufferToWavBytes(buffer: AudioBuffer): Uint8Array<ArrayBuffer> {
	const channels = buffer.numberOfChannels;
	const frames = buffer.length;
	const dataLength = frames * channels * 2;
	const view = new DataView(new ArrayBuffer(44 + dataLength));

	const writeAscii = (offset: number, text: string) => {
		for (let i = 0; i < text.length; i += 1) {
			view.setUint8(offset + i, text.charCodeAt(i));
		}
	};

	writeAscii(0, 'RIFF');
	view.setUint32(4, 36 + dataLength, true);
	writeAscii(8, 'WAVE');
	writeAscii(12, 'fmt ');
	view.setUint32(16, 16, true); // PCM chunk size
	view.setUint16(20, 1, true); // PCM
	view.setUint16(22, channels, true);
	view.setUint32(24, buffer.sampleRate, true);
	view.setUint32(28, buffer.sampleRate * channels * 2, true); // byte rate
	view.setUint16(32, channels * 2, true); // block align
	view.setUint16(34, 16, true); // bits per sample
	writeAscii(36, 'data');
	view.setUint32(40, dataLength, true);

	const channelData: Float32Array[] = [];
	for (let channel = 0; channel < channels; channel += 1) {
		channelData.push(buffer.getChannelData(channel));
	}
	let offset = 44;
	for (let frame = 0; frame < frames; frame += 1) {
		for (let channel = 0; channel < channels; channel += 1) {
			const clamped = Math.max(-1, Math.min(1, channelData[channel][frame]));
			view.setInt16(offset, Math.round(clamped * 32767), true);
			offset += 2;
		}
	}

	return new Uint8Array(view.buffer);
}
