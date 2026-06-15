import tgpu, { d } from 'typegpu';

import {
	drawAnnotationMarks,
	getAnnotationMarkLayouts,
	type AnnotationFrameLayout
} from '$lib/annotations/annotation-marks';
import { getHtmlInCanvasQueue } from '$lib/platform/html-in-canvas';
import { INTERMEDIATE_FORMAT, type GpuHost } from '$lib/platform/gpu-host';
import type { SurfaceAnimState, SurfaceRenderInputs, SurfaceRenderInstance } from '$lib/platform/pipelines/types';

const TEXTURE_USAGE_COPY_SRC = 0x01;
const TEXTURE_USAGE_COPY_DST = 0x02;
const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const DOM_TEXTURE_USAGE =
	TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_DST | TEXTURE_USAGE_RENDER_ATTACHMENT;
const OUTPUT_TEXTURE_USAGE =
	TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_SRC | TEXTURE_USAGE_RENDER_ATTACHMENT;

export type { SurfaceAnimState as PlainAnimState, SurfaceRenderInputs as PlainRenderInputs, SurfaceRenderInstance as PlainPipeline };

export interface CreatePlainPipelineOptions {
	host: GpuHost;
	sourceElement: HTMLElement;
}

const composeLayout = tgpu.bindGroupLayout({
	domTexture: { texture: d.texture2d(d.f32) },
	marksTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' }
});

const composeVertexFn = tgpu['~unstable'].vertexFn({
	in: { vertexIndex: d.builtin.vertexIndex },
	out: { position: d.builtin.position, uv: d.vec2f }
})/* wgsl */ `{
	var positions = array<vec2f, 3>(
		vec2f(-1.0, -1.0),
		vec2f(3.0, -1.0),
		vec2f(-1.0, 3.0)
	);
	var uvs = array<vec2f, 3>(
		vec2f(0.0, 1.0),
		vec2f(2.0, 1.0),
		vec2f(0.0, -1.0)
	);
	return Out(
		vec4f(positions[in.vertexIndex], 0.0, 1.0),
		uvs[in.vertexIndex]
	);
}`;

const composeFragmentFn = tgpu['~unstable']
	.fragmentFn({
		in: { uv: d.vec2f },
		out: d.vec4f
	})/* wgsl */ `{
		let dom = textureSample(layout.$.domTexture, layout.$.samp, in.uv);
		let marks = textureSample(layout.$.marksTexture, layout.$.samp, in.uv);

		let outAlpha = marks.a + dom.a * (1.0 - marks.a);
		let outRgb = marks.rgb * marks.a + dom.rgb * dom.a * (1.0 - marks.a);
		return vec4f(outRgb, outAlpha);
	}`.$uses({ layout: composeLayout });

export function createPlainPipeline({
	host,
	sourceElement
}: CreatePlainPipelineOptions): SurfaceRenderInstance {
	const { canvas, device, root } = host;
	const canvasWidth = canvas.width;
	const canvasHeight = canvas.height;

	const outputTexture = device.createTexture({
		size: [canvasWidth, canvasHeight, 1],
		format: INTERMEDIATE_FORMAT,
		usage: OUTPUT_TEXTURE_USAGE
	});

	const domTexture = device.createTexture({
		size: [canvasWidth, canvasHeight, 1],
		format: 'rgba8unorm',
		usage: DOM_TEXTURE_USAGE
	});

	const marksTexture = device.createTexture({
		size: [canvasWidth, canvasHeight, 1],
		format: 'rgba8unorm',
		usage: DOM_TEXTURE_USAGE
	});

	const marksCanvas = new OffscreenCanvas(canvasWidth, canvasHeight);
	const rawMarksContext = marksCanvas.getContext('2d', { alpha: true });

	if (!rawMarksContext) {
		domTexture.destroy();
		marksTexture.destroy();
		throw new Error('Unable to acquire a 2D context for the plain marks layer.');
	}

	const marksContext: OffscreenCanvasRenderingContext2D = rawMarksContext;

	const sampler = root['~unstable'].createSampler({
		magFilter: 'linear',
		minFilter: 'linear',
		addressModeU: 'clamp-to-edge',
		addressModeV: 'clamp-to-edge'
	});

	const bindGroup = root.createBindGroup(composeLayout, {
		domTexture,
		marksTexture,
		samp: sampler
	});

	const pipeline = root['~unstable']
		.withVertex(composeVertexFn, {})
		.withFragment(composeFragmentFn, { format: INTERMEDIATE_FORMAT })
		.createPipeline();

	const htmlQueue = getHtmlInCanvasQueue(device.queue);

	function uploadDom(): void {
		htmlQueue.copyElementImageToTexture(sourceElement, canvasWidth, canvasHeight, {
			texture: domTexture
		});
	}

	function render(inputs: SurfaceRenderInputs): void {
		const fullLayout: AnnotationFrameLayout = {
			x: 0,
			y: 0,
			width: canvasWidth,
			height: canvasHeight
		};

		marksContext.clearRect(0, 0, canvasWidth, canvasHeight);
		const markLayouts = getAnnotationMarkLayouts(sourceElement, fullLayout);

		drawAnnotationMarks({
			colorsByIndex: inputs.markColorsByIndex,
			context: marksContext,
			intensityByIndex: inputs.markIntensityByIndex,
			layouts: markLayouts,
			progressByIndex: inputs.animState.markProgresses,
			textAnimAlphaByIndex: inputs.textAnimAlphaByMarkIndex
		});

		device.queue.copyExternalImageToTexture(
			{ source: marksCanvas },
			{ texture: marksTexture },
			[canvasWidth, canvasHeight]
		);

		pipeline
			.with(bindGroup)
			.withColorAttachment({
				view: outputTexture.createView(),
				clearValue: [0, 0, 0, 0],
				loadOp: 'clear',
				storeOp: 'store'
			})
			.draw(3);
	}

	function dispose(): void {
		outputTexture.destroy();
		domTexture.destroy();
		marksTexture.destroy();
	}

	function getOutputTexture(): GPUTexture {
		return outputTexture;
	}

	return { uploadDom, render, dispose, getOutputTexture };
}
