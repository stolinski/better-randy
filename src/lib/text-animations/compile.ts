import type { AnimationTweenSpec } from '$lib/platform/animation-manager';
import type {
	TextAnimation,
	TextAnimationParams,
	Transport
} from '$lib/platform/engine-schema';

import { EFFECT_CATALOG, type EffectSpec, type ShowcaseRuntime } from './catalog';
import { compileGenericStagger } from './strategies/generic-stagger';
import { compileKineticCenterBuild } from './strategies/kinetic-center-build';
import { compileKineticTopBuild } from './strategies/kinetic-top-build';
import { compileSharedSlideOpacityStage } from './strategies/shared-slide-opacity-stage';
import type { ResolvedUnit, UnitAlphaWriter } from './unit-types';

/**
 * The keys live on a per-slot/per-unit basis. Supers timestamp-driven playback
 * means we don't multiplex DOM mutation across phrases — the renderer always
 * sees one stable list of units, sized from the SplitText output. Each unit
 * gets one tween for the "enter" phase and (optionally) one for the "exit"
 * phase. Marks coupling reads the resulting per-unit alpha through the
 * `UnitAlphaWriter` callback.
 */
export interface CompileInputs {
	entry: TextAnimation;
	spec: EffectSpec;
	units: ResolvedUnit[];
	transport: Transport;
	writeUnitAlpha: UnitAlphaWriter;
}

export interface CompileOutputs {
	tweens: AnimationTweenSpec[];
}

function shallowMergeRuntime(
	base: ShowcaseRuntime,
	overrides: TextAnimationParams | null | undefined
): ShowcaseRuntime {
	if (!overrides) {
		return base;
	}

	const next: ShowcaseRuntime = { ...base };

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
export function resolveSpec(entry: TextAnimation): EffectSpec | null {
	return EFFECT_CATALOG.get(entry.effect) ?? null;
}

/**
 * Compile one `textAnimations[]` entry into a list of AnimationTweenSpecs that
 * the AnimationManager scrubs against the paused GSAP timeline. Pure /
 * deterministic — given the same inputs (catalog, transport, units, entry) the
 * tween list is identical. No DOM access here; the strategies operate on the
 * `ResolvedUnit[]` the manager has already materialized.
 */
export function compile(inputs: CompileInputs): CompileOutputs {
	const merged: ResolvedSpec = {
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

export type ResolvedSpec = EffectSpec;

export type StrategyInputs = Omit<CompileInputs, 'spec'> & { spec: ResolvedSpec };
