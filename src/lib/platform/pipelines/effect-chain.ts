import tgpu, { d } from 'typegpu';

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

const fullScreenVertexFn = tgpu['~unstable'].vertexFn({
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

// Present pipeline: the final pass of every frame. Reads the last rgba16float
// intermediate and writes to the 8-bit canvas, applying ordered dither at the
// quantization boundary so smooth gradients don't band. Also the no-effect
// path (replaces the old plain blit) — the surface output is always presented
// through here, so dithering happens whether or not effects are configured.
const presentBindGroupLayout = tgpu.bindGroupLayout({
	inputTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' }
});

const presentFragmentFn = tgpu['~unstable']
	.fragmentFn({
		in: { uv: d.vec2f, position: d.builtin.position },
		out: d.vec4f
	})/* wgsl */ `{
		let s = textureSample(layout.$.inputTexture, layout.$.samp, in.uv);
		// Interleaved-gradient-noise ordered dither (~1 LSB) applied at the
		// 16float→8bit write. Breaks up banding on near-black gradients the
		// 8-bit canvas would otherwise quantize into visible steps. Premultiplied
		// rgb is dithered; alpha is left exact so edges stay clean.
		let ign = fract(52.9829189 * fract(dot(in.position.xy, vec2f(0.06711056, 0.00583715))));
		let dither = (ign - 0.5) / 255.0;
		return vec4f(s.rgb + vec3f(dither, dither, dither), s.a);
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
	}): void;
}

interface CompiledPresent {
	apply(opts: {
		commandEncoder: GPUCommandEncoder;
		inputView: GPUTextureView;
		outputView: GPUTextureView;
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
	type LayoutDef = Parameters<typeof tgpu.bindGroupLayout>[0];
	const layoutDef: LayoutDef = {
		inputTexture: { texture: d.texture2d(d.f32) },
		samp: { sampler: 'filtering' },
		uniforms: { uniform: renderer.pass.paramsStruct as never }
	} as unknown as LayoutDef;
	const bindGroupLayout = tgpu.bindGroupLayout(layoutDef);

	const fragmentFn = tgpu['~unstable']
		.fragmentFn({
			in: { uv: d.vec2f },
			out: d.vec4f
		})/* wgsl */ `{
			let inputSample = textureSample(layout.$.inputTexture, layout.$.samp, in.uv);
			${renderer.pass.fragmentBody}
		}`.$uses({ layout: bindGroupLayout });

	const pipeline = root['~unstable']
		.withVertex(fullScreenVertexFn, {})
		.withFragment(fragmentFn, { format: INTERMEDIATE_FORMAT })
		.createPipeline();

	const sampler = root['~unstable'].createSampler({
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
		apply({ inputView, outputView, params, progress, timestamp }) {
			uniformBuffer.write(renderer.pass.pack(params, { progress, timestamp }) as never);

			const bindGroup = root.createBindGroup(bindGroupLayout, {
				inputTexture: inputView,
				samp: sampler,
				uniforms: uniformBuffer
			} as never);

			pipeline
				.with(bindGroup)
				.withColorAttachment({
					view: outputView,
					clearValue: [0, 0, 0, 0],
					loadOp: 'clear',
					storeOp: 'store'
				})
				.draw(3);

			// device used implicitly by pipeline; nothing else to do per apply.
			void device;
		}
	};
}

function compilePresent(host: GpuHost): CompiledPresent {
	// Targets the canvas format (8-bit) — this is the only pass that writes the
	// final 8-bit output; everything upstream is rgba16float.
	const { format, root } = host;

	const pipeline = root['~unstable']
		.withVertex(fullScreenVertexFn, {})
		.withFragment(presentFragmentFn, { format })
		.createPipeline();

	const sampler = root['~unstable'].createSampler({
		magFilter: 'linear',
		minFilter: 'linear',
		addressModeU: 'clamp-to-edge',
		addressModeV: 'clamp-to-edge'
	});

	return {
		apply({ inputView, outputView }) {
			const bindGroup = root.createBindGroup(presentBindGroupLayout, {
				inputTexture: inputView,
				samp: sampler
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
}

export class EffectChain {
	#host: GpuHost;
	#width: number;
	#height: number;
	#pingTexture: GPUTexture;
	#pongTexture: GPUTexture;
	#present: CompiledPresent;
	#cache: Map<string, CompiledEffect>;

	constructor({ host, width, height }: EffectChainOptions) {
		this.#host = host;
		this.#width = width;
		this.#height = height;
		this.#present = compilePresent(host);
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
		timestamp
	}: ApplyChainOptions): void {
		const valid: { effect: Effect; compiled: CompiledEffect }[] = [];
		for (const effect of effects) {
			const compiled = this.#getCompiled(effect.type);
			if (compiled) {
				valid.push({ effect, compiled });
			}
		}

		// Run every effect into the rgba16float intermediates, then present the
		// final result to the 8-bit canvas with dither. The no-effect path skips
		// the loop and presents the surface output directly — dithering (and the
		// 16float→8bit conversion) happens either way.
		let currentInputView = inputTexture.createView();
		for (let i = 0; i < valid.length; i += 1) {
			const outputTexture = i % 2 === 0 ? this.#pingTexture : this.#pongTexture;
			valid[i].compiled.apply({
				commandEncoder,
				inputView: currentInputView,
				outputView: outputTexture.createView(),
				params: valid[i].effect.params,
				progress,
				timestamp
			});
			currentInputView = outputTexture.createView();
		}

		this.#present.apply({
			commandEncoder,
			inputView: currentInputView,
			outputView
		});

		void this.#width;
		void this.#height;
	}

	dispose(): void {
		this.#pingTexture.destroy();
		this.#pongTexture.destroy();
		this.#cache.clear();
	}
}
