<script lang="ts">
	// POC: real WebGPU-native 3D depth-of-field (isolated spike, not wired into the
	// engine). DOM card -> texture -> real 3D plane (perspective camera) -> a scene
	// target carrying colour + per-pixel DEPTH -> a depth-driven DOF gather. A focus
	// pull sweeps the sharp band through TRUE distance. Proves: real 3D, sharp
	// fronto-parallel text, and depth-of-field driven by an actual depth field
	// (not flat layers). Flag-enabled Chrome required (HTML-in-Canvas).
	import { onMount, tick } from 'svelte';
	import tgpu, { d } from 'typegpu';
	import { mat4 } from 'wgpu-matrix';

	import { createGpuHost, type GpuHost } from '$lib/platform/gpu-host';
	import { getHtmlInCanvasQueue } from '$lib/platform/html-in-canvas';
	import { INTERMEDIATE_FORMAT } from '$lib/platform/gpu-host';

	let canvas = $state.raw<HTMLCanvasElement | null>(null);
	let card = $state.raw<HTMLElement | null>(null);
	let status = $state('booting…');

	const WIDTH = 1920;
	const HEIGHT = 1080;
	const TEX_W = 1920;
	const TEX_H = 1080;
	const MAX_COC_PX = 38;
	const D_NEAR = 2.2; // camera-space distance mapped to depth 0
	const D_FAR = 4.6; // ...to depth 1
	const BOKEH_TAPS = 32;

	const TEXTURE_USAGE_COPY_DST = 0x02;
	const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
	const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;

	// wgpu-matrix returns a Float32Array(16); TypeGPU's mat4x4f takes 16 explicit args.
	function toMat4(m: Float32Array) {
		// prettier-ignore
		return d.mat4x4f(
			m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7],
			m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15]
		);
	}

	const SceneUniforms = d.struct({ mvp: d.mat4x4f, depthRange: d.vec2f });
	const DofUniforms = d.struct({ focus: d.f32, aperture: d.f32, resolution: d.vec2f });

	// --- Scene pass: card on a 3D plane, writing colour + per-pixel depth in alpha ---
	const sceneLayout = tgpu.bindGroupLayout({
		cardTexture: { texture: d.texture2d(d.f32) },
		samp: { sampler: 'filtering' },
		uniforms: { uniform: SceneUniforms }
	});

	const cardVertexFn = tgpu['~unstable'].vertexFn({
		in: { vertexIndex: d.builtin.vertexIndex },
		out: { position: d.builtin.position, uv: d.vec2f, dist: d.f32 }
	}) /* wgsl */ `{
		var pos = array<vec3f, 6>(
			vec3f(-1.0, -1.0, 0.0), vec3f(1.0, -1.0, 0.0), vec3f(1.0, 1.0, 0.0),
			vec3f(-1.0, -1.0, 0.0), vec3f(1.0, 1.0, 0.0), vec3f(-1.0, 1.0, 0.0)
		);
		var uv = array<vec2f, 6>(
			vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
			vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
		);
		let clip = layout.$.uniforms.mvp * vec4f(pos[in.vertexIndex], 1.0);
		// clip.w == camera-space distance for a standard perspective projection.
		return Out(clip, uv[in.vertexIndex], clip.w);
	}`.$uses({ layout: sceneLayout });

	const cardFragmentFn = tgpu['~unstable'].fragmentFn({
		in: { uv: d.vec2f, dist: d.f32 },
		out: d.vec4f
	}) /* wgsl */ `{
		let s = textureSample(layout.$.cardTexture, layout.$.samp, in.uv);
		let bg = vec3f(0.07, 0.07, 0.09);
		let rgb = s.rgb * s.a + bg * (1.0 - s.a);
		let dr = layout.$.uniforms.depthRange;
		let depth = clamp((in.dist - dr.x) / (dr.y - dr.x), 0.0, 1.0);
		return vec4f(rgb, depth);
	}`.$uses({ layout: sceneLayout });

	// --- Backdrop pass: fills the scene target at far depth (alpha = 1) ---
	const bgLayout = tgpu.bindGroupLayout({});
	const fullVertexFn = tgpu['~unstable'].vertexFn({
		in: { vertexIndex: d.builtin.vertexIndex },
		out: { position: d.builtin.position, uv: d.vec2f }
	}) /* wgsl */ `{
		var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
		var u = array<vec2f, 3>(vec2f(0.0, 1.0), vec2f(2.0, 1.0), vec2f(0.0, -1.0));
		return Out(vec4f(p[in.vertexIndex], 0.0, 1.0), u[in.vertexIndex]);
	}`;
	const bgFragmentFn = tgpu['~unstable'].fragmentFn({
		in: { uv: d.vec2f },
		out: d.vec4f
	}) /* wgsl */ `{
		let r = length(in.uv - vec2f(0.5));
		let c = mix(vec3f(0.09, 0.09, 0.12), vec3f(0.03, 0.03, 0.05), r);
		return vec4f(c, 1.0);
	}`;

	// --- DOF pass: gather a disc whose radius = CoC from the per-pixel depth ---
	const dofLayout = tgpu.bindGroupLayout({
		scene: { texture: d.texture2d(d.f32) },
		samp: { sampler: 'filtering' },
		uniforms: { uniform: DofUniforms }
	});
	const dofFragmentFn = tgpu['~unstable'].fragmentFn({
		in: { uv: d.vec2f },
		out: d.vec4f
	}) /* wgsl */ `{
		let focus = layout.$.uniforms.focus;
		let aperture = layout.$.uniforms.aperture;
		let texel = vec2f(1.0) / layout.$.uniforms.resolution;
		let centerDepth = textureSample(layout.$.scene, layout.$.samp, in.uv).a;
		let coc = aperture * abs(centerDepth - focus) * ${MAX_COC_PX};
		let jitter = fract(sin(dot(in.uv, vec2f(12.9898, 78.233))) * 43758.5453) * 6.2831853;
		var acc = vec3f(0.0);
		var wsum = 0.0;
		for (var i: u32 = 0u; i < ${BOKEH_TAPS}u; i = i + 1u) {
			let st = (f32(i) + 0.5) / ${BOKEH_TAPS}.0;
			let ang = f32(i) * 2.39996 + jitter;
			let dir = vec2f(cos(ang), sin(ang)) * sqrt(st);
			let sUv = in.uv + dir * coc * texel;
			let smp = textureSample(layout.$.scene, layout.$.samp, sUv);
			// Don't let sharp foreground bleed onto blurry background: weight a tap
			// only if its own depth is at/behind the gathered depth.
			let w = select(0.0, 1.0, smp.a >= centerDepth - 0.08);
			acc = acc + smp.rgb * w;
			wsum = wsum + w;
		}
		let outRgb = select(textureSample(layout.$.scene, layout.$.samp, in.uv).rgb, acc / wsum, wsum > 0.0);
		return vec4f(outRgb, 1.0);
	}`.$uses({ layout: dofLayout });

	onMount(() => {
		let raf = 0;
		let host: GpuHost | null = null;
		let disposed = false;
		let manualFocus = -1; // -1 = auto sweep

		(async () => {
			const c = canvas;
			const cardEl = card;
			if (!c || !cardEl) return;
			await tick();
			await document.fonts.ready;
			await new Promise((r) => requestAnimationFrame(() => r(null)));
			await new Promise((r) => requestAnimationFrame(() => r(null)));

			host = await createGpuHost(c);
			const { device, root } = host;
			const htmlQueue = getHtmlInCanvasQueue(device.queue);

			const cardTexture = device.createTexture({
				size: [TEX_W, TEX_H, 1],
				format: 'rgba8unorm',
				usage:
					TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_DST | TEXTURE_USAGE_RENDER_ATTACHMENT
			});
			htmlQueue.copyElementImageToTexture(cardEl, TEX_W, TEX_H, { texture: cardTexture });

			const sceneTexture = device.createTexture({
				size: [WIDTH, HEIGHT, 1],
				format: INTERMEDIATE_FORMAT,
				usage: TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_RENDER_ATTACHMENT
			});
			const sceneView = sceneTexture.createView();

			const sampler = root['~unstable'].createSampler({
				magFilter: 'linear',
				minFilter: 'linear',
				addressModeU: 'clamp-to-edge',
				addressModeV: 'clamp-to-edge'
			});
			const sceneUniform = root
				.createBuffer(SceneUniforms, { mvp: d.mat4x4f(), depthRange: d.vec2f(D_NEAR, D_FAR) })
				.$usage('uniform');
			const dofUniform = root
				.createBuffer(DofUniforms, { focus: 0.5, aperture: 1, resolution: d.vec2f(WIDTH, HEIGHT) })
				.$usage('uniform');

			const sceneBind = root.createBindGroup(sceneLayout, {
				cardTexture,
				samp: sampler,
				uniforms: sceneUniform
			});
			const bgBind = root.createBindGroup(bgLayout, {});
			const dofBind = root.createBindGroup(dofLayout, {
				scene: sceneView,
				samp: sampler,
				uniforms: dofUniform
			});

			const cardPipeline = root['~unstable']
				.withVertex(cardVertexFn, {})
				.withFragment(cardFragmentFn, { format: INTERMEDIATE_FORMAT })
				.createPipeline();
			const bgPipeline = root['~unstable']
				.withVertex(fullVertexFn, {})
				.withFragment(bgFragmentFn, { format: INTERMEDIATE_FORMAT })
				.createPipeline();
			const dofPipeline = root['~unstable']
				.withVertex(fullVertexFn, {})
				.withFragment(dofFragmentFn, { format: host.format })
				.createPipeline();

			const aspect = WIDTH / HEIGHT;
			const cardAspect = TEX_W / TEX_H;
			const projection = mat4.perspective((42 * Math.PI) / 180, aspect, 0.1, 100);
			const view = mat4.lookAt([0, 0, 3.4], [0, 0, 0], [0, 1, 0]);

			status = 'rendering';
			let frame = 0;
			const renderLoop = () => {
				if (disposed || !host) return;

				// Card tilted about Y so it recedes left->right (continuous depth).
				const model = mat4.identity();
				mat4.rotateY(model, (26 * Math.PI) / 180, model);
				mat4.scale(model, [cardAspect, 1, 1], model);
				const mvp = mat4.multiply(projection, mat4.multiply(view, model));
				sceneUniform.write({
					mvp: toMat4(mvp as Float32Array),
					depthRange: d.vec2f(D_NEAR, D_FAR)
				});

				const focus = manualFocus >= 0 ? manualFocus : 0.5 + 0.5 * Math.sin(frame * 0.01);
				dofUniform.write({ focus, aperture: 1, resolution: d.vec2f(WIDTH, HEIGHT) });

				// Scene: backdrop (far) then the card, into the scene target.
				bgPipeline
					.with(bgBind)
					.withColorAttachment({
						view: sceneView,
						clearValue: [0, 0, 0, 1],
						loadOp: 'clear',
						storeOp: 'store'
					})
					.draw(3);
				cardPipeline
					.with(sceneBind)
					.withColorAttachment({ view: sceneView, loadOp: 'load', storeOp: 'store' })
					.draw(6);

				// DOF -> canvas.
				dofPipeline
					.with(dofBind)
					.withColorAttachment({
						view: host.context.getCurrentTexture().createView(),
						clearValue: [0, 0, 0, 1],
						loadOp: 'clear',
						storeOp: 'store'
					})
					.draw(3);

				frame += 1;
				raf = requestAnimationFrame(renderLoop);
			};
			renderLoop();

			(window as unknown as { __poc: unknown }).__poc = {
				setFocus: (v: number) => (manualFocus = v),
				autoFocus: () => (manualFocus = -1)
			};
		})().catch((err) => {
			console.error('[poc] failed', err);
			status = `error: ${err instanceof Error ? err.message : String(err)}`;
		});

		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			host?.dispose();
		};
	});
</script>

<div class="poc">
	<p class="status">DOF3D POC — {status}</p>
	<canvas bind:this={canvas} width={WIDTH} height={HEIGHT} layoutsubtree>
		<div bind:this={card} class="card">
			<p class="kicker">SYNTAX · ISSUE 02</p>
			<h1>Why Bun Quietly Replaced npm</h1>
			<p class="sub">A field report on the quiet migration nobody announced.</p>
		</div>
	</canvas>
</div>

<style>
	.poc {
		background: #111;
		min-block-size: 100vh;
		padding: 1rem;
	}
	.status {
		color: #9aa;
		font: 12px monospace;
		margin: 0 0 0.5rem;
	}
	.poc :global(canvas) {
		aspect-ratio: 16 / 9;
		display: block;
		inline-size: min(100%, 1280px);
	}
	.card {
		block-size: 1080px;
		inline-size: 1920px;
		box-sizing: border-box;
		background: #f4efe4;
		color: #16140f;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 28px;
		padding: 130px 150px;
		font-family: 'Playfair Display', Georgia, serif;
	}
	.card .kicker {
		font-family: 'JetBrains Mono', monospace;
		font-size: 34px;
		letter-spacing: 0.32em;
		color: #b25b2a;
		margin: 0;
	}
	.card h1 {
		font-size: 150px;
		line-height: 1.02;
		font-weight: 800;
		margin: 0;
	}
	.card .sub {
		font-size: 46px;
		font-family: 'EB Garamond', Georgia, serif;
		color: #4a4438;
		margin: 0;
	}
</style>
