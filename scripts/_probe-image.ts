import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { PNG } from 'pngjs';

export interface ProbeRegion {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface ProbeBounds {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

interface ParseProbeArgsOptions {
	region: 'optional' | 'required';
	usage: string;
}

export function parseProbeArgs({ region: regionRequirement, usage }: ParseProbeArgsOptions): {
	pngPath: string;
	region: ProbeRegion | null;
} {
	const [, , inputPath, ...rest] = process.argv;
	if (!inputPath) {
		console.error(usage);
		process.exit(2);
	}

	let region: ProbeRegion | null = null;
	const regionIndex = rest.indexOf('--region');
	if (regionIndex >= 0) {
		const value = rest[regionIndex + 1];
		if (!value) {
			console.error('--region requires x,y,w,h');
			process.exit(2);
		}

		const [x, y, w, h] = value.split(',').map((part) => Number(part));
		if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
			console.error(`invalid region "${value}"`);
			process.exit(2);
		}
		region = { x, y, w, h };
	}

	if (regionRequirement === 'required' && !region) {
		console.error(usage);
		process.exit(2);
	}

	return { pngPath: resolve(process.cwd(), inputPath), region };
}

export async function loadProbePng(pngPath: string): Promise<PNG> {
	return PNG.sync.read(await readFile(pngPath));
}

export function getProbeBounds(png: PNG, region: ProbeRegion | null): ProbeBounds {
	return {
		x0: region ? Math.max(0, region.x) : 0,
		y0: region ? Math.max(0, region.y) : 0,
		x1: region ? Math.min(png.width, region.x + region.w) : png.width,
		y1: region ? Math.min(png.height, region.y + region.h) : png.height
	};
}
