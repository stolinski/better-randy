import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

// Decode-verify the ACTUAL exported file — not the captured DOM frames.
//
// scripts/probe-frame-diff.ts asserts a PNG sequence animates and carries alpha,
// but was only ever self-tested on frames captured before encode; the encoded
// WebM/ProRes output was never verified. This script closes that gap: it decodes
// the real exported file back to RGBA PNGs with ffmpeg (the same binary the
// ProRes route uses server-side) and feeds the frame paths to probe-frame-diff.
//
// ProRes 4444 (yuva444p10le) round-trips alpha and is byte-deterministic; VP9
// hardware encode is not, so prefer a ProRes export for this check.
//
// A 4K all-frames decode is multiple GB, so by default this samples N
// evenly-spaced frames across the clip (enough to prove motion + alpha). Pass
// `--all` for the literal every-frame decode, or `--frames N` to set the count.
//
// Known edge (do NOT solve here): an opaque full-frame piece carries no alpha,
// so probe-frame-diff's alpha clause fails by design. That's the `--opaque`
// mode owned by corpus-tail task 9w7kdptf, not this script.
//
// usage: probe-export-decode.ts <exported.mov|.webm> [--frames N] [--all] [--keep]
// exit:  forwarded from probe-frame-diff — 0 pass, 1 fail, 2 usage.

interface DecodePlan {
	total: number;
	step: number;
	sampled: number;
	mode: 'all' | 'sampled';
}

function flagValue(argv: readonly string[], name: string): string | undefined {
	const i = argv.indexOf(name);
	return i >= 0 ? argv[i + 1] : undefined;
}

function runFfmpeg(bin: string, ffmpegArgs: readonly string[]): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(bin, ffmpegArgs);
		const stderrChunks: Buffer[] = [];
		child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
		child.once('error', reject);
		child.once('close', (code) => {
			if (code === 0) {
				resolvePromise();
				return;
			}
			const detail = Buffer.concat(stderrChunks).toString('utf8').slice(-2000).trim();
			reject(new Error(detail || `ffmpeg exited with code ${code}.`));
		});
	});
}

// Count decodable video frames. ffprobe with -count_frames is exact for the
// all-intra ProRes output; returns null when the container omits the count so
// the caller can fall back to an all-frames decode.
async function countFrames(bin: string, input: string): Promise<number | null> {
	const out = await new Promise<string>((resolvePromise, reject) => {
		const child = spawn(bin, [
			'-v',
			'error',
			'-select_streams',
			'v:0',
			'-count_frames',
			'-show_entries',
			'stream=nb_read_frames',
			'-of',
			'default=nokey=1:noprint_wrappers=1',
			input
		]);
		const chunks: Buffer[] = [];
		child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
		child.once('error', reject);
		child.once('close', () => resolvePromise(Buffer.concat(chunks).toString('utf8').trim()));
	});
	const n = Number.parseInt(out, 10);
	return Number.isFinite(n) && n > 0 ? n : null;
}

function planDecode(total: number | null, all: boolean, requested: number): DecodePlan {
	if (all || total === null || total <= requested) {
		return { total: total ?? 0, step: 1, sampled: total ?? 0, mode: 'all' };
	}
	const step = Math.max(1, Math.floor(total / requested));
	const sampled = Math.floor((total - 1) / step) + 1;
	return { total, step, sampled, mode: 'sampled' };
}

function ffprobeBin(): string {
	const ffmpeg = process.env.FFMPEG_PATH;
	// FFMPEG_PATH (matching the ProRes route) may point at the ffmpeg binary; the
	// sibling ffprobe lives beside it. Fall back to PATH lookups otherwise.
	if (ffmpeg && ffmpeg.endsWith('ffmpeg')) return `${ffmpeg.slice(0, -'ffmpeg'.length)}ffprobe`;
	return process.env.FFPROBE_PATH ?? 'ffprobe';
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const positionals = argv.filter((arg) => !arg.startsWith('--'));
	const input = positionals[0];
	if (!input) {
		console.error(
			'usage: probe-export-decode.ts <exported.mov|.webm> [--frames N] [--all] [--keep]'
		);
		process.exit(2);
	}

	const inputPath = resolve(process.cwd(), input);
	try {
		if (!(await stat(inputPath)).isFile()) throw new Error('not a file');
	} catch {
		console.error(`probe-export-decode.ts: cannot read exported file: ${inputPath}`);
		process.exit(2);
	}

	const all = argv.includes('--all');
	const keep = argv.includes('--keep');
	const framesFlag = flagValue(argv, '--frames');
	const requested = framesFlag ? Math.max(2, Number.parseInt(framesFlag, 10) || 8) : 8;

	const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
	const ffprobe = ffprobeBin();

	const total = await countFrames(ffprobe, inputPath);
	const plan = planDecode(total, all, requested);

	const workDir = await mkdtemp(join(tmpdir(), 'supers-decode-'));
	try {
		const pattern = join(workDir, 'frame_%04d.png');
		const selectArgs =
			plan.mode === 'sampled'
				? ['-vf', `select='not(mod(n,${plan.step}))'`, '-fps_mode', 'passthrough']
				: [];
		await runFfmpeg(ffmpeg, [
			'-y',
			'-hide_banner',
			'-loglevel',
			'error',
			'-i',
			inputPath,
			...selectArgs,
			'-pix_fmt',
			'rgba',
			pattern
		]);

		const pngs = (await readdir(workDir))
			.filter((name) => name.endsWith('.png'))
			.sort()
			.map((name) => join(workDir, name));

		if (pngs.length < 2) {
			console.error(
				`probe-export-decode.ts: decoded ${pngs.length} frame(s) from ${inputPath} — need ≥2 to diff`
			);
			process.exit(1);
		}

		// Feed the decoded frames to the existing probe verbatim (its exit code and
		// JSON are the verdict); wrap that JSON with decode provenance.
		const probeScript = fileURLToPath(new URL('./probe-frame-diff.ts', import.meta.url));
		const probe = spawn(
			process.execPath,
			['--experimental-strip-types', '--no-warnings', probeScript, ...pngs],
			{ stdio: ['ignore', 'pipe', 'inherit'] }
		);
		const stdoutChunks: Buffer[] = [];
		probe.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
		const probeCode = await new Promise<number>((resolvePromise, reject) => {
			probe.once('error', reject);
			probe.once('close', (code) => resolvePromise(code ?? 0));
		});

		const raw = Buffer.concat(stdoutChunks).toString('utf8').trim();
		let probeJson: unknown = raw;
		try {
			probeJson = JSON.parse(raw);
		} catch {
			// keep the raw string if the probe printed something non-JSON
		}

		console.log(
			JSON.stringify(
				{
					source: inputPath,
					decode: {
						total_frames: plan.total || null,
						decoded_frames: pngs.length,
						mode: plan.mode,
						step: plan.step,
						pix_fmt: 'rgba'
					},
					...(typeof probeJson === 'object' && probeJson !== null
						? probeJson
						: { probe_output: probeJson })
				},
				null,
				2
			)
		);

		if (keep) console.error(`probe-export-decode.ts: kept decoded frames in ${workDir}`);
		process.exitCode = probeCode;
	} finally {
		if (!keep) await rm(workDir, { recursive: true, force: true });
	}
}

await main();
