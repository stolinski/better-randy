import type { PNG } from 'pngjs';

// Shared measurement-channel resolver for the alpha-keyed Critic probes
// (banding, edge-aa, ink-coverage). These probes were written for transparent
// overlays where the signal lives in the alpha channel — but they degenerate to
// meaningless values on (a) opaque `backgroundFill` segments/bumpers (alpha is
// uniformly 255) and (b) flattened page-composite captures of transparent
// overlays (Page.captureScreenshot drops alpha to 255). In both cases the real
// signal is in luma. This resolver lets the probes measure luma instead — either
// on request (`--channel luma`) or by auto-detecting a uniformly-opaque region —
// and reports which channel it used so the reading is never ambiguous.

export type Channel = 'alpha' | 'luma';

export function lumaAt(png: PNG, x: number, y: number): number {
	const i = (y * png.width + x) * 4;
	return 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
}

export function alphaAt(png: PNG, x: number, y: number): number {
	return png.data[(y * png.width + x) * 4 + 3];
}

export function parseChannelFlag(argv: readonly string[]): Channel | undefined {
	const i = argv.indexOf('--channel');
	if (i >= 0) {
		const value = argv[i + 1];
		if (value === 'luma' || value === 'alpha') return value;
	}
	return undefined;
}

interface Bounds {
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

// Resolve the channel to measure: an explicit request wins; otherwise auto-detect
// — a region whose every alpha is 255 has no alpha signal, so fall back to luma.
export function resolveChannel(
	png: PNG,
	bounds: Bounds,
	requested: Channel | undefined
): { channel: Channel; sample: (x: number, y: number) => number } {
	let channel: Channel;
	if (requested) {
		channel = requested;
	} else {
		let opaque = true;
		detect: for (let y = bounds.y0; y < bounds.y1; y++) {
			for (let x = bounds.x0; x < bounds.x1; x++) {
				if (alphaAt(png, x, y) !== 255) {
					opaque = false;
					break detect;
				}
			}
		}
		channel = opaque ? 'luma' : 'alpha';
	}
	const sample =
		channel === 'luma'
			? (x: number, y: number) => lumaAt(png, x, y)
			: (x: number, y: number) => alphaAt(png, x, y);
	return { channel, sample };
}

// Modal luma (most common 8-bucket value, scaled back to 0..255) over a region —
// used as the "background" reference so ink-coverage can count luma DEVIATION
// (content reads as either brighter or darker than the field) on opaque pieces.
export function modalLuma(png: PNG, bounds: Bounds): number {
	const buckets = new Array<number>(32).fill(0);
	for (let y = bounds.y0; y < bounds.y1; y++) {
		for (let x = bounds.x0; x < bounds.x1; x++) {
			const b = Math.min(31, Math.floor((lumaAt(png, x, y) / 255) * 32));
			buckets[b] += 1;
		}
	}
	let best = 0;
	for (let b = 1; b < buckets.length; b++) {
		if (buckets[b] > buckets[best]) best = b;
	}
	return (best / 32) * 255 + 255 / 64; // bucket centre
}
