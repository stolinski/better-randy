import tgpu, { common, d } from 'typegpu';

import type { Effect } from '$lib/platform/engine-schema';
import { INTERMEDIATE_FORMAT, type GpuHost } from '$lib/platform/gpu-host';
import { PIPELINE_REGISTRY } from './index';
import type { EffectRenderer } from './types';

const TEXTURE_USAGE_COPY_DST = 0x02;
const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const TEXTURE_USAGE_COPY_SRC = 0x01;
const INTERMEDIATE_TEXTURE_USAGE =
	TEXTURE_USAGE_TEXTURE_BINDING |
	TEXTURE_USAGE_COPY_DST |
	TEXTURE_USAGE_COPY_SRC |
	TEXTURE_USAGE_RENDER_ATTACHMENT;

// Present pipeline: the final pass of every frame. Reads the last rgba16float
// intermediate and writes to the 8-bit canvas, applying ordered dither at the
// quantization boundary so smooth gradients don't band. Also the no-effect
// path (replaces the old plain blit) — the surface output is always presented
// through here, so dithering happens whether or not effects are configured.
//
// `background` uniform: [r, g, b, a] premultiplied fill composited UNDER the
// surface output (OVER operator). Default [0,0,0,0] = transparent — identical
// to the old behaviour. Set to a solid colour for full-frame segment/bumpers.
const PresentUniforms = d.struct({ background: d.vec4f });

const presentBindGroupLayout = tgpu.bindGroupLayout({
	inputTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	uniforms: { uniform: PresentUniforms }
});

const presentFragmentFn = tgpu.fragmentFn({
	in: { uv: d.vec2f, position: d.builtin.position },
	out: d.vec4f
}) /* wgsl */ `{
		let s = textureSample(layout.$.inputTexture, layout.$.samp, in.uv);
		let bg = layout.$.uniforms.background;
		// OVER operator (premultiplied): composite surface s over background bg.
		// When bg.a == 0 this degenerates to s — transparent default unchanged.
		let outRgb = s.rgb + (1.0 - s.a) * bg.rgb * bg.a;
		let outA   = s.a   + (1.0 - s.a) * bg.a;
		// Interleaved-gradient-noise ordered dither (~1 LSB) applied at the
		// 16float→8bit write. Breaks up banding on near-black gradients the
		// 8-bit canvas would otherwise quantize into visible steps.
		let ign = fract(52.9829189 * fract(dot(in.position.xy, vec2f(0.06711056, 0.00583715))));
		let dither = (ign - 0.5) / 255.0;
		return vec4f(outRgb + vec3f(dither, dither, dither), outA);
	}`.$uses({ layout: presentBindGroupLayout });

interface CompiledEffect {
	type: string;
	apply(opts: {
		commandEncoder: GPUCommandEncoder;
		inputView: GPUTextureView;
		outputView: GPUTextureView;
		params: unknown;
		progress: number;
		timestamp: number;
		canvasWidth: number;
		canvasHeight: number;
	}): void;
}

interface CompiledPresent {
	apply(opts: {
		commandEncoder: GPUCommandEncoder;
		inputView: GPUTextureView;
		outputView: GPUTextureView;
		background?: [number, number, number, number];
	}): void;
}

function findEffectRenderer(type: string): EffectRenderer | null {
	for (const renderer of Object.values(PIPELINE_REGISTRY.effects)) {
		if (renderer.type === type) {
			return renderer as EffectRenderer;
		}
	}
	return null;
}

function compileEffect(host: GpuHost, renderer: EffectRenderer): CompiledEffect {
	const { device, root } = host;

	// The effect declares its uniform layout via paramsStruct (a TgpuStruct).
	// TypeScript can't carry the dynamic schema through the registry boundary,
	// so we cast through unknown into TypeGPU's bind-group layout factory.
	const bindGroupLayout = tgpu.bindGroupLayout({
		inputTexture: { texture: d.texture2d(d.f32) },
		samp: { sampler: 'filtering' },
		uniforms: { uniform: renderer.pass.paramsStruct }
	});

	const fragmentFn = tgpu.fragmentFn({
		in: { uv: d.vec2f },
		out: d.vec4f
	}) /* wgsl */ `{
			let inputSample = textureSample(layout.$.inputTexture, layout.$.samp, in.uv);
			${renderer.pass.fragmentBody}
		}`.$uses({ layout: bindGroupLayout });

	const pipeline = root.createRenderPipeline({
		vertex: common.fullScreenTriangle,
		fragment: fragmentFn,
		targets: { format: INTERMEDIATE_FORMAT }
	});

	const sampler = root.createSampler({
		magFilter: 'linear',
		minFilter: 'linear',
		addressModeU: 'clamp-to-edge',
		addressModeV: 'clamp-to-edge'
	});

	// A persistent uniform buffer per compiled effect; values rewritten per
	// frame via renderer.pass.pack(params). TypeGPU's type machinery doesn't
	// carry the generic struct through `paramsStruct: unknown`, so we route
	// through `as never` and access write() via a minimal local type.
	interface UniformBufferShape {
		write(value: unknown): void;
	}
	const uniformBuffer = (
		root.createBuffer(renderer.pass.paramsStruct as never) as unknown as {
			$usage: (kind: 'uniform') => UniformBufferShape;
		}
	).$usage('uniform');

	return {
		type: renderer.type,
		apply({ inputView, outputView, params, progress, timestamp, canvasWidth, canvasHeight }) {
			uniformBuffer.write(
				renderer.pass.pack(params, { progress, timestamp, canvasWidth, canvasHeight }) as never
			);

			const bindGroup = root.createBindGroup(bindGroupLayout, {
				inputTexture: inputView,
				samp: sampler,
				uniforms: uniformBuffer
			} as never);

			pipeline.with(bindGroup).withColorAttachment({ view: outputView }).draw(3);

			// device used implicitly by pipeline; nothing else to do per apply.
			void device;
		}
	};
}

// Background-composite pass: the SAME OVER operator as the present pass, but
// targeting an rgba16float intermediate instead of the 8-bit canvas. Used to
// bake a full-frame `backgroundFill` UNDER the content BEFORE the effect chain,
// so content-masked effects (e.g. paper-grain, whose mask is `step(0.001, a)`)
// animate the whole opaque frame and the hold breathes — instead of the fill
// being added only at the final present pass, leaving the background static.
// Only used when a fill is declared AND effects exist; transparent pieces and
// effectless full-frame pieces never hit this path.
function compileBackgroundComposite(host: GpuHost): CompiledPresent {
	const { root } = host;

	const pipeline = root.createRenderPipeline({
		vertex: common.fullScreenTriangle,
		fragment: presentFragmentFn,
		targets: { format: INTERMEDIATE_FORMAT }
	});

	const sampler = root.createSampler({
		magFilter: 'linear',
		minFilter: 'linear',
		addressModeU: 'clamp-to-edge',
		addressModeV: 'clamp-to-edge'
	});

	const uniformBuffer = root
		.createBuffer(PresentUniforms, { background: d.vec4f(0, 0, 0, 0) })
		.$usage('uniform');

	return {
		apply({ inputView, outputView, background }) {
			const [r, g, b, a] = background ?? [0, 0, 0, 0];
			uniformBuffer.write({ background: d.vec4f(r, g, b, a) });

			const bindGroup = root.createBindGroup(presentBindGroupLayout, {
				inputTexture: inputView,
				samp: sampler,
				uniforms: uniformBuffer
			});

			pipeline
				.with(bindGroup)
				.withColorAttachment({
					view: outputView,
					clearValue: [0, 0, 0, 0],
					loadOp: 'clear',
					storeOp: 'store'
				})
				.draw(3);
		}
	};
}

function compilePresent(host: GpuHost): CompiledPresent {
	// Targets the canvas format (8-bit) — this is the only pass that writes the
	// final 8-bit output; everything upstream is rgba16float.
	const { format, root } = host;

	const pipeline = root.createRenderPipeline({
		vertex: common.fullScreenTriangle,
		fragment: presentFragmentFn,
		targets: { format }
	});

	const sampler = root.createSampler({
		magFilter: 'linear',
		minFilter: 'linear',
		addressModeU: 'clamp-to-edge',
		addressModeV: 'clamp-to-edge'
	});

	const uniformBuffer = root
		.createBuffer(PresentUniforms, { background: d.vec4f(0, 0, 0, 0) })
		.$usage('uniform');

	return {
		apply({ inputView, outputView, background }) {
			const [r, g, b, a] = background ?? [0, 0, 0, 0];
			uniformBuffer.write({ background: d.vec4f(r, g, b, a) });

			const bindGroup = root.createBindGroup(presentBindGroupLayout, {
				inputTexture: inputView,
				samp: sampler,
				uniforms: uniformBuffer
			});

			pipeline.with(bindGroup).withColorAttachment({ view: outputView }).draw(3);
		}
	};
}

export interface EffectChainOptions {
	host: GpuHost;
	width: number;
	height: number;
}

export interface ApplyChainOptions {
	commandEncoder: GPUCommandEncoder;
	effects: readonly Effect[];
	inputTexture: GPUTexture;
	outputView: GPUTextureView;
	// Timeline-driven values forwarded to each effect's `pack(params, ctx)` so
	// time-driven shaders animate deterministically. Both derive from the same
	// paused-timeline scrub; preview and export agree at the same time.
	progress: number;
	timestamp: number;
	/** Premultiplied RGBA fill composited under the surface output. Absent = transparent default. */
	background?: [number, number, number, number];
}

export class EffectChain {
	#host: GpuHost;
	#width: number;
	#height: number;
	#pingTexture: GPUTexture;
	#pongTexture: GPUTexture;
	#present: CompiledPresent;
	#backgroundComposite: CompiledPresent;
	#cache: Map<string, CompiledEffect>;

	constructor({ host, width, height }: EffectChainOptions) {
		this.#host = host;
		this.#width = width;
		this.#height = height;
		this.#present = compilePresent(host);
		this.#backgroundComposite = compileBackgroundComposite(host);
		this.#cache = new Map();

		const descriptor: GPUTextureDescriptor = {
			size: [width, height, 1],
			format: INTERMEDIATE_FORMAT,
			usage: INTERMEDIATE_TEXTURE_USAGE
		};
		this.#pingTexture = host.device.createTexture(descriptor);
		this.#pongTexture = host.device.createTexture(descriptor);
	}

	#getCompiled(type: string): CompiledEffect | null {
		const cached = this.#cache.get(type);
		if (cached) {
			return cached;
		}

		const renderer = findEffectRenderer(type);
		if (!renderer) {
			return null;
		}

		const compiled = compileEffect(this.#host, renderer);
		this.#cache.set(type, compiled);
		return compiled;
	}

	// Apply effects in sequence, ping-ponging between intermediate textures.
	// The final pass writes to `outputView`.
	apply({
		commandEncoder,
		effects,
		inputTexture,
		outputView,
		progress,
		timestamp,
		background
	}: ApplyChainOptions): void {
		const valid: { effect: Effect; compiled: CompiledEffect }[] = [];
		for (const effect of effects) {
			const compiled = this.#getCompiled(effect.type);
			if (compiled) {
				valid.push({ effect, compiled });
			}
		}

		// Full-frame fill baked BEFORE the effects: when a `backgroundFill` is
		// declared (background.a > 0) AND effects run, composite the content over
		// the fill into the first intermediate so the effects operate on the whole
		// opaque frame (content-masked effects like paper-grain then animate the
		// background too — the hold breathes). The present pass below then skips
		// the fill (already baked). Transparent pieces (a == 0) and effectless
		// full-frame pieces never take this branch — their path is unchanged.
		const preCompositeFill = (background?.[3] ?? 0) > 0 && valid.length > 0;
		let currentInputView = inputTexture.createView();
		let parity = 0;
		if (preCompositeFill) {
			this.#backgroundComposite.apply({
				commandEncoder,
				inputView: inputTexture.createView(),
				outputView: this.#pingTexture.createView(),
				background
			});
			currentInputView = this.#pingTexture.createView();
			parity = 1; // first effect must write pong (ping now holds the baked frame)
		}

		// Run every effect into the rgba16float intermediates, then present the
		// final result to the 8-bit canvas with dither. The no-effect path skips
		// the loop and presents the surface output directly — dithering (and the
		// 16float→8bit conversion) happens either way.
		for (let i = 0; i < valid.length; i += 1) {
			const outputTexture = (i + parity) % 2 === 0 ? this.#pingTexture : this.#pongTexture;
			valid[i].compiled.apply({
				commandEncoder,
				inputView: currentInputView,
				outputView: outputTexture.createView(),
				params: valid[i].effect.params,
				progress,
				timestamp,
				canvasWidth: this.#width,
				canvasHeight: this.#height
			});
			currentInputView = outputTexture.createView();
		}

		this.#present.apply({
			commandEncoder,
			inputView: currentInputView,
			outputView,
			// The fill is pre-composited under the content BEFORE the chain (so
			// content-masked effects animate the whole opaque frame) and passed
			// again here as the present backstop. The OVER operator makes the second
			// application a no-op wherever the chain output is already opaque; where
			// an effect carved alpha out (e.g. a pane-edge fade window), the fill
			// shows through — a declared-backgroundFill piece stays opaque to its
			// edges. Transparent pieces (background absent / a=0) are unaffected.
			background
		});
	}

	dispose(): void {
		this.#pingTexture.destroy();
		this.#pongTexture.destroy();
		this.#cache.clear();
	}
}
