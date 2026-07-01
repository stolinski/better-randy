/**
 * Sound-event → sample resolution (ADR-0033 §3, ADR-0024 hybrid fallback).
 * The cascade, top to bottom:
 *
 *   per-motion override (`sound.mute` / `sound.sample` on the motion window)
 *     → the emitting Layer's kit (`kit.samples[event]`)
 *       → the engine-pinned core sample (`CORE_SOUND_SAMPLES[event]`)
 *
 * A Layer with no kit resolves to silence — sound is opt-in per Layer.
 */
import type { SoundEvent } from '../engine-schema';
import type { DerivedSoundCue } from '../sound-cues';
import { SOUND_KIT_REGISTRY } from './registry.ts';
import type { SoundKitManifest } from './types';

/**
 * The engine-pinned core sample per sound event (ADR-0033 §8) — the fallback
 * every kit resolves through for events it doesn't cover. Slugs into the
 * bundled asset map in `audio-assets.ts`; the WAVs are synthesized
 * deterministically by `scripts/gen-core-sounds.mjs`.
 */
export const CORE_SOUND_SAMPLES: Record<SoundEvent, string> = {
	'whoosh-in': 'core-whoosh-in',
	'whoosh-out': 'core-whoosh-out',
	impact: 'core-impact',
	tick: 'core-tick',
	pop: 'core-pop',
	'sub-drop': 'core-sub-drop',
	sting: 'core-sting'
};

/** A kit's sample for an event, falling back to the core sample (ADR-0024). */
export function resolveSoundSample(kit: SoundKitManifest, event: SoundEvent): string {
	return kit.samples[event] ?? CORE_SOUND_SAMPLES[event];
}

/**
 * Resolve a derived cue to the audio-asset slug it plays, or null for
 * silence (muted, or emitted by a Layer wearing no kit). A locked per-motion
 * `sample` bypasses kit resolution entirely (ADR-0033 §5). The schema rejects
 * unknown kit slugs at parse time; the registry miss here is defence in depth
 * for the render path, resolving to silence rather than crashing a frame.
 */
export function resolveCueSample(cue: DerivedSoundCue): string | null {
	if (cue.muted) {
		return null;
	}
	if (cue.sample !== undefined) {
		return cue.sample;
	}
	if (cue.kit === null) {
		return null;
	}
	const kit = SOUND_KIT_REGISTRY[cue.kit];
	if (kit === undefined) {
		console.error(`Sound cue "${cue.id}" names unregistered kit "${cue.kit}"; resolving silent.`);
		return null;
	}
	return resolveSoundSample(kit, cue.event);
}
