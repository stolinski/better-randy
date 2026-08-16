import { z } from 'zod';
import type { OverlayDefaults } from '$lib/platform/pipelines/types';
import type { OverlayPipelineDefinition } from '$lib/platform/pipelines/definition-types';

/**
 * YouTube subscribe Overlay — a platform-faithful creator CTA (the
 * HeyGen-hyperframes register): avatar + channel identity + the Subscribe
 * pill, whose press-to-Subscribed state change is the piece's beat. The BEAT
 * is composition data (`beat`, a clip fraction — a draggable timeline
 * sub-track like the counter's roll), the choreography around it (press dip,
 * state swap, check, bell ring-in) is intrinsic motion-form, and the
 * artifact's appearance is pack-IMMUNE (ADR-0038): YouTube's palette and
 * type must read as YouTube under every Pack.
 */

const YoutubeSubscribeContentSchema = z.object({
	/** Channel display name (bold line). */
	channel: z.string(),
	/** Handle line, e.g. "@studioatlas". Optional. */
	handle: z.string().optional(),
	/** Free-text meta line, e.g. "1.2M subscribers". Optional. */
	subscribers: z.string().optional(),
	/**
	 * CORS-accessible avatar URL (crossOrigin "anonymous" so the
	 * HTML-in-Canvas capture isn't tainted — the web-document pattern).
	 * Absent → the silhouette fallback.
	 */
	avatarUrl: z.string().optional(),
	/** Card theme. Renderers read `?? 'light'` (defaults don't reach runtime). */
	theme: z.enum(['light', 'dark']).default('light'),
	/**
	 * The press moment as a fraction of the clip — when the pill flips
	 * Subscribe → Subscribed and the bell rings in. Renderers read `?? 0.42`.
	 */
	beat: z.number().min(0).max(1).default(0.42)
});

export type YoutubeSubscribeContent = z.infer<typeof YoutubeSubscribeContentSchema>;

function defaults(): OverlayDefaults<YoutubeSubscribeContent> {
	return {
		content: {
			channel: 'Studio Atlas',
			handle: '@studioatlas',
			subscribers: '1.2M subscribers',
			theme: 'light',
			beat: 0.42
		},
		position: { anchor: 'bottom-left', offset: { x: 0.0625, y: 0.0833 } },
		enter: { start: 0.08, duration: 0.05, ease: 'settled' },
		exit: { start: 0.86, duration: 0.04, ease: 'smooth' }
	};
}

export const youtubeSubscribeOverlayDefinition = {
	type: 'youtube-subscribe',
	label: 'YouTube subscribe',
	schema: YoutubeSubscribeContentSchema,
	defaults,
	readableText: (content, context) => {
		const subscribed =
			(context.progress - (content.beat ?? 0.42)) * context.durationMilliseconds >= 110;
		return [
			{ id: 'channel', text: content.channel, role: 'overlay-primary' },
			...([content.handle, content.subscribers].filter(Boolean).length > 0
				? [
						{
							id: 'meta',
							text: [content.handle, content.subscribers].filter(Boolean).join(' · '),
							role: 'overlay-secondary' as const
						}
					]
				: []),
			{
				id: subscribed ? 'subscribed-action' : 'subscribe-action',
				text: subscribed ? 'Subscribed' : 'Subscribe',
				role: 'overlay-secondary'
			}
		];
	}
} satisfies OverlayPipelineDefinition<YoutubeSubscribeContent>;
