import { d } from 'typegpu';

import type { TransitionEffectRenderer } from '$lib/platform/pipelines/types';

import Editor from './Editor.svelte';
import {
	seededShatterTransitionEffectDefinition,
	type SeededShatterParams as SeededShatterParamsDefinition
} from './definition';

export type SeededShatterParams = SeededShatterParamsDefinition;
const SeededShatterUniforms = d.struct({
	progress: d.f32,
	resolution: d.vec2f,
	seed: d.f32,
	columns: d.f32,
	scatter: d.f32,
	rotation: d.f32,
	depth: d.f32,
	shadow: d.f32
});

export const seededShatterTransitionEffectRenderer: TransitionEffectRenderer<SeededShatterParams> =
	{
		...seededShatterTransitionEffectDefinition,
		Editor,
		pass: {
			paramsStruct: SeededShatterUniforms,
			fragmentBody: /* wgsl */ `
			let aspect = layout.$.uniforms.resolution.x / layout.$.uniforms.resolution.y;
			let grid = vec2f(layout.$.uniforms.columns, layout.$.uniforms.columns / aspect);
			let centerDirection = normalize(in.uv - vec2f(0.5) + vec2f(0.001));
			let radialTravel = centerDirection * layout.$.uniforms.scatter * transitionProgress * transitionProgress;
			let gridUv = (in.uv - radialTravel) * grid;
			let baseCell = floor(gridUv);
			let baseLocal = fract(gridUv);
			let seed = layout.$.uniforms.seed;
			let cellRandom = fract(sin(dot(baseCell + vec2f(seed * 0.31), vec2f(17.17, 71.93))) * 21837.2817);
			let usesAlternateDiagonal = cellRandom > 0.5;
			let regularTriangle = select(0.0, 1.0, baseLocal.x + baseLocal.y > 1.0);
			let alternateTriangle = select(2.0, 3.0, baseLocal.x > baseLocal.y);
			let triangleId = select(regularTriangle, alternateTriangle, usesAlternateDiagonal);
			let shardId = baseCell + vec2f(triangleId * 0.37, triangleId * 0.71);
			let random = fract(sin(dot(shardId + vec2f(seed), vec2f(12.9898, 78.233))) * 43758.5453);
			let random2 = fract(sin(dot(shardId + vec2f(seed * 0.13), vec2f(41.27, 93.71))) * 24634.6345);
			let random3 = fract(sin(dot(shardId + vec2f(seed * 0.71), vec2f(27.17, 61.93))) * 31837.2817);
			let delay = random * 0.42;
			let shardProgress = smoothstep(delay, min(1.0, delay + 0.58), transitionProgress);
			let randomDirection = vec2f(cos(random2 * 6.2831853), sin(random2 * 6.2831853));
			let cellJitter = randomDirection * shardProgress * (0.08 + random3 * 0.18);
			let angle = (random - 0.5) * layout.$.uniforms.rotation * shardProgress * 1.6;
			let c = cos(angle);
			let s = sin(angle);
			let centeredLocal = baseLocal - vec2f(0.5) - cellJitter;
			let shardLocal = vec2f(
				c * centeredLocal.x + s * centeredLocal.y,
				-s * centeredLocal.x + c * centeredLocal.y
			) + vec2f(0.5);
			let isRegularUpper = shardLocal.x + shardLocal.y > 1.0;
			let isAlternateUpper = shardLocal.x > shardLocal.y;
			let lowerEdge = min(min(shardLocal.x, shardLocal.y), 1.0 - shardLocal.x - shardLocal.y);
			let upperEdge = min(min(1.0 - shardLocal.x, 1.0 - shardLocal.y), shardLocal.x + shardLocal.y - 1.0);
			let alternateLowerEdge = min(min(shardLocal.x, 1.0 - shardLocal.y), shardLocal.y - shardLocal.x);
			let alternateUpperEdge = min(min(shardLocal.y, 1.0 - shardLocal.x), shardLocal.x - shardLocal.y);
			let regularEdge = select(lowerEdge, upperEdge, isRegularUpper);
			let alternateEdge = select(alternateLowerEdge, alternateUpperEdge, isAlternateUpper);
			let triangleEdge = select(regularEdge, alternateEdge, usesAlternateDiagonal);
			let edgeAa = max(fwidth(triangleEdge) * 1.35, 0.001);
			let shardGap = shardProgress * (0.012 + random3 * 0.026);
			let separatedCoverage = smoothstep(shardGap, shardGap + edgeAa, triangleEdge);
			let coverage = mix(1.0, separatedCoverage, smoothstep(0.22, 0.48, shardProgress));
			let sourceUv = (baseCell + shardLocal) / grid;
			let shard = textureSample(layout.$.fromTexture, layout.$.samp, sourceUv);
			let depthFade = 1.0 - shardProgress * layout.$.uniforms.depth * (0.42 + random * 0.35);
			let shardOpacity = coverage * (1.0 - shardProgress * shardProgress);
			let shardLit = vec4f(shard.rgb * depthFade * shardOpacity, shard.a * shardOpacity);

			let shadowLocal = shardLocal - vec2f(0.035, -0.035) * shardProgress;
			let shadowRegularUpper = shadowLocal.x + shadowLocal.y > 1.0;
			let shadowAlternateUpper = shadowLocal.x > shadowLocal.y;
			let shadowLowerEdge = min(min(shadowLocal.x, shadowLocal.y), 1.0 - shadowLocal.x - shadowLocal.y);
			let shadowUpperEdge = min(min(1.0 - shadowLocal.x, 1.0 - shadowLocal.y), shadowLocal.x + shadowLocal.y - 1.0);
			let shadowAlternateLowerEdge = min(min(shadowLocal.x, 1.0 - shadowLocal.y), shadowLocal.y - shadowLocal.x);
			let shadowAlternateUpperEdge = min(min(shadowLocal.y, 1.0 - shadowLocal.x), shadowLocal.x - shadowLocal.y);
			let shadowRegularEdge = select(shadowLowerEdge, shadowUpperEdge, shadowRegularUpper);
			let shadowAlternateEdge = select(shadowAlternateLowerEdge, shadowAlternateUpperEdge, shadowAlternateUpper);
			let shadowEdge = select(shadowRegularEdge, shadowAlternateEdge, usesAlternateDiagonal);
			let contactBlur = max(edgeAa * 3.0, 0.012);
			let diffuseBlur = max(edgeAa * 8.0, 0.055);
			let contactCoverage = smoothstep(shardGap - contactBlur, shardGap + contactBlur, shadowEdge);
			let diffuseCoverage = smoothstep(shardGap - diffuseBlur, shardGap + diffuseBlur, shadowEdge);
			let contactOnly = max(contactCoverage - coverage, 0.0);
			let diffuseOnly = max(diffuseCoverage - coverage, 0.0);
			let shardShadow = (contactOnly * 0.48 + diffuseOnly * 0.2)
				* layout.$.uniforms.shadow * shardProgress * (1.0 - shardProgress * 0.72);
			let destination = vec4f(toSample.rgb * (1.0 - shardShadow * 0.42), toSample.a);
			return shardLit + destination * (1.0 - shardLit.a);
		`,
			pack: (params, ctx) => ({
				progress: ctx.progress,
				resolution: d.vec2f(ctx.canvasWidth, ctx.canvasHeight),
				seed: params.seed,
				columns: params.columns,
				scatter: params.scatter,
				rotation: params.rotation,
				depth: params.depth,
				shadow: params.shadow
			})
		}
	};
