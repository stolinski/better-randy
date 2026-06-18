import tgpu, { d } from 'typegpu';

import { getHtmlInCanvasQueue } from '$lib/platform/html-in-canvas';
import { INTERMEDIATE_FORMAT, type GpuHost } from '$lib/platform/gpu-host';

// Depth-of-field multiplane capture (ADR-0027). The composition is captured as
// depth-separated planes — the Surface plane (the surface pipeline's output;
// `.composition` is surface-only while the Composition plane-split is on) and the
// Overlay plane (the Overlay-root sibling DOM rasterized on its own) — so a bokeh
// DOF stage can blur each by its circle of confusion and composite back-to-front.
// `copyElementImageToTexture` only rasterizes the canvas's *direct* layoutsubtree
// children, so each plane source is a direct child, never a nested wrapper. v1 is
// Surface + one Overlay plane; per-overlay-instance planes by z are the extension.
//
// This helper owns the Overlay-side textures and the back-to-front composite.
// The Surface plane is the surface pipeline's own output texture (passed in by
// view), so it is not duplicated here. Each plane is premultiplied rgba16float —
// the correct working space for the disc-bokeh blur (task 3 of the epic), which
// replaces the straight OVER in `compositeFragmentFn` with a per-plane CoC blur.

const TEXTURE_USAGE_COPY_SRC = 0x01;
const TEXTURE_USAGE_COPY_DST = 0x02;
const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;

const DOM_TEXTURE_USAGE =
	TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_DST | TEXTURE_USAGE_RENDER_ATTACHMENT;
const PLANE_TEXTURE_USAGE =
	TEXTURE_USAGE_TEXTURE_BINDING |
	TEXTURE_USAGE_COPY_DST |
	TEXTURE_USAGE_COPY_SRC |
	TEXTURE_USAGE_RENDER_ATTACHMENT;

// (focusZ, aperture, surfaceZ, overlayZ). focusZ = the in-focus plane; aperture
// = max blur strength / CoC. The Surface defaults to z 0.0 (focal); the Overlay
// to its schema z (default 0.7). Unused by the straight composite below; the
// disc-bokeh stage reads them to size each plane's circle of confusion.
const DofUniforms = d.struct({ params: d.vec4f });

const fullScreenVertexFn = tgpu['~unstable'].vertexFn({
	in: { vertexIndex: d.builtin.vertexIndex },
	out: { position: d.builtin.position, uv: d.vec2f }
}) /* wgsl */ `{
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

// Premultiply pass: the DOM rasterization (`copyElementImageToTexture`) is
// straight-alpha rgba8; the planes composite premultiplied, so convert here.
const premultiplyLayout = tgpu.bindGroupLayout({
	domTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' }
});

const premultiplyFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: d.vec4f
}) /* wgsl */ `{
		let s = textureSample(layout.$.domTexture, layout.$.samp, in.uv);
		return vec4f(s.rgb * s.a, s.a);
	}`.$uses({ layout: premultiplyLayout });

// Back-to-front composite of the depth planes. v1 (this task): no blur — the
// Overlay (front) over the Surface (back) with the premultiplied OVER operator,
// the zero-defocus base case. Task 3 replaces the body with the disc-bokeh
// kernel (per-plane CoC blur + highlight bloom) using `layout.$.uniforms.params`.
const compositeLayout = tgpu.bindGroupLayout({
	surfaceTexture: { texture: d.texture2d(d.f32) },
	overlayTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	uniforms: { uniform: DofUniforms }
});

const compositeFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: d.vec4f
}) /* wgsl */ `{
		let surf = textureSample(layout.$.surfaceTexture, layout.$.samp, in.uv);
		let ovl = textureSample(layout.$.overlayTexture, layout.$.samp, in.uv);
		// Premultiplied OVER: overlay plane (front) over surface plane (back).
		let outRgb = ovl.rgb + (1.0 - ovl.a) * surf.rgb;
		let outA = ovl.a + (1.0 - ovl.a) * surf.a;
		return vec4f(outRgb, outA);
	}`.$uses({ layout: compositeLayout });

export interface CompositionPlanesOptions {
	host: GpuHost;
	width: number;
	height: number;
}

/** Inputs to the back-to-front composite. `surfacePlaneView` is the surface
 *  pipeline's own output (`.composition`, surface-only while the split is on). z
 *  values are the resolved focal-distance scalars; the DOF params drive task 3's
 *  blur. */
export interface CompositePlanesInput {
	surfacePlaneView: GPUTextureView;
	focusZ: number;
	aperture: number;
	surfaceZ: number;
	overlayZ: number;
}

export class CompositionPlanes {
	#width: number;
	#height: number;
	#overlayDomTexture: GPUTexture;
	#overlayPlaneTexture: GPUTexture;
	#compositeTexture: GPUTexture;
	#htmlQueue: ReturnType<typeof getHtmlInCanvasQueue>;
	// Built in the constructor as closures over the compiled pipelines — same
	// pattern as `compileEffect` in effect-chain.ts, so TypeGPU's generic
	// pipeline/buffer types stay inferred rather than named on class fields.
	#premultiply: () => void;
	#composite: (input: CompositePlanesInput) => void;

	constructor({ host, width, height }: CompositionPlanesOptions) {
		this.#width = width;
		this.#height = height;

		const { device, root } = host;

		this.#overlayDomTexture = device.createTexture({
			size: [width, height, 1],
			format: 'rgba8unorm',
			usage: DOM_TEXTURE_USAGE
		});
		this.#overlayPlaneTexture = device.createTexture({
			size: [width, height, 1],
			format: INTERMEDIATE_FORMAT,
			usage: PLANE_TEXTURE_USAGE
		});
		this.#compositeTexture = device.createTexture({
			size: [width, height, 1],
			format: INTERMEDIATE_FORMAT,
			usage: PLANE_TEXTURE_USAGE
		});

		const unstable = root['~unstable'];
		const sampler = unstable.createSampler({
			magFilter: 'linear',
			minFilter: 'linear',
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge'
		});

		const premultiplyPipeline = unstable
			.withVertex(fullScreenVertexFn, {})
			.withFragment(premultiplyFragmentFn, { format: INTERMEDIATE_FORMAT })
			.createPipeline();

		const compositePipeline = unstable
			.withVertex(fullScreenVertexFn, {})
			.withFragment(compositeFragmentFn, { format: INTERMEDIATE_FORMAT })
			.createPipeline();

		const uniformBuffer = root
			.createBuffer(DofUniforms, { params: d.vec4f(0, 0, 0, 0) })
			.$usage('uniform');

		const overlayDomTexture = this.#overlayDomTexture;
		const overlayPlaneTexture = this.#overlayPlaneTexture;
		const compositeTexture = this.#compositeTexture;

		this.#premultiply = () => {
			const bindGroup = root.createBindGroup(premultiplyLayout, {
				domTexture: overlayDomTexture,
				samp: sampler
			});
			premultiplyPipeline
				.with(bindGroup)
				.withColorAttachment({
					view: overlayPlaneTexture.createView(),
					clearValue: [0, 0, 0, 0],
					loadOp: 'clear',
					storeOp: 'store'
				})
				.draw(3);
		};

		this.#composite = (input) => {
			uniformBuffer.write({
				params: d.vec4f(input.focusZ, input.aperture, input.surfaceZ, input.overlayZ)
			});
			const bindGroup = root.createBindGroup(compositeLayout, {
				surfaceTexture: input.surfacePlaneView,
				overlayTexture: overlayPlaneTexture.createView(),
				samp: sampler,
				uniforms: uniformBuffer
			});
			compositePipeline
				.with(bindGroup)
				.withColorAttachment({
					view: compositeTexture.createView(),
					clearValue: [0, 0, 0, 0],
					loadOp: 'clear',
					storeOp: 'store'
				})
				.draw(3);
		};

		this.#htmlQueue = getHtmlInCanvasQueue(device.queue);
	}

	/** Rasterize the Overlay-root element into the overlay DOM texture. It is a
	 *  frame-sized direct child of the canvas, so it maps 1:1 and the overlays land
	 *  in composition space (aligned with the surface plane). Queue-ordered ahead of
	 *  the composite, mirroring the surface pipeline's uploadDom→render order. */
	captureOverlay(element: HTMLElement): void {
		this.#htmlQueue.copyElementImageToTexture(element, this.#width, this.#height, {
			texture: this.#overlayDomTexture
		});
	}

	/** Premultiply the captured overlay DOM, then composite the planes
	 *  back-to-front into the composite texture. Result is premultiplied
	 *  rgba16float — fed to the effect chain (which presents + dithers). */
	composite(input: CompositePlanesInput): void {
		this.#premultiply();
		this.#composite(input);
	}

	/** The premultiplied overlay plane (transparent where no overlay). Exposed for
	 *  plane-level verification before the bokeh stage exists. */
	overlayPlaneTexture(): GPUTexture {
		return this.#overlayPlaneTexture;
	}

	/** The back-to-front composite of all planes — fed to the effect chain. */
	compositeTexture(): GPUTexture {
		return this.#compositeTexture;
	}

	dispose(): void {
		this.#overlayDomTexture.destroy();
		this.#overlayPlaneTexture.destroy();
		this.#compositeTexture.destroy();
	}
}
