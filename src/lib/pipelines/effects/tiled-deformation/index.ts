import { d } from 'typegpu';
import { z } from 'zod';

import type { EffectRenderer } from '$lib/platform/pipelines/types';

import Editor from './Editor.svelte';

const TiledDeformationParamsSchema = z
	.object({
		topology: z.enum(['grid', 'hex']).default('grid'),
		seed: z.number().int().min(0).max(65535).default(901),
		columns: z.number().min(3).max(48).default(12),
		lift: z.number().min(0).max(1).default(0.42),
		bevel: z.number().min(0).max(1).default(0.3),
		perspective: z.number().min(0).max(0.2).default(0.045),
		revealFrom: z.number().min(0).max(1).default(0.12),
		revealTo: z.number().min(0).max(1).default(0.62),
		lightAngle: z.number().min(-180).max(180).default(-35)
	})
	.refine((params) => params.revealTo > params.revealFrom, {
		path: ['revealTo'],
		message: 'revealTo must be greater than revealFrom'
	});

export type TiledDeformationParams = z.infer<typeof TiledDeformationParamsSchema>;

const TiledDeformationEffectSchema = z.object({
	type: z.literal('tiled-deformation'),
	id: z.string(),
	params: TiledDeformationParamsSchema
});

const TiledDeformationUniforms = d.struct({
	progress: d.f32,
	durationSeconds: d.f32,
	resolution: d.vec2f,
	topology: d.f32,
	seed: d.f32,
	columns: d.f32,
	lift: d.f32,
	bevel: d.f32,
	perspective: d.f32,
	revealFrom: d.f32,
	revealTo: d.f32,
	lightAngle: d.f32
});

export const tiledDeformationEffectRenderer: EffectRenderer<TiledDeformationParams> = {
	type: 'tiled-deformation',
	label: 'Tiled deformation',
	schema: TiledDeformationEffectSchema,
	defaults: () => ({
		params: {
			topology: 'grid',
			seed: 901,
			columns: 12,
			lift: 0.42,
			bevel: 0.3,
			perspective: 0.045,
			revealFrom: 0.12,
			revealTo: 0.62,
			lightAngle: -35
		}
	}),
	pass: {
		paramsStruct: TiledDeformationUniforms,
		fragmentBody: /* wgsl */ `
			let aspect = layout.$.uniforms.resolution.x / layout.$.uniforms.resolution.y;
			let columns = layout.$.uniforms.columns;
			let isHex = layout.$.uniforms.topology > 0.5;
			var cell = vec2f(0.0);
			var local = vec2f(0.0);
			var cellCenterUv = vec2f(0.5);
			var hexSize = 1.0;
			if (isHex) {
				let point = in.uv * vec2f(aspect, 1.0);
				hexSize = aspect / (columns * 1.7320508);
				let axialQ = (0.57735027 * point.x - 0.33333333 * point.y) / hexSize;
				let axialR = (0.66666667 * point.y) / hexSize;
				let axialS = -axialQ - axialR;
				var roundedQ = round(axialQ);
				var roundedR = round(axialR);
				let roundedS = round(axialS);
				let differenceQ = abs(roundedQ - axialQ);
				let differenceR = abs(roundedR - axialR);
				let differenceS = abs(roundedS - axialS);
				if (differenceQ > differenceR && differenceQ > differenceS) {
					roundedQ = -roundedR - roundedS;
				} else if (differenceR > differenceS) {
					roundedR = -roundedQ - roundedS;
				}
				cell = vec2f(roundedQ, roundedR);
				let centerPoint = hexSize * vec2f(
					1.7320508 * (roundedQ + roundedR * 0.5),
					1.5 * roundedR
				);
				local = (point - centerPoint) / hexSize;
				cellCenterUv = centerPoint / vec2f(aspect, 1.0);
			} else {
				let grid = vec2f(columns, columns / aspect);
				let gridUv = in.uv * grid;
				cell = floor(gridUv);
				local = fract(gridUv) - vec2f(0.5);
				cellCenterUv = (cell + vec2f(0.5)) / grid;
			}
			let random = fract(sin(dot(cell + vec2f(layout.$.uniforms.seed), vec2f(12.9898, 78.233))) * 43758.5453);
			let radialPosition = (cellCenterUv - vec2f(0.5)) * vec2f(aspect, 1.0);
			let field = clamp(length(radialPosition) * 1.25 + random * 0.22, 0.0, 1.0);
			let duration = max(layout.$.uniforms.durationSeconds, 0.001);
			let revealWindow = max(layout.$.uniforms.revealTo - layout.$.uniforms.revealFrom, 0.001);
			let attackWidth = min(0.3 / duration, revealWindow * 0.6);
			let decayWidth = min(0.2 / duration, revealWindow * 0.4);
			let startSpan = max(revealWindow - attackWidth - decayWidth, 0.0);
			let tileStart = layout.$.uniforms.revealFrom + field * startSpan;
			let attackEnd = tileStart + attackWidth;
			let decayEnd = attackEnd + decayWidth;
			let attack = smoothstep(tileStart, attackEnd, layout.$.uniforms.progress);
			let decay = 1.0 - smoothstep(attackEnd, decayEnd, layout.$.uniforms.progress);
			let lift = attack * decay * layout.$.uniforms.lift;
			let radial = normalize(radialPosition + vec2f(0.001));
			let projectedLocal = (local - radial * lift * layout.$.uniforms.perspective * 2.4)
				/ (1.0 + lift * 0.1);
			var sourceUv = in.uv;
			var tileMetric = max(abs(projectedLocal.x), abs(projectedLocal.y)) * 2.0;
			if (isHex) {
				let sourcePoint = cellCenterUv * vec2f(aspect, 1.0) + projectedLocal * hexSize;
				sourceUv = sourcePoint / vec2f(aspect, 1.0);
				tileMetric = max(
					abs(projectedLocal.y),
					dot(abs(projectedLocal), vec2f(0.8660254, 0.5))
				);
			} else {
				let grid = vec2f(columns, columns / aspect);
				sourceUv = (cell + vec2f(0.5) + projectedLocal) / grid;
			}
			let edgeAa = max(fwidth(tileMetric) * 1.25, 0.001);
			let coverage = 1.0 - smoothstep(1.0 - edgeAa, 1.0 + edgeAa, tileMetric);
			let sample = textureSample(layout.$.inputTexture, layout.$.samp, sourceUv);
			let edge = smoothstep(0.7, 1.0, tileMetric);
			let lightDirection = vec2f(cos(layout.$.uniforms.lightAngle), sin(layout.$.uniforms.lightAngle));
			let bevelLight = dot(normalize(projectedLocal + vec2f(0.001)), lightDirection)
				* layout.$.uniforms.bevel * edge * lift;
			let straightRgb = select(
				vec3f(0.0),
				sample.rgb / max(sample.a, 0.0001),
				sample.a > 0.0001
			);
			let tileLight = max(0.35, 1.0 + bevelLight + lift * 0.12);
			let tile = vec4f(clamp(straightRgb * tileLight, vec3f(0.0), vec3f(1.0)) * sample.a, sample.a);
			return mix(inputSample, tile, coverage);
		`,
		pack: (params, ctx) => ({
			progress: ctx.progress,
			durationSeconds: ctx.progress > 0 ? ctx.timestamp / ctx.progress : 1,
			resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
			topology: params.topology === 'hex' ? 1 : 0,
			seed: params.seed,
			columns: params.columns,
			lift: params.lift,
			bevel: params.bevel,
			perspective: params.perspective,
			revealFrom: params.revealFrom,
			revealTo: params.revealTo,
			lightAngle: (params.lightAngle * Math.PI) / 180
		})
	},
	Editor
};
