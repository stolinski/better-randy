import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import type { PNG } from 'pngjs';

import { getProbeBounds, loadProbePng, parseProbeArgs, type ProbeBounds } from './_probe-image.ts';

export interface LocalContrastMeasurement {
	measuredRatio: number;
	treatmentSampleCount: number;
}

export interface LocalContrastCaptureBinding {
	schemaVersion: 1;
	frameIndex: number;
	timestampMicroseconds: number;
	region: { x: number; y: number; width: number; height: number };
	captureWidth: number;
	captureHeight: number;
	backgroundSha256: string;
	treatmentSha256: string;
	authoritativeMaskSha256: string;
}

interface ProbeRgb {
	r: number;
	g: number;
	b: number;
}

function channelLuminance(channel: number): number {
	const normalized = channel / 255;
	return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function luminance(color: ProbeRgb): number {
	return (
		0.2126 * channelLuminance(color.r) +
		0.7152 * channelLuminance(color.g) +
		0.0722 * channelLuminance(color.b)
	);
}

function contrastRatio(left: ProbeRgb, right: ProbeRgb): number {
	const lighter = Math.max(luminance(left), luminance(right));
	const darker = Math.min(luminance(left), luminance(right));
	return (lighter + 0.05) / (darker + 0.05);
}

function compositedPixel(png: PNG, index: number): ProbeRgb {
	const alpha = png.data[index + 3] / 255;
	return {
		r: png.data[index] * alpha + 127 * (1 - alpha),
		g: png.data[index + 1] * alpha + 127 * (1 - alpha),
		b: png.data[index + 2] * alpha + 127 * (1 - alpha)
	};
}

/** Measure only the authority's exact binary significant-treatment mask. */
export function measureLocalBackgroundContrast(
	background: PNG,
	treatment: PNG,
	authoritativeMask: PNG,
	bounds: ProbeBounds
): LocalContrastMeasurement | null {
	if (
		background.width !== treatment.width ||
		background.height !== treatment.height ||
		background.width !== authoritativeMask.width ||
		background.height !== authoritativeMask.height
	) {
		return null;
	}
	let minimum = Infinity;
	let treatmentSampleCount = 0;
	for (let y = bounds.y0; y < bounds.y1; y += 1) {
		for (let x = bounds.x0; x < bounds.x1; x += 1) {
			const index = (y * background.width + x) * 4;
			const maskAlpha = authoritativeMask.data[index + 3];
			if (maskAlpha !== 0 && maskAlpha !== 255) return null;
			if (maskAlpha === 0) continue;
			const differs = [0, 1, 2, 3].some(
				(channel) => background.data[index + channel] !== treatment.data[index + channel]
			);
			if (!differs) return null;
			minimum = Math.min(
				minimum,
				contrastRatio(compositedPixel(treatment, index), compositedPixel(background, index))
			);
			treatmentSampleCount += 1;
		}
	}
	return treatmentSampleCount > 0 ? { measuredRatio: minimum, treatmentSampleCount } : null;
}

function isSha256(value: unknown): value is string {
	return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function parseCaptureBinding(value: unknown): LocalContrastCaptureBinding | null {
	if (!value || typeof value !== 'object') return null;
	const binding = value as Record<string, unknown>;
	const region = binding.region;
	if (!region || typeof region !== 'object') return null;
	const parsedRegion = region as Record<string, unknown>;
	if (
		!Number.isInteger(binding.frameIndex) ||
		!Number.isInteger(binding.timestampMicroseconds) ||
		!Number.isInteger(binding.captureWidth) ||
		!Number.isInteger(binding.captureHeight) ||
		!Number.isInteger(parsedRegion.x) ||
		!Number.isInteger(parsedRegion.y) ||
		!Number.isInteger(parsedRegion.width) ||
		!Number.isInteger(parsedRegion.height) ||
		!isSha256(binding.backgroundSha256) ||
		!isSha256(binding.treatmentSha256) ||
		!isSha256(binding.authoritativeMaskSha256)
	) {
		return null;
	}
	return binding as unknown as LocalContrastCaptureBinding;
}

async function sha256File(path: string): Promise<string> {
	return createHash('sha256')
		.update(await readFile(path))
		.digest('hex');
}

async function main(): Promise<void> {
	const { pngPath, region } = parseProbeArgs({
		region: 'required',
		usage:
			'usage: probe-local-contrast.ts <background-only.png> --treatment <with-text.png> --mask <mask.png> --binding <binding.json> --region x,y,w,h --class body|large'
	});
	const treatmentIndex = process.argv.indexOf('--treatment');
	const maskIndex = process.argv.indexOf('--mask');
	const bindingIndex = process.argv.indexOf('--binding');
	const classIndex = process.argv.indexOf('--class');
	const treatmentPath = process.argv[treatmentIndex + 1];
	const maskPath = process.argv[maskIndex + 1];
	const bindingPath = process.argv[bindingIndex + 1];
	const textClass = process.argv[classIndex + 1];
	if (
		treatmentIndex < 0 ||
		maskIndex < 0 ||
		bindingIndex < 0 ||
		!treatmentPath ||
		!maskPath ||
		!bindingPath ||
		(textClass !== 'body' && textClass !== 'large')
	) {
		console.error(
			'probe-local-contrast.ts: --treatment, --mask, --binding, and --class are required'
		);
		process.exit(2);
	}
	const binding = parseCaptureBinding(JSON.parse(await readFile(bindingPath, 'utf8')));
	if (!binding || !region) {
		console.error('probe-local-contrast.ts: invalid exact-frame capture binding');
		process.exit(1);
	}
	const [background, treatment, authoritativeMask, hashes] = await Promise.all([
		loadProbePng(pngPath),
		loadProbePng(treatmentPath),
		loadProbePng(maskPath),
		Promise.all([sha256File(pngPath), sha256File(treatmentPath), sha256File(maskPath)])
	]);
	if (
		binding.captureWidth !== background.width ||
		binding.captureHeight !== background.height ||
		binding.region.x !== region.x ||
		binding.region.y !== region.y ||
		binding.region.width !== region.w ||
		binding.region.height !== region.h ||
		binding.backgroundSha256 !== hashes[0] ||
		binding.treatmentSha256 !== hashes[1] ||
		binding.authoritativeMaskSha256 !== hashes[2]
	) {
		console.error(
			'probe-local-contrast.ts: captures, mask, region, or dimensions do not match binding'
		);
		process.exit(1);
	}
	const measurement = measureLocalBackgroundContrast(
		background,
		treatment,
		authoritativeMask,
		getProbeBounds(background, region)
	);
	if (measurement === null) {
		console.error(
			'probe-local-contrast.ts: authoritative treatment mask is unavailable or invalid'
		);
		process.exit(1);
	}
	const requiredRatio = textClass === 'large' ? 3 : 4.5;
	console.log(
		JSON.stringify({
			frame_index: binding.frameIndex,
			timestamp_microseconds: binding.timestampMicroseconds,
			measured_ratio: Number(measurement.measuredRatio.toFixed(4)),
			treatment_sample_count: measurement.treatmentSampleCount,
			text_class: textClass,
			verdict: measurement.measuredRatio >= requiredRatio ? 'pass' : 'fail'
		})
	);
	if (measurement.measuredRatio < requiredRatio) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}
