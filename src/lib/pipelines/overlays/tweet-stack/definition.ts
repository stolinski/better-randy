import type { OverlayDefaults } from '$lib/platform/pipelines/types';
import { TweetStackContentSchema, type TweetStackContent } from './tweet-stack-content';
import type { OverlayPipelineDefinition } from '$lib/platform/pipelines/definition-types';

function defaults(): OverlayDefaults<TweetStackContent> {
	return {
		content: {
			posts: [
				{
					id: '20',
					url: 'https://x.com/jack/status/20',
					displayName: 'jack',
					handle: '@jack',
					body: 'just setting up my twttr',
					dateLabel: 'March 21, 2006',
					verified: false
				},
				{
					id: '463440424141459456',
					url: 'https://x.com/Interior/status/463440424141459456',
					displayName: 'US Department of the Interior',
					handle: '@Interior',
					body: "Sunsets don't get much better than this one over @GrandTetonNPS. #nature #sunset",
					dateLabel: 'May 5, 2014',
					verified: true
				}
			],
			pileStart: 0.08,
			pileWindow: 0.52,
			spread: 0.72
		},
		position: { anchor: 'center' },
		exit: { start: 0.88, duration: 0.08, ease: 'sharp' }
	};
}

export const tweetStackOverlayDefinition = {
	type: 'tweet-stack',
	label: 'Tweet stack',
	schema: TweetStackContentSchema,
	defaults,
	readableText: (content) =>
		content.posts.flatMap((post) => [
			{ id: `${post.id}-display-name`, text: post.displayName, role: 'found-document-metadata' },
			{ id: `${post.id}-handle`, text: post.handle, role: 'found-document-metadata' },
			{ id: `${post.id}-body`, text: post.body, role: 'found-document-body' },
			{ id: `${post.id}-date`, text: post.dateLabel, role: 'found-document-metadata' }
		]),
	disableEntryOffset: true,
	disableOpacityTransition: true
} satisfies OverlayPipelineDefinition<TweetStackContent>;
