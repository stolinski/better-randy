import type { AnnotationRenderer } from '$lib/platform/pipelines/types';
import { getCanvasRgbColor } from '$lib/utils/color';
import { clampNumber } from '$lib/utils/math';

export const boxAnnotationRenderer: AnnotationRenderer = {
	style: 'box',
	kind: 'decorative',
	appliesTo: ['paragraph'],
	draw({ color, context, intensity, layout, progress }) {
		const bounds = layout.bounds;
		const padding = Math.max(8, bounds.height * 0.18);
		const left = bounds.x - padding;
		const top = bounds.y - padding * 0.6;
		const right = bounds.x + bounds.width + padding;
		const bottom = bounds.y + bounds.height + padding * 0.6;
		const perimeterStops: [number, number][] = [
			[left, top],
			[right, top],
			[right, bottom],
			[left, bottom],
			[left, top]
		];
		const segments = perimeterStops.length - 1;
		const progressLength = segments * clampNumber(progress, 0, 1);
		const lineWidth = Math.max(4, bounds.height * 0.08);

		context.save();
		context.lineCap = 'round';
		context.lineJoin = 'round';
		context.lineWidth = lineWidth;
		context.strokeStyle = getCanvasRgbColor(color, 0.7 + intensity * 0.2);
		context.beginPath();
		context.moveTo(perimeterStops[0][0], perimeterStops[0][1]);

		for (let segmentIndex = 0; segmentIndex < segments; segmentIndex += 1) {
			const remaining = progressLength - segmentIndex;

			if (remaining <= 0) {
				break;
			}

			const portion = Math.min(1, remaining);
			const start = perimeterStops[segmentIndex];
			const end = perimeterStops[segmentIndex + 1];
			const targetX = start[0] + (end[0] - start[0]) * portion;
			const targetY = start[1] + (end[1] - start[1]) * portion;
			const wobble = bounds.height * 0.018 * Math.sin(segmentIndex * 1.7 + bounds.x * 0.011);

			context.lineTo(targetX + wobble, targetY - wobble);
		}

		context.stroke();
		context.restore();
	}
};
