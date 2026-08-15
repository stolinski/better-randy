import { d } from 'typegpu';

import type { TransitionEffectRenderer } from '$lib/platform/pipelines/types';

import Editor from './Editor.svelte';
import {
	maskWipeTransitionEffectDefinition,
	type MaskWipeParams as MaskWipeParamsDefinition
} from './definition';

export type MaskWipeParams = MaskWipeParamsDefinition;
const MaskWipeUniforms = d.struct({
	progress: d.f32,
	direction: d.f32,
	softness: d.f32
});

const DIRECTION_CODES: Record<MaskWipeParams['direction'], number> = {
	right: 0,
	left: 1,
	down: 2,
	up: 3
};

export const maskWipeTransitionEffectRenderer: TransitionEffectRenderer<MaskWipeParams> = {
	...maskWipeTransitionEffectDefinition,
	Editor,
	pass: {
		paramsStruct: MaskWipeUniforms,
		fragmentBody: /* wgsl */ `
			let direction = layout.$.uniforms.direction;
			var axis = in.uv.x;
			if (direction > 0.5 && direction < 1.5) { axis = 1.0 - in.uv.x; }
			if (direction > 1.5 && direction < 2.5) { axis = in.uv.y; }
			if (direction > 2.5) { axis = 1.0 - in.uv.y; }
			let softness = layout.$.uniforms.softness;
			let edge = smoothstep(transitionProgress - softness, transitionProgress + softness, axis);
			return mix(toSample, fromSample, edge);
		`,
		pack: (params, ctx) => ({
			progress: ctx.progress,
			direction: DIRECTION_CODES[params.direction],
			softness: params.softness
		})
	}
};
