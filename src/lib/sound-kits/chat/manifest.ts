import type { SoundKitManifest } from '../../platform/sound-kits/types';

/**
 * Chat — the conversation palette (ADR-0033 §8): message pops on the bubbles
 * plus the chat card's slide whooshes. Everything else is silent — a palette
 * is exactly its sounds. Sent bubbles conventionally lock the companion
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
export const chatKit: SoundKitManifest = {
	slug: 'chat',
	label: 'Chat',
	description: 'Message pops and sends — the conversation palette.',
	samples: {
		pop: 'message-pop',
		// The chat card itself slides in/out — cover its whooshes with the
		// recorded fwips rather than falling back to the synthesized core.
		'whoosh-in': 'quick-whoosh-in',
		'whoosh-out': 'quick-whoosh-out'
	}
};
