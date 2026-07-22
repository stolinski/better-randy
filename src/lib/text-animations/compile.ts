import type { AnimationTweenSpec } from '$lib/platform/animation-manager';
import type { TextAnimation, TextAnimationParams, Transport } from '$lib/platform/engine-schema';

import {
	TEXT_EFFECT_CATALOG,
	type TextEffectShowcaseRuntime,
	type TextEffectSpec
} from './catalog';
import { compileGenericStagger } from './strategies/generic-stagger';
import { compileKineticCenterBuild } from './strategies/kinetic-center-build';
import { compileKineticTopBuild } from './strategies/kinetic-top-build';
import { compileSharedSlideOpacityStage } from './strategies/shared-slide-opacity-stage';
import type { TextAnimationResolvedUnit, TextAnimationUnitAlphaWriter } from './unit-types';

/**
 * The keys live on a per-slot/per-unit basis. Supers timestamp-driven playback
 * means we don't multiplex DOM mutation across phrases — the renderer always
 * sees one stable list of units, sized from the SplitText output. Each unit
 * gets one tween for the "enter" phase and (optionally) one for the "exit"
 * phase. Marks coupling reads the resulting per-unit alpha through the
 * `TextAnimationUnitAlphaWriter` callback.
 */
export interface TextAnimationCompileInputs {
	entry: TextAnimation;
	spec: TextEffectSpec;
	units: TextAnimationResolvedUnit[];
	transport: Transport;
	writeUnitAlpha: TextAnimationUnitAlphaWriter;
}

export interface TextAnimationCompileResult {
	tweens: AnimationTweenSpec[];
}

function shallowMergeRuntime(
	base: TextEffectShowcaseRuntime,
	overrides: TextAnimationParams | null | undefined
): TextEffectShowcaseRuntime {
	if (!overrides) {
		return base;
	}

	const next: TextEffectShowcaseRuntime = { ...base };

	if (typeof overrides.speedMultiplier === 'number') {
		next.speed_multiplier = overrides.speedMultiplier;
	}
	if (typeof overrides.holdMs === 'number') {
		next.hold_ms = overrides.holdMs;
	}
	if (typeof overrides.gapMs === 'number') {
		next.gap_ms = overrides.gapMs;
	}
	if (typeof overrides.yTravelMultiplier === 'number') {
		next.y_travel_multiplier = overrides.yTravelMultiplier;
	}
	if (typeof overrides.initialDelayMs === 'number') {
		next.initial_delay_ms = overrides.initialDelayMs;
	}

	return next;
}

/**
 * Resolve the catalog spec for an entry, applying the parse-time validators
 * caller side. Returns `null` when the effect id is unknown — schema parse
 * should have caught this; the runtime guard is defensive only.
 */
export function resolveTextEffectSpec(entry: TextAnimation): TextEffectSpec | null {
	return TEXT_EFFECT_CATALOG.get(entry.effect) ?? null;
}

/**
 * Compile one `textAnimations[]` entry into a list of AnimationTweenSpecs that
 * the AnimationManager scrubs against the paused GSAP timeline. Pure /
 * deterministic — given the same inputs (catalog, transport, units, entry) the
 * tween list is identical. No DOM access here; the strategies operate on the
 * `TextAnimationResolvedUnit[]` the manager has already materialized.
 */
export function compileTextAnimation(
	inputs: TextAnimationCompileInputs
): TextAnimationCompileResult {
	const merged: ResolvedTextEffectSpec = {
		...inputs.spec,
		runtime: shallowMergeRuntime(inputs.spec.runtime, inputs.entry.params ?? null)
	};

	switch (merged.renderer) {
		case 'generic-stagger':
			return compileGenericStagger({ ...inputs, spec: merged });
		case 'kinetic-center-build':
			return compileKineticCenterBuild({ ...inputs, spec: merged });
		case 'kinetic-top-build':
			return compileKineticTopBuild({ ...inputs, spec: merged });
		case 'shared-slide-opacity-stage':
			return compileSharedSlideOpacityStage({ ...inputs, spec: merged });
	}
}

export type ResolvedTextEffectSpec = TextEffectSpec;

export type TextEffectStrategyInputs = Omit<TextAnimationCompileInputs, 'spec'> & {
	spec: ResolvedTextEffectSpec;
};
