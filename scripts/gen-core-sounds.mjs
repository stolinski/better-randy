/**
 * Generate the engine-pinned CORE sound samples (ADR-0033 §7/§8) — one WAV per
 * core sound event, written to src/lib/assets/sounds/. Fully deterministic
 * synthesis (seeded noise, no Date/Math.random): running this script twice
 * produces byte-identical files, the audio analog of gen-synthetic-substrate.
 * These are the ADR-0024 core-fallback samples every kit resolves through for
 * events it doesn't cover; designed kits (by-ear, dex r9tbnnkh) layer on top.
 *
 *   node scripts/gen-core-sounds.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(here, '../src/lib/assets/sounds');

const SAMPLE_RATE = 48000;
const TAU = Math.PI * 2;

// Deterministic uniform noise in [-1, 1) — LCG, fixed seed per sound.
function makeNoise(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 2147483648 - 1;
	};
}

// Chamberlin state-variable filter. `cutoff` (Hz) may vary per sample for
// sweeps; clamped well under Nyquist for stability. Returns the band-pass tap
// makers we use (band for whooshes, low for thumps, high for ticks).
function makeSvf(q) {
	let low = 0;
	let band = 0;
	const damp = 1 / q;
	return (input, cutoff) => {
		const f = 2 * Math.sin((Math.PI * Math.min(cutoff, SAMPLE_RATE / 6.5)) / SAMPLE_RATE);
		const high = input - low - damp * band;
		band += f * high;
		low += f * band;
		return { low, band, high };
	};
}

/** Exponential glide from `from` to `to` over t ∈ [0,1]. */
const glide = (from, to, t) => from * Math.pow(to / from, t);

/** Attack/decay envelope: rises over [0, peakAt], falls to 0 at 1. */
function adEnvelope(t, peakAt, riseShape = 1, fallShape = 1) {
	if (t <= peakAt) {
		return Math.pow(t / peakAt, riseShape);
	}
	return Math.pow(1 - (t - peakAt) / (1 - peakAt), fallShape);
}

function seconds(duration) {
	return Math.round(duration * SAMPLE_RATE);
}

function render(duration, fill) {
	const n = seconds(duration);
	const out = new Float64Array(n);
	for (let i = 0; i < n; i += 1) {
		out[i] = fill(i / n, i);
	}
	return out;
}

// ---- The seven core sounds ----

// whoosh-in: band-swept noise that CRESCENDOS toward its end — the cue fires
// at the motion's window start, so the air leads the element in and lands
// with it.
function whooshIn() {
	const noise = makeNoise(0x51a11);
	const svf = makeSvf(1.1);
	return render(0.38, (t) => {
		const cutoff = glide(280, 2200, t);
		const { band } = svf(noise(), cutoff);
		return band * adEnvelope(t, 0.78, 1.6, 1.2);
	});
}

// whoosh-out: the mirror — opens bright and falls away with the exit.
function whooshOut() {
	const noise = makeNoise(0x0f7);
	const svf = makeSvf(1.1);
	return render(0.34, (t) => {
		const cutoff = glide(2000, 260, t);
		const { band } = svf(noise(), cutoff);
		return band * adEnvelope(t, 0.16, 1.2, 1.5);
	});
}

// impact: a low sine thump with a short noise transient — the settle of a
// drop (fires at the window end, ARRIVAL_EVENTS in sound-cues.ts).
function impact() {
	const noise = makeNoise(0x13ac7);
	const svf = makeSvf(0.8);
	let phase = 0;
	return render(0.42, (t) => {
		const freq = glide(110, 44, Math.min(1, t * 3));
		phase += freq / SAMPLE_RATE;
		const thump = Math.sin(TAU * phase) * Math.pow(1 - t, 2.6);
		const { low } = svf(noise(), 900);
		const transient = t < 0.03 ? low * (1 - t / 0.03) * 1.4 : 0;
		return thump * 0.95 + transient;
	});
}

// tick: a 25 ms damped high click — one per mark draw-on / kinetic beat.
function tick() {
	const noise = makeNoise(0x71c4);
	const svf = makeSvf(2.2);
	let phase = 0;
	return render(0.025, (t) => {
		phase += 1900 / SAMPLE_RATE;
		const ping = Math.sin(TAU * phase) * Math.pow(1 - t, 3.5);
		const { high } = svf(noise(), 2600);
		const snap = high * Math.pow(1 - t, 6) * 0.7;
		return ping * 0.6 + snap;
	});
}

// pop: a fast downward pitch blip — the chat-bubble arrival.
function pop() {
	let phase = 0;
	return render(0.09, (t) => {
		const freq = glide(560, 240, t);
		phase += freq / SAMPLE_RATE;
		return Math.sin(TAU * phase) * adEnvelope(t, 0.08, 1, 2.2);
	});
}

// sub-drop: a long low glide with a slow fade — weight under a big landing.
function subDrop() {
	let phase = 0;
	return render(0.7, (t) => {
		const freq = glide(110, 36, t);
		phase += freq / SAMPLE_RATE;
		return Math.sin(TAU * phase) * adEnvelope(t, 0.06, 1, 1.4);
	});
}

// sting: a short three-partial chord with air — an accent, not a jingle.
function sting() {
	const noise = makeNoise(0x5717);
	const svf = makeSvf(1.4);
	const partials = [220, 330, 554.37]; // A3, E4, C#5 — open, unresolved
	const phases = partials.map(() => 0);
	return render(0.85, (t) => {
		let tone = 0;
		for (let i = 0; i < partials.length; i += 1) {
			phases[i] += partials[i] / SAMPLE_RATE;
			tone += Math.sin(TAU * phases[i]) * (1 - i * 0.22);
		}
		tone /= partials.length;
		const { band } = svf(noise(), 3400);
		const air = band * 0.12;
		return (tone + air) * adEnvelope(t, 0.045, 1.2, 2.4);
	});
}

// ---- WAV writing (mono 16-bit PCM) ----

function normalize(samples, peakTarget = 0.89) {
	let peak = 0;
	for (const sample of samples) {
		peak = Math.max(peak, Math.abs(sample));
	}
	if (peak === 0) {
		throw new Error('Refusing to write a silent sample');
	}
	const gain = peakTarget / peak;
	return samples.map((sample) => sample * gain);
}

function toWav(samples) {
	const dataLength = samples.length * 2;
	const buffer = Buffer.alloc(44 + dataLength);
	buffer.write('RIFF', 0);
	buffer.writeUInt32LE(36 + dataLength, 4);
	buffer.write('WAVE', 8);
	buffer.write('fmt ', 12);
	buffer.writeUInt32LE(16, 16); // PCM chunk size
	buffer.writeUInt16LE(1, 20); // PCM
	buffer.writeUInt16LE(1, 22); // mono
	buffer.writeUInt32LE(SAMPLE_RATE, 24);
	buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
	buffer.writeUInt16LE(2, 32); // block align
	buffer.writeUInt16LE(16, 34); // bits per sample
	buffer.write('data', 36);
	buffer.writeUInt32LE(dataLength, 40);
	samples.forEach((sample, i) => {
		const clamped = Math.max(-1, Math.min(1, sample));
		buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
	});
	return buffer;
}

const CORE_SOUNDS = {
	'core-whoosh-in': whooshIn,
	'core-whoosh-out': whooshOut,
	'core-impact': impact,
	'core-tick': tick,
	'core-pop': pop,
	'core-sub-drop': subDrop,
	'core-sting': sting
};

await mkdir(OUT_DIR, { recursive: true });
for (const [slug, synth] of Object.entries(CORE_SOUNDS)) {
	const wav = toWav(normalize(synth()));
	const path = resolve(OUT_DIR, `${slug}.wav`);
	await writeFile(path, wav);
	console.log(`Wrote ${path} (${wav.length} bytes)`);
}
