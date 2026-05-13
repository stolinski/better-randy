import gsap from 'gsap';

export interface AnimationTweenSpec {
	key: string;
	start: number;
	duration: number;
	ease: string;
	onUpdate: (value: number) => void;
}

export interface AnimationManifest {
	tweens: readonly AnimationTweenSpec[];
}

function computeFingerprint(manifest: AnimationManifest): string {
	return manifest.tweens
		.map((tween) => `${tween.key}|${tween.start}|${tween.duration}|${tween.ease}`)
		.join(';');
}

export class AnimationManager {
	#timeline: gsap.core.Timeline | null = null;
	#fingerprint = '';
	#liveTweens: AnimationTweenSpec[] = [];

	rebuild(manifest: AnimationManifest): void {
		const nextFingerprint = computeFingerprint(manifest);

		if (nextFingerprint === this.#fingerprint && this.#timeline) {
			this.#liveTweens = manifest.tweens.slice();
			return;
		}

		this.#timeline?.kill();
		this.#liveTweens = manifest.tweens.slice();

		const tl = gsap.timeline({ paused: true });

		for (const tween of this.#liveTweens) {
			tween.onUpdate(0);

			const target = { value: 0 };
			const liveTween = tween;

			tl.to(
				target,
				{
					value: 1,
					duration: tween.duration,
					ease: tween.ease,
					onUpdate: () => liveTween.onUpdate(target.value)
				},
				tween.start
			);
		}

		tl.set({}, {}, 1);

		this.#timeline = tl;
		this.#fingerprint = nextFingerprint;
	}

	progress(fraction: number): void {
		if (!this.#timeline) {
			return;
		}

		const clamped = Math.max(0, Math.min(fraction, 1));

		this.#timeline.progress(clamped);
	}

	dispose(): void {
		this.#timeline?.kill();
		this.#timeline = null;
		this.#fingerprint = '';
		this.#liveTweens = [];
	}
}
