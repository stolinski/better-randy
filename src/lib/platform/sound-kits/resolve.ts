/**
 * Sound-event → sample resolution (ADR-0033 §3, amended 2026-07-02). The
 * cascade, top to bottom:
 *
 *   per-motion override (`sound.mute` / `sound.sample` on the motion window)
 *     → the emitting Layer's palette (`kit.samples[event]`)
 *       → SILENCE
 *
 * A palette is EXACTLY its sounds — there is no hidden fallback. The original
 * ADR-0024-style core fallback was removed after by-ear testing: it made
 * palette swaps inaudible (picking Chat on a mark fell through to a
 * synthesized swipe that sounded like the marker it was supposed to replace),
 * which reads as the control doing nothing. Silence is an honest resolution
 * for sound the way a blank fill is not for appearance; `core` is an ordinary
 * pickable palette that happens to cover every event. A Layer with no palette
 * resolves to silence — sound is opt-in per Layer.
 */
import type { SoundEvent } from '../engine-schema';
import type { DerivedSoundCue } from '../sound-cues';
import { SOUND_KIT_REGISTRY } from './registry.ts';
import type { SoundKitManifest } from './types';

/** A palette's sample for an event, or null — the palette doesn't carry it. */
export function resolveSoundSample(kit: SoundKitManifest, event: SoundEvent): string | null {
	return kit.samples[event] ?? null;
}

/**
 * Resolve a derived cue to the audio-asset slug it plays, or null for
 * silence (muted, palette-less Layer, or an event the palette doesn't
 * carry). A locked per-motion `sample` bypasses palette resolution entirely
 * (ADR-0033 §5). The schema rejects unknown palette slugs at parse time; the
 * registry miss here is defence in depth for the render path, resolving to
 * silence rather than crashing a frame.
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
