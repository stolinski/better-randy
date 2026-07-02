/**
 * Derived sound cues (ADR-0033 §2, §4). Motion primitives emit semantic sound
 * events at their own frame — automatic cues are a pure function of the
 * composition's motion, DERIVED here at render time and never stored in
 * `audioCues[]`, so they stay welded to the motion through every re-time and
 * reflow. Consumers: the offline export mix, the playback-only preview
 * scheduler, and the timeline's audio-cue rail. Pure / deterministic — no
 * Svelte, no DOM.
 */
import { messageEnter } from '../pipelines/surfaces/imessage/schedule.ts';
import { EFFECT_CATALOG } from '../text-animations/catalog.ts';

import {
	listMarkInstances,
	resolveMarkForIndex,
	type EngineState,
	type SoundEvent,
	type SoundOverride
} from './engine-schema.ts';

/**
 * The Layer that emitted a cue — the cue resolves through THIS Layer's Sound
 * kit (ADR-0033 §3). Text animations resolve through their target Layer;
 * chat-bubble pops through the `imessage` Surface.
 */
export type SoundCueLayer =
	| { kind: 'surface' }
	| { kind: 'marks' }
	| { kind: 'overlay'; overlayId: string };

export interface DerivedSoundCue {
	/** Stable per-motion-beat id, e.g. `surface:enter`, `overlay:badge:exit`, `mark:2`. */
	id: string;
	layer: SoundCueLayer;
	event: SoundEvent;
	/** Timeline fraction — the motion's own frame. */
	start: number;
	/** The emitting Layer's Sound kit; null = the Layer wears no kit (silent). */
	kit: string | null;
	/** Locked audio-asset slug from the per-motion override — bypasses kit resolution. */
	sample?: string;
	muted: boolean;
}

/**
 * Default primitive → event mapping (ADR-0033 §2, §8). The per-motion
 * `sound.event` override swaps an individual motion away from these.
 * Per-character text effects tick (the kinetic-build sound); everything else
 * whooshes in/out with its window, and chat bubbles pop.
 */
export const MOTION_SOUND_DEFAULTS = {
	surfaceEnter: 'whoosh-in',
	surfaceExit: 'whoosh-out',
	overlayEnter: 'whoosh-in',
	overlayExit: 'whoosh-out',
	textEnter: 'whoosh-in',
	textEnterPerCharacter: 'tick',
	textExit: 'whoosh-out',
	mark: 'tick',
	message: 'pop'
} as const satisfies Record<string, SoundEvent>;

// Arrival-flavoured events mark a landing, not a launch — they fire at the
// window's settle (start + duration), the "impact at a card-drop's settle" of
// ADR-0033 §2. Everything else leads the motion from its window start.
const ARRIVAL_EVENTS: ReadonlySet<SoundEvent> = new Set(['impact', 'sub-drop']);

// Motion-character defaults per Overlay type (ADR-0033 §2: WHICH event is
// intrinsic to the motion, owned by the Pipeline). A whoosh means something
// crossing space — types whose motion doesn't displace air (a press-on, a
// fade, a glide) emit NOTHING by default; their sound is opt-in per motion
// through the `sound.event` / `sound.sample` override. Unlisted types keep
// the generic slide semantics (whoosh with the window).
const OVERLAY_EVENT_DEFAULTS: Record<
	string,
	{ enter: SoundEvent | null; exit: SoundEvent | null }
> = {
	// Tape is pressed on / peeled off — nothing flies.
	'washi-tape': { enter: null, exit: null },
	// A watermark fades — silent.
	watermark: { enter: null, exit: null },
	// The cursor glides; its dwells are the story, not air displacement.
	'cursor-trail': { enter: null, exit: null }
};

interface MotionWindow {
	start: number;
	duration: number;
}

function cueFrom(
	id: string,
	layer: SoundCueLayer,
	defaultEvent: SoundEvent,
	window: MotionWindow,
	kit: string | null,
	override: SoundOverride | undefined
): DerivedSoundCue {
	const event = override?.event ?? defaultEvent;
	const start = ARRIVAL_EVENTS.has(event)
		? Math.min(1, window.start + window.duration)
		: window.start;

	const cue: DerivedSoundCue = {
		id,
		layer,
		event,
		start,
		kit,
		muted: override?.mute === true
	};
	if (override?.sample !== undefined) {
		cue.sample = override.sample;
	}
	return cue;
}

/**
 * Every automatic cue the composition's motion emits, sorted by time. Includes
 * muted and kit-less (silent) cues so the GUI rail can show them; audible
 * consumers filter with {@link isAudibleSoundCue}. Manual cues and the bed
 * live in `state.audioCues[]` and are NOT returned here — the mix combines
 * both.
 */
export function deriveSoundCues(state: EngineState): DerivedSoundCue[] {
	const cues: DerivedSoundCue[] = [];
	const surface = state.surface;
	const surfaceKit = surface.soundKit ?? null;
	const surfaceLayer: SoundCueLayer = { kind: 'surface' };

	if (surface.enter) {
		cues.push(
			cueFrom(
				'surface:enter',
				surfaceLayer,
				MOTION_SOUND_DEFAULTS.surfaceEnter,
				surface.enter,
				surfaceKit,
				surface.enter.sound
			)
		);
	}
	if (surface.exit) {
		cues.push(
			cueFrom(
				'surface:exit',
				surfaceLayer,
				MOTION_SOUND_DEFAULTS.surfaceExit,
				surface.exit,
				surfaceKit,
				surface.exit.sound
			)
		);
	}

	// One cue per mark instance, indexed like `marks.timings[]` (document
	// order); `resolveMarkForIndex` supplies the draw-on window even when the
	// timing entry is absent (shared fallback timing).
	const marksKit = state.marks.soundKit ?? null;
	listMarkInstances(surface.content).forEach((instance, index) => {
		const resolved = resolveMarkForIndex(instance.style, index, state.marks);
		cues.push(
			cueFrom(
				`mark:${index}`,
				{ kind: 'marks' },
				MOTION_SOUND_DEFAULTS.mark,
				resolved,
				marksKit,
				state.marks.timings[index]?.sound
			)
		);
	});

	for (const overlay of state.overlays) {
		const layer: SoundCueLayer = { kind: 'overlay', overlayId: overlay.id };
		const kit = overlay.soundKit ?? null;
		const typeDefaults = OVERLAY_EVENT_DEFAULTS[overlay.type];

		for (const phase of ['enter', 'exit'] as const) {
			const motionWindow = overlay[phase];
			if (!motionWindow) {
				continue;
			}
			const genericDefault =
				phase === 'enter' ? MOTION_SOUND_DEFAULTS.overlayEnter : MOTION_SOUND_DEFAULTS.overlayExit;
			const typeDefault = typeDefaults === undefined ? genericDefault : typeDefaults[phase];
			// A silent-by-default motion emits only when the author opts in with
			// an explicit event swap or a locked sample.
			const override = motionWindow.sound;
			if (typeDefault === null && !override?.event && override?.sample === undefined) {
				continue;
			}
			cues.push(
				cueFrom(
					`overlay:${overlay.id}:${phase}`,
					layer,
					typeDefault ?? genericDefault,
					motionWindow,
					kit,
					override
				)
			);
		}
	}

	// Text animations resolve through their TARGET Layer's kit — they are not
	// a Layer themselves. Per-character effects tick; whole/word/line effects
	// whoosh with their window.
	for (const entry of state.textAnimations) {
		let layer: SoundCueLayer = surfaceLayer;
		let kit = surfaceKit;
		if (entry.target.kind === 'overlay') {
			const overlayId = entry.target.overlayId;
			layer = { kind: 'overlay', overlayId };
			kit = state.overlays.find((overlay) => overlay.id === overlayId)?.soundKit ?? null;
		}

		const spec = EFFECT_CATALOG.get(entry.effect);
		const enterDefault =
			spec?.target === 'per-character'
				? MOTION_SOUND_DEFAULTS.textEnterPerCharacter
				: MOTION_SOUND_DEFAULTS.textEnter;

		cues.push(
			cueFrom(`text:${entry.id}:enter`, layer, enterDefault, entry.enter, kit, entry.enter.sound)
		);
		if (entry.exit) {
			cues.push(
				cueFrom(
					`text:${entry.id}:exit`,
					layer,
					MOTION_SOUND_DEFAULTS.textExit,
					entry.exit,
					kit,
					entry.exit.sound
				)
			);
		}
	}

	// Chat bubbles pop on the `imessage` Surface (every other Surface ignores
	// `content.messages`). Bubbles without an explicit `enter` still pop — the
	// default staggered cadence is composition timing too.
	if (surface.type === 'imessage') {
		(surface.content.messages ?? []).forEach((message, index) => {
			cues.push(
				cueFrom(
					`message:${index}`,
					surfaceLayer,
					MOTION_SOUND_DEFAULTS.message,
					messageEnter(message, index),
					surfaceKit,
					message.enter?.sound
				)
			);
		});
	}

	return cues.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

/**
 * Whether a derived cue produces sound: not muted, and either carrying a
 * locked sample or emitted by a Layer that wears a kit. A Layer with no kit is
 * silent (ADR-0033 §3).
 */
export function isAudibleSoundCue(cue: DerivedSoundCue): boolean {
	return !cue.muted && (cue.sample !== undefined || cue.kit !== null);
}
