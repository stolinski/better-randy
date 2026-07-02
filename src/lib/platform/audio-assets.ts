/**
 * Bundled audio assets (ADR-0033 §7) — the audio analog of
 * `substrate-textures.ts`. Samples ship as Vite-imported WAVs, so the bytes
 * are in the build and decode is deterministic: no network, no cache
 * variance; the offline export mix reads identical samples every run. The
 * core set is synthesized by `scripts/gen-core-sounds.mjs`; kit-specific
 * samples register here as they land.
 */
import coreImpactUrl from '$lib/assets/sounds/core-impact.wav';
import corePopUrl from '$lib/assets/sounds/core-pop.wav';
import coreScratchUrl from '$lib/assets/sounds/core-scratch.wav';
import coreSwipeUrl from '$lib/assets/sounds/core-swipe.wav';
import coreStingUrl from '$lib/assets/sounds/core-sting.wav';
import coreSubDropUrl from '$lib/assets/sounds/core-sub-drop.wav';
import coreTickUrl from '$lib/assets/sounds/core-tick.wav';
import coreWhooshInUrl from '$lib/assets/sounds/core-whoosh-in.wav';
import coreWhooshOutUrl from '$lib/assets/sounds/core-whoosh-out.wav';
import bedAmbientTextureUrl from '$lib/assets/sounds/bed-ambient-texture.wav';
import impactBookUrl from '$lib/assets/sounds/impact-book.wav';
import messagePopUrl from '$lib/assets/sounds/message-pop.wav';
import messageSendUrl from '$lib/assets/sounds/message-send.wav';
import quickWhooshInUrl from '$lib/assets/sounds/quick-whoosh-in.wav';
import quickWhooshOutUrl from '$lib/assets/sounds/quick-whoosh-out.wav';
import tapbackDislikeUrl from '$lib/assets/sounds/tapback-dislike.wav';
import tapbackEmphasizeUrl from '$lib/assets/sounds/tapback-emphasize.wav';
import tapbackHahaUrl from '$lib/assets/sounds/tapback-haha.wav';
import tapbackHeartUrl from '$lib/assets/sounds/tapback-heart.wav';
import tapbackLikeUrl from '$lib/assets/sounds/tapback-like.wav';
import tapbackQuestionUrl from '$lib/assets/sounds/tapback-question.wav';
import tickPencilUrl from '$lib/assets/sounds/tick-pencil.wav';

import { CORE_SOUND_SAMPLES } from './sound-kits/resolve.ts';
import { listSoundKits } from './sound-kits/registry.ts';

const SOUND_ASSETS: Record<string, string> = {
	'core-whoosh-in': coreWhooshInUrl,
	'core-whoosh-out': coreWhooshOutUrl,
	'core-impact': coreImpactUrl,
	'core-tick': coreTickUrl,
	'core-pop': corePopUrl,
	'core-swipe': coreSwipeUrl,
	'core-scratch': coreScratchUrl,
	'core-sub-drop': coreSubDropUrl,
	'core-sting': coreStingUrl,
	// Quick Whoosh kit samples (CC0; provenance in sound-kits/quick-whoosh/manifest.ts)
	'quick-whoosh-in': quickWhooshInUrl,
	'quick-whoosh-out': quickWhooshOutUrl,
	'impact-book': impactBookUrl,
	'tick-pencil': tickPencilUrl,
	// Message Pop kit samples (provenance + ⚠ redistribution note in
	// sound-kits/message-pop/manifest.ts — Apple recordings at Scott's direction)
	'message-pop': messagePopUrl,
	'message-send': messageSendUrl,
	// Tapback acknowledgements, one per reaction type — Apple ToneLibrary
	// recordings, same ⚠ NOT-redistributable provenance as the pair above.
	// Locked-specific by the iMessage derivation (ADR-0033 §5 signature sound).
	'tapback-heart': tapbackHeartUrl,
	'tapback-like': tapbackLikeUrl,
	'tapback-dislike': tapbackDislikeUrl,
	'tapback-haha': tapbackHahaUrl,
	'tapback-emphasize': tapbackEmphasizeUrl,
	'tapback-question': tapbackQuestionUrl,
	// Ambient bed texture for full-frame pieces — referenced by audioCues, not a kit.
	'bed-ambient-texture': bedAmbientTextureUrl
};

export function isSoundAsset(slug: string): boolean {
	return slug in SOUND_ASSETS;
}

export function listSoundAssets(): readonly string[] {
	return Object.keys(SOUND_ASSETS);
}

// Fetch + decode is async and memoised per (slug, sample-rate) so each asset
// decodes once per rate — `decodeAudioData` resamples to the decoding
// context's rate, and preview (AudioContext) and export (OfflineAudioContext
// at the muxer's rate) may differ.
const bufferCache = new Map<string, Promise<AudioBuffer>>();

export function loadSoundBuffer(
	slug: string,
	context: BaseAudioContext
): Promise<AudioBuffer> | null {
	if (typeof window === 'undefined') return null;
	const url = SOUND_ASSETS[slug];
	if (!url) return null;
	const key = `${slug}@${context.sampleRate}`;
	let pending = bufferCache.get(key);
	if (!pending) {
		pending = fetch(url)
			.then((response) => response.arrayBuffer())
			.then((bytes) => context.decodeAudioData(bytes));
		bufferCache.set(key, pending);
	}
	return pending;
}

/**
 * Boot gate (the ADR-0019 pattern): every engine-pinned core sample and every
 * sample a registered Sound kit names must be a bundled asset. Throws an
 * aggregated Error so a missing WAV fails at startup, not mid-export.
 */
export function assertSoundRegistryValid(): void {
	const problems: string[] = [];

	for (const [event, slug] of Object.entries(CORE_SOUND_SAMPLES)) {
		if (!isSoundAsset(slug)) {
			problems.push(`core sample for "${event}" names unknown asset "${slug}"`);
		}
	}

	for (const kit of listSoundKits()) {
		for (const [event, slug] of Object.entries(kit.samples)) {
			if (slug !== undefined && !isSoundAsset(slug)) {
				problems.push(`kit "${kit.slug}" sample for "${event}" names unknown asset "${slug}"`);
			}
		}
	}

	if (problems.length > 0) {
		throw new Error(`Sound registry invalid:\n- ${problems.join('\n- ')}`);
	}
}
