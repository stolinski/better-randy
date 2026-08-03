<script lang="ts" module>
	import { SvelteMap } from 'svelte/reactivity';

	import { loadSoundBuffer } from './audio-assets';
	import { waveformPeaksFromAudioBuffer } from '$lib/utils/audio-waveform';

	// One decode + downsample per sample slug, shared across every clip.
	const peakPromiseCache = new SvelteMap<string, Promise<Float32Array | null>>();

	function loadWaveformPeaks(slug: string): Promise<Float32Array | null> {
		let pending = peakPromiseCache.get(slug);
		if (!pending) {
			const decodeContext = new OfflineAudioContext(1, 1, 44100);
			const buffer = loadSoundBuffer(slug, decodeContext);
			pending = buffer
				? buffer.then((decoded) => waveformPeaksFromAudioBuffer(decoded, 96)).catch(() => null)
				: Promise.resolve(null);
			peakPromiseCache.set(slug, pending);
		}
		return pending;
	}
</script>

<script lang="ts">
	// The waveform inside a Sound-rail cue clip — real peaks from the bundled
	// sample, drawn as centered bars; redraws as the clip is trimmed/resized.
	interface Props {
		slug: string;
	}

	let { slug }: Props = $props();

	function attachWaveform(canvas: HTMLCanvasElement): () => void {
		let disposed = false;
		let peaks: Float32Array | null = null;

		function draw(): void {
			const width = canvas.clientWidth;
			const height = canvas.clientHeight;
			if (width === 0 || height === 0) return;
			const scale = window.devicePixelRatio || 1;
			canvas.width = Math.round(width * scale);
			canvas.height = Math.round(height * scale);
			const context = canvas.getContext('2d');
			if (!context) return;
			context.scale(scale, scale);
			context.clearRect(0, 0, width, height);
			if (!peaks) return;
			context.fillStyle = 'rgb(223 244 241 / 0.9)';
			const barStride = 3;
			const bars = Math.max(1, Math.floor(width / barStride));
			for (let bar = 0; bar < bars; bar++) {
				const peak = peaks[Math.min(peaks.length - 1, Math.floor((bar / bars) * peaks.length))];
				const barHeight = Math.max(1.5, peak * (height - 6));
				context.fillRect(bar * barStride, (height - barHeight) / 2, 2, barHeight);
			}
		}

		const observer = new ResizeObserver(draw);
		observer.observe(canvas);
		void loadWaveformPeaks(slug).then((loaded) => {
			if (disposed) return;
			peaks = loaded;
			draw();
		});
		return () => {
			disposed = true;
			observer.disconnect();
		};
	}
</script>

<canvas class="sound-clip-waveform" {@attach attachWaveform} aria-hidden="true"></canvas>

<style>
	.sound-clip-waveform {
		block-size: 100%;
		display: block;
		inline-size: 100%;
		pointer-events: none;
	}
</style>
