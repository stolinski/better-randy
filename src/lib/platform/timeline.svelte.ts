export type TimelineTick = (timestamp: number) => void;

export interface TimelineOptions {
	durationSeconds: number;
	fps: number;
	loop?: boolean;
	tick: TimelineTick;
}

export interface TimelineSelection {
	trackId: string;
	transitionId: string | null;
}

export class Timeline {
	time = $state(0);
	isPlaying = $state(false);
	durationSeconds = $state(0);
	fps = $state(30);
	loop = $state(true);
	selection = $state<TimelineSelection | null>(null);

	#tick: TimelineTick;
	#rafId: number | null = null;
	#playStartedAt = 0;
	#playStartedFrom = 0;

	constructor(options: TimelineOptions) {
		this.durationSeconds = options.durationSeconds;
		this.fps = options.fps;
		this.loop = options.loop ?? true;
		this.#tick = options.tick;
	}

	seek(timestamp: number): void {
		const clamped = Math.max(0, Math.min(timestamp, this.durationSeconds));

		this.time = clamped;
		this.#tick(clamped);
	}

	stepFrames(frames: number): void {
		this.seek(this.time + frames / this.fps);
	}

	play(): void {
		if (this.isPlaying) {
			return;
		}

		if (this.time >= this.durationSeconds) {
			this.time = 0;
		}

		this.isPlaying = true;
		this.#playStartedAt = performance.now();
		this.#playStartedFrom = this.time;
		this.#rafId = requestAnimationFrame(this.#loop);
	}

	pause(): void {
		this.isPlaying = false;

		if (this.#rafId !== null) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = null;
		}
	}

	toggle(): void {
		if (this.isPlaying) {
			this.pause();
		} else {
			this.play();
		}
	}

	selectTransition(trackId: string, transitionId: string): void {
		this.selection = { trackId, transitionId };
	}

	clearSelection(): void {
		this.selection = null;
	}

	dispose(): void {
		this.pause();
	}

	seekProgress(progress: number): void {
		this.seek(Math.max(0, Math.min(progress, 1)) * this.durationSeconds);
	}

	#loop = (now: number): void => {
		if (!this.isPlaying) {
			return;
		}

		const elapsed = (now - this.#playStartedAt) / 1000;
		const next = Math.min(this.#playStartedFrom + elapsed, this.durationSeconds);

		this.time = next;
		this.#tick(next);

		if (next >= this.durationSeconds) {
			if (this.loop && this.durationSeconds > 0) {
				this.#playStartedAt = now;
				this.#playStartedFrom = 0;
				this.time = 0;
				this.#tick(0);
				this.#rafId = requestAnimationFrame(this.#loop);
				return;
			}

			this.pause();
			return;
		}

		this.#rafId = requestAnimationFrame(this.#loop);
	};
}

declare global {
	interface Window {
		__hivizTimeline?: Timeline;
		// DOF verification seam (ADR-0027): present a single depth plane in
		// isolation instead of the back-to-front composite. Only consulted while a
		// `depth-of-field` Effect is active.
		__hivizDofPreviewPlane?: 'surface' | 'overlay' | 'composite';
	}
}
