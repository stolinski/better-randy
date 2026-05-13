import tgpu, { d } from 'typegpu';

import type { AnnotationFrameLayout } from '$lib/annotations/annotation-marks';
import type { GpuHost } from '$lib/platform/gpu-host';
import { getHtmlInCanvasQueue } from '$lib/platform/html-in-canvas';
import { getRgbColorChannels } from '$lib/utils/color';
import { clampNumber, easeOutCubic } from '$lib/utils/math';

import type { QuoteFocusAnimState } from './quote-focus-animation.svelte';
import { drawQuoteMarks } from './quote-focus-marks';
import type {
	QuoteFocusCameraMotion,
	QuoteFocusFocusStyle,
	QuoteFocusMarkStyle
} from './quote-focus-state.svelte';

const TEXTURE_USAGE_COPY_DST = 0x02;
const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const DOM_TEXTURE_USAGE =
	TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_DST | TEXTURE_USAGE_RENDER_ATTACHMENT;

const LANDSCAPE_PAPER_WIDTH_RATIO = 0.46;
const PORTRAIT_PAPER_WIDTH_RATIO = 0.86;
const PAPER_HEIGHT_RATIO = 0.84;
const PAPER_ASPECT_RATIO = 1358 / 960;

const FOCUS_STYLE_TARGETS: Record<
	QuoteFocusFocusStyle,
	{ dim: number; magnify: number; highlight: number; tear: number }
> = {
	highlight: { dim: 0, magnify: 0, highlight: 1, tear: 0 },
	magnify: { dim: 0, magnify: 0.22, highlight: 0, tear: 0 },
	isolate: { dim: 1, magnify: 0, highlight: 0, tear: 0 },
	'lift-out': { dim: 1, magnify: 0.2, highlight: 0, tear: 0 },
	'tear-out': { dim: 1, magnify: 0.24, highlight: 0, tear: 1 }
};

export interface QuoteFocusRenderInputs {
	animState: QuoteFocusAnimState;
	attribution: string;
	backgroundVisibility: number;
	cameraMotion: QuoteFocusCameraMotion;
	durationSeconds: number;
	focusStart: number;
	focusStyle: QuoteFocusFocusStyle;
	highlightColor: string;
	markColor: string;
	markIntensity: number;
	markStyle: QuoteFocusMarkStyle;
	timestamp: number;
}

export interface QuoteFocusPipeline {
	uploadDom(): void;
	render(inputs: QuoteFocusRenderInputs): void;
	dispose(): void;
}

export interface CreateQuoteFocusPipelineOptions {
	host: GpuHost;
	sourceElement: HTMLElement;
}

const QuoteFocusUniforms = d.struct({
	paperRect: d.vec4f,
	quoteRect: d.vec4f,
	focusParams: d.vec4f,
	styleColor: d.vec4f
});

const composeLayout = tgpu.bindGroupLayout({
	domTexture: { texture: d.texture2d(d.f32) },
	marksTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	uniforms: { uniform: QuoteFocusUniforms }
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
		let paperRect = layout.$.uniforms.paperRect;
		let quoteRect = layout.$.uniforms.quoteRect;
		let focusParams = layout.$.uniforms.focusParams;
		let styleColor = layout.$.uniforms.styleColor;
		let uv = in.uv;

		let paperLocalUv = (uv - paperRect.xy) / paperRect.zw;
		let isInPaper = paperLocalUv.x >= 0.0 && paperLocalUv.x <= 1.0 && paperLocalUv.y >= 0.0 && paperLocalUv.y <= 1.0;
		let inPaper = select(0.0, 1.0, isInPaper);
		let safePaperUv = clamp(paperLocalUv, vec2f(0.0), vec2f(1.0));
		let domSample = textureSample(layout.$.domTexture, layout.$.samp, safePaperUv);

		let isInQuote = uv.x >= quoteRect.x && uv.x <= quoteRect.x + quoteRect.z && uv.y >= quoteRect.y && uv.y <= quoteRect.y + quoteRect.w;
		let inQuote = select(0.0, 1.0, isInQuote);
		let outsideQuote = 1.0 - inQuote;

		let tintMix = focusParams.z * inQuote;
		let tintMultiplier = mix(vec3f(1.0), styleColor.rgb, tintMix);
		let bgRgb = domSample.rgb * tintMultiplier;

		let dimAmount = focusParams.x;
		let bgFloor = styleColor.w;
		let dimFactor = 1.0 - dimAmount * outsideQuote * (1.0 - bgFloor);
		let bgAlpha = domSample.a * inPaper * dimFactor;
		let bgColor = vec4f(bgRgb, bgAlpha);

		let magnifyAmount = focusParams.y;
		let magScale = 1.0 + magnifyAmount;
		let quoteCenter = quoteRect.xy + quoteRect.zw * 0.5;
		let magSize = quoteRect.zw * magScale;
		let magOrigin = quoteCenter - magSize * 0.5;
		let liftedLocalUv = (uv - magOrigin) / magSize;
		let isInLifted = liftedLocalUv.x >= 0.0 && liftedLocalUv.x <= 1.0 && liftedLocalUv.y >= 0.0 && liftedLocalUv.y <= 1.0;
		let quoteSourceUv = quoteRect.xy + liftedLocalUv * quoteRect.zw;
		let liftedPaperUv = (quoteSourceUv - paperRect.xy) / paperRect.zw;
		let safeLiftedPaperUv = clamp(liftedPaperUv, vec2f(0.0), vec2f(1.0));
		let liftedSample = textureSample(layout.$.domTexture, layout.$.samp, safeLiftedPaperUv);

		let tearAmount = focusParams.w;
		let edgeDist = min(min(liftedLocalUv.x, 1.0 - liftedLocalUv.x), min(liftedLocalUv.y, 1.0 - liftedLocalUv.y));
		let noisePos = liftedLocalUv * vec2f(420.0, 60.0);
		let noiseI = floor(noisePos);
		let noiseFract = fract(noisePos);
		let noiseS = noiseFract * noiseFract * (vec2f(3.0) - 2.0 * noiseFract);
		let n00 = fract(sin(dot(noiseI, vec2f(127.1, 311.7))) * 43758.5453);
		let n10 = fract(sin(dot(noiseI + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
		let n01 = fract(sin(dot(noiseI + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
		let n11 = fract(sin(dot(noiseI + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
		let edgeNoise = mix(mix(n00, n10, noiseS.x), mix(n01, n11, noiseS.x), noiseS.y);
		let tearThreshold = max(tearAmount * 0.07, 0.0005);
		let tearMask = smoothstep(tearThreshold * (0.2 + edgeNoise * 1.4), tearThreshold * 1.4 + 0.001, edgeDist);
		let liftedInside = select(0.0, 1.0, isInLifted);
		let liftedAlphaRaw = liftedInside * liftedSample.a;
		let liftedAlphaWithTear = liftedAlphaRaw * mix(1.0, tearMask, smoothstep(0.0, 0.01, tearAmount));
		let useLifted = smoothstep(0.0, 0.005, magnifyAmount);
		let liftedAlpha = liftedAlphaWithTear * useLifted;
		let liftedColor = vec4f(liftedSample.rgb, liftedAlpha);

		let marksColor = textureSample(layout.$.marksTexture, layout.$.samp, uv);

		let stepOneRgb = liftedColor.rgb * liftedColor.a + bgColor.rgb * bgColor.a * (1.0 - liftedColor.a);
		let stepOneA = liftedColor.a + bgColor.a * (1.0 - liftedColor.a);
		let outRgb = marksColor.rgb * marksColor.a + stepOneRgb * (1.0 - marksColor.a);
		let outAlpha = marksColor.a + stepOneA * (1.0 - marksColor.a);

		return vec4f(outRgb, outAlpha);
	}`.$uses({ layout: composeLayout });

interface SourcePoint {
	x: number;
	y: number;
}

interface SourceRectNdc {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface QuoteDomReadout {
	sourceCenter: SourcePoint;
	sourceBounds: SourceRectNdc;
	clientRectsNdc: SourceRectNdc[];
}

function readQuoteFromDom(sourceElement: HTMLElement): QuoteDomReadout | null {
	const elementRect = sourceElement.getBoundingClientRect();

	if (elementRect.width <= 0 || elementRect.height <= 0) {
		return null;
	}

	const target = sourceElement.querySelector<HTMLElement>('[data-quote-target]');

	if (!target) {
		return null;
	}

	const targetRect = target.getBoundingClientRect();
	const clientRectsNdc = Array.from(target.getClientRects())
		.map<SourceRectNdc>((rect) => ({
			x: (rect.left - elementRect.left) / elementRect.width,
			y: (rect.top - elementRect.top) / elementRect.height,
			width: rect.width / elementRect.width,
			height: rect.height / elementRect.height
		}))
		.filter((rect) => rect.width > 0 && rect.height > 0);

	if (clientRectsNdc.length === 0) {
		return null;
	}

	return {
		sourceBounds: {
			x: (targetRect.left - elementRect.left) / elementRect.width,
			y: (targetRect.top - elementRect.top) / elementRect.height,
			width: targetRect.width / elementRect.width,
			height: targetRect.height / elementRect.height
		},
		sourceCenter: {
			x: (targetRect.left - elementRect.left + targetRect.width * 0.5) / elementRect.width,
			y: (targetRect.top - elementRect.top + targetRect.height * 0.5) / elementRect.height
		},
		clientRectsNdc
	};
}

function computePaperLayout(
	canvasWidth: number,
	canvasHeight: number,
	cameraMotion: QuoteFocusCameraMotion,
	timestamp: number,
	durationSeconds: number,
	focusStart: number,
	quoteSourceCenter: SourcePoint | null
): AnnotationFrameLayout {
	const isPortrait = canvasHeight > canvasWidth;
	const baseWidthByRatio =
		canvasWidth * (isPortrait ? PORTRAIT_PAPER_WIDTH_RATIO : LANDSCAPE_PAPER_WIDTH_RATIO);
	const baseHeightLimit = canvasHeight * PAPER_HEIGHT_RATIO;
	const fittedWidth = Math.min(baseWidthByRatio, baseHeightLimit / PAPER_ASPECT_RATIO);
	const baseWidth = fittedWidth;
	const baseHeight = fittedWidth * PAPER_ASPECT_RATIO;
	const t = clampNumber(timestamp / Math.max(0.001, durationSeconds), 0, 1);
	let scale = 1;
	const focal: SourcePoint = { x: 0.5, y: 0.5 };

	if (cameraMotion === 'push') {
		scale = 1 + easeOutCubic(t) * 0.05;
	}

	if (cameraMotion === 'snap' && quoteSourceCenter) {
		const snapProgress = easeOutCubic(clampNumber((t - focusStart) / 0.18, 0, 1));
		scale = 1 + snapProgress * 0.08;
		focal.x = 0.5 + (quoteSourceCenter.x - 0.5) * snapProgress;
		focal.y = 0.5 + (quoteSourceCenter.y - 0.5) * snapProgress;
	}

	const width = baseWidth * scale;
	const height = baseHeight * scale;
	const x = canvasWidth * 0.5 - width * focal.x;
	const y = canvasHeight * 0.5 - height * focal.y;

	return { x, y, width, height };
}

function computeFocusParams(
	focusStyle: QuoteFocusFocusStyle,
	phase: number,
	hasQuote: boolean,
	intensityScale: number
): { dim: number; magnify: number; highlight: number; tear: number } {
	if (!hasQuote) {
		return { dim: 0, magnify: 0, highlight: 0, tear: 0 };
	}

	const targets = FOCUS_STYLE_TARGETS[focusStyle];

	return {
		dim: targets.dim * phase * intensityScale,
		magnify: targets.magnify * phase,
		highlight: targets.highlight * phase * intensityScale,
		tear: targets.tear * phase
	};
}

function mapSourceNdcToCanvas(
	rect: SourceRectNdc,
	paperLayout: AnnotationFrameLayout
): AnnotationFrameLayout {
	return {
		x: paperLayout.x + rect.x * paperLayout.width,
		y: paperLayout.y + rect.y * paperLayout.height,
		width: rect.width * paperLayout.width,
		height: rect.height * paperLayout.height
	};
}

export function createQuoteFocusPipeline({
	host,
	sourceElement
}: CreateQuoteFocusPipelineOptions): QuoteFocusPipeline {
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
		throw new Error('Unable to acquire a 2D context for the quote focus marks layer.');
	}

	const marksContext: OffscreenCanvasRenderingContext2D = rawMarksContext;

	const sampler = root['~unstable'].createSampler({
		magFilter: 'linear',
		minFilter: 'linear',
		addressModeU: 'clamp-to-edge',
		addressModeV: 'clamp-to-edge'
	});

	const uniformBuffer = root
		.createBuffer(QuoteFocusUniforms, {
			paperRect: d.vec4f(0, 0, 0, 0),
			quoteRect: d.vec4f(0, 0, 0, 0),
			focusParams: d.vec4f(0, 0, 0, 0),
			styleColor: d.vec4f(1, 0.84, 0.26, 0.2)
		})
		.$usage('uniform');

	const bindGroup = root.createBindGroup(composeLayout, {
		domTexture,
		marksTexture,
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

	function render(inputs: QuoteFocusRenderInputs): void {
		const previousTransform = sourceElement.style.transform;
		sourceElement.style.transform = '';
		const quoteReadout = readQuoteFromDom(sourceElement);
		sourceElement.style.transform = previousTransform;

		const paperLayout = computePaperLayout(
			canvasWidth,
			canvasHeight,
			inputs.cameraMotion,
			inputs.timestamp,
			inputs.durationSeconds,
			inputs.focusStart,
			quoteReadout ? quoteReadout.sourceCenter : null
		);
		const quoteBoundsPixels = quoteReadout
			? mapSourceNdcToCanvas(quoteReadout.sourceBounds, paperLayout)
			: null;
		const quoteFragmentsPixels = quoteReadout
			? quoteReadout.clientRectsNdc.map((rect) => mapSourceNdcToCanvas(rect, paperLayout))
			: [];
		const hasQuote = quoteBoundsPixels !== null && quoteFragmentsPixels.length > 0;
		const focusParams = computeFocusParams(
			inputs.focusStyle,
			inputs.animState.focusProgress,
			hasQuote,
			inputs.markIntensity
		);
		const markProgress = inputs.animState.markProgress;
		const highlightChannels = getRgbColorChannels(inputs.highlightColor);

		marksContext.clearRect(0, 0, canvasWidth, canvasHeight);

		if (hasQuote && quoteBoundsPixels) {
			drawQuoteMarks({
				attribution: inputs.attribution,
				color: inputs.markColor,
				context: marksContext,
				intensity: inputs.markIntensity,
				layout: {
					bounds: quoteBoundsPixels,
					fragments: quoteFragmentsPixels
				},
				paperLayout,
				progress: markProgress,
				style: inputs.markStyle
			});
		}

		device.queue.copyExternalImageToTexture(
			{ source: marksCanvas },
			{ texture: marksTexture },
			[canvasWidth, canvasHeight]
		);

		const paperRectNdc = d.vec4f(
			paperLayout.x / canvasWidth,
			paperLayout.y / canvasHeight,
			paperLayout.width / canvasWidth,
			paperLayout.height / canvasHeight
		);
		const quoteRectNdc =
			hasQuote && quoteBoundsPixels
				? d.vec4f(
						quoteBoundsPixels.x / canvasWidth,
						quoteBoundsPixels.y / canvasHeight,
						quoteBoundsPixels.width / canvasWidth,
						quoteBoundsPixels.height / canvasHeight
					)
				: d.vec4f(0, 0, 0, 0);

		uniformBuffer.write({
			paperRect: paperRectNdc,
			quoteRect: quoteRectNdc,
			focusParams: d.vec4f(
				focusParams.dim,
				focusParams.magnify,
				focusParams.highlight,
				focusParams.tear
			),
			styleColor: d.vec4f(
				highlightChannels.red / 255,
				highlightChannels.green / 255,
				highlightChannels.blue / 255,
				clampNumber(inputs.backgroundVisibility, 0, 1)
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
		marksTexture.destroy();
	}

	return { uploadDom, render, dispose };
}
