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

// params = (focusZ, aperture, surfaceZ, overlayZ). focusZ = the in-focus plane;
// aperture = max blur strength (scales the circle of confusion). The Surface
// defaults to z 0.0 (focal); the Overlay to its schema z (default 0.7).
// resolution = canvas (width, height) px, so the CoC disc is circular in pixel
// space (not stretched by the frame's aspect) and sized in real pixels.
// backdrop = (strength, edgeBlur, vignette, speckle): an optional procedural
// defocused-material plane composited BEHIND the Surface, giving the
// tabletop/macro depth look — soft material that loses detail and gains bokeh
// specks toward the frame edges (receding depth). strength 0 = no backdrop
// (transparent, the default). backdropColor = (rgb material tone, grain amount).
const DofUniforms = d.struct({
	params: d.vec4f,
	backdrop: d.vec4f,
	backdropColor: d.vec4f,
	lens: d.vec4f,
	resolution: d.vec2f
});

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

// Bokeh depth-of-field composite (ADR-0027). Each plane is blurred by its own
// circle of confusion — `coc = aperture · |planeZ − focusZ|` mapped to pixels —
// by gathering a flat DISC (not a gaussian) of taps around each fragment. Bright
// taps are weighted up so highlights bloom into bright bokeh discs, the
// photographic tell that separates real lens defocus from a gaussian blur. The
// blurred planes composite premultiplied back-to-front: the focal plane stays
// sharp; an out-of-focus foreground plane bleeds its disc over the subject.
//
// Disc sampling is a golden-angle spiral with `r = sqrt(t)` for uniform areal
// density (a flat disc, hard-edged at the CoC radius — the bokeh shape), and a
// per-fragment angular jitter so the finite tap count dissolves into dither
// instead of a visible pinwheel. The jitter is a hash of the fragment UV, so it
// is identical every frame at a given pixel — frame-deterministic.
const MAX_COC_PX = 120.0; // CoC radius (px) at aperture·depth = 1
const BOKEH_TAPS = 48;
const GOLDEN_ANGLE = 2.399963; // 2π / φ²
const BLOOM_THRESHOLD = 0.7; // premultiplied luma where highlight bloom starts
const BLOOM_STRENGTH = 2.6; // extra disc weight for the brightest taps

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
		let focusZ = layout.$.uniforms.params.x;
		let aperture = layout.$.uniforms.params.y;
		let surfaceZ = layout.$.uniforms.params.z;
		let overlayZ = layout.$.uniforms.params.w;
		let texel = vec2f(1.0) / max(layout.$.uniforms.resolution, vec2f(1.0));
		let aspect = layout.$.uniforms.resolution.x / max(layout.$.uniforms.resolution.y, 1.0);
		let bdStrength = layout.$.uniforms.backdrop.x;
		let t = layout.$.uniforms.lens.x;
		let center = vec2f(0.5);

		// Cinematic camera move — a slow push-in with PARALLAX: the foreground
		// (Surface + Overlay) magnifies less than the background, and the background
		// also pans. Different planes moving at different rates IS depth — the single
		// biggest "cinematic vs. static slide" cue. Gated on the backdrop (scene
		// mode), so a plain transparent-overlay DOF preset doesn't move.
		let mAmt = clamp(bdStrength, 0.0, 1.0);
		// Subject sampled straight (centred, sharp, undistorted). The background
		// drifts very gently on its own so the defocused bed is alive without the
		// foreground moving — a calm, natural motion, no parallax warp on the card.
		let fgUv = in.uv;
		let bgUv = center + (in.uv - center) * (1.0 - 0.03 * t * mAmt) + vec2f(0.010, -0.006) * t * mAmt;

		// Circle of confusion in pixels. Plane mode (default, non-scene): one constant
		// depth per layer. Scene mode (backdrop present): a CONTINUOUS per-pixel depth
		// field — the surface lies on a plane receding into the frame (nearer at the
		// bottom-left, farther toward the top-right) — so the CoC scales with TRUE
		// distance from the focal plane. A focus pull then sweeps a sharp band through
		// real depth: this is the actual depth-of-field, not two flat layers.
		var surfCoc = aperture * abs(surfaceZ - focusZ) * ${MAX_COC_PX};
		let ovlCoc = aperture * abs(overlayZ - focusZ) * ${MAX_COC_PX};
		var sceneDepth = surfaceZ;
		if (bdStrength > 0.001) {
			sceneDepth = clamp(0.5 + (in.uv.y - 0.5) * 0.9 + (in.uv.x - 0.5) * 0.45, 0.0, 1.0);
			surfCoc = aperture * abs(sceneDepth - focusZ) * ${MAX_COC_PX};
		}

		// Per-fragment spiral rotation so the ${BOKEH_TAPS} taps read as dither, not
		// a pinwheel. Deterministic in the fragment UV.
		let jitter = fract(sin(dot(in.uv, vec2f(12.9898, 78.233))) * 43758.5453) * 6.2831853;

		var surfAcc = vec4f(0.0);
		var surfW = 0.0;
		var ovlAcc = vec4f(0.0);
		var ovlW = 0.0;

		for (var i: u32 = 0u; i < ${BOKEH_TAPS}u; i = i + 1u) {
			let st = (f32(i) + 0.5) / ${BOKEH_TAPS}.0;
			let r = sqrt(st);
			let ang = f32(i) * ${GOLDEN_ANGLE} + jitter;
			let dir = vec2f(cos(ang), sin(ang)) * r;

			let sS = textureSampleLevel(layout.$.surfaceTexture, layout.$.samp, fgUv + dir * surfCoc * texel, 0.0);
			let sLuma = dot(sS.rgb, vec3f(0.299, 0.587, 0.114));
			let sWgt = 1.0 + ${BLOOM_STRENGTH} * smoothstep(${BLOOM_THRESHOLD}, 1.0, sLuma);
			surfAcc = surfAcc + sS * sWgt;
			surfW = surfW + sWgt;

			let oS = textureSampleLevel(layout.$.overlayTexture, layout.$.samp, fgUv + dir * ovlCoc * texel, 0.0);
			let oLuma = dot(oS.rgb, vec3f(0.299, 0.587, 0.114));
			let oWgt = 1.0 + ${BLOOM_STRENGTH} * smoothstep(${BLOOM_THRESHOLD}, 1.0, oLuma);
			ovlAcc = ovlAcc + oS * oWgt;
			ovlW = ovlW + oWgt;
		}

		var surf = surfAcc / max(surfW, 0.0001);
		let ovl = ovlAcc / max(ovlW, 0.0001);

		// Composition-owned surface fade (ADR-0035): the authored opacity channel
		// multiplies the Surface plane HERE, on the GPU — copyElementImageToTexture
		// cannot rasterize CSS opacity < 1, so a DOM fade would be binary. The
		// planes are premultiplied, so all four components scale together. 1.0 =
		// no fade (the DOF-only path).
		let surfaceAlpha = layout.$.uniforms.lens.y;
		surf = surf * surfaceAlpha;

		// ----- Procedural defocused-material backdrop (tabletop/macro depth) -----
		// A soft material plane behind the Surface: low-frequency mottle (an
		// out-of-focus surface), a sparse field of bright bokeh specks that grow and
		// brighten toward the edges (defocused highlights receding into depth), and a
		// vignette. Detail and sharpness fall off radially — the "edge blur" that
		// reads as a real surface tilting away. Inherently soft (low frequency), so no
		// extra gather. strength 0 → transparent (the default; no backdrop). The
		// content is sampled in the drifting bgUv space so the whole bed parallaxes.
		var bd = vec4f(0.0);
		if (bdStrength > 0.001) {
			let edgeBlur = layout.$.uniforms.backdrop.y;
			let vignetteAmt = layout.$.uniforms.backdrop.z;
			let speckle = layout.$.uniforms.backdrop.w;
			let baseCol = layout.$.uniforms.backdropColor.rgb;
			let grainAmt = layout.$.uniforms.backdropColor.w;

			let centred = (bgUv - vec2f(0.5)) * vec2f(aspect, 1.0);
			let radial = clamp(length(centred) / 0.72, 0.0, 1.0);

			// Two-octave value-noise mottle (a cloudy, tactile out-of-focus material);
			// contrast fades toward edges (edge blur). Coarse octave gives broad
			// light/shade across the surface; fine octave adds material grain.
			let mpA = bgUv * vec2f(4.0, 4.0);
			let miA = floor(mpA);
			let mfA = fract(mpA);
			let msA = mfA * mfA * (vec2f(3.0) - 2.0 * mfA);
			let a00 = fract(sin(dot(miA, vec2f(127.1, 311.7))) * 43758.5453);
			let a10 = fract(sin(dot(miA + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
			let a01 = fract(sin(dot(miA + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
			let a11 = fract(sin(dot(miA + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
			let mottleA = mix(mix(a00, a10, msA.x), mix(a01, a11, msA.x), msA.y);
			let mpB = bgUv * vec2f(15.0, 15.0);
			let miB = floor(mpB);
			let mfB = fract(mpB);
			let msB = mfB * mfB * (vec2f(3.0) - 2.0 * mfB);
			let b00 = fract(sin(dot(miB, vec2f(269.5, 183.3))) * 43758.5453);
			let b10 = fract(sin(dot(miB + vec2f(1.0, 0.0), vec2f(269.5, 183.3))) * 43758.5453);
			let b01 = fract(sin(dot(miB + vec2f(0.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
			let b11 = fract(sin(dot(miB + vec2f(1.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
			let mottleB = mix(mix(b00, b10, msB.x), mix(b01, b11, msB.x), msB.y);
			let mottle = mottleA * 0.66 + mottleB * 0.34;
			let detail = mix(1.0, 0.35, radial * edgeBlur);
			// Lift the material above the base tone so the texture is visible, then
			// modulate; keeps a dark material from collapsing to a flat void.
			var col = baseCol * (1.0 + (mottle - 0.4) * 0.85 * detail);
			let gr = fract(sin(dot(bgUv * vec2f(640.0, 640.0), vec2f(12.99, 78.23))) * 43758.5453);
			col = col + vec3f((gr - 0.5) * grainAmt);

			// Soft directional light pool (upper-left) — implies a key light raking
			// across the surface, the cue that sells a real lit 3D material.
			let lightDelta = (bgUv - vec2f(0.32, 0.30)) * vec2f(aspect, 1.0);
			let lightFalloff = 1.0 - smoothstep(0.05, 0.78, length(lightDelta));
			col = col + col * lightFalloff * 0.32;

			// Sparse warm bokeh specks on a hashed grid; disc radius + brightness grow
			// toward the edges (defocused light receding). Each speck twinkles slowly
			// on its own phase so the bed breathes — the surround is alive, not static.
			let gridN = 5.0;
			var glow = 0.0;
			for (var gy = -1; gy <= 1; gy = gy + 1) {
				for (var gx = -1; gx <= 1; gx = gx + 1) {
					let cell = floor(bgUv * gridN) + vec2f(f32(gx), f32(gy));
					let h = fract(sin(dot(cell, vec2f(41.3, 289.1))) * 43758.5453);
					let h2 = fract(sin(dot(cell, vec2f(93.7, 17.2))) * 43758.5453);
					let pt = (cell + vec2f(h, h2)) / gridN;
					let dd = length((bgUv - pt) * vec2f(aspect, 1.0));
					let discR = (0.018 + 0.07 * radial) * (0.6 + speckle);
					let disc = smoothstep(discR, discR * 0.4, dd);
					let twinkle = 0.86 + 0.14 * sin(t * 6.2831 * (0.6 + h) + h2 * 6.2831);
					let bright = step(0.5, h) * h2 * twinkle;
					glow = max(glow, disc * bright);
				}
			}
			// Warm bokeh tint, brighter toward the edges (further = more defocus glow).
			col = col + vec3f(1.0, 0.86, 0.62) * glow * (0.6 + speckle) * (0.5 + 0.85 * radial);

			// Vignette — darker at the edges for depth.
			col = col * (1.0 - radial * radial * vignetteAmt);

			bd = vec4f(col * bdStrength, bdStrength);
		}

		// Put the subject in the scene (scene mode). Per the channel brief a collage
		// card's shadow is a HARD OFFSET (screen-print / risograph: solid foreground
		// colour, NO blur, offset ~8-15px at 4K) — never a soft drop shadow. So: (1)
		// suppress the card's own baked soft drop shadow by remapping to a crisp body
		// mask; (2) draw a solid, un-blurred offset copy of that body silhouette in
		// the dark foreground behind the card; (3) a gentle shared key light. A hard
		// offset can't band or go patchy — it is a clean solid shape.
		var litSurfRgb = surf.rgb;
		var cardA = surf.a;
		var shadedBdRgb = bd.rgb;
		if (bdStrength > 0.001) {
			let keyPos = vec2f(0.33, 0.32);
			let key = 1.0 - smoothstep(0.1, 1.3, length((in.uv - keyPos) * vec2f(aspect, 1.0)));
			let warm = mix(vec3f(0.99, 0.985, 0.975), vec3f(1.025, 1.0, 0.965), key);

			// Crisp card body — drops the baked soft drop shadow halo (alpha <= ~0.55).
			cardA = smoothstep(0.6, 0.85, surf.a);
			litSurfRgb = surf.rgb * (cardA / max(surf.a, 0.001)) * warm * mix(0.96, 1.025, key);

			// Hard offset shadow: solid dark silhouette of the card body, offset to the
			// lower-left, no blur. Sampled from the body mask so it is the card shape,
			// not the soft baked shadow.
			let shadowShift = vec2f(-0.0045, 0.006);
			let hardMask = smoothstep(0.6, 0.85, textureSampleLevel(layout.$.surfaceTexture, layout.$.samp, in.uv - shadowShift, 0.0).a);
			// The hard shadow rides the card's composition-owned fade too — a
			// lingering silhouette under a faded card reads as a ghost.
			shadedBdRgb = mix(bd.rgb, vec3f(0.05, 0.04, 0.035), hardMask * 0.92 * surfaceAlpha);
		}

		// Back-to-front premultiplied composite: backdrop (back, now carrying the hard
		// offset shadow) → Surface (mid) → Overlay (front). With strength 0 this
		// degenerates to the prior Overlay-over-Surface composite.
		let surfRgb = litSurfRgb + (1.0 - cardA) * shadedBdRgb;
		let surfA = cardA + (1.0 - cardA) * bd.a;
		var outRgb = ovl.rgb + (1.0 - ovl.a) * surfRgb;
		let outA = ovl.a + (1.0 - ovl.a) * surfA;

		// ----- Cinematic finish (scene mode) -----
		// One film grade over the WHOLE frame so the sharp subject and the defocused
		// bed read as a single photographed image, not pasted layers: warm balance +
		// gentle lift, warm halation bleeding from the highlights (the lensed glow a
		// flat composite lacks), a lens vignette spanning both planes, and animated
		// film grain so the image breathes. Opaque scene (outA≈1) → straight grade.
		if (bdStrength > 0.001) {
			let frameRad = clamp(length((in.uv - center) * vec2f(aspect, 1.0)) / 0.80, 0.0, 1.0);
			var g = max(outRgb, vec3f(0.0));
			g = g * vec3f(1.03, 1.0, 0.95);
			g = pow(g, vec3f(0.96));
			let lu = dot(g, vec3f(0.299, 0.587, 0.114));
			g = g + vec3f(1.0, 0.66, 0.36) * smoothstep(0.78, 1.1, lu) * 0.08;
			g = g * (1.0 - frameRad * frameRad * 0.32);
			let gn = fract(sin(dot(in.uv * vec2f(1280.0, 720.0) + vec2f(t * 91.7, t * 47.3), vec2f(12.9898, 78.233))) * 43758.5453);
			g = g + vec3f((gn - 0.5) * 0.022);
			outRgb = g;
		}

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
/** Optional procedural backdrop behind the Surface. `strength` 0 disables it. */
export interface CompositeBackdrop {
	strength: number;
	edgeBlur: number;
	vignette: number;
	speckle: number;
	color: [number, number, number];
	grain: number;
}

export interface CompositePlanesInput {
	surfacePlaneView: GPUTextureView;
	focusZ: number;
	aperture: number;
	surfaceZ: number;
	overlayZ: number;
	backdrop: CompositeBackdrop;
	/** Clip progress 0..1 — drives the cinematic camera push, parallax, bokeh
	 *  twinkle, and animated grain. Frame-deterministic. */
	time: number;
	/** Composition-owned surface opacity (ADR-0035) applied as a GPU
	 *  alpha-multiply on the Surface plane. 1 = no fade. */
	surfaceAlpha: number;
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
			.createBuffer(DofUniforms, {
				params: d.vec4f(0, 0, 0, 0),
				backdrop: d.vec4f(0, 0, 0, 0),
				backdropColor: d.vec4f(0, 0, 0, 0),
				lens: d.vec4f(0, 0, 0, 0),
				resolution: d.vec2f(width, height)
			})
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
			const b = input.backdrop;
			uniformBuffer.write({
				params: d.vec4f(input.focusZ, input.aperture, input.surfaceZ, input.overlayZ),
				backdrop: d.vec4f(b.strength, b.edgeBlur, b.vignette, b.speckle),
				backdropColor: d.vec4f(b.color[0], b.color[1], b.color[2], b.grain),
				lens: d.vec4f(input.time, input.surfaceAlpha, 0, 0),
				resolution: d.vec2f(width, height)
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

	/** Premultiply the captured overlay DOM into the overlay plane texture
	 *  WITHOUT the flat composite — the depth stage (ADR-0028) consumes the
	 *  plane directly as a 3D quad texture (overlay-at-depth). */
	premultiplyOverlay(): void {
		this.#premultiply();
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
