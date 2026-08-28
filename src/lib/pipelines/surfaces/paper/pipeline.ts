import tgpu, { d } from 'typegpu';

import {
	drawAnnotationMarks,
	getAnnotationMarkLayouts,
	type AnnotationFrameLayout,
	type AnnotationMarkLayout
} from '$lib/annotations/annotation-marks';
import { drawDiagramStrokes, getDiagramNodeLayouts } from '$lib/annotations/diagram-strokes';
import type { AnnotationMarkStyle } from '$lib/annotations/annotation-mark-styles';
import { createChartMarkRenderer } from '$lib/pipelines/shader-passes/chart-mark-renderer';
import { getDomFrameCaptureQueue } from '$lib/platform/html-in-canvas';
import { requireLoadedAnnotationRenderer } from '$lib/platform/pipelines/runtime-loader';
import type { SurfaceRenderInputs, SurfaceRenderInstance } from '$lib/platform/pipelines/types';
import { INTERMEDIATE_FORMAT, type GpuHost } from '$lib/platform/gpu-host';
import { createBicubicSampleWgsl } from '$lib/utils/bicubic-sampling-wgsl';
import { hexToRgbaFloat } from '$lib/utils/color';

const TEXTURE_USAGE_COPY_SRC = 0x01;
const TEXTURE_USAGE_COPY_DST = 0x02;
const TEXTURE_USAGE_TEXTURE_BINDING = 0x04;
const TEXTURE_USAGE_RENDER_ATTACHMENT = 0x10;
const DOM_TEXTURE_USAGE =
	TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_DST | TEXTURE_USAGE_RENDER_ATTACHMENT;
const OUTPUT_TEXTURE_USAGE =
	TEXTURE_USAGE_TEXTURE_BINDING | TEXTURE_USAGE_COPY_SRC | TEXTURE_USAGE_RENDER_ATTACHMENT;

const MAX_FOCAL_SLOTS = 8;

// Focal-style codes encoded in the uniform's `params.w`. 0 == empty slot.
const FOCAL_STYLE_CODES: Partial<Record<AnnotationMarkStyle, number>> = {
	magnify: 1,
	'lift-out': 2,
	'tear-out': 3,
	isolate: 4
};

export interface CreatePaperPipelineOptions {
	host: GpuHost;
	sourceElement: HTMLElement;
	// `light` (default) = paper/newspaper: amber multiply, dark ink shows through.
	// `dark` = web-document: dark surface with light text — paint the amber band and
	// invert the light text to dark ink so the highlight stays readable.
	highlightSurface?: 'light' | 'dark';
	// `paper` (default) bakes the warm fiber/grain substrate into the DOM (the
	// paper/newspaper look). `flat` leaves the captured DOM untinted — for screen
	// surfaces (iMessage) that are not photographed paper.
	substrate?: 'paper' | 'flat';
}

const FocalSlotStruct = d.struct({
	rect: d.vec4f,
	params: d.vec4f, // x=magnify, y=dim, z=tear, w=styleCode (0 = empty)
	optics: d.vec4f, // x=shape (0 circle, 1 rounded rect), y=intensity, z=ripple, w=reserved
	color: d.vec4f
});

const PaperUniforms = d.struct({
	focalSlotCount: d.u32,
	bgFloor: d.f32,
	highlightDarkSurface: d.u32,
	flatSubstrate: d.u32,
	// Over-ink (strokes) alpha multiplier — lets a surface fade its drawn marks
	// in lockstep with its own enter/exit (the marks canvas is a separate layer
	// the DOM-capture CSS-opacity fade never reaches). 1 = no attenuation; the
	// default for every surface that doesn't drive it.
	markAlpha: d.f32,
	resolution: d.vec2f,
	focalSlots: d.arrayOf(FocalSlotStruct, MAX_FOCAL_SLOTS)
});

const composeLayout = tgpu.bindGroupLayout({
	domTexture: { texture: d.texture2d(d.f32) },
	chartTexture: { texture: d.texture2d(d.f32) },
	highlightTexture: { texture: d.texture2d(d.f32) },
	strokesTexture: { texture: d.texture2d(d.f32) },
	samp: { sampler: 'filtering' },
	uniforms: { uniform: PaperUniforms }
});

const composeVertexFn = tgpu['~unstable'].vertexFn({
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

// Single fragment with inline composition + focal-warp loop. The same
// "compose at uv" logic runs once for the base sample and once per focal slot
// (sampling the same texture stack at a backward-mapped uv to produce the
// lifted appearance). Inlining is intentional — TypeGPU's fragmentFn template
// is a single function body and the duplication keeps the shader self-contained.
const composeFragmentFn = tgpu['~unstable'].fragmentFn({
	in: { uv: d.vec2f },
	out: d.vec4f
}) /* wgsl */ `{
		// ----- Base composition at in.uv -----
		var dom = textureSample(layout.$.domTexture, layout.$.samp, in.uv);
		let chart = textureSample(layout.$.chartTexture, layout.$.samp, in.uv);
		let chartedAlpha = chart.a + dom.a * (1.0 - chart.a);
		let chartedRgb = chart.rgb + dom.rgb * dom.a * (1.0 - chart.a);
		dom = vec4f(chartedRgb / max(chartedAlpha, 0.000001), chartedAlpha);
		let mask = step(0.001, dom.a);

		let coarsePos = in.uv * vec2f(220.0, 220.0);
		let coarseI = floor(coarsePos);
		let coarseF = fract(coarsePos);
		let coarseS = coarseF * coarseF * (vec2f(3.0) - 2.0 * coarseF);
		let c00 = fract(sin(dot(coarseI, vec2f(127.1, 311.7))) * 43758.5453);
		let c10 = fract(sin(dot(coarseI + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
		let c01 = fract(sin(dot(coarseI + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
		let c11 = fract(sin(dot(coarseI + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
		let coarseN = mix(mix(c00, c10, coarseS.x), mix(c01, c11, coarseS.x), coarseS.y);

		let finePos = in.uv * vec2f(680.0, 680.0);
		let fineI = floor(finePos);
		let fineF = fract(finePos);
		let fineS = fineF * fineF * (vec2f(3.0) - 2.0 * fineF);
		let f00 = fract(sin(dot(fineI, vec2f(269.5, 183.3))) * 43758.5453);
		let f10 = fract(sin(dot(fineI + vec2f(1.0, 0.0), vec2f(269.5, 183.3))) * 43758.5453);
		let f01 = fract(sin(dot(fineI + vec2f(0.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
		let f11 = fract(sin(dot(fineI + vec2f(1.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
		let fineN = mix(mix(f00, f10, fineS.x), mix(f01, f11, fineS.x), fineS.y);

		// Anisotropic fiber band — long horizontal grain at low frequency,
		// imitating laid-paper / smooth bond fiber. Combined with the
		// isotropic coarse + fine layers, this gives the substrate a
		// visible texture at 4K viewing distance instead of reading flat.
		let fiberPos = in.uv * vec2f(78.0, 22.0);
		let fiberI = floor(fiberPos);
		let fiberF = fract(fiberPos);
		let fiberS = fiberF * fiberF * (vec2f(3.0) - 2.0 * fiberF);
		let fb00 = fract(sin(dot(fiberI, vec2f(41.7, 89.3))) * 43758.5453);
		let fb10 = fract(sin(dot(fiberI + vec2f(1.0, 0.0), vec2f(41.7, 89.3))) * 43758.5453);
		let fb01 = fract(sin(dot(fiberI + vec2f(0.0, 1.0), vec2f(41.7, 89.3))) * 43758.5453);
		let fb11 = fract(sin(dot(fiberI + vec2f(1.0, 1.0), vec2f(41.7, 89.3))) * 43758.5453);
		let fiberN = mix(mix(fb00, fb10, fiberS.x), mix(fb01, fb11, fiberS.x), fiberS.y);

		let grain = (coarseN * 0.38 + fineN * 0.32 + fiberN * 0.30 - 0.5) * 0.040;
		let warmth = vec3f(1.0, 0.990, 0.968);
		let paperSubstrate = mix(vec3f(1.0), warmth + vec3f(grain), mask);
		// Screen surfaces (iMessage) opt out of the paper substrate — leave the
		// captured DOM untinted.
		let substrate = select(paperSubstrate, vec3f(1.0), layout.$.uniforms.flatSubstrate != 0u);
		dom = vec4f(dom.rgb * substrate, dom.a);

		let h = textureSample(layout.$.highlightTexture, layout.$.samp, in.uv);
		let streakPos = in.uv * vec2f(180.0, 9.0);
		let streakI = floor(streakPos);
		let streakF = fract(streakPos);
		let streakS = streakF * streakF * (vec2f(3.0) - 2.0 * streakF);
		let sk00 = fract(sin(dot(streakI, vec2f(72.3, 91.7))) * 26482.13);
		let sk10 = fract(sin(dot(streakI + vec2f(1.0, 0.0), vec2f(72.3, 91.7))) * 26482.13);
		let sk01 = fract(sin(dot(streakI + vec2f(0.0, 1.0), vec2f(72.3, 91.7))) * 26482.13);
		let sk11 = fract(sin(dot(streakI + vec2f(1.0, 1.0), vec2f(72.3, 91.7))) * 26482.13);
		let streakN = mix(mix(sk00, sk10, streakS.x), mix(sk01, sk11, streakS.x), streakS.y);
		let inkDensity = mix(0.86, 1.04, streakN);
		let hEffectiveAlpha = clamp(h.a * inkDensity, 0.0, 1.0);
		// Light-surface highlight (paper / newspaper): a translucent amber multiply.
		// Dark text shows through the band naturally — amber over light paper, ink stays dark.
		let hMul = mix(vec3f(1.0), h.rgb, hEffectiveAlpha);
		let tinted_light = vec4f(dom.rgb * hMul, dom.a);
		// Dark-surface highlight (web-document): dark bg + LIGHT text. Reusing the paper
		// marker's translucent textured alpha here reads as MUD — the dark bg bleeds
		// through the dry-break/streak alpha (filthy band) and the light text bleeds
		// through the partial coverage (gray, noisy glyphs). So: lay a CLEAN, near-opaque
		// amber band — saturate the coverage so the bg never shows through, and carry the
		// marker texture as a subtle brightness sheen (not alpha) — then punch the light
		// text fully down to near-black ink via DOM luminance. Crisp black-on-amber, the
		// readable paper-highlighter look, on any dark background colour.
		let bandCoverage = smoothstep(0.06, 0.34, h.a);
		let amberBand = h.rgb * mix(0.90, 1.0, streakN);
		let domLum = dot(dom.rgb, vec3f(0.2126, 0.7152, 0.0722));
		let textMask = smoothstep(0.42, 0.70, domLum);
		let darkInk = vec3f(0.05, 0.045, 0.035);
		let bandFill = mix(amberBand, darkInk, textMask);
		let tinted_dark = vec4f(mix(dom.rgb, bandFill, bandCoverage), dom.a);
		let tinted = select(tinted_light, tinted_dark, layout.$.uniforms.highlightDarkSurface != 0u);

		let blurRadius = 0.0004;
		let s0 = textureSample(layout.$.strokesTexture, layout.$.samp, in.uv);
		let s1 = textureSample(layout.$.strokesTexture, layout.$.samp, in.uv + vec2f(blurRadius, blurRadius));
		let s2 = textureSample(layout.$.strokesTexture, layout.$.samp, in.uv + vec2f(-blurRadius, blurRadius));
		let s3 = textureSample(layout.$.strokesTexture, layout.$.samp, in.uv + vec2f(blurRadius, -blurRadius));
		let s4 = textureSample(layout.$.strokesTexture, layout.$.samp, in.uv + vec2f(-blurRadius, -blurRadius));
		var strokes = s0 * 0.72 + (s1 + s2 + s3 + s4) * 0.07;
		// Fade the drawn marks with the surface's own visibility ramp (markAlpha).
		strokes.a = strokes.a * layout.$.uniforms.markAlpha;

		let baseOutAlpha = strokes.a + tinted.a * (1.0 - strokes.a);
		let baseOutRgb = strokes.rgb * strokes.a + tinted.rgb * tinted.a * (1.0 - strokes.a);
		var current = vec4f(baseOutRgb, baseOutAlpha);

		// ----- Focal warp loop -----
		//
		// styleCode dispatch:
		//   0 = empty slot (skip)
		//   1 = magnify  → optical-lens path: circle/rounded-rect SDF, bounded
		//                  refraction/dispersion, reticle + inspection ripple,
		//                  focal dim, material rim and depth shadow.
		//   2/3/4 = lift-out / tear-out / isolate → dim-and-lift path: dim
		//          surroundings (capped by bgFloor), composite a magnified
		//          sample of the rect on top; tear-out adds a torn-edge mask.
		let slotCount = min(layout.$.uniforms.focalSlotCount, ${MAX_FOCAL_SLOTS}u);
		for (var i: u32 = 0u; i < slotCount; i = i + 1u) {
			let slot = layout.$.uniforms.focalSlots[i];
			let styleCode = u32(slot.params.w);
			if (styleCode == 0u) {
				continue;
			}

			let rect = slot.rect;
			let magnifyAmount = slot.params.x;
			let dimAmount = slot.params.y;
			let tearAmount = slot.params.z;
			let opticalShape = slot.optics.x;
			let opticalIntensity = slot.optics.y;
			let opticalRipple = slot.optics.z;
			let opticalColor = slot.color;

			if (styleCode == 1u && magnifyAmount > 0.001) {
				// -------- MAGNIFY: glass-lens path --------
				//
				// Body-scale and magnification factor are decoupled.
				// magnifyAmount carries the lens-body iris envelope
				// (0→1→0 over the mark bar, with brief enter/exit), and
				// the magnification factor itself is HELD CONSTANT at a
				// readable 1.2–1.4x for the entire lifetime of the lens. This is the
				// architectural reason there is no visible text cross-
				// fade: at every pixel the magnification is binary,
				// either "inside lens at its authored scale" or "outside lens at 1x",
				// with sub-pixel AA on the boundary. The text never
				// renders at intermediate scales between 1.0 and 1.8.
				//
				// The reveal therefore reads as a lens body iris-ing
				// in and out, not as text scaling up and down.
				let bodyScale = clamp(magnifyAmount / 0.8, 0.0, 1.0);
				let magFactor = 0.12 + 0.06 * opticalIntensity;
				let lensProgress = smoothstep(0.0, 0.15, bodyScale);

				let rectCenter = rect.xy + rect.zw * 0.5;
				let resolution = layout.$.uniforms.resolution;
				let pillHalfFull = rect.zw * 0.5;
				let pillHalf = pillHalfFull * bodyScale;
				let pillHalfPixels = pillHalf * resolution;
				let pillR = max(
					select(
						min(pillHalfPixels.x, pillHalfPixels.y),
						min(pillHalfPixels.x, pillHalfPixels.y) * 0.38,
						opticalShape > 0.5
					),
					0.75
				);

				let p = in.uv - rectCenter;
				let pPixels = p * resolution;
				let absP = abs(pPixels);
				let q = absP - pillHalfPixels + vec2f(pillR);
				let sdLens = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - pillR;

				// Sub-pixel SDF coverage via fwidth + smoothstep — the
				// rim is one pixel of smooth fractional coverage, not a
				// binary in/out step.
				let aaWidth = max(fwidth(sdLens), 0.75);
				let insideCoverage = 1.0 - smoothstep(-aaWidth, aaWidth, sdLens);

				// edgeDepth: 0 at the rim → ~1 in the lens core. Clamped
				// so fragments outside the lens (sdLens > 0) don't go
				// negative.
				let edgeDepth = clamp(-sdLens / pillR, 0.0, 1.0);
				let edgeFactor = clamp(1.0 - edgeDepth, 0.0, 1.0);

				// Magnification at a CONSTANT factor. The lens shows the
				// underlying texture at a stable readable scale at every pixel inside
				// its (current) body. As the body grows during enter,
				// more of the magnified content becomes visible inside
				// the larger lens — but the magnification factor itself
				// never animates.
				//
				// Barrel + chromatic-aberration strengths intentionally
				// LOW: real glass shows only subtle refraction at the
				// rim. Earlier values (barrel 0.45, chroma 0.0025) made
				// the rim text illegible at 4K (~10px chroma separation,
				// 36% rim bend). The dominant cue should be the
				// magnification itself, not the aberrations.
				let scaleFactor = 1.0 + magFactor;
				let baseOffset = p / scaleFactor;
				let barrelStrength = magFactor * mix(0.05, 0.09, opticalIntensity);
				let distortion = baseOffset * pow(edgeFactor, 2.0) * barrelStrength;
				let sourceUv = rectCenter + baseOffset + distortion;

				// Chromatic aberration along the outward normal, peaks at rim.
				let normalDir = normalize(pPixels + vec2f(0.0001));
				let chromaShift = normalDir / resolution * edgeFactor * opticalIntensity * 0.08;
				${createBicubicSampleWgsl({
					prefix: 'magnifyRed',
					result: 'magnifyRedSample',
					sampler: 'layout.$.samp',
					texture: 'layout.$.domTexture',
					uv: 'sourceUv + chromaShift'
				})}
				${createBicubicSampleWgsl({
					prefix: 'magnifyGreen',
					result: 'gSample',
					sampler: 'layout.$.samp',
					texture: 'layout.$.domTexture',
					uv: 'sourceUv'
				})}
				${createBicubicSampleWgsl({
					prefix: 'magnifyBlue',
					result: 'magnifyBlueSample',
					sampler: 'layout.$.samp',
					texture: 'layout.$.domTexture',
					uv: 'sourceUv - chromaShift'
				})}
				let rChan = magnifyRedSample.r;
				let bChan = magnifyBlueSample.b;
				var lensDom = vec4f(rChan, gSample.g, bChan, gSample.a);
				let lensChart = textureSampleLevel(layout.$.chartTexture, layout.$.samp, sourceUv, 0.0);
				let lensChartedAlpha = lensChart.a + lensDom.a * (1.0 - lensChart.a);
				let lensChartedRgb = lensChart.rgb + lensDom.rgb * lensDom.a * (1.0 - lensChart.a);
				lensDom = vec4f(lensChartedRgb / max(lensChartedAlpha, 0.000001), lensChartedAlpha);
				let lensDomMask = step(0.001, lensDom.a);

				// Paper substrate resampled at sourceUv so lens content
				// carries the same grain as the page underneath.
				let lCoarsePos2 = sourceUv * vec2f(220.0, 220.0);
				let lcI2 = floor(lCoarsePos2);
				let lcF2 = fract(lCoarsePos2);
				let lcS2 = lcF2 * lcF2 * (vec2f(3.0) - 2.0 * lcF2);
				let lcc00 = fract(sin(dot(lcI2, vec2f(127.1, 311.7))) * 43758.5453);
				let lcc10 = fract(sin(dot(lcI2 + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
				let lcc01 = fract(sin(dot(lcI2 + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
				let lcc11 = fract(sin(dot(lcI2 + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
				let lcN2 = mix(mix(lcc00, lcc10, lcS2.x), mix(lcc01, lcc11, lcS2.x), lcS2.y);
				let lFinePos2 = sourceUv * vec2f(680.0, 680.0);
				let lfI2 = floor(lFinePos2);
				let lfF2 = fract(lFinePos2);
				let lfS2 = lfF2 * lfF2 * (vec2f(3.0) - 2.0 * lfF2);
				let lff00 = fract(sin(dot(lfI2, vec2f(269.5, 183.3))) * 43758.5453);
				let lff10 = fract(sin(dot(lfI2 + vec2f(1.0, 0.0), vec2f(269.5, 183.3))) * 43758.5453);
				let lff01 = fract(sin(dot(lfI2 + vec2f(0.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
				let lff11 = fract(sin(dot(lfI2 + vec2f(1.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
				let lfN2 = mix(mix(lff00, lff10, lfS2.x), mix(lff01, lff11, lfS2.x), lfS2.y);
				let lensGrain = (lcN2 * 0.55 + lfN2 * 0.45 - 0.5) * 0.012;
				let lensSubstrate = mix(vec3f(1.0), warmth + vec3f(lensGrain), lensDomMask);
				lensDom = vec4f(lensDom.rgb * lensSubstrate, lensDom.a);

				// Highlight + strokes resampled at sourceUv so decorative
				// marks magnify with the text.
				let lensHigh = textureSampleLevel(layout.$.highlightTexture, layout.$.samp, sourceUv, 0.0);
				let lensHEffective = clamp(lensHigh.a * inkDensity, 0.0, 1.0);
				let lensHMult = mix(vec3f(1.0), lensHigh.rgb, lensHEffective);
				let lensTinted = vec4f(lensDom.rgb * lensHMult, lensDom.a);

				let lensS0 = textureSampleLevel(layout.$.strokesTexture, layout.$.samp, sourceUv, 0.0);
				let lensS1 = textureSampleLevel(layout.$.strokesTexture, layout.$.samp, sourceUv + vec2f(blurRadius, blurRadius), 0.0);
				let lensS2_ = textureSampleLevel(layout.$.strokesTexture, layout.$.samp, sourceUv + vec2f(-blurRadius, blurRadius), 0.0);
				let lensS3 = textureSampleLevel(layout.$.strokesTexture, layout.$.samp, sourceUv + vec2f(blurRadius, -blurRadius), 0.0);
				let lensS4 = textureSampleLevel(layout.$.strokesTexture, layout.$.samp, sourceUv + vec2f(-blurRadius, -blurRadius), 0.0);
				let lensStrokes = lensS0 * 0.72 + (lensS1 + lensS2_ + lensS3 + lensS4) * 0.07;

				let lensContentA = lensStrokes.a + lensTinted.a * (1.0 - lensStrokes.a);
				let lensContentRgb = lensStrokes.rgb * lensStrokes.a + lensTinted.rgb * lensTinted.a * (1.0 - lensStrokes.a);

				// Glass surface lighting. Single light from upper-left
				// (matches the paper card shading direction).
				let lightDir = normalize(vec2f(-0.55, -0.83));
				let rimDot = max(dot(normalDir, lightDir), 0.0);
				let oppositeDot = max(dot(normalDir, -lightDir), 0.0);

				// Specular: thin bright arc along the upper-left rim,
				// expressed in SDF distance so its width is consistent
				// across lens sizes.
				let specBand = exp(-pow((-sdLens) / max(pillR * 0.028, 0.0001), 2.0));
				let specular = pow(rimDot, 1.5) * specBand * 0.45 * insideCoverage;

				// Inner shadow opposite the light — implies the lens
				// has thickness; light refracting through the body falls
				// off on the back rim.
				let innerBand = exp(-pow((-sdLens) / max(pillR * 0.08, 0.0001), 2.0));
				let innerShadow = oppositeDot * innerBand * 0.08 * insideCoverage;

				// Subtle uniform rim — a thin (~1.5px gaussian) dark line
				// at the lens boundary on the inside, on ALL sides (not
				// just light-facing). Delineates the glass body from the
				// page on the rims perpendicular to the light direction,
				// where neither specular nor inner-shadow reach.
				let rimDistAA = abs(sdLens) / max(aaWidth * 1.6, 0.0001);
				let rimDark = exp(-rimDistAA * rimDistAA) * 0.1 * insideCoverage;

				// Scanner grammar: a restrained optical ring plus four rim-local
				// registration ticks. Keep the chrome beneath readable content so
				// it cannot overwrite glyphs reconstructed inside the lens.
				let ringBand = exp(-pow(abs(sdLens) / max(aaWidth * 1.25, 0.0001), 2.0));
				let tickWidth = max(aaWidth * 1.7, 0.0001);
				let tickX = exp(-pow(abs(pPixels.x) / tickWidth, 2.0))
					* smoothstep(pillHalfPixels.y * 0.84, pillHalfPixels.y * 0.91, abs(pPixels.y))
					* (1.0 - smoothstep(pillHalfPixels.y, pillHalfPixels.y * 1.08, abs(pPixels.y)));
				let tickY = exp(-pow(abs(pPixels.y) / tickWidth, 2.0))
					* smoothstep(pillHalfPixels.x * 0.84, pillHalfPixels.x * 0.91, abs(pPixels.x))
					* (1.0 - smoothstep(pillHalfPixels.x, pillHalfPixels.x * 1.08, abs(pPixels.x)));
				let lensLuma = dot(lensDom.rgb, vec3f(0.2126, 0.7152, 0.0722));
				let darkGlyphOccupancy = 1.0 - smoothstep(0.32, 0.72, lensLuma);
				let lightGlyphOccupancy = smoothstep(0.50, 0.82, lensLuma);
				let glyphOccupancy = select(
					darkGlyphOccupancy,
					lightGlyphOccupancy,
					layout.$.uniforms.highlightDarkSurface != 0u
				);
				let reticleClear = 1.0 - glyphOccupancy;
				let reticle = clamp(ringBand * 0.78 + max(tickX, tickY), 0.0, 1.0) * reticleClear
					* lensProgress * opticalColor.a;

				// One authored inspection ripple lands during the lens settle beat.
				// It is frame-addressed through focal progress and disappears before
				// the read hold, replacing CanvasUI's pointer-click trigger with a
				// deterministic motion-graphics event.
				let lensMetric = length(pPixels / max(pillHalfFull * resolution, vec2f(0.75)));
				let rippleRadius = 1.0 + 0.35 * opticalRipple;
				let rippleWidth = 0.012 + 0.008 * opticalRipple;
				let rippleBand = exp(-pow((lensMetric - rippleRadius) / rippleWidth, 2.0));
				let rippleAlpha = rippleBand * pow(1.0 - opticalRipple, 2.0)
					* smoothstep(0.0, 0.08, opticalRipple) * opticalColor.a * 0.22;

				var glassRgb = lensContentRgb + vec3f(specular * lensProgress);
				glassRgb = glassRgb - vec3f(innerShadow * lensProgress);
				glassRgb = glassRgb * (1.0 - rimDark * lensProgress);
				glassRgb = mix(glassRgb, opticalColor.rgb, reticle);
				glassRgb = clamp(glassRgb, vec3f(0.0), vec3f(1.0));
				let glassAlpha = lensContentA * lensProgress;
				let lensCoverage = glassAlpha * insideCoverage;

				// Two-zone drop shadow with gaussian (exp) falloff —
				// the earlier smoothstep-over-large-range produced a
				// soft "vignette blob" that didn't read as a directional
				// drop shadow. exp(-(d/σ)²) gives the same kind of
				// rapid-near-zero / long-tail behavior real diffuse
				// shadows have, and at our tighter σ values the shadow
				// sits visually below-right of the lens instead of
				// haloing it.
				//
				// Contact: tight, close to the lens edge, ~35% strength.
				// Diffuse: wider penumbra, larger offset, ~22% strength.
				// Both rest on the SAME light direction (Q3) and both
				// scale with the lens body via pillR (Q15 / Q16).
				let contactOffset = vec2f(pillR * 0.10, pillR * 0.16);
				let pContact = pPixels - contactOffset;
				let absPC = abs(pContact);
				let qC = absPC - pillHalfPixels + vec2f(pillR);
				let sdContact = length(max(qC, vec2f(0.0))) + min(max(qC.x, qC.y), 0.0) - pillR;
				let contactDist = max(sdContact, 0.0);
				let contactFalloff = exp(-pow(contactDist / max(pillR * 0.20, 0.0001), 2.0));
				let contactStrength = contactFalloff * 0.07 * lensProgress;

				let diffuseOffset = vec2f(pillR * 0.24, pillR * 0.40);
				let diffuseHalf = pillHalfPixels * 1.10;
				let diffuseR = max(diffuseHalf.y, 0.0001);
				let pDiffuse = pPixels - diffuseOffset;
				let absPD = abs(pDiffuse);
				let qD = absPD - diffuseHalf + vec2f(diffuseR);
				let sdDiffuse = length(max(qD, vec2f(0.0))) + min(max(qD.x, qD.y), 0.0) - diffuseR;
				let diffuseDist = max(sdDiffuse, 0.0);
				let diffuseFalloff = exp(-pow(diffuseDist / max(pillR * 0.55, 0.0001), 2.0));
				let diffuseStrength = diffuseFalloff * 0.035 * lensProgress;

				let rawShadow = contactStrength + diffuseStrength * (1.0 - contactStrength);
				let shadowApplied = rawShadow * (1.0 - insideCoverage) * step(0.001, current.a);

				// Establish one focal hero: dim the surrounding page down to the
				// authored backgroundVisibility floor, then add the brief inspection
				// ripple and composite the readable lens body on top.
				let contextDim = min(clamp(dimAmount, 0.0, 1.0), 1.0 - layout.$.uniforms.bgFloor)
					* lensProgress;
				let dimmedRgb = current.rgb * (1.0 - contextDim * (1.0 - insideCoverage));
				let rippleRgb = opticalColor.rgb * rippleAlpha * current.a;
				let shadowedRgb = dimmedRgb * (1.0 - shadowApplied) + rippleRgb;
				let shadowedA = current.a;

				let outA = lensCoverage + shadowedA * (1.0 - lensCoverage);
				let outRgb = glassRgb * lensCoverage + shadowedRgb * shadowedA * (1.0 - lensCoverage);
				current = vec4f(outRgb, outA);
				continue;
			}

			// -------- LIFT-OUT / TEAR-OUT / ISOLATE: dim-and-lift path --------
			let center = rect.xy + rect.zw * 0.5;
			let scale = 1.0 + magnifyAmount;
			let liftSize = rect.zw * scale;
			let liftOrigin = center - liftSize * 0.5;
			let liftedLocalUv = (in.uv - liftOrigin) / liftSize;
			let isInLifted =
				liftedLocalUv.x >= 0.0 && liftedLocalUv.x <= 1.0 &&
				liftedLocalUv.y >= 0.0 && liftedLocalUv.y <= 1.0;
			let liftedFactor = select(0.0, 1.0, isInLifted);

			// Dim the area outside the lifted region. The surface's
			// backgroundVisibility (bgFloor) limits how aggressive the dim can be —
			// e.g. bgFloor=0.2 means at most 80% dim so the background stays 20%
			// visible.
			let dimRange = 1.0 - layout.$.uniforms.bgFloor;
			let outsideDim = 1.0 - dimAmount * (1.0 - liftedFactor) * dimRange;
			// Scale rgb only, NOT alpha: dimming alpha fades the paper card to
				// transparent and reveals the composite background — the card "vanishing"
				// outside a small focal region (the tear-out blank-body bug). Darken the
				// surround (spotlight) while the card stays present.
				current = vec4f(current.rgb * outsideDim, current.a);

			// Sample the composed stack at the backward-mapped sourceUv when
			// magnification is active.
			let useLifted = liftedFactor * smoothstep(0.0, 0.005, magnifyAmount);
			if (useLifted > 0.0) {
				let sourceUv = rect.xy + liftedLocalUv * rect.zw;

				var liftedDom = textureSampleLevel(layout.$.domTexture, layout.$.samp, sourceUv, 0.0);
				let liftedChart = textureSampleLevel(layout.$.chartTexture, layout.$.samp, sourceUv, 0.0);
				let liftedChartedAlpha = liftedChart.a + liftedDom.a * (1.0 - liftedChart.a);
				let liftedChartedRgb = liftedChart.rgb + liftedDom.rgb * liftedDom.a * (1.0 - liftedChart.a);
				liftedDom = vec4f(liftedChartedRgb / max(liftedChartedAlpha, 0.000001), liftedChartedAlpha);
				let liftedMask = step(0.001, liftedDom.a);

				let lCoarsePos = sourceUv * vec2f(220.0, 220.0);
				let lCoarseI = floor(lCoarsePos);
				let lCoarseF = fract(lCoarsePos);
				let lCoarseS = lCoarseF * lCoarseF * (vec2f(3.0) - 2.0 * lCoarseF);
				let lc00 = fract(sin(dot(lCoarseI, vec2f(127.1, 311.7))) * 43758.5453);
				let lc10 = fract(sin(dot(lCoarseI + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
				let lc01 = fract(sin(dot(lCoarseI + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
				let lc11 = fract(sin(dot(lCoarseI + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
				let lCoarseN = mix(mix(lc00, lc10, lCoarseS.x), mix(lc01, lc11, lCoarseS.x), lCoarseS.y);

				let lFinePos = sourceUv * vec2f(680.0, 680.0);
				let lFineI = floor(lFinePos);
				let lFineF = fract(lFinePos);
				let lFineS = lFineF * lFineF * (vec2f(3.0) - 2.0 * lFineF);
				let lf00 = fract(sin(dot(lFineI, vec2f(269.5, 183.3))) * 43758.5453);
				let lf10 = fract(sin(dot(lFineI + vec2f(1.0, 0.0), vec2f(269.5, 183.3))) * 43758.5453);
				let lf01 = fract(sin(dot(lFineI + vec2f(0.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
				let lf11 = fract(sin(dot(lFineI + vec2f(1.0, 1.0), vec2f(269.5, 183.3))) * 43758.5453);
				let lFineN = mix(mix(lf00, lf10, lFineS.x), mix(lf01, lf11, lFineS.x), lFineS.y);

				let lGrain = (lCoarseN * 0.55 + lFineN * 0.45 - 0.5) * 0.012;
				let lSubstrate = mix(vec3f(1.0), warmth + vec3f(lGrain), liftedMask);
				liftedDom = vec4f(liftedDom.rgb * lSubstrate, liftedDom.a);

				let liftedH = textureSampleLevel(layout.$.highlightTexture, layout.$.samp, sourceUv, 0.0);
				let lhEffectiveAlpha = clamp(liftedH.a * inkDensity, 0.0, 1.0);
				let lhMul = mix(vec3f(1.0), liftedH.rgb, lhEffectiveAlpha);
				let liftedTinted_light = vec4f(liftedDom.rgb * lhMul, liftedDom.a);
				// Dark-surface: clean near-opaque amber band + light text punched to ink
				// (mirrors the main pass — see that block's rationale).
				let lBandCoverage = smoothstep(0.06, 0.34, liftedH.a);
				let lAmberBand = liftedH.rgb * mix(0.90, 1.0, streakN);
				let lDomLum = dot(liftedDom.rgb, vec3f(0.2126, 0.7152, 0.0722));
				let lTextMask = smoothstep(0.42, 0.70, lDomLum);
				let lDarkInk = vec3f(0.05, 0.045, 0.035);
				let lBandFill = mix(lAmberBand, lDarkInk, lTextMask);
				let liftedTinted_dark = vec4f(mix(liftedDom.rgb, lBandFill, lBandCoverage), liftedDom.a);
				let liftedTinted = select(liftedTinted_light, liftedTinted_dark, layout.$.uniforms.highlightDarkSurface != 0u);

				let ls0 = textureSampleLevel(layout.$.strokesTexture, layout.$.samp, sourceUv, 0.0);
				let ls1 = textureSampleLevel(layout.$.strokesTexture, layout.$.samp, sourceUv + vec2f(blurRadius, blurRadius), 0.0);
				let ls2 = textureSampleLevel(layout.$.strokesTexture, layout.$.samp, sourceUv + vec2f(-blurRadius, blurRadius), 0.0);
				let ls3 = textureSampleLevel(layout.$.strokesTexture, layout.$.samp, sourceUv + vec2f(blurRadius, -blurRadius), 0.0);
				let ls4 = textureSampleLevel(layout.$.strokesTexture, layout.$.samp, sourceUv + vec2f(-blurRadius, -blurRadius), 0.0);
				let liftedStrokes = ls0 * 0.72 + (ls1 + ls2 + ls3 + ls4) * 0.07;

				let liftedAlphaBase = liftedStrokes.a + liftedTinted.a * (1.0 - liftedStrokes.a);
				let liftedRgbBase = liftedStrokes.rgb * liftedStrokes.a + liftedTinted.rgb * liftedTinted.a * (1.0 - liftedStrokes.a);

				// Torn-edge mask for tear-out (smooth alpha falloff with pseudo-noise).
				var tearMask = 1.0;
				if (tearAmount > 0.001) {
					let edgeDist = min(min(liftedLocalUv.x, 1.0 - liftedLocalUv.x), min(liftedLocalUv.y, 1.0 - liftedLocalUv.y));
					let tnPos = liftedLocalUv * vec2f(420.0, 60.0);
					let tnI = floor(tnPos);
					let tnF = fract(tnPos);
					let tnS = tnF * tnF * (vec2f(3.0) - 2.0 * tnF);
					let tn00 = fract(sin(dot(tnI, vec2f(127.1, 311.7))) * 43758.5453);
					let tn10 = fract(sin(dot(tnI + vec2f(1.0, 0.0), vec2f(127.1, 311.7))) * 43758.5453);
					let tn01 = fract(sin(dot(tnI + vec2f(0.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
					let tn11 = fract(sin(dot(tnI + vec2f(1.0, 1.0), vec2f(127.1, 311.7))) * 43758.5453);
					let tearNoise = mix(mix(tn00, tn10, tnS.x), mix(tn01, tn11, tnS.x), tnS.y);
					let threshold = max(tearAmount * 0.07, 0.0005);
					tearMask = smoothstep(threshold * (0.2 + tearNoise * 1.4), threshold * 1.4 + 0.001, edgeDist);
				}

				let liftedFinalAlpha = liftedAlphaBase * tearMask * useLifted;
				let outA = liftedFinalAlpha + current.a * (1.0 - liftedFinalAlpha);
				let outR = liftedRgbBase * liftedFinalAlpha + current.rgb * current.a * (1.0 - liftedFinalAlpha);
				current = vec4f(outR, outA);
			}
		}

		// ----- Paper card drop shadow -----
		// Light from upper-left, shadow cast toward lower-right. Sample
		// the DOM alpha at offsets and accumulate gaussian-weighted
		// contributions: 6 tight contact taps + 10 softer cast taps.
		// The natural over-composite keeps current.rgb where current.a > 0,
		// so shadow only fills the transparent surround.
		var shadowMass = 0.0;
		let contactOff = vec2f(0.0010, 0.0018);
		let contactTaps = array<vec2f, 6>(
			vec2f( 0.0008,  0.0008),
			vec2f(-0.0008,  0.0008),
			vec2f( 0.0000,  0.0014),
			vec2f( 0.0014,  0.0000),
			vec2f( 0.0008, -0.0008),
			vec2f( 0.0000,  0.0000)
		);
		for (var ci = 0u; ci < 6u; ci = ci + 1u) {
			let s = textureSampleLevel(layout.$.domTexture, layout.$.samp, in.uv - contactOff - contactTaps[ci], 0.0);
			shadowMass = shadowMass + s.a * 0.090;
		}
		let castOff = vec2f(0.0042, 0.0072);
		let castTaps = array<vec2f, 10>(
			vec2f(-0.0040, -0.0030),
			vec2f( 0.0000, -0.0030),
			vec2f( 0.0040, -0.0030),
			vec2f(-0.0050,  0.0000),
			vec2f( 0.0000,  0.0000),
			vec2f( 0.0050,  0.0000),
			vec2f(-0.0040,  0.0030),
			vec2f( 0.0000,  0.0030),
			vec2f( 0.0040,  0.0030),
			vec2f( 0.0000,  0.0050)
		);
		for (var di = 0u; di < 10u; di = di + 1u) {
			let s = textureSampleLevel(layout.$.domTexture, layout.$.samp, in.uv - castOff - castTaps[di], 0.0);
			shadowMass = shadowMass + s.a * 0.046;
		}
		let cardShadowAlpha = clamp(shadowMass, 0.0, 1.0) * 0.55;
		let shadowOver = cardShadowAlpha * (1.0 - current.a);
		let finalA = current.a + shadowOver;
		let finalRgb = select(vec3f(0.0), current.rgb * current.a / max(finalA, 0.0001), finalA > 0.0001);
		current = vec4f(finalRgb, finalA);

		return current;
	}`.$uses({ layout: composeLayout });

interface FocalSlotData {
	rect: { x: number; y: number; width: number; height: number };
	magnify: number;
	dim: number;
	tear: number;
	styleCode: number;
	opticalColor: string;
	opticalIntensity: number;
	opticalRipple: number;
	opticalShape: 'circle' | 'rounded-rect';
}

const EMPTY_FOCAL_SLOT = {
	rect: d.vec4f(0, 0, 0, 0),
	params: d.vec4f(0, 0, 0, 0),
	optics: d.vec4f(0, 0, 0, 0),
	color: d.vec4f(1, 1, 1, 1)
};

function buildFocalSlots(
	layouts: readonly AnnotationMarkLayout[],
	progressByIndex: readonly number[],
	durationMsByIndex: readonly number[],
	intensityByIndex: readonly number[],
	colorsByIndex: readonly string[],
	canvasWidth: number,
	canvasHeight: number,
	compositionLayout: AnnotationFrameLayout
): FocalSlotData[] {
	const slots: FocalSlotData[] = [];

	for (let i = 0; i < layouts.length; i += 1) {
		if (slots.length >= MAX_FOCAL_SLOTS) {
			break;
		}

		const layout = layouts[i];
		const styleCode = FOCAL_STYLE_CODES[layout.style];
		if (styleCode === undefined) continue;
		const renderer = requireLoadedAnnotationRenderer(layout.style);
		if (!renderer.computeFocalSlot) {
			throw new Error(`Focal Annotation renderer "${layout.style}" has no focal-slot resolver.`);
		}

		const progress = progressByIndex[i] ?? 0;

		if (progress <= 0) {
			continue;
		}

		const intensity = intensityByIndex[i] ?? 1;
		const color = colorsByIndex[i] ?? '#ffffff';

		const slot = renderer.computeFocalSlot({
			bounds: layout.bounds,
			canvasHeight,
			canvasWidth,
			color,
			context: null as never,
			durationMs: durationMsByIndex[i] ?? 1,
			intensity,
			layout,
			markIndex: i,
			paperLayout: compositionLayout,
			progress
		});

		slots.push({
			rect: slot.rect,
			magnify: slot.magnify,
			dim: slot.dim,
			tear: slot.tear,
			styleCode,
			opticalColor: slot.opticalColor ?? color,
			opticalIntensity: slot.opticalIntensity ?? intensity,
			opticalRipple: slot.opticalRipple ?? 0,
			opticalShape: slot.opticalShape ?? 'rounded-rect'
		});
	}

	return slots;
}

export function createPaperPipeline({
	host,
	sourceElement,
	highlightSurface = 'light',
	substrate = 'paper'
}: CreatePaperPipelineOptions): SurfaceRenderInstance {
	const { canvas, device, root } = host;
	const canvasWidth = canvas.width;
	const canvasHeight = canvas.height;

	// Surface renders to its own intermediate texture; the platform layer
	// composes that texture into the canvas (optionally through the per-layer
	// effect chain) so post-process effects can read the surface output.
	const outputTexture = device.createTexture({
		size: [canvasWidth, canvasHeight, 1],
		format: INTERMEDIATE_FORMAT,
		usage: OUTPUT_TEXTURE_USAGE
	});

	const domTexture = device.createTexture({
		size: [canvasWidth, canvasHeight, 1],
		format: 'rgba8unorm',
		usage: DOM_TEXTURE_USAGE
	});

	const highlightTexture = device.createTexture({
		size: [canvasWidth, canvasHeight, 1],
		format: 'rgba8unorm',
		usage: DOM_TEXTURE_USAGE
	});

	const strokesTexture = device.createTexture({
		size: [canvasWidth, canvasHeight, 1],
		format: 'rgba8unorm',
		usage: DOM_TEXTURE_USAGE
	});

	const highlightCanvas = new OffscreenCanvas(canvasWidth, canvasHeight);
	const rawHighlightContext = highlightCanvas.getContext('2d', { alpha: true });
	const strokesCanvas = new OffscreenCanvas(canvasWidth, canvasHeight);
	const rawStrokesContext = strokesCanvas.getContext('2d', { alpha: true });

	if (!rawHighlightContext || !rawStrokesContext) {
		domTexture.destroy();
		highlightTexture.destroy();
		strokesTexture.destroy();
		throw new Error('Unable to acquire a 2D context for the marks layers.');
	}

	const highlightContext: OffscreenCanvasRenderingContext2D = rawHighlightContext;
	const strokesContext: OffscreenCanvasRenderingContext2D = rawStrokesContext;

	const sampler = root['~unstable'].createSampler({
		magFilter: 'linear',
		minFilter: 'linear',
		addressModeU: 'clamp-to-edge',
		addressModeV: 'clamp-to-edge'
	});

	const initialSlots = Array.from({ length: MAX_FOCAL_SLOTS }, () => EMPTY_FOCAL_SLOT);

	const uniformBuffer = root
		.createBuffer(PaperUniforms, {
			focalSlotCount: 0,
			bgFloor: 0,
			highlightDarkSurface: 0,
			flatSubstrate: 0,
			markAlpha: 1,
			resolution: d.vec2f(canvasWidth, canvasHeight),
			focalSlots: initialSlots
		})
		.$usage('uniform');

	const chartRenderer = createChartMarkRenderer(device, canvasWidth, canvasHeight);
	const bindGroup = root.createBindGroup(composeLayout, {
		domTexture,
		chartTexture: chartRenderer.getOutputTexture(),
		highlightTexture,
		strokesTexture,
		samp: sampler,
		uniforms: uniformBuffer
	});

	const pipeline = root['~unstable']
		.withVertex(composeVertexFn, {})
		.withFragment(composeFragmentFn, { format: INTERMEDIATE_FORMAT })
		.createPipeline();

	const domFrameCaptureQueue = getDomFrameCaptureQueue(device.queue);

	function uploadDom(): void {
		domFrameCaptureQueue.captureElementToTexture(sourceElement, canvasWidth, canvasHeight, {
			texture: domTexture
		});
	}

	function renderMarks(
		layouts: readonly AnnotationMarkLayout[],
		inputs: SurfaceRenderInputs,
		progressByIndex: readonly number[]
	): void {
		highlightContext.clearRect(0, 0, canvasWidth, canvasHeight);
		strokesContext.clearRect(0, 0, canvasWidth, canvasHeight);

		const drawableLayouts = layouts as AnnotationMarkLayout[];

		drawAnnotationMarks({
			colorsByIndex: inputs.markColorsByIndex,
			context: highlightContext,
			intensityByIndex: inputs.markIntensityByIndex,
			layouts: drawableLayouts,
			progressByIndex,
			markStyles: ['highlight'],
			textAnimAlphaByIndex: inputs.textAnimAlphaByMarkIndex
		});

		drawAnnotationMarks({
			colorsByIndex: inputs.markColorsByIndex,
			context: strokesContext,
			intensityByIndex: inputs.markIntensityByIndex,
			layouts: drawableLayouts,
			progressByIndex,
			markStyles: ['underline', 'strike', 'circle', 'box', 'side-note'],
			textAnimAlphaByIndex: inputs.textAnimAlphaByMarkIndex
		});

		if (inputs.diagram) {
			// Diagram strokes (ADR-0036) ride the over-ink strokes layer — same
			// z-home as underline/strike, above glyphs, below overlays.
			const frameLayout: AnnotationFrameLayout = {
				x: 0,
				y: 0,
				width: canvasWidth,
				height: canvasHeight
			};
			drawDiagramStrokes({
				context: strokesContext,
				primitives: inputs.diagram.primitives,
				frame: frameLayout,
				nodeLayouts: getDiagramNodeLayouts(sourceElement, frameLayout),
				drawProgressById: inputs.diagram.drawProgressById,
				alphaById: inputs.diagram.alphaById,
				stroke: inputs.diagram.stroke,
				accentColor: inputs.diagram.accentColor
			});
		}

		device.queue.copyExternalImageToTexture(
			{ source: highlightCanvas },
			{ texture: highlightTexture },
			[canvasWidth, canvasHeight]
		);
		device.queue.copyExternalImageToTexture(
			{ source: strokesCanvas },
			{ texture: strokesTexture },
			[canvasWidth, canvasHeight]
		);
	}

	function render(inputs: SurfaceRenderInputs): void {
		chartRenderer.render(inputs.chart);
		const compositionLayout: AnnotationFrameLayout = {
			x: 0,
			y: 0,
			width: canvasWidth,
			height: canvasHeight
		};
		const markLayouts = getAnnotationMarkLayouts(sourceElement, compositionLayout);

		renderMarks(markLayouts, inputs, inputs.animState.markProgresses);

		const focalSlots = buildFocalSlots(
			markLayouts,
			inputs.animState.markProgresses,
			inputs.markDurationMsByIndex,
			inputs.markIntensityByIndex,
			inputs.markColorsByIndex,
			canvasWidth,
			canvasHeight,
			compositionLayout
		);

		const paddedSlots = Array.from({ length: MAX_FOCAL_SLOTS }, (_, idx) => {
			const slot = focalSlots[idx];
			if (!slot) {
				return EMPTY_FOCAL_SLOT;
			}
			return {
				rect: d.vec4f(slot.rect.x, slot.rect.y, slot.rect.width, slot.rect.height),
				params: d.vec4f(slot.magnify, slot.dim, slot.tear, slot.styleCode),
				optics: d.vec4f(
					slot.opticalShape === 'rounded-rect' ? 1 : 0,
					slot.opticalIntensity,
					slot.opticalRipple,
					0
				),
				color: d.vec4f(...hexToRgbaFloat(slot.opticalColor))
			};
		});

		// The highlight blend mode follows the surface's actual background: the
		// per-frame `highlightDarkSurface` (from paperColor luminance) wins, so a
		// single Surface can host both dark and light pages (e.g. web-document
		// twitter/reddit dark vs wikipedia light). Falls back to the creation-time
		// `highlightSurface` default when the caller doesn't supply it.
		const darkHighlight = inputs.highlightDarkSurface ?? highlightSurface === 'dark';
		uniformBuffer.write({
			focalSlotCount: focalSlots.length,
			bgFloor: Math.max(0, Math.min(1, inputs.backgroundVisibility ?? 0)),
			highlightDarkSurface: darkHighlight ? 1 : 0,
			flatSubstrate: substrate === 'flat' ? 1 : 0,
			markAlpha: Math.max(0, Math.min(1, inputs.markAlpha ?? 1)),
			resolution: d.vec2f(canvasWidth, canvasHeight),
			focalSlots: paddedSlots
		});

		pipeline
			.with(bindGroup)
			.withColorAttachment({
				view: outputTexture.createView(),
				clearValue: [0, 0, 0, 0],
				loadOp: 'clear',
				storeOp: 'store'
			})
			.draw(3);
	}

	function dispose(): void {
		chartRenderer.dispose();
		outputTexture.destroy();
		domTexture.destroy();
		highlightTexture.destroy();
		strokesTexture.destroy();
	}

	function getOutputTexture(): GPUTexture {
		return outputTexture;
	}

	return { uploadDom, render, dispose, getOutputTexture };
}
