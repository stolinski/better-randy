import type { PNG } from 'pngjs';

export type ProbeOutputClass = 'transparent' | 'opaque' | 'mixed';

/** G12 classification uses the complete decoded frame edge, not a page-capture border. */
export function classifyProbeOutputClass(png: PNG): ProbeOutputClass {
	let everyTransparent = true;
	let everyOpaque = true;
	const inspect = (x: number, y: number): void => {
		const alpha = png.data[(y * png.width + x) * 4 + 3];
		everyTransparent &&= alpha === 0;
		everyOpaque &&= alpha === 255;
	};
	for (let x = 0; x < png.width; x += 1) {
		inspect(x, 0);
		if (png.height > 1) inspect(x, png.height - 1);
	}
	for (let y = 1; y < png.height - 1; y += 1) {
		inspect(0, y);
		if (png.width > 1) inspect(png.width - 1, y);
	}
	return everyTransparent ? 'transparent' : everyOpaque ? 'opaque' : 'mixed';
}
