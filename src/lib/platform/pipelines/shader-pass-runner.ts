import tgpu, { d } from 'typegpu';

import { INTERMEDIATE_FORMAT, type GpuHost } from '$lib/platform/gpu-host';
import { compilePassComposite, type CompiledPassComposite } from './pass-composite';
import { resolvePassExecution, type PassPixelBounds } from './pass-execution';
import type { EffectPackContext, ShaderPass } from './types';

/**
 * Compose-pipeline invocation for `ShaderPass<T>` (declared by
 * `SurfaceRenderer.shaderPass` per ADR-0008 and `OverlayRenderer.shaderPass`
 * per ADR-0005). Resolves the deferred wiring captured in ADR-0010.
 *
 * The runner mirrors the bind-group layout the effect-chain executor uses
 * (`inputTexture`, `samp`, `uniforms`) so a `ShaderPass`'s `wgsl` fragment
 * body has the same calling convention as `EffectPassDefinition.fragmentBody`:
 *
 *   - `in.uv: vec2f`              — full-screen UV
 *   - `inputSample: vec4f`        — `textureSample(layout.$.inputTexture, layout.$.samp, in.uv)`
 *   - `layout.$.uniforms`         — the pass's TypeGPU `uniforms` struct
 *
 * The body returns `vec4f`.
 *
 * Compose-pipeline contract:
 *   - Runs between the host's DOM-to-texture upload (carried by the surface's
 *     own `render()`) and the final composite. The pass reads the source
 *     output texture and writes to a dedicated intermediate texture so the
 *     downstream effect chain sees the post-shader pixels.
 *   - Every render target uses `loadOp: 'clear'` with
 *     `clearValue: [0, 0, 0, 0]`. Canvas alphaMode stays `premultiplied`.
 *     Transparency contract holds.
 *   - Deterministic: uniforms are packed once per frame from the target's
 *     content + bounds (the same `(SurfaceState | overlay.content)` that the
 *     timeline drives). No wall-clock reads, no `Math.random`.
 */

const TEXTURE_USAGE_COPY_SRC = 0x01;
const TEXTURE_USAGE_COPY_DST = 0x02;
const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const INTERMEDIATE_TEXTURE_USAGE =
	TEXTURE_USAGE_TEXTURE_BINDING |
	TEXTURE_USAGE_COPY_DST |
	TEXTURE_USAGE_COPY_SRC |
	TEXTURE_USAGE_RENDER_ATTACHMENT;

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

export interface ShaderPassBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ApplyShaderPassOptions<TContent> {
	commandEncoder: GPUCommandEncoder;
	inputView: GPUTextureView;
	outputView: GPUTextureView;
	target: TContent;
	bounds: ShaderPassBounds;
	ctx: EffectPackContext;
	scissor?: PassPixelBounds;
}

export interface CompiledShaderPass<TContent> {
	apply(opts: ApplyShaderPassOptions<TContent>): void;
}

interface UniformBufferShape {
	write(value: unknown): void;
}

/**
 * Compile a declarative `ShaderPass<TContent>` into a runnable pipeline.
 * Compilation is one-time per pass; subsequent calls reuse the pipeline +
 * uniform buffer and rewrite uniforms via `pass.packUniforms`.
 */
export function compileShaderPass<TContent>(
	host: GpuHost,
	pass: ShaderPass<TContent>
): CompiledShaderPass<TContent> {
	const { root } = host;

	// Same shape as effect-chain's compileEffect — TypeScript can't carry the
	// dynamic struct shape through the registry boundary; cast through unknown
	// into TypeGPU's bindGroupLayout factory.
	type LayoutDef = Parameters<typeof tgpu.bindGroupLayout>[0];
	const layoutDef: LayoutDef = {
		inputTexture: { texture: d.texture2d(d.f32) },
		samp: { sampler: 'filtering' },
		uniforms: { uniform: pass.uniforms as never }
	} as unknown as LayoutDef;
	const bindGroupLayout = tgpu.bindGroupLayout(layoutDef);

	const fragmentFn = tgpu['~unstable'].fragmentFn({
		in: { uv: d.vec2f },
		out: d.vec4f
	}) /* wgsl */ `{
			let inputSample = textureSample(layout.$.inputTexture, layout.$.samp, in.uv);
			${pass.wgsl}
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

	// Persistent uniform buffer; values rewritten per frame via pass.packUniforms.
	const uniformBuffer = (
		root.createBuffer(pass.uniforms as never) as unknown as {
			$usage: (kind: 'uniform') => UniformBufferShape;
		}
	).$usage('uniform');

	return {
		apply({ commandEncoder, inputView, outputView, target, bounds, ctx, scissor }) {
			uniformBuffer.write(pass.packUniforms(target, bounds, ctx) as never);

			const bindGroup = root.createBindGroup(bindGroupLayout, {
				inputTexture: inputView,
				samp: sampler,
				uniforms: uniformBuffer
			} as never);

			const renderPass = commandEncoder.beginRenderPass({
				colorAttachments: [
					{
						view: outputView,
						clearValue: [0, 0, 0, 0],
						loadOp: 'clear',
						storeOp: 'store'
					}
				]
			});
			if (scissor) {
				renderPass.setScissorRect(scissor.x, scissor.y, scissor.width, scissor.height);
			}
			pipeline.with(bindGroup).with(renderPass).draw(3);
			renderPass.end();
		}
	};
}

export interface ShaderPassDispatcherOptions {
	host: GpuHost;
	width: number;
	height: number;
}

interface ShaderPassDispatchEntry<TContent> {
	pass: ShaderPass<TContent>;
	target: TContent;
	bounds: ShaderPassBounds;
}

export type ShaderPassDispatchList = readonly ShaderPassDispatchEntry<unknown>[];

/**
 * Owns the ping-pong intermediate textures shared across surface + overlay
 * shader passes, plus a per-pass compiled-pipeline cache keyed by
 * `ShaderPass` identity (object reference). The dispatcher is held by
 * `Workspace.svelte` for the lifetime of the GPU host; it's disposed
 * alongside the host so the intermediate GPUTexture lifetimes track the
 * canvas size.
 *
 * Shape rationale:
 *   - Two intermediates (ping/pong) cover the surface + overlay sequence —
 *     when a surface pass writes to the first intermediate, an overlay pass
 *     reads from it and writes to the second, and so on. WebGPU forbids a
 *     pass reading and writing the same texture in one draw, so a single
 *     intermediate would break under concurrent surface + overlay passes.
 *   - Compiled pipelines are cached by `ShaderPass` reference (`WeakMap`),
 *     not by string type, because shader passes don't carry a type
 *     discriminator (a renderer declares its own pass inline; the renderer
 *     is the identity).
 */
export class ShaderPassDispatcher {
	#host: GpuHost;
	#pingTexture: GPUTexture;
	#pongTexture: GPUTexture;
	#cache: WeakMap<ShaderPass<unknown>, CompiledShaderPass<unknown>>;
	#composite: CompiledPassComposite;
	#scratchTextures = new Map<string, GPUTexture>();
	#width: number;
	#height: number;

	constructor({ host, width, height }: ShaderPassDispatcherOptions) {
		this.#host = host;
		this.#width = width;
		this.#height = height;
		this.#cache = new WeakMap();
		this.#composite = compilePassComposite(host);

		const descriptor: GPUTextureDescriptor = {
			size: [width, height, 1],
			format: INTERMEDIATE_FORMAT,
			usage: INTERMEDIATE_TEXTURE_USAGE
		};
		this.#pingTexture = host.device.createTexture(descriptor);
		this.#pongTexture = host.device.createTexture(descriptor);
	}

	#scratchTexture(width: number, height: number): GPUTexture {
		const key = `${width}x${height}`;
		const existing = this.#scratchTextures.get(key);
		if (existing) return existing;
		const texture = this.#host.device.createTexture({
			size: [width, height, 1],
			format: INTERMEDIATE_FORMAT,
			usage: INTERMEDIATE_TEXTURE_USAGE
		});
		this.#scratchTextures.set(key, texture);
		return texture;
	}

	#getCompiled<TContent>(pass: ShaderPass<TContent>): CompiledShaderPass<TContent> {
		const cached = this.#cache.get(pass as ShaderPass<unknown>);
		if (cached) {
			return cached as CompiledShaderPass<TContent>;
		}

		const compiled = compileShaderPass(this.#host, pass);
		this.#cache.set(pass as ShaderPass<unknown>, compiled as CompiledShaderPass<unknown>);
		return compiled;
	}

	/**
	 * Run a sequence of shader passes. Reads from `inputTexture`, ping-pongs
	 * through the dispatcher's intermediate textures, and returns the texture
	 * holding the final result. Caller passes the returned texture to the
	 * downstream composite (the effect chain) as its new input.
	 *
	 * If `passes` is empty, the input texture is returned untouched so the
	 * caller can keep its existing wiring; the empty-list path is the common
	 * case (only the newspaper Surface declares a shaderPass today).
	 */
	apply(opts: {
		commandEncoder: GPUCommandEncoder;
		passes: ShaderPassDispatchList;
		inputTexture: GPUTexture;
		// Timebase only — the dispatcher owns the canvas dimensions and fills in
		// the `EffectPackContext` canvas fields itself.
		ctx: Omit<EffectPackContext, 'canvasWidth' | 'canvasHeight'>;
	}): GPUTexture {
		const { commandEncoder, passes, inputTexture, ctx } = opts;

		if (passes.length === 0) {
			return inputTexture;
		}

		let currentInputView = inputTexture.createView();
		let lastOutputTexture: GPUTexture = inputTexture;

		for (let i = 0; i < passes.length; i += 1) {
			const entry = passes[i];
			const outputTexture = i % 2 === 0 ? this.#pingTexture : this.#pongTexture;
			const compiled = this.#getCompiled(entry.pass);
			const passContext = { ...ctx, canvasWidth: this.#width, canvasHeight: this.#height };
			const execution = resolvePassExecution(
				entry.pass.execution?.(entry.target, entry.bounds, passContext),
				this.#width,
				this.#height
			);

			if (execution.mode === 'full') {
				compiled.apply({
					commandEncoder,
					inputView: currentInputView,
					outputView: outputTexture.createView(),
					target: entry.target,
					bounds: entry.bounds,
					ctx: passContext
				});
			} else {
				const scratchTexture = this.#scratchTexture(execution.targetWidth, execution.targetHeight);
				compiled.apply({
					commandEncoder,
					inputView: currentInputView,
					outputView: scratchTexture.createView(),
					target: entry.target,
					bounds: entry.bounds,
					ctx: passContext,
					scissor: execution.mode === 'region' ? execution.region : undefined
				});
				this.#composite.apply({
					commandEncoder,
					inputView: currentInputView,
					processedView: scratchTexture.createView(),
					outputView: outputTexture.createView(),
					region: execution.region,
					canvasWidth: this.#width,
					canvasHeight: this.#height
				});
			}

			lastOutputTexture = outputTexture;
			currentInputView = outputTexture.createView();
		}
		this.#host.device.queue.submit([commandEncoder.finish()]);

		return lastOutputTexture;
	}

	dispose(): void {
		this.#pingTexture.destroy();
		this.#pongTexture.destroy();
		for (const texture of this.#scratchTextures.values()) texture.destroy();
		this.#scratchTextures.clear();
		// WeakMap cache clears with the dispatcher reference; compiled
		// pipelines are owned by the TypeGPU root and freed when the host
		// disposes.
	}
}
