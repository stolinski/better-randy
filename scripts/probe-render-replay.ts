import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

export interface RenderReplayMeasurement {
	frameIndex: number;
	timestampMicroseconds: number;
	width: number;
	height: number;
	firstPixelSha256: string;
	secondPixelSha256: string;
	changedPixelCount: number;
	changedPixelRatio: number;
}

export function measureRenderReplayPngs(
	first: PNG,
	second: PNG,
	address: { frameIndex: number; timestampMicroseconds: number }
): RenderReplayMeasurement | null {
	if (first.width !== second.width || first.height !== second.height) return null;
	let changedPixelCount = 0;
	for (let index = 0; index < first.data.length; index += 4) {
		if (
			first.data[index] !== second.data[index] ||
			first.data[index + 1] !== second.data[index + 1] ||
			first.data[index + 2] !== second.data[index + 2] ||
			first.data[index + 3] !== second.data[index + 3]
		) {
			changedPixelCount += 1;
		}
	}
	const pixelCount = first.width * first.height;
	return {
		...address,
		width: first.width,
		height: first.height,
		firstPixelSha256: createHash('sha256').update(first.data).digest('hex'),
		secondPixelSha256: createHash('sha256').update(second.data).digest('hex'),
		changedPixelCount,
		changedPixelRatio: changedPixelCount / pixelCount
	};
}

function exactNonNegativeInteger(value: string | undefined): number | null {
	if (value === undefined || !/^\d+$/.test(value)) return null;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) ? parsed : null;
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const frameFlag = argv.indexOf('--frame');
	const timestampFlag = argv.indexOf('--timestamp-us');
	const paths = argv.filter((value, index) => {
		return !value.startsWith('--') && index !== frameFlag + 1 && index !== timestampFlag + 1;
	});
	const frameIndex = exactNonNegativeInteger(argv[frameFlag + 1]);
	const timestampMicroseconds = exactNonNegativeInteger(argv[timestampFlag + 1]);
	if (paths.length !== 2 || frameIndex === null || timestampMicroseconds === null) {
		console.error(
			'usage: probe-render-replay.ts <first.png> <second.png> --frame N --timestamp-us N'
		);
		process.exit(2);
	}
	const [firstBytes, secondBytes] = await Promise.all(
		paths.map((path) => readFile(resolve(process.cwd(), path)))
	);
	const measurement = measureRenderReplayPngs(
		PNG.sync.read(firstBytes),
		PNG.sync.read(secondBytes),
		{ frameIndex, timestampMicroseconds }
	);
	if (measurement === null) {
		console.error('probe-render-replay.ts: replay dimensions differ');
		process.exit(1);
	}
	console.log(
		JSON.stringify({
			...measurement,
			verdict: measurement.changedPixelRatio === 0 ? 'pass' : 'fail'
		})
	);
	if (measurement.changedPixelRatio !== 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
