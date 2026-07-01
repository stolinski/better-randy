/**
 * Real-time preview audio (ADR-0033 §6): cues schedule through Web Audio while
 * the timeline PLAYS; scrub is silent; pause cancels everything scheduled.
 * Playback-only — the exported track always comes from the deterministic
 * offline mix (`audio-mix.ts`), never from here. Preview mirrors the mix's
 * master headroom but skips its post-render peak-normalize: an un-exported
 * approximation, exactly like dropped-frame preview pixels.
 */
import { loadSoundBuffer } from './audio-assets';
import { planAudioMix } from './audio-mix.ts';
import type { EngineState } from './engine-schema';

const MASTER_GAIN = 0.8;
// Small offset between "now" and the first schedulable sample so cues at the
// playhead itself don't land in the past while the graph spins up.
const SCHEDULE_HEADROOM_SECONDS = 0.03;

export class AudioPreview {
	#context: AudioContext | null = null;
	#master: GainNode | null = null;
	#active: AudioBufferSourceNode[] = [];
	#generation = 0;

	/**
	 * Schedule the composition's cues from the current playhead onward. Called
	 * on play (a user gesture, satisfying the autoplay policy) and again on
	 * each loop wrap. Sounds already mid-window at the playhead (a bed, a long
	 * tail) start partway through; everything earlier is skipped.
	 */
	async start(state: EngineState, getPlayheadSeconds: () => number): Promise<void> {
		this.stop();
		const generation = ++this.#generation;

		const context = (this.#context ??= new AudioContext());
		if (!this.#master) {
			this.#master = context.createGain();
			this.#master.gain.value = MASTER_GAIN;
			this.#master.connect(context.destination);
		}
		if (context.state === 'suspended') {
			await context.resume();
		}

		const plan = planAudioMix(state);
		const buffers = new Map<string, AudioBuffer>();
		await Promise.all(
			[...new Set(plan.map((entry) => entry.slug))].map(async (slug) => {
				const pending = loadSoundBuffer(slug, context);
				if (pending === null) {
					console.error(`Preview audio: unknown sound asset "${slug}"; skipping.`);
					return;
				}
				buffers.set(slug, await pending);
			})
		);
		if (generation !== this.#generation) {
			// Paused or re-played while samples were decoding — this pass is stale.
			return;
		}

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
			gain.connect(this.#master);
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

	/** Cancel everything scheduled; also invalidates any in-flight start(). */
	stop(): void {
		this.#generation += 1;
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
