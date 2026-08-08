import tgpu, { d } from 'typegpu';

import type { ResolvedChartMarkFill } from '$lib/platform/packs/resolve';
import {
	ChartMarkFillUniforms,
	packChartMarkFillUniforms
} from '$lib/pipelines/shader-passes/chart-mark-fill';

export interface ChartMarkFillGpuProbePackingInput {
	base: ResolvedChartMarkFill;
	emphasis: ResolvedChartMarkFill;
	canvasWidth: number;
	canvasHeight: number;
}

export interface ChartMarkFillGpuProbeBuffer {
	buffer: GPUBuffer;
	destroy(): void;
}

/** Build the probe buffer through the same TypeGPU schema and packer future renderers consume. */
export function createChartMarkFillGpuProbeBuffer(
	device: GPUDevice,
	inputs: readonly ChartMarkFillGpuProbePackingInput[]
): ChartMarkFillGpuProbeBuffer {
	const root = tgpu.initFromDevice({ device });
	const schema = d.arrayOf(ChartMarkFillUniforms, inputs.length);
	const buffer = root
		.createBuffer(
			schema,
			inputs.map((input) =>
				packChartMarkFillUniforms(input.base, input.emphasis, input.canvasWidth, input.canvasHeight)
			)
		)
		.$usage('storage');
	return {
		buffer: buffer.buffer,
		destroy(): void {
			buffer.destroy();
			root.destroy();
		}
	};
}
