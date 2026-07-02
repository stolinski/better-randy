import type { SoundKitManifest } from '../../platform/sound-kits/types';

/**
 * Message Pop — chat-bubble sounds (ADR-0033 §8). Covers the `pop` event the
 * iMessage Surface's bubbles emit; everything else falls through to the core
 * samples per ADR-0024. Sent bubbles conventionally lock the companion
 * `message-send` asset per message (`enter.sound.sample`) — send/receive
 * side-awareness stays an authoring convention until by-ear use proves it
 * belongs in the emission defaults.
 *
 * Sample provenance — ⚠ NOT redistributable. These are Apple's own Messages
 * sound recordings, extracted from macOS at Scott's direction (2026-07-02)
 * for use in his channel's videos; they must not ship if Hiviz is ever
 * distributed as a product. Sources (processed to 48 kHz stereo WAV +
 * peak-normalized via ffmpeg):
 * - message-pop  — ToneLibrary.framework AlertTones/ReceivedMessage.caf
 * - message-send (asset, locked per sent message, not kit-resolved) —
 *   IMDaemonCore.framework Resources/Sent Message.aiff
 * The prior CC0 pair ("Message Receive"/"Message Sent" by Froey_,
 * freesound 760369/760370) remains in git history (commit 634d0d6) as the
 * redistributable fallback.
 */
export const messagePopKit: SoundKitManifest = {
	slug: 'message-pop',
	label: 'Message Pop',
	description:
		'Chat-bubble pops — soft receive pop; pair with the message-send sample on sent bubbles.',
	samples: {
		pop: 'message-pop',
		// The chat card itself slides in/out — cover its whooshes with the
		// recorded fwips rather than falling back to the synthesized core.
		'whoosh-in': 'quick-whoosh-in',
		'whoosh-out': 'quick-whoosh-out'
	}
};
