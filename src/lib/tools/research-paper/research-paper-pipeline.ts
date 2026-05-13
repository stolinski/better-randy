import tgpu, { d } from 'typegpu';

import {
	drawAnnotationMarks,
	getAnnotationMarkLayouts,
	type AnnotationFrameLayout,
	type AnnotationMarkColors
} from '$lib/annotations/annotation-marks';
import { getHtmlInCanvasQueue } from '$lib/platform/html-in-canvas';
import type { GpuHost } from '$lib/platform/gpu-host';

import type { ResearchPaperAnimState } from './research-paper-animation.svelte';

const TEXTURE_USAGE_COPY_DST = 0x02;
const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const DOM_TEXTURE_USAGE =
	TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_DST | TEXTURE_USAGE_RENDER_ATTACHMENT;

const PAPER_ASPECT_RATIO = Math.SQRT2;
const LANDSCAPE_PAPER_WIDTH_RATIO = 0.38;
const PORTRAIT_PAPER_WIDTH_RATIO = 0.82;
const PAPER_HEIGHT_RATIO = 0.88;

export interface ResearchPaperRenderInputs {
	animState: ResearchPaperAnimState;
	markColors: AnnotationMarkColors;
	markIntensity: number;
	timestamp: number;
}

export interface ResearchPaperPipeline {
	uploadDom(): void;
	render(inputs: ResearchPaperRenderInputs): void;
	dispose(): void;
}

export interface CreateResearchPaperPipelineOptions {
	host: GpuHost;
	sourceElement: HTMLElement;
}

interface ComputedLayout extends AnnotationFrameLayout {
	canvasWidth: number;
	canvasHeight: number;
}

function computeLayout(
	canvasWidth: number,
	canvasHeight: number,
	paperEntrance: number
): ComputedLayout {
	const isPortraitFrame = canvasHeight > canvasWidth;
	const maxWidth =
		canvasWidth * (isPortraitFrame ? PORTRAIT_PAPER_WIDTH_RATIO : LANDSCAPE_PAPER_WIDTH_RATIO);
	const maxHeight = canvasHeight * PAPER_HEIGHT_RATIO;
	const width = Math.min(maxWidth, maxHeight / PAPER_ASPECT_RATIO);
	const height = width * PAPER_ASPECT_RATIO;
	const x = canvasWidth * 0.5 - width / 2;
	const startY = canvasHeight + height * 0.08;
	const endY = canvasHeight * 0.5 - height / 2;
	const y = startY + (endY - startY) * paperEntrance;

	return { x, y, width, height, canvasWidth, canvasHeight };
}

const PaperUniforms = d.struct({
	paperRect: d.vec4f
});

const composeLayout = tgpu.bindGroupLayout({
	domTexture: { texture: d.texture2d(d.f32) },
	highlightTexture: { texture: d.texture2d(d.f32) },
	strokesTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	uniforms: { uniform: PaperUniforms }
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
		let rect = layout.$.uniforms.paperRect;
		let localUv = (in.uv - rect.xy) / rect.zw;
		let isInside = localUv.x >= 0.0 && localUv.x <= 1.0 && localUv.y >= 0.0 && localUv.y <= 1.0;
		let inside = select(0.0, 1.0, isInside);
		let safeUv = clamp(localUv, vec2f(0.0), vec2f(1.0));

		let domSample = textureSample(layout.$.domTexture, layout.$.samp, safeUv);
		var dom = domSample * inside;

		// Paper substrate: 2-octave value-noise FBM, isotropic, barely-there grain.
		let coarsePos = in.uv * vec2f(220.0, 220.0);
		let coarseI = floor(coarsePos);
		let coarseF = fract(coarsePos);
		let coarseS = coarseF * coarseF * (vec2f(3.0) - 2.0 * coarseF);
		let c00 = fract(sin(dot(coarseI, vec2f(127.1, 311.7))) * 43758.5453);
		let c10 = fract(sin(dot(coarseI + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
		let c01 = fract(sin(dot(coarseI + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
		let c11 = fract(sin(dot(coarseI + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
		let coarseN = mix(mix(c00, c10, coarseS.x), mix(c01, c11, coarseS.x), coarseS.y);

		let finePos = in.uv * vec2f(680.0, 680.0);
		let fineI = floor(finePos);
		let fineF = fract(finePos);
		let fineS = fineF * fineF * (vec2f(3.0) - 2.0 * fineF);
		let f00 = fract(sin(dot(fineI, vec2f(269.5, 183.3))) * 43758.5453);
		let f10 = fract(sin(dot(fineI + vec2f(1.0, 0.0), vec2f(269.5, 183.3))) * 43758.5453);
		let f01 = fract(sin(dot(fineI + vec2f(0.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
		let f11 = fract(sin(dot(fineI + vec2f(1.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
		let fineN = mix(mix(f00, f10, fineS.x), mix(f01, f11, fineS.x), fineS.y);

		let grain = (coarseN * 0.55 + fineN * 0.45 - 0.5) * 0.012;
		let warmth = vec3f(1.0, 0.996, 0.984);
		let substrate = mix(vec3f(1.0), warmth + vec3f(grain), inside);
		dom = vec4f(dom.rgb * substrate, dom.a);

		// Very soft inner edge shadow: long falloff, barely darker. No CSS-shadow look.
		let toEdge = min(min(localUv.x, 1.0 - localUv.x), min(localUv.y, 1.0 - localUv.y));
		let edgeFactor = pow(clamp(toEdge / 0.12, 0.0, 1.0), 0.65);
		let edgeDarken = mix(1.0, mix(0.97, 1.0, edgeFactor), inside);
		dom = vec4f(dom.rgb * edgeDarken, dom.a);

		// Highlight multiplied into paper+text, with subtle horizontal ink-density streaks.
		let h = textureSample(layout.$.highlightTexture, layout.$.samp, in.uv);
		let streakPos = in.uv * vec2f(180.0, 9.0);
		let streakI = floor(streakPos);
		let streakF = fract(streakPos);
		let streakS = streakF * streakF * (vec2f(3.0) - 2.0 * streakF);
		let sk00 = fract(sin(dot(streakI, vec2f(72.3, 91.7))) * 26482.13);
		let sk10 = fract(sin(dot(streakI + vec2f(1.0, 0.0), vec2f(72.3, 91.7))) * 26482.13);
		let sk01 = fract(sin(dot(streakI + vec2f(0.0, 1.0), vec2f(72.3, 91.7))) * 26482.13);
		let sk11 = fract(sin(dot(streakI + vec2f(1.0, 1.0), vec2f(72.3, 91.7))) * 26482.13);
		let streakN = mix(mix(sk00, sk10, streakS.x), mix(sk01, sk11, streakS.x), streakS.y);
		let inkDensity = mix(0.86, 1.04, streakN);
		let effectiveAlpha = clamp(h.a * inkDensity, 0.0, 1.0);
		let multiplier = mix(vec3f(1.0), h.rgb, effectiveAlpha);
		let tinted = vec4f(dom.rgb * multiplier, dom.a);

		// Strokes with very subtle ink bleed (4-tap diagonal sample, tight radius).
		let blurRadius = 0.0004;
		let s0 = textureSample(layout.$.strokesTexture, layout.$.samp, in.uv);
		let s1 = textureSample(layout.$.strokesTexture, layout.$.samp, in.uv + vec2f(blurRadius, blurRadius));
		let s2 = textureSample(layout.$.strokesTexture, layout.$.samp, in.uv + vec2f(-blurRadius, blurRadius));
		let s3 = textureSample(layout.$.strokesTexture, layout.$.samp, in.uv + vec2f(blurRadius, -blurRadius));
		let s4 = textureSample(layout.$.strokesTexture, layout.$.samp, in.uv + vec2f(-blurRadius, -blurRadius));
		let strokes = s0 * 0.72 + (s1 + s2 + s3 + s4) * 0.07;

		let outAlpha = strokes.a + tinted.a * (1.0 - strokes.a);
		let outRgb = strokes.rgb * strokes.a + tinted.rgb * tinted.a * (1.0 - strokes.a);
		return vec4f(outRgb, outAlpha);
	}`.$uses({ layout: composeLayout });

export function createResearchPaperPipeline({
	host,
	sourceElement
}: CreateResearchPaperPipelineOptions): ResearchPaperPipeline {
	const { canvas, context, device, format, root } = host;
	const canvasWidth = canvas.width;
	const canvasHeight = canvas.height;

	const sourceRect = sourceElement.getBoundingClientRect();
	const sourceDpr = window.devicePixelRatio || 1;
	const domWidth = Math.max(1, Math.round(sourceRect.width * sourceDpr));
	const domHeight = Math.max(1, Math.round(sourceRect.height * sourceDpr));

	const domTexture = device.createTexture({
		size: [domWidth, domHeight, 1],
		format: 'rgba8unorm',
		usage: DOM_TEXTURE_USAGE
	});

	const highlightTexture = device.createTexture({
		size: [canvasWidth, canvasHeight, 1],
		format: 'rgba8unorm',
		usage: DOM_TEXTURE_USAGE
	});

	const strokesTexture = device.createTexture({
		size: [canvasWidth, canvasHeight, 1],
		format: 'rgba8unorm',
		usage: DOM_TEXTURE_USAGE
	});

	const highlightCanvas = new OffscreenCanvas(canvasWidth, canvasHeight);
	const rawHighlightContext = highlightCanvas.getContext('2d', { alpha: true });
	const strokesCanvas = new OffscreenCanvas(canvasWidth, canvasHeight);
	const rawStrokesContext = strokesCanvas.getContext('2d', { alpha: true });

	if (!rawHighlightContext || !rawStrokesContext) {
		domTexture.destroy();
		highlightTexture.destroy();
		strokesTexture.destroy();
		throw new Error('Unable to acquire a 2D context for the marks layers.');
	}

	const highlightContext: OffscreenCanvasRenderingContext2D = rawHighlightContext;
	const strokesContext: OffscreenCanvasRenderingContext2D = rawStrokesContext;

	const sampler = root['~unstable'].createSampler({
		magFilter: 'linear',
		minFilter: 'linear',
		addressModeU: 'clamp-to-edge',
		addressModeV: 'clamp-to-edge'
	});

	const uniformBuffer = root
		.createBuffer(PaperUniforms, { paperRect: d.vec4f(0, 0, 0, 0) })
		.$usage('uniform');

	const bindGroup = root.createBindGroup(composeLayout, {
		domTexture,
		highlightTexture,
		strokesTexture,
		samp: sampler,
		uniforms: uniformBuffer
	});

	const pipeline = root['~unstable']
		.withVertex(composeVertexFn, {})
		.withFragment(composeFragmentFn, { format })
		.createPipeline();

	const htmlQueue = getHtmlInCanvasQueue(device.queue);

	function uploadDom(): void {
		const previousTransform = sourceElement.style.transform;
		sourceElement.style.transform = '';
		htmlQueue.copyElementImageToTexture(sourceElement, domWidth, domHeight, {
			texture: domTexture
		});
		sourceElement.style.transform = previousTransform;
	}

	function renderMarks(
		layout: ComputedLayout,
		inputs: ResearchPaperRenderInputs,
		progressByIndex: readonly number[]
	): void {
		highlightContext.clearRect(0, 0, canvasWidth, canvasHeight);
		strokesContext.clearRect(0, 0, canvasWidth, canvasHeight);
		const previousTransform = sourceElement.style.transform;
		sourceElement.style.transform = '';
		const markLayouts = getAnnotationMarkLayouts(sourceElement, layout);
		sourceElement.style.transform = previousTransform;

		drawAnnotationMarks({
			colors: inputs.markColors,
			context: highlightContext,
			intensity: inputs.markIntensity,
			layouts: markLayouts,
			progressByIndex,
			markStyles: ['highlight']
		});

		drawAnnotationMarks({
			colors: inputs.markColors,
			context: strokesContext,
			intensity: inputs.markIntensity,
			layouts: markLayouts,
			progressByIndex,
			markStyles: ['underline', 'strike', 'circle']
		});

		device.queue.copyExternalImageToTexture(
			{ source: highlightCanvas },
			{ texture: highlightTexture },
			[canvasWidth, canvasHeight]
		);
		device.queue.copyExternalImageToTexture(
			{ source: strokesCanvas },
			{ texture: strokesTexture },
			[canvasWidth, canvasHeight]
		);
	}

	function render(inputs: ResearchPaperRenderInputs): void {
		const layout = computeLayout(canvasWidth, canvasHeight, inputs.animState.paperEntrance);
		renderMarks(layout, inputs, inputs.animState.markProgresses);

		uniformBuffer.write({
			paperRect: d.vec4f(
				layout.x / canvasWidth,
				layout.y / canvasHeight,
				layout.width / canvasWidth,
				layout.height / canvasHeight
			)
		});

		pipeline
			.with(bindGroup)
			.withColorAttachment({
				view: context.getCurrentTexture().createView(),
				clearValue: [0, 0, 0, 0],
				loadOp: 'clear',
				storeOp: 'store'
			})
			.draw(3);
	}

	function dispose(): void {
		domTexture.destroy();
		highlightTexture.destroy();
		strokesTexture.destroy();
	}

	return { uploadDom, render, dispose };
}
