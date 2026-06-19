import tgpu, { d } from 'typegpu';
import { mat4 } from 'wgpu-matrix';

import { INTERMEDIATE_FORMAT, type GpuHost } from '$lib/platform/gpu-host';

// Dimensional depth stage (ADR-0028). The validated WebGPU 3D depth-of-field POC
// (src/routes/poc/dof3d) as a reusable engine renderer: the Surface composite is
// placed on a fronto-parallel plane near the camera, over an opaque backdrop plane
// at depth; a perspective camera move makes the two reproject at different rates
// (real parallax), and a mip-prefiltered gather DOF defocuses by per-pixel depth.
//
// v1 scope (per ADR-0028): Surface plane + backdrop, depth-in-alpha with painter's
// order (the Surface composite's transparent surround is discarded so the backdrop
// shows around the floating card). Overlay-at-depth and real scene lighting/shadow
// are documented forward hooks, not built here. The flat multiplane path (ADR-0027)
// stays the default; this renders only when a Preset declares `state.stage`.
//
// The grain fix that made the POC ship: the DOF gather never samples the sharp
// scene buffer — it reads a prefiltered mip whose footprint spans the gap between
// sparse taps, so a handful of taps reconstruct a smooth disc instead of aliasing.

const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const SCENE_TEXTURE_USAGE = TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_RENDER_ATTACHMENT;

const FOV = (42 * Math.PI) / 180;
const CAM_Z = 3.4; // camera distance; the Surface plane sits at the framing distance
const BACKDROP_DEPTH = 2.2; // world units the backdrop sits behind the Surface plane
const D_NEAR = 2.5; // camera-space distance encoded as depth 0
const D_FAR = 6.0; // …as depth 1
const BOKEH_TAPS = 96;
const MAX_LOD = 14; // textureSampleLevel clamps to the texture's real top mip
const REF_COC = 42; // max circle-of-confusion (px) per 1080px of frame short side

// misc = (depthNear, depthFar, textured, discardTransparent). baseColor = solid
// plane albedo (the backdrop). textured>0.5 ⇒ sample the Surface plane instead.
const PlaneUniforms = d.struct({
	mvp: d.mat4x4f,
	misc: d.vec4f,
	baseColor: d.vec4f
});
// params = (focus depth01, aperture, maxCoc px, _). resolution = scene px.
const DofUniforms = d.struct({ params: d.vec4f, resolution: d.vec2f });

const planeLayout = tgpu.bindGroupLayout({
	surfaceTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	plane: { uniform: PlaneUniforms }
});

// A plane quad transformed by its MVP; carries uv + camera-space distance (clip.w).
const planeVertexFn = tgpu['~unstable'].vertexFn({
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
	let clip = layout.$.plane.mvp * vec4f(pos[in.vertexIndex], 1.0);
	return Out(clip, uv[in.vertexIndex], clip.w);
}`.$uses({ layout: planeLayout });

// Opaque planes in painter's order: the scene target stores STRAIGHT colour + the
// camera-space depth in alpha. The Surface composite is premultiplied; transparent
// surround is discarded so the backdrop (drawn first) shows around the card.
const planeFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f, dist: d.f32 },
	out: d.vec4f
}) /* wgsl */ `{
	let misc = layout.$.plane.misc;
	var color = layout.$.plane.baseColor.rgb;
	if (misc.z > 0.5) {
		let s = textureSample(layout.$.surfaceTexture, layout.$.samp, in.uv); // premultiplied
		if (misc.w > 0.5 && s.a < 0.5) { discard; }
		color = s.rgb / max(s.a, 0.001); // un-premultiply: planes overwrite, never blend
	}
	let depth01 = clamp((in.dist - misc.x) / (misc.y - misc.x), 0.0, 1.0);
	return vec4f(color, depth01);
}`.$uses({ layout: planeLayout });

const fullVertexFn = tgpu['~unstable'].vertexFn({
	in: { vertexIndex: d.builtin.vertexIndex },
	out: { position: d.builtin.position, uv: d.vec2f }
}) /* wgsl */ `{
	var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
	var u = array<vec2f, 3>(vec2f(0.0, 1.0), vec2f(2.0, 1.0), vec2f(0.0, -1.0));
	return Out(vec4f(p[in.vertexIndex], 0.0, 1.0), u[in.vertexIndex]);
}`;

// Mip-downsample: box-filter the previous level into the next, building the
// prefiltered pyramid the DOF gather reads from.
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

// DOF gather: read colour from a prefiltered mip whose footprint spans the gap
// between our sparse golden-angle taps (the grain fix); depth always at LOD 0.
// scatter-as-gather weighting (a tap lights the centre only if the centre is
// within the tap's own CoC) keeps sharp foreground from bleeding. Output is
// opaque (alpha 1) — the stage is a full-frame piece behind the backdrop.
const dofLayout = tgpu.bindGroupLayout({
	scene: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	uniforms: { uniform: DofUniforms }
});
const dofFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: d.vec4f
}) /* wgsl */ `{
	let focus = layout.$.uniforms.params.x;
	let aperture = layout.$.uniforms.params.y;
	let maxCoc = layout.$.uniforms.params.z;
	let texel = vec2f(1.0) / layout.$.uniforms.resolution;
	let center = textureSampleLevel(layout.$.scene, layout.$.samp, in.uv, 0.0);
	let cocC = aperture * abs(center.a - focus) * maxCoc;
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
		let reach = max(tapCoc, cocC);
		let w = 1.0 - smoothstep(reach - 2.0, reach + 2.0, length(offsetPx));
		acc = acc + textureSampleLevel(layout.$.scene, layout.$.samp, tapUV, lod).rgb * w;
		wsum = wsum + w;
	}
	var col = acc / wsum;
	col = col * vec3f(1.03, 1.0, 0.955); // gentle warm film grade
	let frameRad = length(in.uv - vec2f(0.5));
	col = col * (1.0 - frameRad * frameRad * 0.30); // subtle lens vignette
	return vec4f(col, 1.0);
}`.$uses({ layout: dofLayout });

// wgpu-matrix returns Float32Array(16); TypeGPU's mat4x4f takes 16 explicit args.
function toMat4(m: Float32Array) {
	// prettier-ignore
	return d.mat4x4f(
		m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7],
		m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15]
	);
}

const smootherstep = (t: number): number => {
	const x = Math.min(1, Math.max(0, t));
	return x * x * x * (x * (x * 6 - 15) + 10);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface DepthStageOptions {
	host: GpuHost;
	width: number;
	height: number;
}

export interface DepthStageInput {
	/** The Surface pipeline's premultiplied composition output (surface-only while
	 *  the Composition plane-split is on). Placed on the near plane. */
	surfacePlaneView: GPUTextureView;
	/** In-focus depth (ADR-0021 scalar): 0 ⇒ the Surface plane sharp, 1 ⇒ backdrop. */
	focusZ: number;
	/** Max circle-of-confusion / blur strength, 0..1. */
	aperture: number;
	/** Backdrop plane colour (rgb 0..1). */
	backdropColor: [number, number, number];
	cameraMove: 'static' | 'push' | 'drift';
	/** Camera move strength, 0..1. */
	cameraAmount: number;
	/** Clip progress 0..1 — drives the camera move + focus. Frame-deterministic. */
	time: number;
}

export class DepthStage {
	#width: number;
	#height: number;
	#sceneTexture: GPUTexture;
	#outputTexture: GPUTexture;
	#render: (input: DepthStageInput) => void;

	constructor({ host, width, height }: DepthStageOptions) {
		this.#width = width;
		this.#height = height;
		const { device, root } = host;
		const unstable = root['~unstable'];

		const mipLevels = Math.floor(Math.log2(Math.max(width, height))) + 1;
		const maxCoc = Math.round((REF_COC * Math.min(width, height)) / 1080);

		this.#sceneTexture = device.createTexture({
			size: [width, height, 1],
			format: INTERMEDIATE_FORMAT,
			mipLevelCount: mipLevels,
			usage: SCENE_TEXTURE_USAGE
		});
		this.#outputTexture = device.createTexture({
			size: [width, height, 1],
			format: INTERMEDIATE_FORMAT,
			usage: SCENE_TEXTURE_USAGE
		});
		const sceneView = this.#sceneTexture.createView();
		const mipViews: GPUTextureView[] = [];
		for (let i = 0; i < mipLevels; i += 1) {
			mipViews.push(
				this.#sceneTexture.createView({ baseMipLevel: i, mipLevelCount: 1, dimension: '2d' })
			);
		}
		const outputView = this.#outputTexture.createView();

		const sampler = unstable.createSampler({
			magFilter: 'linear',
			minFilter: 'linear',
			mipmapFilter: 'linear',
			addressModeU: 'clamp-to-edge',
			addressModeV: 'clamp-to-edge'
		});

		const backdropPlane = root
			.createBuffer(PlaneUniforms, {
				mvp: d.mat4x4f(),
				misc: d.vec4f(D_NEAR, D_FAR, 0, 0),
				baseColor: d.vec4f(0.16, 0.14, 0.13, 1)
			})
			.$usage('uniform');
		const surfacePlane = root
			.createBuffer(PlaneUniforms, {
				mvp: d.mat4x4f(),
				misc: d.vec4f(D_NEAR, D_FAR, 1, 1),
				baseColor: d.vec4f(0, 0, 0, 1)
			})
			.$usage('uniform');
		const dofUniform = root
			.createBuffer(DofUniforms, {
				params: d.vec4f(0, 0, maxCoc, 0),
				resolution: d.vec2f(width, height)
			})
			.$usage('uniform');

		const planePipeline = unstable
			.withVertex(planeVertexFn, {})
			.withFragment(planeFragmentFn, { format: INTERMEDIATE_FORMAT })
			.createPipeline();
		const downPipeline = unstable
			.withVertex(fullVertexFn, {})
			.withFragment(downsampleFragmentFn, { format: INTERMEDIATE_FORMAT })
			.createPipeline();
		const dofPipeline = unstable
			.withVertex(fullVertexFn, {})
			.withFragment(dofFragmentFn, { format: INTERMEDIATE_FORMAT })
			.createPipeline();

		const downBinds = Array.from({ length: mipLevels - 1 }, (_, k) =>
			root.createBindGroup(downLayout, { src: mipViews[k], samp: sampler })
		);
		const dofBind = root.createBindGroup(dofLayout, {
			scene: sceneView,
			samp: sampler,
			uniforms: dofUniform
		});

		const aspect = width / height;
		const projection = mat4.perspective(FOV, aspect, 0.1, 100);
		// Each plane fills the frame at its own distance: half-height = the frustum
		// half-height there, half-width = that × aspect. Authored content lands at its
		// composed size; the camera move shifts near/far planes at different rates.
		const fillScale = (dist: number): [number, number, number] => {
			const halfH = Math.tan(FOV / 2) * dist;
			return [halfH * aspect, halfH, 1];
		};
		const surfaceModel = mat4.scale(mat4.identity(), fillScale(CAM_Z));
		const backdropModel = mat4.scale(
			mat4.translate(mat4.identity(), [0, 0, -BACKDROP_DEPTH]),
			fillScale(CAM_Z + BACKDROP_DEPTH)
		);
		const surfaceDepth01 = (CAM_Z - D_NEAR) / (D_FAR - D_NEAR);
		const backdropDepth01 = (CAM_Z + BACKDROP_DEPTH - D_NEAR) / (D_FAR - D_NEAR);

		this.#render = (input) => {
			const e = smootherstep(input.time);
			const amt = input.cameraAmount;
			let eyeX = 0;
			let eyeZ = CAM_Z;
			if (input.cameraMove === 'push') {
				eyeZ = CAM_Z + 0.55 * amt * (1 - e); // start pulled back, dolly in
			} else if (input.cameraMove === 'drift') {
				eyeX = mix(-0.18, 0.14, e) * amt; // lateral parallax sweep
			}
			const vp = mat4.multiply(projection, mat4.lookAt([eyeX, 0, eyeZ], [0, 0, 0], [0, 1, 0]));
			backdropPlane.write({
				mvp: toMat4(mat4.multiply(vp, backdropModel) as Float32Array),
				misc: d.vec4f(D_NEAR, D_FAR, 0, 0),
				baseColor: d.vec4f(
					input.backdropColor[0],
					input.backdropColor[1],
					input.backdropColor[2],
					1
				)
			});
			surfacePlane.write({
				mvp: toMat4(mat4.multiply(vp, surfaceModel) as Float32Array),
				misc: d.vec4f(D_NEAR, D_FAR, 1, 1),
				baseColor: d.vec4f(0, 0, 0, 1)
			});
			const focus = mix(surfaceDepth01, backdropDepth01, input.focusZ);
			dofUniform.write({
				params: d.vec4f(focus, input.aperture, maxCoc, 0),
				resolution: d.vec2f(width, height)
			});

			// Bind groups that reference the per-call Surface plane view.
			const backdropBind = root.createBindGroup(planeLayout, {
				surfaceTexture: input.surfacePlaneView,
				samp: sampler,
				plane: backdropPlane
			});
			const surfaceBind = root.createBindGroup(planeLayout, {
				surfaceTexture: input.surfacePlaneView,
				samp: sampler,
				plane: surfacePlane
			});

			// Backdrop (far) then Surface (near) into the scene target, painter's order.
			planePipeline
				.with(backdropBind)
				.withColorAttachment({
					view: mipViews[0],
					clearValue: [0, 0, 0, 1],
					loadOp: 'clear',
					storeOp: 'store'
				})
				.draw(6);
			planePipeline
				.with(surfaceBind)
				.withColorAttachment({ view: mipViews[0], loadOp: 'load', storeOp: 'store' })
				.draw(6);

			// Prefiltered pyramid — only when there's defocus to gather. With aperture ~0
			// the gather's LOD stays 0 (it never reads a mip), so skipping the build is
			// free correctness AND the perf gate that keeps flat/degenerate-stage pieces
			// (the unify case) from paying the pyramid cost.
			if (input.aperture > 0.001) {
				for (let i = 1; i < mipLevels; i += 1) {
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
	}

	/** Render the depth-staged frame. Output is the graded, defocused composite. */
	render(input: DepthStageInput): void {
		this.#render(input);
	}

	/** The depth-staged result (premultiplied/opaque rgba16float) — fed to the
	 *  effect chain, which presents + dithers it to the canvas. */
	outputTexture(): GPUTexture {
		return this.#outputTexture;
	}

	get width(): number {
		return this.#width;
	}
	get height(): number {
		return this.#height;
	}

	dispose(): void {
		this.#sceneTexture.destroy();
		this.#outputTexture.destroy();
	}
}
