/**
 * Deterministic offline audio mix (ADR-0033 §6). The export's audio track is
 * a pure function of {derived motion cues + manual cues + bed + resolved samples +
 * duration}: `planAudioMix` computes the schedule (pure, node-testable) and
 * `renderAudioMix` realizes it through an `OfflineAudioContext` at fixed
 * sample positions — no wall-clock anywhere, so the same composition renders
 * a byte-identical buffer every run. Preview playback (real-time, scrub
 * silent) is a separate concern and does NOT go through this module.
 */
import { loadSoundBuffer } from './audio-assets';
import type { EngineState } from './engine-schema';
import { deriveSoundCues, isAudibleSoundCue, resolveCueSample } from './sound-cues.ts';

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
 * through its per-motion override or the engine event default, plus every
 * manual cue and the bed from `audioCues[]`. Pure — this is the part of the §6
 * determinism contract that is checkable without Web Audio.
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
 * resolve to silence with a console.error (the boot gate catches engine-default
 * and signature samples; this guards authored asset typos).
 */
export async function renderAudioMix(state: EngineState): Promise<AudioBuffer | null> {
	const plan = planAudioMix(state);
	const duration = state.transport.durationSeconds;
	const playable = plan.filter((entry) => entry.when < duration);
	if (playable.length === 0) {
		return null;
	}

	// Web Audio is used ONLY to decode (resampled to the mix rate). The
	// summing itself is plain JS in fixed plan order — an OfflineAudioContext
	// graph sums overlapping sources in unspecified order, and float addition
	// is non-associative, so three-plus overlapping cues broke byte-identity
	// by ±1 ULP. Hand-mixing keeps the §6 contract literal: same inputs →
	// same bytes.
	const context = new OfflineAudioContext(AUDIO_MIX_CHANNELS, 1, AUDIO_MIX_SAMPLE_RATE);
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

	const frameCount = Math.ceil(duration * AUDIO_MIX_SAMPLE_RATE);
	const channels = [new Float32Array(frameCount), new Float32Array(frameCount)];
	const releaseFrames = Math.round(RELEASE_SECONDS * AUDIO_MIX_SAMPLE_RATE);

	for (const entry of playable) {
		const buffer = buffers.get(entry.slug);
		if (!buffer) {
			continue;
		}

		const startFrame = Math.round(Math.max(0, entry.when) * AUDIO_MIX_SAMPLE_RATE);
		const windowFrames =
			entry.windowSeconds !== null
				? Math.round(entry.windowSeconds * AUDIO_MIX_SAMPLE_RATE)
				: buffer.length;
		const playFrames = Math.min(buffer.length, windowFrames, frameCount - startFrame);
		if (playFrames <= 0) {
			continue;
		}
		// Release ramp only when the window cuts the sample early — a hard stop
		// mid-waveform clicks; a sample playing out (or hitting the piece's own
		// end) keeps its natural tail.
		const cutEarly = entry.windowSeconds !== null && buffer.length > windowFrames;
		const rampStart = cutEarly ? Math.max(0, playFrames - releaseFrames) : playFrames;

		for (let channel = 0; channel < AUDIO_MIX_CHANNELS; channel += 1) {
			const out = channels[channel];
			// Mono samples feed both output channels; stereo maps per channel.
			const src = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
			for (let i = 0; i < playFrames; i += 1) {
				const release = i >= rampStart ? 1 - (i - rampStart) / (playFrames - rampStart) : 1;
				out[startFrame + i] += src[i] * entry.gain * MASTER_GAIN * release;
			}
		}
	}

	let peak = 0;
	for (const data of channels) {
		for (const sample of data) {
			peak = Math.max(peak, Math.abs(sample));
		}
	}
	if (peak > PEAK_CEILING) {
		const scale = PEAK_CEILING / peak;
		for (const data of channels) {
			for (let i = 0; i < data.length; i += 1) {
				data[i] *= scale;
			}
		}
	}

	const rendered = new AudioBuffer({
		length: frameCount,
		numberOfChannels: AUDIO_MIX_CHANNELS,
		sampleRate: AUDIO_MIX_SAMPLE_RATE
	});
	rendered.copyToChannel(channels[0], 0);
	rendered.copyToChannel(channels[1], 1);
	return rendered;
}
