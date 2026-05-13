import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { error, type RequestHandler } from '@sveltejs/kit';

import { clampNumber } from '$lib/utils/math';

export const POST: RequestHandler = async ({ request, url }) => {
	if (!request.body) {
		error(400, 'Missing request body.');
	}

	const fps = clampNumber(Number(url.searchParams.get('fps')) || 30, 1, 120);
	const ffmpegBin = process.env.FFMPEG_PATH ?? 'ffmpeg';

	const workDir = await mkdtemp(join(tmpdir(), 'hiviz-prores-'));
	const outPath = join(workDir, 'overlay.mov');

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
		'-c:v',
		'prores_ks',
		'-profile:v',
		'4444',
		'-pix_fmt',
		'yuva444p10le',
		'-vendor',
		'apl0',
		outPath
	]);

	const stderrChunks: Buffer[] = [];
	child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

	const exitCode = new Promise<number>((resolve, reject) => {
		child.once('close', (code) => resolve(code ?? 0));
		child.once('error', reject);
	});

	try {
		const reader = request.body.getReader();

		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				break;
			}

			if (!child.stdin.write(value)) {
				await new Promise<void>((resolve) => child.stdin.once('drain', () => resolve()));
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
				'Content-Type': 'video/quicktime',
				'Content-Length': String(buffer.byteLength)
			}
		});
	} catch (cause) {
		if (!child.killed) {
			child.kill('SIGKILL');
		}

		const message = cause instanceof Error ? cause.message : 'ProRes export failed.';

		error(500, message);
	} finally {
		await rm(workDir, { recursive: true, force: true });
	}
};
