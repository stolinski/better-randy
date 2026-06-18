import tgpu, { d } from 'typegpu';

import type { GpuHost } from '$lib/platform/gpu-host';

/**
 * The transition-Effect render lane (ADR-0026). Unlike a post-process Effect
 * (one input colour texture), a transition Effect binds the TWO snapshot colour
 * textures — `from` and `to` — plus a local wipe `progress` (0 = fully `from`,
 * 1 = fully `to`), and composites directly to the canvas (host format).
 *
 * `mask-wipe` is the first: a per-pixel selection by a left-to-right boundary at
 * `x = progress`, with a thin smoothstep band for edge AA. It is a true wipe —
 * each pixel is `from` OR `to`, not a blend of both — except inside the ~1px AA
 * band. Both snapshots are premultiplied-alpha composites, so the output stays
 * premultiplied and the transparency contract holds. A richer mask shape (task
 * 4) swaps only the boundary expression; the two-texture lane is unchanged.
 */

const WipeUniforms = d.struct({ progress: d.f32 });

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

export interface TransitionWipeApplyOptions {
	fromView: GPUTextureView;
	toView: GPUTextureView;
	outputView: GPUTextureView;
	progress: number;
}

export interface CompiledTransitionWipe {
	apply(opts: TransitionWipeApplyOptions): void;
}

interface UniformBufferShape {
	write(value: unknown): void;
}

/** Compile the `mask-wipe` transition pass against the host. One-time; the
 *  pipeline + uniform buffer are reused per frame via apply(). */
export function compileTransitionWipe(host: GpuHost): CompiledTransitionWipe {
	const { format, root } = host;

	const bindGroupLayout = tgpu.bindGroupLayout({
		fromTexture: { texture: d.texture2d(d.f32) },
		toTexture: { texture: d.texture2d(d.f32) },
		samp: { sampler: 'filtering' },
		uniforms: { uniform: WipeUniforms }
	});

	const fragmentFn = tgpu['~unstable']
		.fragmentFn({
			in: { uv: d.vec2f },
			out: d.vec4f
		})/* wgsl */ `{
			let fromSample = textureSample(layout.$.fromTexture, layout.$.samp, in.uv);
			let toSample = textureSample(layout.$.toTexture, layout.$.samp, in.uv);
			let p = layout.$.uniforms.progress;
			// Boundary at x = p sweeps left to right. Left of it (uv.x < p) reveals
			// the to-state; right of it stays the from-state. ~1px smoothstep AA band.
			let edge = smoothstep(p - 0.0008, p + 0.0008, in.uv.x);
			return mix(toSample, fromSample, edge);
		}`.$uses({ layout: bindGroupLayout });

	const pipeline = root['~unstable']
		.withVertex(fullScreenVertexFn, {})
		.withFragment(fragmentFn, { format })
		.createPipeline();

	const sampler = root['~unstable'].createSampler({
		magFilter: 'linear',
		minFilter: 'linear',
		addressModeU: 'clamp-to-edge',
		addressModeV: 'clamp-to-edge'
	});

	const uniformBuffer = (
		root.createBuffer(WipeUniforms) as unknown as {
			$usage: (kind: 'uniform') => UniformBufferShape;
		}
	).$usage('uniform');

	return {
		apply({ fromView, toView, outputView, progress }) {
			uniformBuffer.write({ progress });

			const bindGroup = root.createBindGroup(bindGroupLayout, {
				fromTexture: fromView,
				toTexture: toView,
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
		}
	};
}
