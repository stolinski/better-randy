/**
 * Deterministic offline audio mix (ADR-0033 §6). The export's audio track is
 * a pure function of {derived motion cues + manual cues + bed + kit samples +
 * duration}: `planAudioMix` computes the schedule (pure, node-testable) and
 * `renderAudioMix` realizes it through an `OfflineAudioContext` at fixed
 * sample positions — no wall-clock anywhere, so the same composition renders
 * a byte-identical buffer every run. Preview playback (real-time, scrub
 * silent) is a separate concern and does NOT go through this module.
 */
import { loadSoundBuffer } from './audio-assets';
import type { EngineState } from './engine-schema';
import { deriveSoundCues, isAudibleSoundCue } from './sound-cues.ts';
import { resolveCueSample } from './sound-kits/resolve.ts';

/** Fixed mix rate — matches the bundled core WAVs; the muxer resamples if it must. */
export const AUDIO_MIX_SAMPLE_RATE = 48000;
export const AUDIO_MIX_CHANNELS = 2;

// Master headroom so stacked cues don't clip on encode.
const MASTER_GAIN = 0.8;
// Post-render ceiling: stacked cues can still sum past full scale, so the
// rendered buffer is peak-normalized down to this when it overshoots — a
// deterministic scale of every sample, preserving the mix balance.
const PEAK_CEILING = 0.98;
// Short release when a manual cue / bed window cuts a sample early — a hard
// stop mid-waveform clicks.
const RELEASE_SECONDS = 0.012;

export interface ScheduledSound {
	/** Bundled audio-asset slug to play. */
	slug: string;
	/** Absolute start, seconds from composition start. */
	when: number;
	/**
	 * Cap on played length in seconds — manual cues and the bed stop at their
	 * authored window. Derived one-shots play out naturally (null).
	 */
	windowSeconds: number | null;
	gain: number;
	source: 'derived' | 'manual' | 'bed';
	cueId: string;
}

/**
 * The full mix schedule, sorted by time: every audible derived cue resolved
 * through its Layer's kit, plus every manual cue and the bed from
 * `audioCues[]`. Pure — this is the part of the §6 determinism contract that
 * is checkable without Web Audio.
 */
export function planAudioMix(state: EngineState): ScheduledSound[] {
	const duration = state.transport.durationSeconds;
	const plan: ScheduledSound[] = [];

	for (const cue of deriveSoundCues(state)) {
		if (!isAudibleSoundCue(cue)) {
			continue;
		}
		const slug = resolveCueSample(cue);
		if (slug === null) {
			continue;
		}
		plan.push({
			slug,
			when: cue.start * duration,
			windowSeconds: null,
			gain: 1,
			source: 'derived',
			cueId: cue.id
		});
	}

	for (const cue of state.audioCues) {
		plan.push({
			slug: cue.assetSlug,
			when: cue.start * duration,
			windowSeconds: cue.duration * duration,
			gain: cue.volume ?? 1,
			source: cue.kind === 'bed' ? 'bed' : 'manual',
			cueId: cue.id
		});
	}

	return plan.sort((a, b) => a.when - b.when || a.cueId.localeCompare(b.cueId));
}

/**
 * Render the composition's audio into one AudioBuffer
 * (AUDIO_MIX_SAMPLE_RATE, stereo, exactly the transport duration). Returns
 * null when the composition schedules no sound — a silent piece must not
 * grow a silent audio track on export. Sounds whose asset slug is unknown
 * resolve to silence with a console.error (the boot gate catches kit/core
 * slugs; this guards manual-cue typos).
 */
export async function renderAudioMix(state: EngineState): Promise<AudioBuffer | null> {
	const plan = planAudioMix(state);
	const duration = state.transport.durationSeconds;
	const playable = plan.filter((entry) => entry.when < duration);
	if (playable.length === 0) {
		return null;
	}

	const context = new OfflineAudioContext(
		AUDIO_MIX_CHANNELS,
		Math.ceil(duration * AUDIO_MIX_SAMPLE_RATE),
		AUDIO_MIX_SAMPLE_RATE
	);
	const master = context.createGain();
	master.gain.value = MASTER_GAIN;
	master.connect(context.destination);

	const slugs = [...new Set(playable.map((entry) => entry.slug))];
	const buffers = new Map<string, AudioBuffer>();
	await Promise.all(
		slugs.map(async (slug) => {
			const pending = loadSoundBuffer(slug, context);
			if (pending === null) {
				console.error(`Audio mix: unknown sound asset "${slug}"; scheduling silence.`);
				return;
			}
			buffers.set(slug, await pending);
		})
	);

	for (const entry of playable) {
		const buffer = buffers.get(entry.slug);
		if (!buffer) {
			continue;
		}

		const source = context.createBufferSource();
		source.buffer = buffer;
		const gainNode = context.createGain();
		gainNode.gain.value = entry.gain;
		source.connect(gainNode);
		gainNode.connect(master);

		const when = Math.max(0, entry.when);
		if (entry.windowSeconds !== null && buffer.duration > entry.windowSeconds) {
			const cutAt = when + entry.windowSeconds;
			gainNode.gain.setValueAtTime(entry.gain, Math.max(when, cutAt - RELEASE_SECONDS));
			gainNode.gain.linearRampToValueAtTime(0, cutAt);
			source.start(when, 0, entry.windowSeconds);
		} else {
			source.start(when);
		}
	}

	const rendered = await context.startRendering();

	let peak = 0;
	for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
		for (const sample of rendered.getChannelData(channel)) {
			peak = Math.max(peak, Math.abs(sample));
		}
	}
	if (peak > PEAK_CEILING) {
		const scale = PEAK_CEILING / peak;
		for (let channel = 0; channel < rendered.numberOfChannels; channel += 1) {
			const data = rendered.getChannelData(channel);
			for (let i = 0; i < data.length; i += 1) {
				data[i] *= scale;
			}
		}
	}

	return rendered;
}
