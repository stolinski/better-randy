import type { AnnotationRenderer } from '$lib/platform/pipelines/types';
import { getCanvasRgbColor } from '$lib/utils/color';
import { clampNumber } from '$lib/utils/math';

export const sideNote: AnnotationRenderer = {
	style: 'side-note',
	kind: 'decorative',
	appliesTo: ['paragraph'],
	draw({ color, context, intensity, layout, paperLayout, progress }) {
		const bounds = layout.bounds;
		const useRightMargin = bounds.x + bounds.width * 0.5 <= paperLayout.x + paperLayout.width * 0.5;
		const noteFontSize = Math.max(28, bounds.height * 0.95);
		const arrowLength = Math.max(60, bounds.height * 2.2);
		const arrowEndX = useRightMargin
			? bounds.x + bounds.width + Math.max(20, bounds.height * 0.45)
			: bounds.x - Math.max(20, bounds.height * 0.45);
		const arrowStartX = useRightMargin ? arrowEndX + arrowLength : arrowEndX - arrowLength;
		const arrowMidY = bounds.y + bounds.height * 0.55;
		const lineWidth = Math.max(3, bounds.height * 0.07);
		const drawProgress = clampNumber(progress, 0, 1);

		context.save();
		context.lineCap = 'round';
		context.lineJoin = 'round';
		context.strokeStyle = getCanvasRgbColor(color, 0.7 + intensity * 0.2);
		context.fillStyle = getCanvasRgbColor(color, 0.85 + intensity * 0.1);
		context.lineWidth = lineWidth;
		context.beginPath();
		context.moveTo(arrowStartX, arrowMidY - bounds.height * 0.4);

		const arrowSegments = 24;
		const drawnSegments = Math.max(1, Math.ceil(arrowSegments * drawProgress));

		for (let segment = 1; segment <= drawnSegments; segment += 1) {
			const segmentProgress = segment / arrowSegments;
			const x = arrowStartX + (arrowEndX - arrowStartX) * segmentProgress;
			const sway = Math.sin(segmentProgress * Math.PI) * bounds.height * 0.5;
			const y = arrowMidY - bounds.height * 0.4 + sway;

			context.lineTo(x, y);
		}

		context.stroke();

		if (drawProgress >= 0.65) {
			const headSize = Math.max(10, bounds.height * 0.4);
			const headDirection = useRightMargin ? -1 : 1;

			context.beginPath();
			context.moveTo(arrowEndX, arrowMidY);
			context.lineTo(arrowEndX + headDirection * headSize, arrowMidY - headSize * 0.6);
			context.lineTo(arrowEndX + headDirection * headSize * 0.6, arrowMidY);
			context.lineTo(arrowEndX + headDirection * headSize, arrowMidY + headSize * 0.6);
			context.closePath();
			context.fill();
		}

		const text = '';

		if (text.length > 0 && drawProgress >= 0.4) {
			const textOpacity = clampNumber((drawProgress - 0.4) / 0.45, 0, 1);

			context.fillStyle = getCanvasRgbColor(color, (0.85 + intensity * 0.1) * textOpacity);
			context.font = `italic ${noteFontSize}px Georgia, "Times New Roman", serif`;
			context.textBaseline = 'top';
			context.textAlign = useRightMargin ? 'left' : 'right';
			context.fillText(
				text,
				arrowStartX,
				arrowMidY + bounds.height * 0.3,
				Math.max(160, Math.abs(arrowEndX - arrowStartX) + arrowLength * 0.3)
			);
		}

		context.restore();
	}
};
