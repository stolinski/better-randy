import type { ChatMessage } from '$lib/platform/engine-schema';

/**
 * Per-message timing for the `imessage` Surface, shared by the renderer
 * (CanvasSource) and the timeline (Workspace `buildTracks`) so the bubbles are
 * real, draggable timeline clips driven by the composition — not hardcoded
 * component constants. See docs/adr/0031-imessage-interactive-surface.md.
 */

// Default staggered cadence (fractions of the clip) when a message carries no
// explicit `enter` descriptor.
const DEFAULT_START = 0.07;
const DEFAULT_STEP = 0.18;
const DEFAULT_POP = 0.06;

export interface MessageEnter {
	start: number;
	duration: number;
}

export function defaultMessageEnter(index: number): MessageEnter {
	return { start: DEFAULT_START + index * DEFAULT_STEP, duration: DEFAULT_POP };
}

/** The message's explicit `enter` if set, else the default cadence for its index. */
export function messageEnter(message: ChatMessage, index: number): MessageEnter {
	const fallback = defaultMessageEnter(index);
	return {
		start: message.enter?.start ?? fallback.start,
		duration: message.enter?.duration ?? fallback.duration
	};
}

/** The typing indicator's window for a message (its own schema descriptor), or null. */
export function messageTyping(message: ChatMessage, index: number): MessageEnter | null {
	if (!message.typing) {
		return null;
	}
	const bubbleStart = messageEnter(message, index).start;
	return { start: bubbleStart - message.typing.duration, duration: message.typing.duration };
}

// Secondary beats, expressed relative to a message's `enter.start`.
export const TAPBACK_DELAY = 0.05; // a tapback pops this far after its bubble
export const RECEIPT_DELIVERED_DELAY = 0.05;
export const RECEIPT_READ_DELAY = 0.14;
