import { z } from 'zod';

import { parseXStatusUrl } from '$lib/utils/x-post-oembed';

export const TweetStackPostSchema = z.strictObject({
	id: z.string().regex(/^\d+$/),
	url: z.string().superRefine((value, ctx) => {
		try {
			parseXStatusUrl(value);
		} catch (errorValue) {
			ctx.addIssue({
				code: 'custom',
				message: errorValue instanceof Error ? errorValue.message : 'Invalid X post URL'
			});
		}
	}),
	displayName: z.string().trim().min(1).max(80),
	handle: z
		.string()
		.trim()
		.regex(/^@[A-Za-z0-9_]{1,15}$/),
	body: z.string().trim().min(1).max(560),
	dateLabel: z.string().trim().min(1).max(80),
	avatarUrl: z.union([z.string().url(), z.string().regex(/^\/[A-Za-z0-9_./-]+$/)]).optional(),
	verified: z.boolean().default(false)
});

export const TweetStackContentSchema = z
	.strictObject({
		posts: z.array(TweetStackPostSchema).min(2).max(8),
		pileStart: z.number().min(0).max(0.95).default(0.08),
		pileWindow: z.number().min(0.08).max(0.8).default(0.52),
		spread: z.number().min(0).max(1).default(0.72)
	})
	.superRefine((content, ctx) => {
		const ids = new Set<string>();
		const urls = new Set<string>();
		for (let index = 0; index < content.posts.length; index += 1) {
			const post = content.posts[index];
			const url = post?.url;
			if (post) {
				try {
					if (parseXStatusUrl(post.url).statusId !== post.id) {
						ctx.addIssue({
							code: 'custom',
							path: ['posts', index, 'id'],
							message: 'Post id must match its share URL'
						});
					}
				} catch {
					// The field-level URL issue is already more specific.
				}
			}
			if (post && ids.has(post.id)) {
				ctx.addIssue({
					code: 'custom',
					path: ['posts', index, 'id'],
					message: 'Post ids must be unique'
				});
			}
			if (post) ids.add(post.id);
			if (url && urls.has(url)) {
				ctx.addIssue({
					code: 'custom',
					path: ['posts', index, 'url'],
					message: 'Post URLs must be unique'
				});
			}
			if (url) urls.add(url);
		}
		if (content.pileStart + content.pileWindow > 1) {
			ctx.addIssue({
				code: 'custom',
				path: ['pileWindow'],
				message: 'Pile window must end at or before the composition endpoint'
			});
		}
	});

export type TweetStackPost = z.infer<typeof TweetStackPostSchema>;
export type TweetStackContent = z.infer<typeof TweetStackContentSchema>;
