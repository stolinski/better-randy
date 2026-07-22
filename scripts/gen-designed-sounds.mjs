/**
 * Generate the DESIGNED engine-default samples (dex gmrkycs6) — the voice
 * behind `DEFAULT_EVENT_SAMPLES`, written to src/lib/assets/sounds/.
 * Quick decisive hits that read flat/physical (the syntax-overlay register):
 * tight thuds for landings, ~160 ms fwips for air, dry chip-pops, soft ticks,
 * a mech-keyboard thock for CTA presses. Replaces the desk-object/iMessage
 * samples that leaked into the general vocabulary (impact-book on every
 * landing, the Messages bloop on diagram nodes).
 *
 * Same discipline as gen-core-sounds.mjs: fully deterministic synthesis
 * (seeded noise, no Date/Math.random) — running twice produces byte-identical
 * files. Physical bodies come from modal synthesis (a few damped inharmonic
 * partials, the way real objects ring) instead of pure harmonic tones.
 *
 * The MIX HIERARCHY is baked into per-sample peak targets (derived cues play
 * at gain 1, audio-mix.ts): hits > pops/clicks > air/draws > ticks.
 *
 *   node scripts/gen-designed-sounds.mjs
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

// Chamberlin state-variable filter (same clamp as gen-core-sounds.mjs).
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

function render(duration, fill) {
	const n = Math.round(duration * SAMPLE_RATE);
	const out = new Float64Array(n);
	for (let i = 0; i < n; i += 1) {
		out[i] = fill(i / n, i / SAMPLE_RATE);
	}
	return out;
}

/**
 * Modal body — a sum of exponentially damped sine partials, the physical
 * signature of a struck object. `specs`: { freq (Hz), tau (s, exp decay
 * constant), level }. Inharmonic freq sets read wood/plastic; short taus keep
 * the hit decisive.
 */
function makeModes(specs) {
	const phases = specs.map(() => 0);
	return (tSec) => {
		let sum = 0;
		for (let i = 0; i < specs.length; i += 1) {
			phases[i] += specs[i].freq / SAMPLE_RATE;
			sum += Math.sin(TAU * phases[i]) * specs[i].level * Math.exp(-tSec / specs[i].tau);
		}
		return sum;
	};
}

// ---- Landings (the `impact` event — replaces impact-book on 36 presets) ----

// thud-solid: THE title-land. A knuckle on a solid desk — tight inharmonic
// knock over a short pitch-dropping punch. Nothing rings past 180 ms.
function thudSolid() {
	const noise = makeNoise(0x7d51d);
	const svf = makeSvf(0.9);
	const knock = makeModes([
		{ freq: 172, tau: 0.045, level: 1 },
		{ freq: 277, tau: 0.028, level: 0.55 },
		{ freq: 512, tau: 0.014, level: 0.3 },
		{ freq: 943, tau: 0.007, level: 0.16 }
	]);
	let punchPhase = 0;
	return render(0.18, (t, tSec) => {
		const freq = glide(96, 52, Math.min(1, t * 1.6));
		punchPhase += freq / SAMPLE_RATE;
		const punch = Math.sin(TAU * punchPhase) * Math.exp(-tSec / 0.055) * 0.9;
		const { low } = svf(noise(), 1100);
		const skin = tSec < 0.012 ? low * (1 - tSec / 0.012) * 0.5 : 0;
		return knock(tSec) + punch + skin;
	});
}

// thud-felt: the gentle landing — a felt mallet on a table. The felt damps
// the highs, so the attack is a "fuff", not a click.
function thudFelt() {
	const noise = makeNoise(0xfe17);
	const svf = makeSvf(0.8);
	const body = makeModes([
		{ freq: 121, tau: 0.06, level: 0.5 },
		{ freq: 193, tau: 0.035, level: 0.2 }
	]);
	let punchPhase = 0;
	return render(0.22, (t, tSec) => {
		const freq = glide(82, 48, Math.min(1, t * 1.4));
		punchPhase += freq / SAMPLE_RATE;
		const punch = Math.sin(TAU * punchPhase) * Math.exp(-tSec / 0.07);
		const { low } = svf(noise(), 450);
		const fuff = tSec < 0.018 ? low * (1 - tSec / 0.018) * 0.35 : 0;
		return punch + body(tSec) + fuff;
	});
}

// thud-deep: the hero landing — the solid knock (darker) plus a delayed sub
// tail: the impact, then the weight arriving.
function thudDeep() {
	const noise = makeNoise(0xdee9);
	const svf = makeSvf(0.9);
	const knock = makeModes([
		{ freq: 151, tau: 0.04, level: 1 },
		{ freq: 243, tau: 0.024, level: 0.5 },
		{ freq: 438, tau: 0.011, level: 0.24 }
	]);
	let subPhase = 0;
	return render(0.42, (t, tSec) => {
		const { low } = svf(noise(), 900);
		const skin = tSec < 0.01 ? low * (1 - tSec / 0.01) * 0.45 : 0;
		let sub = 0;
		if (tSec >= 0.008) {
			const ts = tSec - 0.008;
			const freq = glide(58, 34, Math.min(1, ts * 2.2));
			subPhase += freq / SAMPLE_RATE;
			sub = Math.sin(TAU * subPhase) * Math.exp(-ts / 0.14);
		}
		return knock(tSec) * 0.8 + sub + skin;
	});
}

// ---- Air (`whoosh-in` / `whoosh-out` — replaces the quick-whooshes) ----

// fwip-in: ~160 ms of wide-band air that CRESCENDOS to its end — the cue
// fires at the window start, so the air leads the element in and lands with
// it. Wide Q so it reads as fabric, never a whistle.
function fwipIn() {
	const noise = makeNoise(0xf1b1);
	const svf = makeSvf(0.85);
	const tipSvf = makeSvf(1.2);
	return render(0.16, (t) => {
		const cutoff = glide(400, 3200, t);
		const { band } = svf(noise(), cutoff);
		const { high } = tipSvf(noise(), 2000);
		const tip = high * 0.25 * Math.pow(t, 2);
		return (band + tip) * adEnvelope(t, 0.86, 1.7, 1);
	});
}

// fwip-out: the mirror — opens bright and falls away fast.
function fwipOut() {
	const noise = makeNoise(0xf0b7);
	const svf = makeSvf(0.85);
	return render(0.15, (t) => {
		const cutoff = glide(2800, 380, t);
		const { band } = svf(noise(), cutoff);
		return band * adEnvelope(t, 0.12, 1.2, 1.6);
	});
}

// fwip-soft-in / fwip-soft-out: the darker, gentler pair for secondary
// elements — same gesture, lower ceiling, quieter target.
function fwipSoftIn() {
	const noise = makeNoise(0x50f1);
	const svf = makeSvf(0.8);
	return render(0.17, (t) => {
		const cutoff = glide(300, 1400, t);
		const { band } = svf(noise(), cutoff);
		return band * adEnvelope(t, 0.82, 1.5, 1.1);
	});
}

function fwipSoftOut() {
	const noise = makeNoise(0x50f0);
	const svf = makeSvf(0.8);
	return render(0.16, (t) => {
		const cutoff = glide(1300, 300, t);
		const { band } = svf(noise(), cutoff);
		return band * adEnvelope(t, 0.14, 1.2, 1.5);
	});
}

// ---- Pops (the `pop` event — frees message-pop back to the iMessage
// surface, where it is locked at derivation) ----

// pop-chip: a dry chip planting — the diagram-node / badge arrival. Damped
// plastic modes + a tiny blip; deliberately NOT the Messages water-drop.
function popChip() {
	const noise = makeNoise(0x9c1b);
	const svf = makeSvf(1.6);
	const chip = makeModes([
		{ freq: 820, tau: 0.022, level: 1 },
		{ freq: 1290, tau: 0.014, level: 0.6 },
		{ freq: 2140, tau: 0.008, level: 0.35 }
	]);
	let blipPhase = 0;
	return render(0.07, (t, tSec) => {
		const freq = glide(430, 290, Math.min(1, t * 1.8));
		blipPhase += freq / SAMPLE_RATE;
		const blip = Math.sin(TAU * blipPhase) * Math.exp(-tSec / 0.018) * 0.5;
		const { high } = svf(noise(), 3000);
		const click = tSec < 0.002 ? high * 0.3 : 0;
		return chip(tSec) + blip + click;
	});
}

// pop-round: the warmer generic pop — a rounded blip with a soft body, for
// arrivals that want less percussion than the chip.
function popRound() {
	const noise = makeNoise(0x90fd);
	const svf = makeSvf(0.9);
	const body = makeModes([{ freq: 640, tau: 0.025, level: 0.3 }]);
	let phase = 0;
	return render(0.09, (t, tSec) => {
		const freq = glide(520, 320, t);
		phase += freq / SAMPLE_RATE;
		const blip = Math.sin(TAU * phase) * adEnvelope(t, 0.06, 1, 2);
		const { low } = svf(noise(), 700);
		const breath = tSec < 0.005 ? low * 0.2 : 0;
		return blip + body(tSec) + breath;
	});
}

// ---- Ticks (the `tick` event — per-character builds fire dozens of these,
// so the default is SOFT; tick-snap is the single-accent variant) ----

function tickSoft() {
	const noise = makeNoise(0x71c5);
	const svf = makeSvf(2);
	let phase = 0;
	return render(0.02, (t, tSec) => {
		phase += 1350 / SAMPLE_RATE;
		const ping = Math.sin(TAU * phase) * Math.exp(-tSec / 0.006) * 0.7;
		const { high } = svf(noise(), 2400);
		const snap = high * Math.exp(-tSec / 0.003) * 0.4;
		return ping + snap;
	});
}

function tickSnap() {
	const noise = makeNoise(0x75a9);
	const svf = makeSvf(2.2);
	let phase = 0;
	return render(0.035, (t, tSec) => {
		phase += 2400 / SAMPLE_RATE;
		const ping = Math.sin(TAU * phase) * Math.exp(-tSec / 0.008);
		const { high } = svf(noise(), 3200);
		const snap = high * Math.exp(-tSec / 0.004) * 0.6;
		return ping * 0.7 + snap;
	});
}

// ---- Press (the `click` event — the creator-CTA press beat) ----

// click-thock: a mechanical-keyboard thock — deeper and rounder than
// core-click: broadband down-snap into a damped 620 Hz body, with a lighter
// up-click answering at 34 ms.
function clickThock() {
	const noise = makeNoise(0xc10c);
	const svf = makeSvf(1.7);
	const down = makeModes([
		{ freq: 620, tau: 0.02, level: 0.85 },
		{ freq: 940, tau: 0.012, level: 0.3 }
	]);
	const up = makeModes([{ freq: 780, tau: 0.014, level: 0.4 }]);
	return render(0.08, (t, tSec) => {
		const { high } = svf(noise(), 3400);
		const snap = tSec < 0.0025 ? high * 0.9 : 0;
		let answer = 0;
		if (tSec >= 0.034) {
			const tu = tSec - 0.034;
			answer = up(tu) + (tu < 0.0015 ? high * 0.25 : 0);
		}
		return snap + down(tSec) + answer;
	});
}

// ---- Draw (the new `draw` event — diagram stroke draw-ons; a clean line
// sweeping a technical canvas, distinct from the paper-grain pencil) ----

function drawSlide() {
	const noise = makeNoise(0xd5a4);
	const grain = makeNoise(0x6b2f);
	const svf = makeSvf(1);
	const grainSvf = makeSvf(0.7);
	return render(0.2, (t) => {
		const cutoff = 650 + 1000 * Math.sin(Math.PI * Math.min(1, t * 1.2)) + 330 * t;
		const { band } = svf(noise(), cutoff);
		const { low } = grainSvf(grain(), 40);
		const texture = 0.85 + 0.15 * Math.abs(low * 8);
		return band * texture * adEnvelope(t, 0.5, 1.4, 1.4);
	});
}

// ---- Send (the `send` event's engine default — a departure whip; the
// Apple send swish stays locked to the iMessage surface) ----

function swishSend() {
	const noise = makeNoise(0x5e4d);
	const svf = makeSvf(0.9);
	return render(0.17, (t) => {
		const cutoff = glide(500, 2900, t);
		const { band } = svf(noise(), cutoff);
		return band * adEnvelope(t, 0.3, 1.3, 1.5);
	});
}

// ---- WAV writing (mono 16-bit PCM) ----

// Peak targets carry the mix hierarchy (derived cues play at gain 1):
// hits land hard, pops/clicks sit under them, air and draws support, ticks
// stay small (per-character builds fire dozens).
function normalize(samples, peakTarget) {
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

// A 3 ms linear tail-out so no sample ends off-zero (buffer-edge click).
function fadeTail(samples, ms = 3) {
	const n = Math.min(samples.length, Math.round((ms / 1000) * SAMPLE_RATE));
	for (let i = 0; i < n; i += 1) {
		samples[samples.length - 1 - i] *= i / n;
	}
	return samples;
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

const DESIGNED_SOUNDS = {
	'thud-solid': { synth: thudSolid, peak: 0.92 },
	'thud-felt': { synth: thudFelt, peak: 0.8 },
	'thud-deep': { synth: thudDeep, peak: 0.95 },
	'fwip-in': { synth: fwipIn, peak: 0.55 },
	'fwip-out': { synth: fwipOut, peak: 0.55 },
	'fwip-soft-in': { synth: fwipSoftIn, peak: 0.42 },
	'fwip-soft-out': { synth: fwipSoftOut, peak: 0.42 },
	'pop-chip': { synth: popChip, peak: 0.72 },
	'pop-round': { synth: popRound, peak: 0.66 },
	'tick-soft': { synth: tickSoft, peak: 0.5 },
	'tick-snap': { synth: tickSnap, peak: 0.66 },
	'click-thock': { synth: clickThock, peak: 0.8 },
	'draw-slide': { synth: drawSlide, peak: 0.5 },
	'swish-send': { synth: swishSend, peak: 0.5 }
};

await mkdir(OUT_DIR, { recursive: true });
for (const [slug, { synth, peak }] of Object.entries(DESIGNED_SOUNDS)) {
	const wav = toWav(fadeTail(normalize(synth(), peak)));
	const path = resolve(OUT_DIR, `${slug}.wav`);
	await writeFile(path, wav);
	console.log(`Wrote ${path} (${wav.length} bytes)`);
}
