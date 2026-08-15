import { z } from 'zod';
import type { OverlayDefaults } from '$lib/platform/pipelines/types';
import type { OverlayPipelineDefinition } from '$lib/platform/pipelines/definition-types';

/**
 * Instagram follow Overlay — the second creator platform block (the
 * HeyGen-hyperframes register, vertical-first): a profile card — gradient
 * story-ring avatar, username, meta line — whose Follow button presses to
 * Following at the authored `beat`. Same discipline as `youtube-subscribe`:
 * the beat is composition data (draggable timeline sub-track), the press
 * choreography is intrinsic motion-form, and the artifact is pack-IMMUNE
 * (ADR-0038): Instagram's gradient and blue must read as Instagram under
 * every Pack.
 */

const InstagramFollowContentSchema = z.object({
	/** Handle line (bold), e.g. "studioatlas". Rendered without the @. */
	username: z.string(),
	/** Display-name line under the handle. Optional. */
	name: z.string().optional(),
	/** Free-text meta line, e.g. "482K followers". Optional. */
	meta: z.string().optional(),
	/**
	 * Instagram's blue verified seal beside the username — the platform's most
	 * recognizable trust mark. Renderers read `?? false`.
	 */
	verified: z.boolean().default(false),
	/**
	 * CORS-accessible avatar URL (crossOrigin "anonymous" so the
	 * HTML-in-Canvas capture isn't tainted). Absent → the silhouette fallback.
	 */
	avatarUrl: z.string().optional(),
	/** Card theme. Renderers read `?? 'light'` (defaults don't reach runtime). */
	theme: z.enum(['light', 'dark']).default('light'),
	/**
	 * The press moment as a fraction of the clip — when Follow flips to
	 * Following. Renderers read `?? 0.42`.
	 */
	beat: z.number().min(0).max(1).default(0.42)
});

export type InstagramFollowContent = z.infer<typeof InstagramFollowContentSchema>;

function defaults(): OverlayDefaults<InstagramFollowContent> {
	return {
		content: {
			username: 'studioatlas',
			name: 'Studio Atlas',
			meta: '482K followers',
			verified: true,
			theme: 'light',
			beat: 0.42
		},
		position: { anchor: 'bottom-center', offset: { x: 0, y: 0.2 } },
		enter: { start: 0.08, duration: 0.05, ease: 'settled' },
		exit: { start: 0.86, duration: 0.04, ease: 'smooth' }
	};
}

export const instagramFollowOverlayDefinition = {
	type: 'instagram-follow',
	label: 'Instagram follow',
	schema: InstagramFollowContentSchema,
	defaults
} satisfies OverlayPipelineDefinition<InstagramFollowContent>;
