import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { error, type RequestHandler } from '@sveltejs/kit';

import { clampNumber } from '$lib/utils/math';

export const POST: RequestHandler = async ({ request, url }) => {
	if (!request.body) {
		error(400, 'Missing request body.');
	}

	const fps = clampNumber(Number(url.searchParams.get('fps')) || 30, 1, 120);
	const isOpaque = url.searchParams.get('opaque') === 'true';
	const audioBytes = Math.max(0, Number(request.headers.get('x-supers-audio-bytes')) || 0);
	const ffmpegBin = process.env.FFMPEG_PATH ?? 'ffmpeg';
	const workDir = await mkdtemp(join(tmpdir(), 'supers-webm-'));
	const outPath = join(workDir, 'overlay.webm');
	const audioPath = join(workDir, 'mix.wav');
	const reader = request.body.getReader();
	let leftover: Uint8Array | null = null;

	try {
		if (audioBytes > 0) {
			const audioChunks: Uint8Array[] = [];
			let received = 0;
			while (received < audioBytes) {
				const { done, value } = await reader.read();
				if (done) {
					throw new Error('Request body ended inside the declared audio prefix.');
				}
				if (received + value.byteLength <= audioBytes) {
					audioChunks.push(value);
					received += value.byteLength;
				} else {
					const split = audioBytes - received;
					audioChunks.push(value.subarray(0, split));
					leftover = value.subarray(split);
					received = audioBytes;
				}
			}
			await writeFile(audioPath, Buffer.concat(audioChunks));
		}

		const child = spawn(ffmpegBin, [
			'-y',
			'-hide_banner',
			'-loglevel',
			'error',
			'-f',
			'image2pipe',
			'-framerate',
			String(fps),
			'-c:v',
			'png',
			'-i',
			'pipe:0',
			...(audioBytes > 0 ? ['-i', audioPath, '-map', '0:v', '-map', '1:a', '-c:a', 'libopus'] : []),
			'-c:v',
			'libvpx-vp9',
			'-lossless',
			'1',
			'-pix_fmt',
			isOpaque ? 'yuv444p' : 'yuva420p',
			'-auto-alt-ref',
			'0',
			outPath
		]);

		const stderrChunks: Buffer[] = [];
		child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
		const exitCode = new Promise<number>((resolve, reject) => {
			child.once('close', (code) => resolve(code ?? 0));
			child.once('error', reject);
		});

		try {
			if (leftover && leftover.byteLength > 0 && !child.stdin.write(leftover)) {
				await new Promise<void>((resolve) => child.stdin.once('drain', resolve));
			}
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (!child.stdin.write(value)) {
					await new Promise<void>((resolve) => child.stdin.once('drain', resolve));
				}
			}
			child.stdin.end();
			const code = await exitCode;
			if (code !== 0) {
				const detail = Buffer.concat(stderrChunks).toString('utf8').slice(-2000).trim();
				throw new Error(detail || `ffmpeg exited with code ${code}.`);
			}
			const buffer = await readFile(outPath);
			return new Response(buffer, {
				headers: {
					'Content-Type': 'video/webm',
					'Content-Length': String(buffer.byteLength)
				}
			});
		} catch (cause) {
			if (!child.killed) child.kill('SIGKILL');
			throw cause;
		}
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : 'WebM export failed.';
		error(500, message);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
};
