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

	// Output resolution is resolved at runtime from ?w=&h= (defaults 1920×1080) so the
	// same POC validates 4K (3840×2160) and vertical (2160×3840) — the engine's binding
	// targets. Shaders bake constants at module load, so anything resolution-dependent
	// (CoC, mip count) is a uniform or computed in onMount, never a module const here.
	const DEFAULT_W = 1920;
	const DEFAULT_H = 1080;
	const D_NEAR = 2.5; // camera-space distance mapped to depth 0
	const D_FAR = 6.0; // ...to depth 1
	const BOKEH_TAPS = 96;
	// Mip pyramid of the scene colour: the DOF gather samples a prefiltered level
	// (not the sharp full-res buffer) so sparse taps reconstruct a smooth disc.
	const MAX_LOD = 14; // textureSampleLevel clamps to the texture's real top mip
	const SHOT_FRAMES = 240; // the shot is a pure function of t = frame/SHOT_FRAMES

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
	// Settled easing (no overshoot) + lerp, for the camera move and focus pull.
	const smootherstep = (t: number): number => {
		const x = Math.min(1, Math.max(0, t));
		return x * x * x * (x * (x * 6 - 15) + 10);
	};
	const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

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
	const DofUniforms = d.struct({
		focus: d.f32,
		aperture: d.f32,
		maxCoc: d.f32,
		resolution: d.vec2f
	});

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

	// --- Mip-downsample pass: box-filter the previous level into the next. Builds
	// the prefiltered pyramid the DOF gather reads from. ---
	const downLayout = tgpu.bindGroupLayout({
		src: { texture: d.texture2d(d.f32) },
		samp: { sampler: 'filtering' }
	});
	const downsampleFragmentFn = tgpu['~unstable'].fragmentFn({
		in: { uv: d.vec2f },
		out: d.vec4f
	}) /* wgsl */ `{
		return textureSampleLevel(layout.$.src, layout.$.samp, in.uv, 0.0);
	}`.$uses({ layout: downLayout });

	// --- Blit pass: card texture straight to the canvas at 1:1 (the unify A/B's crispness
	// ceiling — one resample, no camera, no DOF). ---
	const blitLayout = tgpu.bindGroupLayout({
		tex: { texture: d.texture2d(d.f32) },
		samp: { sampler: 'filtering' }
	});
	const blitFragmentFn = tgpu['~unstable'].fragmentFn({
		in: { uv: d.vec2f },
		out: d.vec4f
	}) /* wgsl */ `{
		return vec4f(textureSampleLevel(layout.$.tex, layout.$.samp, in.uv, 0.0).rgb, 1.0);
	}`.$uses({ layout: blitLayout });

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
		let maxCoc = layout.$.uniforms.maxCoc;
		let texel = vec2f(1.0) / layout.$.uniforms.resolution;
		let center = textureSampleLevel(layout.$.scene, layout.$.samp, in.uv, 0.0);
		let cocC = aperture * abs(center.a - focus) * maxCoc;
		// Read colour from a prefiltered mip whose footprint spans the gap between our
		// sparse taps. THIS is the fix for the grain: a few taps of a sharp buffer
		// alias into noise; the same taps of a pre-averaged level reconstruct a clean,
		// smooth disc. LOD rises with the blur radius (log2 of the tap spacing).
		let lod = clamp(log2(max(cocC, 1.0)) - 2.3, 0.0, ${MAX_LOD}.0);
		var acc = center.rgb;
		var wsum = 1.0;
		for (var i: u32 = 0u; i < ${BOKEH_TAPS}u; i = i + 1u) {
			let st = (f32(i) + 0.5) / ${BOKEH_TAPS}.0;
			let ang = f32(i) * 2.39996;
			let offsetPx = vec2f(cos(ang), sin(ang)) * sqrt(st) * cocC;
			let tapUV = in.uv + offsetPx * texel;
			let tapDepth = textureSampleLevel(layout.$.scene, layout.$.samp, tapUV, 0.0).a;
			let tapCoc = aperture * abs(tapDepth - focus) * maxCoc;
			// scatter-as-gather: a tap lights the centre only if the centre falls within
			// the tap's own circle of confusion — blurry foreground spreads over sharp
			// background, but sharp foreground never bleeds.
			let reach = max(tapCoc, cocC);
			let w = 1.0 - smoothstep(reach - 2.0, reach + 2.0, length(offsetPx));
			acc = acc + textureSampleLevel(layout.$.scene, layout.$.samp, tapUV, lod).rgb * w;
			wsum = wsum + w;
		}
		// Film finish: subtle warm grade + a gentle lens vignette.
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
		let manualT = -1;

		(async () => {
			const c = canvas;
			const cardEl = card;
			if (!c || !cardEl) return;

			// Resolve the output target from the URL (?w=&h=). Everything downstream —
			// canvas backing, scene texture, mip count, CoC, camera framing — derives from
			// these, so one POC renders horizontal 4K and vertical with no code change.
			const params = new URLSearchParams(window.location.search);
			const WIDTH = Math.round(Number(params.get('w')) || DEFAULT_W);
			const HEIGHT = Math.round(Number(params.get('h')) || DEFAULT_H);
			const portrait = HEIGHT > WIDTH;
			// mode: 'depth' = the cinematic stage; 'flat' = card fronto-parallel filling the
			// frame, no DOF (the unify candidate — flat as a degenerate 3D stage); 'ref' = the
			// card texture blitted 1:1 (the crispness ceiling for the A/B).
			const mode = params.get('mode') ?? 'depth';
			const flat = mode === 'flat' || mode === 'ref';
			// The 16:9 card is authored at native pixel density (2× past ~3K) so in-focus
			// text is genuinely sharp at 4K, not an upscaled 1080p texture.
			const CARD_SCALE = Math.max(WIDTH, HEIGHT) >= 3000 ? 2 : 1;
			const CARD_W = 1920 * CARD_SCALE;
			const CARD_H = 1080 * CARD_SCALE;
			// CoC (max blur radius) is relative to the frame's short side, so the lens look
			// is identical across resolutions instead of half-strength at 4K.
			const MAX_COC = Math.round((42 * Math.min(WIDTH, HEIGHT)) / 1080);
			const MIP_LEVELS = Math.floor(Math.log2(Math.max(WIDTH, HEIGHT))) + 1;

			c.width = WIDTH;
			c.height = HEIGHT;
			c.style.aspectRatio = `${WIDTH} / ${HEIGHT}`;
			cardEl.style.setProperty('--s', String(CARD_SCALE));
			status = `rendering ${WIDTH}×${HEIGHT} [${mode}]`;

			await tick();
			await document.fonts.ready;
			await new Promise((r) => requestAnimationFrame(() => r(null)));
			await new Promise((r) => requestAnimationFrame(() => r(null)));

			host = await createGpuHost(c);
			const { device, root } = host;
			const htmlQueue = getHtmlInCanvasQueue(device.queue);

			const cardTexture = device.createTexture({
				size: [CARD_W, CARD_H, 1],
				format: 'rgba8unorm',
				usage:
					TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_DST | TEXTURE_USAGE_RENDER_ATTACHMENT
			});
			htmlQueue.copyElementImageToTexture(cardEl, CARD_W, CARD_H, { texture: cardTexture });

			const sceneTexture = device.createTexture({
				size: [WIDTH, HEIGHT, 1],
				format: INTERMEDIATE_FORMAT,
				mipLevelCount: MIP_LEVELS,
				usage: TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_RENDER_ATTACHMENT
			});
			const sceneView = sceneTexture.createView(); // all mips — the DOF gather samples by LOD
			// Single-level views: as render targets when building the pyramid, and as the
			// source binding for the next downsample step.
			const mipViews: GPUTextureView[] = [];
			for (let i = 0; i < MIP_LEVELS; i++) {
				mipViews.push(
					sceneTexture.createView({ baseMipLevel: i, mipLevelCount: 1, dimension: '2d' })
				);
			}

			const sampler = root['~unstable'].createSampler({
				magFilter: 'linear',
				minFilter: 'linear',
				mipmapFilter: 'linear',
				addressModeU: 'clamp-to-edge',
				addressModeV: 'clamp-to-edge'
			});

			const lightUniform = root
				.createBuffer(LightUniforms, {
					lightPos: d.vec4f(-2.2, 2.0, 2.6, 0),
					// flat A/B uses ambient-only (full-bright) so the comparison isolates
					// crispness, not scene lighting.
					params: flat ? d.vec4f(1, 0, 0, 0) : d.vec4f(0.5, 0.85, 0.05, 0.45)
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
				.createBuffer(DofUniforms, {
					focus: 0.3,
					aperture: 1,
					maxCoc: MAX_COC,
					resolution: d.vec2f(WIDTH, HEIGHT)
				})
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
			// downBinds[i-1] reads level i-1 and is rendered into level i.
			const downBinds = Array.from({ length: MIP_LEVELS - 1 }, (_, k) =>
				root.createBindGroup(downLayout, { src: mipViews[k], samp: sampler })
			);

			const planePipeline = root['~unstable']
				.withVertex(planeVertexFn, {})
				.withFragment(planeFragmentFn, { format: INTERMEDIATE_FORMAT })
				.createPipeline();
			const dofPipeline = root['~unstable']
				.withVertex(fullVertexFn, {})
				.withFragment(dofFragmentFn, { format: host.format })
				.createPipeline();
			const downPipeline = root['~unstable']
				.withVertex(fullVertexFn, {})
				.withFragment(downsampleFragmentFn, { format: INTERMEDIATE_FORMAT })
				.createPipeline();
			const blitPipeline = root['~unstable']
				.withVertex(fullVertexFn, {})
				.withFragment(blitFragmentFn, { format: host.format })
				.createPipeline();
			const blitBind = root.createBindGroup(blitLayout, { tex: cardTexture, samp: sampler });

			const cardAspect = CARD_W / CARD_H;
			const FOV = (42 * Math.PI) / 180;
			const FLAT_CAM_Z = 3.4;
			const projection = mat4.perspective(FOV, WIDTH / HEIGHT, 0.1, 100);

			// Flat mode fills the frame fronto-parallel: card half-height = the frustum
			// half-height at z=0, so a 16:9 card exactly fills a 16:9 frame at ~1:1 texel
			// density. Depth mode reflows for portrait (shrink + lift into the title band).
			const fillFit = Math.tan(FOV / 2) * FLAT_CAM_Z;
			const fit = flat ? fillFit : portrait ? 0.42 : 1.0;
			const yShift = portrait && !flat ? 0.62 : 0.0;
			const rotY = flat ? 0 : (26 * Math.PI) / 180;

			// Static geometry — the camera moves, not the planes.
			const cardModel = mat4.identity();
			mat4.translate(cardModel, [0, yShift, 0], cardModel);
			mat4.rotateY(cardModel, rotY, cardModel);
			mat4.scale(cardModel, [cardAspect * fit, fit, 1], cardModel);
			const wallModel = mat4.identity();
			mat4.translate(wallModel, [0, 0, -2.0], wallModel);
			mat4.scale(wallModel, [10, 10, 1], wallModel);

			// Re-projects both planes for a camera eye/target. Called per frame as the
			// camera dollies: the card (z≈0) and wall (z≈-2) reproject at different rates,
			// which is real parallax — the thing the 3D stage buys over the 2D path.
			const writeCamera = (
				eye: [number, number, number],
				target: [number, number, number]
			): void => {
				const vp = mat4.multiply(projection, mat4.lookAt(eye, target, [0, 1, 0]));
				cardPlane.write({
					mvp: toMat4(mat4.multiply(vp, cardModel) as Float32Array),
					model: toMat4(cardModel as Float32Array),
					misc: d.vec4f(D_NEAR, D_FAR, 1, 0),
					baseColor: d.vec4f(0.95, 0.93, 0.87, 1)
				});
				wallPlane.write({
					mvp: toMat4(mat4.multiply(vp, wallModel) as Float32Array),
					model: toMat4(wallModel as Float32Array),
					misc: d.vec4f(D_NEAR, D_FAR, 0, 0),
					baseColor: d.vec4f(0.16, 0.14, 0.13, 1)
				});
			};

			// Card quad in world space (centre at origin; half-extent axes + normal),
			// for the analytic cast shadow. n.w = 1 enables shadowing on receivers.
			const cm = cardModel as Float32Array;
			const cu = dir3(cm, 1, 0, 0);
			const cv = dir3(cm, 0, 1, 0);
			const cn = norm3(dir3(cm, 0, 0, 1));
			shadowUniform.write({
				center: d.vec4f(cm[12], cm[13], cm[14], 0), // card's world centre (carries yShift)
				u: d.vec4f(cu[0], cu[1], cu[2], 0),
				v: d.vec4f(cv[0], cv[1], cv[2], 0),
				n: d.vec4f(cn[0], cn[1], cn[2], 1)
			});

			let frame = 0;

			// One frame as a pure function of t — the SAME function drives preview and
			// export, so what you scrub is exactly what encodes (frame-determinism).
			const renderAt = (t: number): void => {
				if (!host) return;
				const outputView = host.context.getCurrentTexture().createView();

				// 'ref' — card texture straight to canvas at 1:1 (the A/B crispness ceiling).
				if (mode === 'ref') {
					blitPipeline
						.with(blitBind)
						.withColorAttachment({
							view: outputView,
							clearValue: [0, 0, 0, 1],
							loadOp: 'clear',
							storeOp: 'store'
						})
						.draw(3);
					return;
				}

				if (flat) {
					// Unify candidate: card fronto-parallel filling the frame, static camera,
					// aperture 0 ⇒ DOF collapses to identity. Same pipeline as the depth stage.
					writeCamera([0, 0, FLAT_CAM_Z], [0, 0, 0]);
					dofUniform.write({ focus: 0.5, aperture: 0, maxCoc: MAX_COC, resolution: d.vec2f(WIDTH, HEIGHT) });
				} else {
					const e = smootherstep(t);
					// Slow dolly-in with lateral/vertical drift → parallax between card and wall.
					writeCamera([mix(-0.16, 0.12, e), mix(0.05, -0.03, e), mix(3.7, 3.15, e)], [
						mix(0.04, -0.03, e),
						0,
						0
					]);
					// Rack focus: pull from the back wall (depth ≈0.83) onto the title (≈0.2).
					const focus = manualFocus >= 0 ? manualFocus : mix(0.83, 0.2, e);
					dofUniform.write({ focus, aperture: 1, maxCoc: MAX_COC, resolution: d.vec2f(WIDTH, HEIGHT) });
				}

				// Wall (far) then card (front), into the scene target. Card is always in
				// front of the wall, so painter's order suffices (no depth buffer yet).
				planePipeline
					.with(wallBind)
					.withColorAttachment({
						view: mipViews[0],
						clearValue: [0, 0, 0, 1],
						loadOp: 'clear',
						storeOp: 'store'
					})
					.draw(6);
				planePipeline
					.with(cardBind)
					.withColorAttachment({ view: mipViews[0], loadOp: 'load', storeOp: 'store' })
					.draw(6);

				// Build the prefiltered pyramid: box-filter each level down into the next.
				for (let i = 1; i < MIP_LEVELS; i++) {
					downPipeline
						.with(downBinds[i - 1])
						.withColorAttachment({
							view: mipViews[i],
							clearValue: [0, 0, 0, 1],
							loadOp: 'clear',
							storeOp: 'store'
						})
						.draw(3);
				}

				dofPipeline
					.with(dofBind)
					.withColorAttachment({
						view: outputView,
						clearValue: [0, 0, 0, 1],
						loadOp: 'clear',
						storeOp: 'store'
					})
					.draw(3);
			};

			const renderLoop = () => {
				if (disposed || !host) return;
				const t = manualT >= 0 ? manualT : (frame % SHOT_FRAMES) / SHOT_FRAMES;
				renderAt(t);
				frame += 1;
				raf = requestAnimationFrame(renderLoop);
			};
			renderLoop();

			(window as unknown as { __poc: unknown }).__poc = {
				setFocus: (v: number) => (manualFocus = v),
				autoFocus: () => (manualFocus = -1),
				setT: (v: number) => (manualT = v),
				play: () => (manualT = -1),
				// Export the shot through the engine's REAL Mediabunny path. renderFrame
				// drives the same renderAt(t) as preview, so the encoded video == preview.
				exportWebM: async (durationSeconds = 4, fps = 30) => {
					cancelAnimationFrame(raf);
					const { downloadVideoExport, exportTransparentWebM } = await import(
						'$lib/platform/export-video'
					);
					const video = await exportTransparentWebM({
						canvas: c,
						durationSeconds,
						fps,
						hasBackground: true, // opaque scene → keep alpha discarded, like a bumper
						renderFrame: (_f: number, timestamp: number) => renderAt(timestamp / durationSeconds)
					});
					frame = 0;
					renderLoop();
					downloadVideoExport(video, 'dof3d.webm');
					return { frames: Math.round(durationSeconds * fps) };
				}
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
	<canvas bind:this={canvas} width={DEFAULT_W} height={DEFAULT_H} layoutsubtree>
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
		display: block;
		inline-size: min(100%, 1280px);
	}
	/* The card is authored at a 1920×1080 design and scaled by --s for native-density
	   capture at 4K (--s=2). Every dimension is in design px × var(--s). */
	.card {
		block-size: calc(var(--s, 1) * 1080px);
		inline-size: calc(var(--s, 1) * 1920px);
		box-sizing: border-box;
		background: #f4efe4;
		color: #16140f;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: calc(var(--s, 1) * 28px);
		padding: calc(var(--s, 1) * 130px) calc(var(--s, 1) * 150px);
		font-family: 'Playfair Display', Georgia, serif;
	}
	.card .kicker {
		font-family: 'JetBrains Mono', monospace;
		font-size: calc(var(--s, 1) * 34px);
		letter-spacing: 0.32em;
		color: #b25b2a;
		margin: 0;
	}
	.card h1 {
		font-size: calc(var(--s, 1) * 150px);
		line-height: 1.02;
		font-weight: 800;
		margin: 0;
	}
	.card .sub {
		font-size: calc(var(--s, 1) * 46px);
		font-family: 'EB Garamond', Georgia, serif;
		color: #4a4438;
		margin: 0;
	}
</style>
