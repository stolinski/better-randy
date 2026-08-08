import type { ChartRenderInputs } from '$lib/platform/pipelines/types';
import { createChartMarkFillWgsl, packChartMarkFillUniforms } from './chart-mark-fill';

const CHART_MARK_INSTANCE_STRIDE = 144;
const TEXTURE_USAGE_COPY_SRC = 0x01;
const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const CHART_TEXTURE_USAGE =
	TEXTURE_USAGE_COPY_SRC | TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_RENDER_ATTACHMENT;
const SHADER_STAGE_VERTEX = 0x1;
const SHADER_STAGE_FRAGMENT = 0x2;
const BUFFER_USAGE_COPY_DST = 0x8;
const BUFFER_USAGE_STORAGE = 0x80;

export interface ChartMarkRenderer {
	dispose(): void;
	getOutputTexture(): GPUTexture;
	render(inputs: ChartRenderInputs | undefined): void;
}

function writeVec4(view: DataView, byteOffset: number, values: readonly number[]): void {
	for (let index = 0; index < 4; index += 1)
		view.setFloat32(byteOffset + index * 4, values[index], true);
}

function writeU32x4(view: DataView, byteOffset: number, values: readonly number[]): void {
	for (let index = 0; index < 4; index += 1)
		view.setUint32(byteOffset + index * 4, values[index], true);
}

export function countChartMarkRendererInstances(inputs: ChartRenderInputs): number {
	return inputs.marks.length + inputs.swatches.length;
}

export function packChartMarkRendererInstances(
	inputs: ChartRenderInputs,
	canvasWidth: number,
	canvasHeight: number
): ArrayBuffer {
	if (inputs.baseFillByVoice.length === 0) {
		throw new RangeError('Chart mark renderer requires at least one base fill voice.');
	}
	if (inputs.emphasisFillByVoice.length !== inputs.baseFillByVoice.length) {
		throw new RangeError('Chart mark renderer requires matching base and emphasis fill voices.');
	}
	const highestVoiceIndex = Math.max(
		-1,
		...inputs.marks.map((mark) => mark.fillVoiceIndex),
		...inputs.swatches.map((swatch) => swatch.fillVoiceIndex)
	);
	if (highestVoiceIndex >= inputs.baseFillByVoice.length) {
		throw new RangeError('Chart mark renderer has no treatment for a geometry fill voice.');
	}
	const visualMarks = [
		...inputs.marks.map((mark) => ({
			bounds: mark.bounds,
			cornerRadius: mark.cornerRadius,
			fillVoiceIndex: mark.fillVoiceIndex,
			isHighlighted: mark.isHighlighted,
			labelBounds: mark.labelPlateBounds
				? [
						mark.labelPlateBounds.x,
						mark.labelPlateBounds.y,
						mark.labelPlateBounds.width,
						mark.labelPlateBounds.height
					]
				: [0, 0, 0, 0]
		})),
		...inputs.swatches.map((swatch) => ({
			bounds: swatch.bounds,
			cornerRadius: swatch.cornerRadius,
			fillVoiceIndex: swatch.fillVoiceIndex,
			isHighlighted: false,
			labelBounds: [0, 0, 0, 0]
		}))
	];
	const buffer = new ArrayBuffer(visualMarks.length * CHART_MARK_INSTANCE_STRIDE);
	const view = new DataView(buffer);
	for (let index = 0; index < visualMarks.length; index += 1) {
		const mark = visualMarks[index];
		const packed = packChartMarkFillUniforms(
			inputs.baseFillByVoice[mark.fillVoiceIndex],
			inputs.emphasisFillByVoice[mark.fillVoiceIndex],
			canvasWidth,
			canvasHeight
		);
		const offset = index * CHART_MARK_INSTANCE_STRIDE;
		writeVec4(view, offset, [mark.bounds.x, mark.bounds.y, mark.bounds.width, mark.bounds.height]);
		writeVec4(view, offset + 16, packed.baseColorA);
		writeVec4(view, offset + 32, packed.baseColorB);
		writeVec4(view, offset + 48, packed.emphasisColorA);
		writeVec4(view, offset + 64, packed.emphasisColorB);
		writeVec4(view, offset + 80, [
			mark.cornerRadius,
			packed.baseCellPx,
			packed.emphasisCellPx,
			inputs.alpha
		]);
		writeU32x4(view, offset + 96, [
			mark.fillVoiceIndex,
			packed.baseMode,
			packed.baseGradientAxis,
			packed.baseMatrixBits
		]);
		writeU32x4(view, offset + 112, [
			packed.emphasisMode,
			packed.emphasisGradientAxis,
			packed.emphasisMatrixBits,
			mark.isHighlighted ? 1 : 0
		]);
		writeVec4(view, offset + 128, mark.labelBounds);
	}
	return buffer;
}

export function createChartMarkRendererWgsl(canvasWidth: number, canvasHeight: number): string {
	return /* wgsl */ `
${createChartMarkFillWgsl()}

struct ChartMarkInstance {
	bounds: vec4f,
	baseColorA: vec4f,
	baseColorB: vec4f,
	emphasisColorA: vec4f,
	emphasisColorB: vec4f,
	numeric: vec4f,
	baseFlags: vec4u,
	emphasisFlags: vec4u,
	labelBounds: vec4f,
};

@group(0) @binding(0) var<storage, read> chartMarks: array<ChartMarkInstance>;

struct ChartMarkVertexOutput {
	@builtin(position) position: vec4f,
	@location(0) localUv: vec2f,
	@location(1) @interpolate(flat) instanceIndex: u32,
};

@vertex
fn chartMarkVertex(
	@builtin(vertex_index) vertexIndex: u32,
	@builtin(instance_index) instanceIndex: u32
) -> ChartMarkVertexOutput {
	let corners = array<vec2f, 6>(
		vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
		vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
	);
	let localUv = corners[vertexIndex];
	let bounds = chartMarks[instanceIndex].bounds;
	let pixel = bounds.xy + localUv * bounds.zw;
	let frameSize = vec2f(${canvasWidth.toFixed(1)}, ${canvasHeight.toFixed(1)});
	let clip = vec2f(pixel.x / frameSize.x * 2.0 - 1.0, 1.0 - pixel.y / frameSize.y * 2.0);
	var out: ChartMarkVertexOutput;
	out.position = vec4f(clip, 0.0, 1.0);
	out.localUv = localUv;
	out.instanceIndex = instanceIndex;
	return out;
}

@fragment
fn chartMarkFragment(input: ChartMarkVertexOutput) -> @location(0) vec4f {
	let mark = chartMarks[input.instanceIndex];
	let localPx = input.localUv * mark.bounds.zw;
	let halfSize = mark.bounds.zw * 0.5;
	let radius = min(mark.numeric.x, min(halfSize.x, halfSize.y));
	let centered = localPx - halfSize;
	let rounded = abs(centered) - halfSize + vec2f(radius);
	let signedDistance = length(max(rounded, vec2f(0.0))) + min(max(rounded.x, rounded.y), 0.0) - radius;
	var maskAlpha = 1.0 - smoothstep(-0.75, 0.75, signedDistance);
	let pixel = mark.bounds.xy + localPx;
	let hasLabelPlate = mark.labelBounds.z > 0.0 && mark.labelBounds.w > 0.0;
	let insideLabelPlate =
		pixel.x >= mark.labelBounds.x && pixel.x <= mark.labelBounds.x + mark.labelBounds.z &&
		pixel.y >= mark.labelBounds.y && pixel.y <= mark.labelBounds.y + mark.labelBounds.w;
	if (hasLabelPlate && insideLabelPlate) {
		maskAlpha = 0.0;
	}
	let sample = resolveChartMarkFillSample(
		mark.baseFlags.y,
		mark.baseColorA,
		mark.baseColorB,
		mark.baseFlags.z,
		mark.baseFlags.w,
		mark.numeric.y,
		mark.emphasisFlags.x,
		mark.emphasisColorA,
		mark.emphasisColorB,
		mark.emphasisFlags.y,
		mark.emphasisFlags.z,
		mark.numeric.z,
		input.localUv,
		localPx,
		vec2f(${canvasWidth.toFixed(1)}, ${canvasHeight.toFixed(1)}),
		mark.baseFlags.x,
		maskAlpha,
		1.0,
		f32(mark.emphasisFlags.w)
	);
	return sample * mark.numeric.w;
}
`;
}

export function createChartMarkRenderer(
	device: GPUDevice,
	canvasWidth: number,
	canvasHeight: number
): ChartMarkRenderer {
	const outputTexture = device.createTexture({
		label: 'chart-mark-renderer-output',
		size: [canvasWidth, canvasHeight, 1],
		format: 'rgba8unorm',
		usage: CHART_TEXTURE_USAGE
	});
	const shader = device.createShaderModule({
		label: 'chart-mark-renderer-shader',
		code: createChartMarkRendererWgsl(canvasWidth, canvasHeight)
	});
	const bindGroupLayout = device.createBindGroupLayout({
		entries: [
			{
				binding: 0,
				visibility: SHADER_STAGE_VERTEX | SHADER_STAGE_FRAGMENT,
				buffer: { type: 'read-only-storage' }
			}
		]
	});
	const pipeline = device.createRenderPipeline({
		label: 'chart-mark-renderer-pipeline',
		layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
		vertex: { module: shader, entryPoint: 'chartMarkVertex' },
		fragment: {
			module: shader,
			entryPoint: 'chartMarkFragment',
			targets: [
				{
					format: 'rgba8unorm',
					blend: {
						color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
						alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }
					}
				}
			]
		},
		primitive: { topology: 'triangle-list' }
	});
	let instanceBuffer: GPUBuffer | null = null;
	let instanceBindGroup: GPUBindGroup | null = null;
	let instanceCapacity = 0;

	function requireInstanceBuffer(byteLength: number): GPUBuffer {
		const requiredCapacity = Math.max(CHART_MARK_INSTANCE_STRIDE, byteLength);
		if (instanceBuffer && instanceCapacity >= requiredCapacity) return instanceBuffer;
		instanceBuffer?.destroy();
		instanceCapacity = requiredCapacity;
		instanceBuffer = device.createBuffer({
			label: 'chart-mark-renderer-instances',
			size: instanceCapacity,
			usage: BUFFER_USAGE_STORAGE | BUFFER_USAGE_COPY_DST
		});
		instanceBindGroup = device.createBindGroup({
			layout: bindGroupLayout,
			entries: [{ binding: 0, resource: { buffer: instanceBuffer } }]
		});
		return instanceBuffer;
	}

	function render(inputs: ChartRenderInputs | undefined): void {
		const instanceCount = inputs ? countChartMarkRendererInstances(inputs) : 0;
		if (inputs && instanceCount > 0) {
			const packed = packChartMarkRendererInstances(inputs, canvasWidth, canvasHeight);
			const buffer = requireInstanceBuffer(packed.byteLength);
			device.queue.writeBuffer(buffer, 0, packed);
		}
		const encoder = device.createCommandEncoder({ label: 'chart-mark-renderer-command' });
		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: outputTexture.createView(),
					clearValue: [0, 0, 0, 0],
					loadOp: 'clear',
					storeOp: 'store'
				}
			]
		});
		if (instanceBindGroup && instanceCount > 0) {
			pass.setPipeline(pipeline);
			pass.setBindGroup(0, instanceBindGroup);
			pass.draw(6, instanceCount);
		}
		pass.end();
		device.queue.submit([encoder.finish()]);
	}

	function dispose(): void {
		instanceBuffer?.destroy();
		outputTexture.destroy();
	}

	return { render, dispose, getOutputTexture: () => outputTexture };
}
