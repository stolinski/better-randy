import { d } from 'typegpu';

import type { TransitionEffectRenderer } from '$lib/platform/pipelines/types';

import Editor from './Editor.svelte';
import {
	sheetPeelTransitionEffectDefinition,
	type SheetPeelParams as SheetPeelParamsDefinition
} from './definition';

export type SheetPeelParams = SheetPeelParamsDefinition;
const SheetPeelUniforms = d.struct({
	progress: d.f32,
	direction: d.f32,
	curl: d.f32,
	perspective: d.f32,
	shadow: d.f32,
	highlight: d.f32
});

const DIRECTION_CODES: Record<SheetPeelParams['direction'], number> = {
	right: 0,
	left: 1,
	down: 2,
	up: 3
};

export const sheetPeelTransitionEffectRenderer: TransitionEffectRenderer<SheetPeelParams> = {
	...sheetPeelTransitionEffectDefinition,
	Editor,
	pass: {
		paramsStruct: SheetPeelUniforms,
		fragmentBody: /* wgsl */ `
			let direction = layout.$.uniforms.direction;
			var axis = in.uv.x;
			var crossAxis = in.uv.y;
			if (direction > 0.5 && direction < 1.5) { axis = 1.0 - in.uv.x; }
			if (direction > 1.5 && direction < 2.5) { axis = in.uv.y; crossAxis = in.uv.x; }
			if (direction > 2.5) { axis = 1.0 - in.uv.y; crossAxis = in.uv.x; }
			let curl = layout.$.uniforms.curl;
			let boundary = transitionProgress * (1.0 + curl);
			let distanceToFold = axis - boundary;
			let isRevealed = distanceToFold < -curl;
			let isSheet = distanceToFold > 0.0;
			let foldT = clamp(-distanceToFold / curl, 0.0, 1.0);
			let arc = sin(foldT * 3.14159265);
			let reflectedAxis = boundary - distanceToFold * (1.0 + 0.55 * arc);
			let perspectiveShift = (crossAxis - 0.5) * arc * layout.$.uniforms.perspective * 0.08;
			var peeledUv = in.uv;
			if (direction < 0.5) { peeledUv = vec2f(reflectedAxis, in.uv.y + perspectiveShift); }
			if (direction > 0.5 && direction < 1.5) { peeledUv = vec2f(1.0 - reflectedAxis, in.uv.y + perspectiveShift); }
			if (direction > 1.5 && direction < 2.5) { peeledUv = vec2f(in.uv.x + perspectiveShift, reflectedAxis); }
			if (direction > 2.5) { peeledUv = vec2f(in.uv.x + perspectiveShift, 1.0 - reflectedAxis); }
			let flap = textureSample(layout.$.fromTexture, layout.$.samp, peeledUv);
			let backsideShade = 1.0 - arc * layout.$.uniforms.shadow * 0.58;
			let ridgeLight = pow(arc, 6.0) * layout.$.uniforms.highlight * 0.24;
			let foldEdge = 1.0 - smoothstep(0.0, curl * 0.035, abs(distanceToFold));
			let flapLight = backsideShade + ridgeLight + foldEdge * layout.$.uniforms.highlight * 0.16;
			let flapLit = vec4f(flap.rgb * flapLight, flap.a);
			let coverage = max(fromSample.a, toSample.a);
			let revealedDistance = max(boundary - curl - axis, 0.0);
			let contactShadow = 1.0 - smoothstep(0.0, curl * 0.08, revealedDistance);
			let diffuseShadow = 1.0 - smoothstep(0.0, curl * 0.72, revealedDistance);
			let castShadow = (contactShadow * 0.2 + diffuseShadow * 0.13)
				* layout.$.uniforms.shadow * coverage;
			let destinationShadowed = vec4f(toSample.rgb * (1.0 - castShadow), toSample.a);
			if (isSheet) { return fromSample; }
			if (isRevealed) { return destinationShadowed; }
			return flapLit + destinationShadowed * (1.0 - flapLit.a);
		`,
		pack: (params, ctx) => ({
			progress: ctx.progress,
			direction: DIRECTION_CODES[params.direction],
			curl: params.curl,
			perspective: params.perspective,
			shadow: params.shadow,
			highlight: params.highlight
		})
	}
};
