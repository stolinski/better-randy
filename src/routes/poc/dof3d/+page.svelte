<script lang="ts">
	// POC: real WebGPU-native 3D depth-of-field (isolated spike, not wired into the
	// engine). A DOM card on a real 3D plane + a back wall, lit by a point light,
	// rendered to a scene target carrying colour + per-pixel DEPTH, then a depth-
	// driven scatter-as-gather DOF. A focus pull sweeps the sharp band through TRUE
	// distance. Proves real 3D, sharp fronto-parallel text, real lighting, and real
	// depth-of-field. Flag-enabled Chrome required (HTML-in-Canvas).
	import { onMount, tick } from 'svelte';
	import tgpu, { d } from 'typegpu';
	import { mat4 } from 'wgpu-matrix';

	import { createGpuHost, INTERMEDIATE_FORMAT, type GpuHost } from '$lib/platform/gpu-host';
	import { getHtmlInCanvasQueue } from '$lib/platform/html-in-canvas';

	let canvas = $state.raw<HTMLCanvasElement | null>(null);
	let card = $state.raw<HTMLElement | null>(null);
	let status = $state('booting…');

	const WIDTH = 1920;
	const HEIGHT = 1080;
	const TEX_W = 1920;
	const TEX_H = 1080;
	const MAX_COC_PX = 42;
	const D_NEAR = 2.5; // camera-space distance mapped to depth 0
	const D_FAR = 6.0; // ...to depth 1
	const BOKEH_TAPS = 96;

	const TEXTURE_USAGE_COPY_DST = 0x02;
	const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
	const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;

	// Transform a direction by a column-major mat4's upper-3x3 (no translation).
	function dir3(m: Float32Array, x: number, y: number, z: number): [number, number, number] {
		return [
			m[0] * x + m[4] * y + m[8] * z,
			m[1] * x + m[5] * y + m[9] * z,
			m[2] * x + m[6] * y + m[10] * z
		];
	}
	function norm3([x, y, z]: [number, number, number]): [number, number, number] {
		const l = Math.hypot(x, y, z) || 1;
		return [x / l, y / l, z / l];
	}

	// wgpu-matrix returns a Float32Array(16); TypeGPU's mat4x4f takes 16 explicit args.
	function toMat4(m: Float32Array) {
		// prettier-ignore
		return d.mat4x4f(
			m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7],
			m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15]
		);
	}

	// misc = (depthNear, depthFar, textured, _). baseColor = plane albedo (rgb).
	const PlaneUniforms = d.struct({
		mvp: d.mat4x4f,
		model: d.mat4x4f,
		misc: d.vec4f,
		baseColor: d.vec4f
	});
	// lightPos.xyz; params = (ambient, diffuse, falloffK, areaRadius).
	const LightUniforms = d.struct({ lightPos: d.vec4f, params: d.vec4f });
	// Card quad in world space, for analytic ray-cast shadow: centre + the two
	// in-plane half-extent axes (u, v) + the plane normal. enabled in n.w.
	const ShadowUniforms = d.struct({
		center: d.vec4f,
		u: d.vec4f,
		v: d.vec4f,
		n: d.vec4f
	});
	const DofUniforms = d.struct({ focus: d.f32, aperture: d.f32, resolution: d.vec2f });

	// --- Scene pass: a lit plane (card or wall), writing colour + per-pixel depth ---
	const planeLayout = tgpu.bindGroupLayout({
		cardTexture: { texture: d.texture2d(d.f32) },
		samp: { sampler: 'filtering' },
		plane: { uniform: PlaneUniforms },
		light: { uniform: LightUniforms },
		shadow: { uniform: ShadowUniforms }
	});

	const planeVertexFn = tgpu['~unstable'].vertexFn({
		in: { vertexIndex: d.builtin.vertexIndex },
		out: {
			position: d.builtin.position,
			uv: d.vec2f,
			worldPos: d.vec3f,
			normal: d.vec3f,
			dist: d.f32
		}
	}) /* wgsl */ `{
		var pos = array<vec3f, 6>(
			vec3f(-1.0, -1.0, 0.0), vec3f(1.0, -1.0, 0.0), vec3f(1.0, 1.0, 0.0),
			vec3f(-1.0, -1.0, 0.0), vec3f(1.0, 1.0, 0.0), vec3f(-1.0, 1.0, 0.0)
		);
		var uv = array<vec2f, 6>(
			vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
			vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
		);
		let lp = pos[in.vertexIndex];
		let world = layout.$.plane.model * vec4f(lp, 1.0);
		let clip = layout.$.plane.mvp * vec4f(lp, 1.0);
		let n = (layout.$.plane.model * vec4f(0.0, 0.0, 1.0, 0.0)).xyz;
		return Out(clip, uv[in.vertexIndex], world.xyz, n, clip.w);
	}`.$uses({ layout: planeLayout });

	const planeFragmentFn = tgpu['~unstable'].fragmentFn({
		in: { uv: d.vec2f, worldPos: d.vec3f, normal: d.vec3f, dist: d.f32 },
		out: d.vec4f
	}) /* wgsl */ `{
		let misc = layout.$.plane.misc;
		var albedo = layout.$.plane.baseColor.rgb;
		if (misc.z > 0.5) {
			let s = textureSample(layout.$.cardTexture, layout.$.samp, in.uv);
			albedo = s.rgb * s.a + albedo * (1.0 - s.a);
		}
		// Point-light shading: distance falloff across the tilted plane gives real
		// form (the side toward the light is brighter), and the far wall sits darker.
		let toL = layout.$.light.lightPos.xyz - in.worldPos;
		let L = normalize(toL);
		let N = normalize(in.normal);
		let ndotl = max(dot(N, L), 0.0);
		let p = layout.$.light.params;
		let falloff = 1.0 / (1.0 + p.z * dot(toL, toL));
		var shade = p.x + p.y * ndotl * falloff;

		// Real cast shadow (receivers only — the wall, n.w > 0.5): for an area light,
		// fire several rays from this point toward jittered light positions; a ray
		// that passes through the card quad before reaching the light is occluded.
		// The fraction occluded is the soft penumbra. Real geometry, real light.
		let sh = layout.$.shadow;
		if (sh.n.w > 0.5 && misc.z < 0.5) {
			let cardN = sh.n.xyz;
			let area = p.w;
			var occ = 0.0;
			for (var k: u32 = 0u; k < 12u; k = k + 1u) {
				let a = f32(k) * 2.39996;
				let r = sqrt((f32(k) + 0.5) / 12.0) * area;
				let Ls = layout.$.light.lightPos.xyz + vec3f(cos(a) * r, sin(a) * r, 0.0);
				let dir = Ls - in.worldPos;
				let denom = dot(dir, cardN);
				let tt = dot(sh.center.xyz - in.worldPos, cardN) / denom;
				let hit = in.worldPos + dir * tt;
				let rel = hit - sh.center.xyz;
				let aU = dot(rel, sh.u.xyz) / dot(sh.u.xyz, sh.u.xyz);
				let aV = dot(rel, sh.v.xyz) / dot(sh.v.xyz, sh.v.xyz);
				let inside = abs(denom) > 0.0001 && tt > 0.001 && tt < 1.0 && abs(aU) < 1.0 && abs(aV) < 1.0;
				occ = occ + select(0.0, 1.0, inside);
			}
			shade = shade * (1.0 - (occ / 12.0) * 0.72);
		}

		let depth = clamp((in.dist - misc.x) / (misc.y - misc.x), 0.0, 1.0);
		return vec4f(albedo * shade, depth);
	}`.$uses({ layout: planeLayout });

	// --- DOF pass: scatter-as-gather; weight each tap by whether its own CoC reaches
	// the centre pixel (no foreground bleed). ---
	const dofLayout = tgpu.bindGroupLayout({
		scene: { texture: d.texture2d(d.f32) },
		samp: { sampler: 'filtering' },
		uniforms: { uniform: DofUniforms }
	});
	const fullVertexFn = tgpu['~unstable'].vertexFn({
		in: { vertexIndex: d.builtin.vertexIndex },
		out: { position: d.builtin.position, uv: d.vec2f }
	}) /* wgsl */ `{
		var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
		var u = array<vec2f, 3>(vec2f(0.0, 1.0), vec2f(2.0, 1.0), vec2f(0.0, -1.0));
		return Out(vec4f(p[in.vertexIndex], 0.0, 1.0), u[in.vertexIndex]);
	}`;
	const dofFragmentFn = tgpu['~unstable'].fragmentFn({
		in: { uv: d.vec2f },
		out: d.vec4f
	}) /* wgsl */ `{
		let focus = layout.$.uniforms.focus;
		let aperture = layout.$.uniforms.aperture;
		let texel = vec2f(1.0) / layout.$.uniforms.resolution;
		let jitter = fract(sin(dot(in.uv, vec2f(12.9898, 78.233))) * 43758.5453) * 6.2831853;
		let center = textureSample(layout.$.scene, layout.$.samp, in.uv);
		var acc = center.rgb;
		var wsum = 1.0;
		for (var i: u32 = 0u; i < ${BOKEH_TAPS}u; i = i + 1u) {
			let st = (f32(i) + 0.5) / ${BOKEH_TAPS}.0;
			let ang = f32(i) * 2.39996 + jitter;
			let offsetPx = vec2f(cos(ang), sin(ang)) * sqrt(st) * ${MAX_COC_PX};
			let smp = textureSample(layout.$.scene, layout.$.samp, in.uv + offsetPx * texel);
			let tapCoc = aperture * abs(smp.a - focus) * ${MAX_COC_PX};
			// Soft-edged disc: a tap fades over ~4px around its CoC radius rather than a
			// 1px hard cutoff, so the bokeh reads smooth, not hard-edged.
			let w = 1.0 - smoothstep(-2.0, 2.0, length(offsetPx) - tapCoc);
			acc = acc + smp.rgb * w;
			wsum = wsum + w;
		}
		// Film finish: subtle warm grade + a gentle lens vignette. No added grain —
		// it read as noise; the dense soft-edged gather is clean on its own.
		var col = acc / wsum;
		col = col * vec3f(1.03, 1.0, 0.955);
		let frameRad = length(in.uv - vec2f(0.5));
		col = col * (1.0 - frameRad * frameRad * 0.38);
		return vec4f(col, 1.0);
	}`.$uses({ layout: dofLayout });

	onMount(() => {
		let raf = 0;
		let host: GpuHost | null = null;
		let disposed = false;
		let manualFocus = -1;

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

			const lightUniform = root
				.createBuffer(LightUniforms, {
					lightPos: d.vec4f(-2.2, 2.0, 2.6, 0),
					params: d.vec4f(0.5, 0.85, 0.05, 0.45)
				})
				.$usage('uniform');
			const shadowUniform = root
				.createBuffer(ShadowUniforms, {
					center: d.vec4f(0, 0, 0, 0),
					u: d.vec4f(1, 0, 0, 0),
					v: d.vec4f(0, 1, 0, 0),
					n: d.vec4f(0, 0, 1, 0)
				})
				.$usage('uniform');
			const cardPlane = root
				.createBuffer(PlaneUniforms, {
					mvp: d.mat4x4f(),
					model: d.mat4x4f(),
					misc: d.vec4f(D_NEAR, D_FAR, 1, 0),
					baseColor: d.vec4f(0.95, 0.93, 0.87, 1)
				})
				.$usage('uniform');
			const wallPlane = root
				.createBuffer(PlaneUniforms, {
					mvp: d.mat4x4f(),
					model: d.mat4x4f(),
					misc: d.vec4f(D_NEAR, D_FAR, 0, 0),
					baseColor: d.vec4f(0.16, 0.14, 0.13, 1)
				})
				.$usage('uniform');
			const dofUniform = root
				.createBuffer(DofUniforms, { focus: 0.3, aperture: 1, resolution: d.vec2f(WIDTH, HEIGHT) })
				.$usage('uniform');

			const cardBind = root.createBindGroup(planeLayout, {
				cardTexture,
				samp: sampler,
				plane: cardPlane,
				light: lightUniform,
				shadow: shadowUniform
			});
			const wallBind = root.createBindGroup(planeLayout, {
				cardTexture,
				samp: sampler,
				plane: wallPlane,
				light: lightUniform,
				shadow: shadowUniform
			});
			const dofBind = root.createBindGroup(dofLayout, {
				scene: sceneView,
				samp: sampler,
				uniforms: dofUniform
			});

			const planePipeline = root['~unstable']
				.withVertex(planeVertexFn, {})
				.withFragment(planeFragmentFn, { format: INTERMEDIATE_FORMAT })
				.createPipeline();
			const dofPipeline = root['~unstable']
				.withVertex(fullVertexFn, {})
				.withFragment(dofFragmentFn, { format: host.format })
				.createPipeline();

			const aspect = WIDTH / HEIGHT;
			const cardAspect = TEX_W / TEX_H;
			const projection = mat4.perspective((42 * Math.PI) / 180, aspect, 0.1, 100);
			const view = mat4.lookAt([0, 0, 3.4], [0, 0, 0], [0, 1, 0]);

			// Static model matrices.
			const cardModel = mat4.identity();
			mat4.rotateY(cardModel, (26 * Math.PI) / 180, cardModel);
			mat4.scale(cardModel, [cardAspect, 1, 1], cardModel);
			const cardMvp = mat4.multiply(projection, mat4.multiply(view, cardModel));

			const wallModel = mat4.identity();
			mat4.translate(wallModel, [0, 0, -2.0], wallModel);
			mat4.scale(wallModel, [9, 5, 1], wallModel);
			const wallMvp = mat4.multiply(projection, mat4.multiply(view, wallModel));

			cardPlane.write({
				mvp: toMat4(cardMvp as Float32Array),
				model: toMat4(cardModel as Float32Array),
				misc: d.vec4f(D_NEAR, D_FAR, 1, 0),
				baseColor: d.vec4f(0.95, 0.93, 0.87, 1)
			});
			wallPlane.write({
				mvp: toMat4(wallMvp as Float32Array),
				model: toMat4(wallModel as Float32Array),
				misc: d.vec4f(D_NEAR, D_FAR, 0, 0),
				baseColor: d.vec4f(0.16, 0.14, 0.13, 1)
			});

			// Card quad in world space (centre at origin; half-extent axes + normal),
			// for the analytic cast shadow. n.w = 1 enables shadowing on receivers.
			const cm = cardModel as Float32Array;
			const cu = dir3(cm, 1, 0, 0);
			const cv = dir3(cm, 0, 1, 0);
			const cn = norm3(dir3(cm, 0, 0, 1));
			shadowUniform.write({
				center: d.vec4f(0, 0, 0, 0),
				u: d.vec4f(cu[0], cu[1], cu[2], 0),
				v: d.vec4f(cv[0], cv[1], cv[2], 0),
				n: d.vec4f(cn[0], cn[1], cn[2], 1)
			});

			status = 'rendering';
			let frame = 0;
			const renderLoop = () => {
				if (disposed || !host) return;
				const focus = manualFocus >= 0 ? manualFocus : 0.5 + 0.5 * Math.sin(frame * 0.01);
				dofUniform.write({ focus, aperture: 1, resolution: d.vec2f(WIDTH, HEIGHT) });

				// Wall (far) then card (front), into the scene target. Card is always in
				// front of the wall, so painter's order suffices (no depth buffer yet).
				planePipeline
					.with(wallBind)
					.withColorAttachment({
						view: sceneView,
						clearValue: [0, 0, 0, 1],
						loadOp: 'clear',
						storeOp: 'store'
					})
					.draw(6);
				planePipeline
					.with(cardBind)
					.withColorAttachment({ view: sceneView, loadOp: 'load', storeOp: 'store' })
					.draw(6);

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
