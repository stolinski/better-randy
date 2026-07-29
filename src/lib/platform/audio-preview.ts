/**
 * Timeline-play preview audio (ADR-0033 §6). Video-audio compositions play
 * the same deterministic final mix used by export; cue-only compositions keep
 * the low-latency per-cue Web Audio scheduler. Scrub remains silent because
 * only Timeline play/loop calls start; pause aborts decode and stops sources.
 */
import { resolveFrameRate, secondsToFrames } from '$lib/utils/composition-timing';

import { loadSoundBuffer } from './audio-assets';
import {
	hasAudibleVideoClipAudio,
	planAudioMix,
	renderAudioMix,
	type AudioMixRenderRequest
} from './audio-mix.ts';
import type { EngineState } from './engine-schema';

const MASTER_GAIN = 0.8;
// Small offset between "now" and the first schedulable sample so cues at the
// playhead itself don't land in the past while the graph spins up.
const SCHEDULE_HEADROOM_SECONDS = 0.03;

export interface AudioPreviewServices {
	createAudioContext(): AudioContext;
	loadCueBuffer(slug: string, context: BaseAudioContext): Promise<AudioBuffer> | null;
	renderMixedAudio(request: AudioMixRenderRequest): Promise<AudioBuffer | null>;
}

const DEFAULT_AUDIO_PREVIEW_SERVICES: AudioPreviewServices = {
	createAudioContext: () => new AudioContext(),
	loadCueBuffer: loadSoundBuffer,
	renderMixedAudio: renderAudioMix
};

export class AudioPreview {
	readonly #services: AudioPreviewServices;
	#context: AudioContext | null = null;
	#master: GainNode | null = null;
	#active: AudioBufferSourceNode[] = [];
	#activeStartAbortController: AbortController | null = null;
	#generation = 0;

	constructor(services: AudioPreviewServices = DEFAULT_AUDIO_PREVIEW_SERVICES) {
		this.#services = services;
	}

	/**
	 * Schedule the composition's cues from the current playhead onward. Called
	 * on play (a user gesture, satisfying the autoplay policy) and again on
	 * each loop wrap. Sounds already mid-window at the playhead (a bed, a long
	 * tail) start partway through; everything earlier is skipped.
	 */
	async start(state: EngineState, getPlayheadSeconds: () => number): Promise<void> {
		this.stop();
		const generation = ++this.#generation;
		const abortController = new AbortController();
		const { signal } = abortController;
		this.#activeStartAbortController = abortController;

		const context = (this.#context ??= this.#services.createAudioContext());
		if (!this.#master) {
			this.#master = context.createGain();
			this.#master.gain.value = MASTER_GAIN;
			this.#master.connect(context.destination);
		}
		try {
			if (context.state === 'suspended') {
				await context.resume();
			}
			signal.throwIfAborted();
			if (hasAudibleVideoClipAudio(state)) {
				await this.#startMixedAudio(state, getPlayheadSeconds, context, generation, signal);
			} else {
				await this.#startCueAudio(state, getPlayheadSeconds, context, generation, signal);
			}
		} catch (error) {
			if (signal.aborted || generation !== this.#generation) return;
			throw error;
		} finally {
			if (this.#activeStartAbortController === abortController) {
				this.#activeStartAbortController = null;
			}
		}
	}

	async #startCueAudio(
		state: EngineState,
		getPlayheadSeconds: () => number,
		context: AudioContext,
		generation: number,
		signal: AbortSignal
	): Promise<void> {
		const plan = planAudioMix(state);
		const buffers = new Map<string, AudioBuffer>();
		await Promise.all(
			[...new Set(plan.map((entry) => entry.slug))].map(async (slug) => {
				signal.throwIfAborted();
				const pending = this.#services.loadCueBuffer(slug, context);
				if (pending === null) {
					console.error(`Preview audio: unknown sound asset "${slug}"; skipping.`);
					return;
				}
				buffers.set(slug, await pending);
			})
		);
		if (signal.aborted || generation !== this.#generation) {
			// Paused or re-played while samples were decoding — this pass is stale.
			return;
		}

		const master = this.#master;
		if (!master) throw new Error('Preview audio master gain is unavailable.');
		const playhead = getPlayheadSeconds();
		const base = context.currentTime + SCHEDULE_HEADROOM_SECONDS;

		for (const entry of plan) {
			const buffer = buffers.get(entry.slug);
			if (!buffer) {
				continue;
			}

			const playableSeconds =
				entry.windowSeconds !== null
					? Math.min(entry.windowSeconds, buffer.duration)
					: buffer.duration;
			const elapsed = playhead - entry.when;

			const gain = context.createGain();
			gain.gain.value = entry.gain;
			gain.connect(master);
			const source = context.createBufferSource();
			source.buffer = buffer;
			source.connect(gain);

			if (elapsed <= 0) {
				const when = base - elapsed;
				if (entry.windowSeconds !== null && buffer.duration > entry.windowSeconds) {
					source.start(when, 0, entry.windowSeconds);
				} else {
					source.start(when);
				}
			} else if (elapsed < playableSeconds) {
				source.start(base, elapsed, playableSeconds - elapsed);
			} else {
				continue;
			}

			this.#active.push(source);
			source.onended = () => {
				const index = this.#active.indexOf(source);
				if (index >= 0) {
					this.#active.splice(index, 1);
				}
			};
		}
	}

	async #startMixedAudio(
		state: EngineState,
		getPlayheadSeconds: () => number,
		context: AudioContext,
		generation: number,
		signal: AbortSignal
	): Promise<void> {
		const frameRate = resolveFrameRate(state.transport.fps);
		const frameCount = Math.max(1, secondsToFrames(state.transport.durationSeconds, frameRate));
		const buffer = await this.#services.renderMixedAudio({
			state,
			frameCount,
			frameRate,
			signal
		});
		if (!buffer || signal.aborted || generation !== this.#generation) return;

		const playhead = Math.max(0, getPlayheadSeconds());
		if (playhead >= buffer.duration) return;
		const source = context.createBufferSource();
		source.buffer = buffer;
		// renderAudioMix already contains clip gain, cue headroom, and the final
		// peak policy; a second master gain here would diverge preview from export.
		source.connect(context.destination);
		source.start(
			context.currentTime + SCHEDULE_HEADROOM_SECONDS,
			playhead,
			buffer.duration - playhead
		);
		this.#trackSource(source);
	}

	#trackSource(source: AudioBufferSourceNode): void {
		this.#active.push(source);
		source.onended = () => {
			const index = this.#active.indexOf(source);
			if (index >= 0) this.#active.splice(index, 1);
		};
	}

	/** Cancel everything scheduled; also invalidates any in-flight start(). */
	stop(): void {
		this.#generation += 1;
		this.#activeStartAbortController?.abort();
		this.#activeStartAbortController = null;
		for (const source of this.#active.splice(0)) {
			try {
				source.stop();
			} catch {
				// Already ended — stop() on a finished source throws in some engines.
			}
		}
	}

	dispose(): void {
		this.stop();
		if (this.#context) {
			void this.#context.close();
		}
		this.#context = null;
		this.#master = null;
	}
}
