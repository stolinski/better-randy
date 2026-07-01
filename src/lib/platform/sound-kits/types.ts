/**
 * Sound-kit manifest types (ADR-0033 §3). A Sound kit is the sonic sibling of
 * the appearance Pack: it resolves sound-event Roles → concrete audio samples,
 * and carries sound ONLY — no appearance (that is the Pack, ADR-0023), no
 * motion timing (that is intrinsic to the motion, ADR-0015). Kits are assigned
 * PER LAYER (`surface.soundKit` / `overlays[].soundKit` / `marks.soundKit`),
 * never per composition; a Layer with no kit is silent.
 */
import type { SoundEvent } from '../engine-schema';

export interface SoundKitManifest {
	slug: string;
	label: string;
	description: string;
	/**
	 * Event → bundled audio-asset slug (see `audio-assets.ts`). Partial on
	 * purpose (ADR-0024 hybrid): events a kit does not cover fall back to the
	 * engine-pinned core sample for that event (`CORE_SOUND_SAMPLES`), so a
	 * minimal kit is a handful of signature samples and everything still sounds.
	 */
	samples: Partial<Record<SoundEvent, string>>;
}
