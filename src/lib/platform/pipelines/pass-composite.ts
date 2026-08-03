import tgpu, { d } from 'typegpu';

import { INTERMEDIATE_FORMAT, type GpuHost } from '$lib/platform/gpu-host';
import type { PassPixelBounds } from './pass-execution';

const fullScreenVertexFn = tgpu['~unstable'].vertexFn({
	in: { vertexIndex: d.builtin.vertexIndex },
	out: { position: d.builtin.position, uv: d.vec2f }
}) /* wgsl */ `{
	var positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
	var uvs = array<vec2f, 3>(vec2f(0.0, 1.0), vec2f(2.0, 1.0), vec2f(0.0, -1.0));
	return Out(vec4f(positions[in.vertexIndex], 0.0, 1.0), uvs[in.vertexIndex]);
}`;

const PassCompositeUniforms = d.struct({ region: d.vec4f });
const passCompositeLayout = tgpu.bindGroupLayout({
	inputTexture: { texture: d.texture2d(d.f32) },
	processedTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	uniforms: { uniform: PassCompositeUniforms }
});
const passCompositeFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: d.vec4f
}) /* wgsl */ `{
		let region = layout.$.uniforms.region;
		let isInside = all(in.uv >= region.xy) && all(in.uv <= region.xy + region.zw);
		let original = textureSample(layout.$.inputTexture, layout.$.samp, in.uv);
		let processed = textureSample(layout.$.processedTexture, layout.$.samp, in.uv);
		return select(original, processed, isInside);
	}`.$uses({ layout: passCompositeLayout });

export interface CompiledPassComposite {
	apply(options: {
		commandEncoder: GPUCommandEncoder;
		inputView: GPUTextureView;
		processedView: GPUTextureView;
		outputView: GPUTextureView;
		region: PassPixelBounds;
		canvasWidth: number;
		canvasHeight: number;
	}): void;
}

export function compilePassComposite(host: GpuHost): CompiledPassComposite {
	const { root } = host;
	const pipeline = root['~unstable']
		.withVertex(fullScreenVertexFn, {})
		.withFragment(passCompositeFragmentFn, { format: INTERMEDIATE_FORMAT })
		.createPipeline();
	const sampler = root['~unstable'].createSampler({
		magFilter: 'linear',
		minFilter: 'linear',
		addressModeU: 'clamp-to-edge',
		addressModeV: 'clamp-to-edge'
	});
	const uniformBuffer = root
		.createBuffer(PassCompositeUniforms, { region: d.vec4f(0, 0, 1, 1) })
		.$usage('uniform');

	return {
		apply({
			commandEncoder,
			inputView,
			processedView,
			outputView,
			region,
			canvasWidth,
			canvasHeight
		}) {
			uniformBuffer.write({
				region: d.vec4f(
					region.x / canvasWidth,
					region.y / canvasHeight,
					region.width / canvasWidth,
					region.height / canvasHeight
				)
			});
			const bindGroup = root.createBindGroup(passCompositeLayout, {
				inputTexture: inputView,
				processedTexture: processedView,
				samp: sampler,
				uniforms: uniformBuffer
			});
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
			pipeline.with(bindGroup).with(renderPass).draw(3);
			renderPass.end();
		}
	};
}
