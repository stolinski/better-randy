import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';

import { readHttpResponseMessage } from '$lib/utils/http-response-message';
import {
	MAX_USER_VIDEO_BYTES,
	userVideoFormatForMime
} from '$lib/utils/user-video-format-validation';

import {
	isUserVideoAssetDescriptor,
	type UserVideoAssetDescriptor,
	type UserVideoAssetMetadata
} from './user-video-asset';

export async function inspectUserVideoFile(file: File): Promise<UserVideoAssetMetadata> {
	const format = userVideoFormatForMime(file.type);
	if (!format) {
		throw new TypeError(`Cannot upload "${file.name}": expected an MP4, MOV, or WebM file.`);
	}
	if (file.size === 0) throw new TypeError(`Cannot upload "${file.name}": file is empty.`);
	if (file.size > MAX_USER_VIDEO_BYTES) {
		throw new RangeError(`Cannot upload "${file.name}": file exceeds the 50 GiB limit.`);
	}

	const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
	try {
		const videoTrack = await input.getPrimaryVideoTrack();
		if (!videoTrack) throw new TypeError(`Cannot upload "${file.name}": no video track found.`);
		if (!(await videoTrack.canDecode())) {
			throw new TypeError(
				`Cannot upload "${file.name}": the browser cannot decode its video codec.`
			);
		}

		const audioTrack = await input.getPrimaryAudioTrack();
		if (audioTrack && !(await audioTrack.canDecode())) {
			throw new TypeError(
				`Cannot upload "${file.name}": the browser cannot decode its audio codec.`
			);
		}

		const [
			durationSeconds,
			displayWidth,
			displayHeight,
			rotation,
			packetStats,
			videoCodec,
			audioCodec,
			audioChannels,
			audioSampleRate
		] = await Promise.all([
			input.computeDuration(),
			videoTrack.getDisplayWidth(),
			videoTrack.getDisplayHeight(),
			videoTrack.getRotation(),
			videoTrack.computePacketStats(120),
			videoTrack.getCodec(),
			audioTrack?.getCodec(),
			audioTrack?.getNumberOfChannels(),
			audioTrack?.getSampleRate()
		]);
		if (!videoCodec || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
			throw new TypeError(`Cannot upload "${file.name}": video metadata is incomplete.`);
		}

		return {
			durationSeconds,
			displayWidth,
			displayHeight,
			rotation,
			averageFrameRate: packetStats.averagePacketRate,
			videoCodec,
			hasAudio: audioTrack !== null,
			...(audioCodec ? { audioCodec } : {}),
			...(audioChannels ? { audioChannels } : {}),
			...(audioSampleRate ? { audioSampleRate } : {})
		};
	} finally {
		input.dispose();
	}
}

export async function uploadUserVideo(file: File): Promise<UserVideoAssetDescriptor> {
	await inspectUserVideoFile(file);

	let response: Response;
	try {
		response = await fetch('/api/user-assets', {
			method: 'POST',
			headers: { 'Content-Type': file.type },
			body: file
		});
	} catch (errorValue) {
		throw new Error(`Failed to upload user video "${file.name}": network request failed.`, {
			cause: errorValue
		});
	}

	if (!response.ok) {
		throw new Error(
			`Failed to upload user video "${file.name}": ${await readHttpResponseMessage(response)}`
		);
	}

	const body: unknown = await response.json();
	if (!isUserVideoAssetDescriptor(body)) {
		throw new Error(`Failed to upload user video "${file.name}": invalid server response.`);
	}
	return body;
}
