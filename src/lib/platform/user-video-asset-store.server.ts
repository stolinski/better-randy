import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, open, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
	hasUserVideoSignature,
	MAX_USER_VIDEO_BYTES,
	type UserVideoMime,
	userVideoFormatForMime
} from '$lib/utils/user-video-format-validation';

import type { UserVideoAssetDescriptor, UserVideoAssetMetadata } from './user-video-asset';

interface StoreUserVideoOptions {
	storeDirectory?: string;
	probe?: (filePath: string) => Promise<UserVideoAssetMetadata>;
}

function isAlreadyStored(errorValue: unknown): boolean {
	return (
		typeof errorValue === 'object' &&
		errorValue !== null &&
		'code' in errorValue &&
		errorValue.code === 'EEXIST'
	);
}

function recordValue(value: unknown): Record<string, unknown> | null {
	return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function numericValue(value: unknown): number | null {
	const number =
		typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	return Number.isFinite(number) ? number : null;
}

function rationalValue(value: unknown): number {
	if (typeof value !== 'string') return 0;
	const [numerator, denominator] = value.split('/').map(Number);
	return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
		? numerator / denominator
		: 0;
}

function normalizedRotation(value: unknown): 0 | 90 | 180 | 270 {
	const number = numericValue(value) ?? 0;
	const normalized = (((Math.round(number / 90) * 90) % 360) + 360) % 360;
	return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

function rotationFromStream(stream: Record<string, unknown>): 0 | 90 | 180 | 270 {
	const tags = recordValue(stream.tags);
	if (tags?.rotate !== undefined) return normalizedRotation(tags.rotate);
	if (Array.isArray(stream.side_data_list)) {
		for (const entry of stream.side_data_list) {
			const sideData = recordValue(entry);
			if (sideData?.rotation !== undefined) return normalizedRotation(sideData.rotation);
		}
	}
	return 0;
}

function parseUserVideoProbe(value: unknown): UserVideoAssetMetadata {
	const root = recordValue(value);
	const streams = Array.isArray(root?.streams)
		? root.streams
				.map(recordValue)
				.filter((entry): entry is Record<string, unknown> => entry !== null)
		: [];
	const video = streams.find((stream) => stream.codec_type === 'video');
	if (!video) throw new TypeError('User video contains no video track.');

	const width = numericValue(video.width);
	const height = numericValue(video.height);
	const codec = typeof video.codec_name === 'string' ? video.codec_name : '';
	const format = recordValue(root?.format);
	const duration = numericValue(format?.duration);
	if (!width || !height || !codec || !duration || duration <= 0) {
		throw new TypeError('User video metadata is incomplete or invalid.');
	}

	const rotation = rotationFromStream(video);
	const audio = streams.find((stream) => stream.codec_type === 'audio');
	const audioCodec = typeof audio?.codec_name === 'string' ? audio.codec_name : undefined;
	const audioChannels = numericValue(audio?.channels) ?? undefined;
	const audioSampleRate = numericValue(audio?.sample_rate) ?? undefined;

	return {
		durationSeconds: duration,
		displayWidth: rotation === 90 || rotation === 270 ? height : width,
		displayHeight: rotation === 90 || rotation === 270 ? width : height,
		rotation,
		averageFrameRate: rationalValue(video.avg_frame_rate) || rationalValue(video.r_frame_rate),
		videoCodec: codec,
		hasAudio: audio !== undefined,
		...(audioCodec ? { audioCodec } : {}),
		...(audioChannels ? { audioChannels } : {}),
		...(audioSampleRate ? { audioSampleRate } : {})
	};
}

export function probeStoredUserVideo(filePath: string): Promise<UserVideoAssetMetadata> {
	const ffprobeBin = process.env.FFPROBE_PATH ?? 'ffprobe';
	return new Promise((resolve, reject) => {
		const child = spawn(ffprobeBin, [
			'-v',
			'error',
			'-show_streams',
			'-show_format',
			'-of',
			'json',
			filePath
		]);
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
		child.once('error', reject);
		child.once('close', (code) => {
			if (code !== 0) {
				reject(
					new TypeError(
						Buffer.concat(stderr).toString('utf8').trim() ||
							`User video probe exited with code ${code ?? 'unknown'}.`
					)
				);
				return;
			}
			try {
				const value: unknown = JSON.parse(Buffer.concat(stdout).toString('utf8'));
				resolve(parseUserVideoProbe(value));
			} catch (errorValue) {
				reject(errorValue);
			}
		});
	});
}

export async function storeUserVideo(
	body: ReadableStream<Uint8Array>,
	mime: UserVideoMime,
	options: StoreUserVideoOptions = {}
): Promise<UserVideoAssetDescriptor> {
	const format = userVideoFormatForMime(mime);
	if (!format) throw new TypeError(`Unsupported user video MIME type: ${mime}`);

	const storeDirectory = options.storeDirectory ?? join(process.cwd(), 'user-assets');
	const uploadDirectory = join(storeDirectory, '.uploads');
	await mkdir(uploadDirectory, { recursive: true });
	const temporaryPath = join(uploadDirectory, randomUUID());
	const handle = await open(temporaryPath, 'wx');
	const reader = body.getReader();
	const hash = createHash('sha256');
	let signature = new Uint8Array(0);
	let sizeBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value.byteLength === 0) continue;
			sizeBytes += value.byteLength;
			if (sizeBytes > MAX_USER_VIDEO_BYTES) {
				throw new RangeError('User video exceeds the 50 GiB limit.');
			}
			if (signature.byteLength < 16) {
				const remaining = 16 - signature.byteLength;
				const next = new Uint8Array(signature.byteLength + Math.min(remaining, value.byteLength));
				next.set(signature);
				next.set(value.subarray(0, remaining), signature.byteLength);
				signature = next;
			}
			hash.update(value);
			await handle.write(value);
		}
		await handle.sync();
		await handle.close();

		if (sizeBytes === 0) throw new TypeError('User video body is empty.');
		if (!hasUserVideoSignature(signature, mime)) {
			throw new TypeError(`User video bytes do not match ${mime}.`);
		}

		const metadata = await (options.probe ?? probeStoredUserVideo)(temporaryPath);
		const key = `${hash.digest('hex')}.${format.extension}`;
		const storedPath = join(storeDirectory, key);
		try {
			await link(temporaryPath, storedPath);
		} catch (errorValue) {
			if (!isAlreadyStored(errorValue)) throw errorValue;
		}

		return {
			url: `/api/user-assets/${key}`,
			mime,
			sizeBytes,
			...metadata
		};
	} finally {
		reader.releaseLock();
		await handle.close().catch(() => undefined);
		await rm(temporaryPath, { force: true });
	}
}
