import { d } from 'typegpu';

import type { EffectRenderer } from '$lib/platform/pipelines/types';
import { hexToRgbaFloat } from '$lib/utils/color';

import Editor from './Editor.svelte';
import {
	halftoneCmykEffectDefinition,
	type HalftoneCmykParams as HalftoneCmykParamsDefinition
} from './definition';

export type HalftoneCmykParams = HalftoneCmykParamsDefinition;
const HalftoneCmykUniforms = d.struct({
	colorBack: d.vec4f,
	colorC: d.vec4f,
	colorM: d.vec4f,
	colorY: d.vec4f,
	colorK: d.vec4f,
	resolution: d.vec2f,
	cmykType: d.f32,
	size: d.f32,
	contrast: d.f32,
	softness: d.f32,
	gridNoise: d.f32,
	floodC: d.f32,
	floodM: d.f32,
	floodY: d.f32,
	floodK: d.f32,
	gainC: d.f32,
	gainM: d.f32,
	gainY: d.f32,
	gainK: d.f32
});

const CMYK_TYPE_TO_INDEX: Record<HalftoneCmykParams['cmykType'], number> = {
	dots: 0,
	ink: 1,
	sharp: 2
};

// CMYK print separation: the frame is separated into four ink channels, each
// screened on its own rotated dot lattice at the classic press angles
// (C 15°, M 75°, Y 0°, K 45°) so the overlap forms rosettes instead of moiré.
// Each fragment accumulates dot coverage from the 3×3 neighboring cells of all
// four lattices (36 cell samples in dots/ink mode; sharp mode separates the
// fragment's own color), then multiplies the inks over the paper color in
// print order K→C→M→Y.
//
// Alpha (rubric E4): per-cell coverage is scaled by the sampled alpha (a
// transparent cell prints nothing), and the final output — paper color
// included — is multiplied by the frame's own per-pixel alpha, so the print
// exists only inside the content silhouette.
const fragmentBody = /* wgsl */ `
	let res = layout.$.uniforms.resolution;
	let cmykType = layout.$.uniforms.cmykType;
	let contrast = layout.$.uniforms.contrast;
	let softness = layout.$.uniforms.softness;
	let gridNoise = layout.$.uniforms.gridNoise;
	let isJoined = cmykType > 0.5;

	let cellsPerSide = mix(400.0, 7.0, pow(layout.$.uniforms.size, 0.7));
	let cellSizeY = 1.0 / cellsPerSide;
	let aspect = res.x / res.y;
	let pad = cellSizeY * vec2f(1.0 / aspect, 1.0);
	let uvGrid = (in.uv - vec2f(0.5)) / pad;

	// Frame window: soften coverage across one cell at the frame edge.
	let insideImageBox = smoothstep(-pad.x, 0.0, in.uv.x)
		* smoothstep(1.0 + pad.x, 1.0, in.uv.x)
		* smoothstep(-pad.y, 0.0, in.uv.y)
		* smoothstep(1.0 + pad.y, 1.0, in.uv.y);

	let generalComp = 0.1 * softness + 0.1 * gridNoise
		+ 0.1 * (1.0 - step(0.5, cmykType)) * (1.5 - softness);

	// Press angles: C 15°, M 75°, Y 0°, K 45° — precomputed sin/cos, plus a
	// per-channel lattice phase shift.
	var cosA = array<f32, 4>(0.9659258, 0.2588190, 1.0, 0.7071068);
	var sinA = array<f32, 4>(0.2588190, 0.9659258, 0.0, 0.7071068);
	var latticeShift = array<f32, 4>(-0.5, -0.25, 0.2, 0.0);
	var flood = array<f32, 4>(
		layout.$.uniforms.floodC, layout.$.uniforms.floodM,
		layout.$.uniforms.floodY, layout.$.uniforms.floodK
	);
	var gain = array<f32, 4>(
		layout.$.uniforms.gainC, layout.$.uniforms.gainM,
		layout.$.uniforms.gainY, layout.$.uniforms.gainK
	);
	var masks = array<f32, 4>(0.0, 0.0, 0.0, 0.0);

	// Sharp mode separates the fragment's own (pre-sampled) color once.
	let straightIn = inputSample.rgb / max(inputSample.a, 0.0001);
	let sharpC = clamp((straightIn - vec3f(0.5)) * contrast + vec3f(0.5), vec3f(0.0), vec3f(1.0));
	let sharpK = 1.0 - max(max(sharpC.r, sharpC.g), sharpC.b);
	var sharpCmy = vec3f(0.0);
	if (1.0 - sharpK > 0.00001) {
		sharpCmy = (vec3f(1.0) - sharpC - vec3f(sharpK)) / (1.0 - sharpK);
	}
	let sharpCmyk = vec4f(sharpCmy, sharpK) * inputSample.a;

	for (var ch = 0; ch < 4; ch = ch + 1) {
		let rot = mat2x2f(vec2f(cosA[ch], sinA[ch]), vec2f(-sinA[ch], cosA[ch]));
		let rotInv = mat2x2f(vec2f(cosA[ch], -sinA[ch]), vec2f(sinA[ch], cosA[ch]));
		let uvCh = rot * uvGrid + vec2f(latticeShift[ch]);

		for (var dy = -1; dy <= 1; dy = dy + 1) {
			for (var dx = -1; dx <= 1; dx = dx + 1) {
				let cellCenterBase = floor(uvCh) + vec2f(0.5) + vec2f(f32(dx), f32(dy));

				// Procedural per-cell jitter (replaces the source's noise texture).
				var p3 = fract(
					vec3f(cellCenterBase.x, cellCenterBase.y, cellCenterBase.x + f32(ch) * 50.0)
						* vec3f(0.3183099, 0.3678794, 0.3141592)
				) + vec3f(0.1);
				p3 = p3 + vec3f(dot(p3, p3.yzx + vec3f(19.19)));
				let jitter = fract(vec2f(p3.x * p3.y, p3.y * p3.z));
				let cellCenter = cellCenterBase + (jitter - vec2f(0.5)) * gridNoise;

				var cov = 0.0;
				var transparency = insideImageBox;
				if (cmykType > 1.5) {
					cov = sharpCmyk[ch];
					transparency = transparency * inputSample.a;
				} else {
					let sampleUV = (rotInv * (cellCenter - vec2f(latticeShift[ch]))) * pad + vec2f(0.5);
					let tex = textureSampleLevel(layout.$.inputTexture, layout.$.samp, sampleUV, 0.0);
					let straight = tex.rgb / max(tex.a, 0.0001);
					let c = clamp((straight - vec3f(0.5)) * contrast + vec3f(0.5), vec3f(0.0), vec3f(1.0));
					let maxRGB = max(max(c.r, c.g), c.b);
					if (ch == 3) {
						cov = (1.0 - maxRGB) * tex.a;
					} else if (maxRGB > 0.00001) {
						cov = ((maxRGB - c[ch]) / maxRGB) * tex.a;
					}
					transparency = transparency * tex.a;
				}

				let dist = length(uvCh - cellCenter);
				var radius = cov * (1.0 + generalComp);
				radius = radius + (0.15 + gain[ch] * radius);
				radius = max(0.0, radius);
				radius = mix(0.0, radius, transparency);
				radius = radius + flood[ch];
				var mask = 1.0 - smoothstep(0.0, max(radius, 0.00001), dist);
				if (isJoined) {
					mask = pow(mask, 1.2);
				} else {
					mask = smoothstep(0.5 - 0.5 * softness, 0.51 + 0.49 * softness, mask);
				}
				mask = mask * mix(1.0, mix(0.5, 1.0, 1.5 * radius), softness);
				masks[ch] = masks[ch] + mask;
			}
		}
	}

	var covC = masks[0];
	var covM = masks[1];
	var covY = masks[2];
	var covK = masks[3];

	if (isJoined) {
		// Joined-dot threshold — the source's fwidth-based AA (uniform control
		// flow here, so derivatives are legal).
		let th = 0.5;
		let sLeft = th * softness;
		let sRight = (1.0 - th) * softness + 0.01;
		covC = smoothstep(th - sLeft - fwidth(covC), th + sRight, covC);
		covM = smoothstep(th - sLeft - fwidth(covM), th + sRight, covM);
		covY = smoothstep(th - sLeft - fwidth(covY), th + sRight, covY);
		covK = smoothstep(th - sLeft - fwidth(covK), th + sRight, covK);
	}

	let inkC = layout.$.uniforms.colorC;
	let inkM = layout.$.uniforms.colorM;
	let inkY = layout.$.uniforms.colorY;
	let inkK = layout.$.uniforms.colorK;
	let back = layout.$.uniforms.colorBack;

	covC = covC * inkC.a;
	covM = covM * inkM.a;
	covY = covY * inkY.a;
	covK = covK * inkK.a;

	// Multiplicative ink laydown in print order K → C → M → Y.
	var ink = vec3f(1.0);
	ink = ink * mix(vec3f(1.0), inkK.rgb, clamp(covK, 0.0, 1.0));
	ink = ink * mix(vec3f(1.0), inkC.rgb, clamp(covC, 0.0, 1.0));
	ink = ink * mix(vec3f(1.0), inkM.rgb, clamp(covM, 0.0, 1.0));
	ink = ink * mix(vec3f(1.0), inkY.rgb, clamp(covY, 0.0, 1.0));

	let shape = clamp(max(max(covC, covM), max(covY, covK)), 0.0, 1.0);

	var outColor = back.rgb * back.a;
	var outAlpha = back.a;
	outColor = mix(outColor, ink, shape);
	outAlpha = clamp(outAlpha + shape, 0.0, 1.0);

	// E4: the print — paper included — exists only inside the content
	// silhouette; transparent regions stay transparent.
	return vec4f(outColor, outAlpha) * inputSample.a;
`;

export const halftoneCmykEffectRenderer: EffectRenderer<HalftoneCmykParams> = {
	...halftoneCmykEffectDefinition,
	pass: {
		paramsStruct: HalftoneCmykUniforms,
		fragmentBody,
		// Params flow raw from preset JSON (schema defaults are not applied at
		// runtime), so every read falls back to the declared default.
		pack: (params, ctx) => ({
			colorBack: d.vec4f(...hexToRgbaFloat(params.colorBack ?? '#fdf6ec')),
			colorC: d.vec4f(...hexToRgbaFloat(params.colorC ?? '#00a1e4')),
			colorM: d.vec4f(...hexToRgbaFloat(params.colorM ?? '#e6007e')),
			colorY: d.vec4f(...hexToRgbaFloat(params.colorY ?? '#ffed00')),
			colorK: d.vec4f(...hexToRgbaFloat(params.colorK ?? '#1a1a1a')),
			resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
			cmykType: CMYK_TYPE_TO_INDEX[params.cmykType ?? 'dots'],
			size: params.size ?? 0.5,
			contrast: params.contrast ?? 1,
			softness: params.softness ?? 0.25,
			gridNoise: params.gridNoise ?? 0,
			floodC: params.floodC ?? 0,
			floodM: params.floodM ?? 0,
			floodY: params.floodY ?? 0,
			floodK: params.floodK ?? 0,
			gainC: params.gainC ?? 0,
			gainM: params.gainM ?? 0,
			gainY: params.gainY ?? 0,
			gainK: params.gainK ?? 0
		})
	},
	Editor
};
